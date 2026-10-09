import {getRepoFile,putRepoFile} from "./githubFile";
import {readDb,removeIdsAndSave,mergeAndSave} from "./db";
import {hasKnownPlatform,normalizeAvatarPlatforms} from "./platforms";
import {enrichNewAvatarsPlatforms} from "./enrich";
import {readPlatformReview,moveToPlatformReview} from "./platformReview";
import {readOptOuts,filterExcluded,stageMarkerRequests,detectOptOutMarkers} from "./optOut";

const PATH=()=>process.env.UNKNOWN_PLATFORM_QUARANTINE_PATH||"unknown-platform-quarantine.json";

async function readQ(){
 try{
  const f=await getRepoFile(PATH());
  const j=JSON.parse(f.text||"{}");
  return Array.isArray(j)?{avatars:j}:j;
 }catch(e){
  if(e.message==="NOT_FOUND")return {version:1,updated:null,avatars:[]};
  throw e;
 }
}
async function writeQ(avatars,message){
 const root={version:1,updated:new Date().toISOString(),avatars};
 await putRepoFile(PATH(),JSON.stringify(root,null,2)+"\n",message);
 return root;
}
export async function quarantineRecords(records,{reason="platform-unresolved"}={}){
 const incoming=filterExcluded((records||[]).filter(a=>a?.id&&!hasKnownPlatform(a)),await readOptOuts());
 if(!incoming.length)return {quarantined:0,total:(await readQ()).avatars?.length||0};
 const q=await readQ();
 const review=await readPlatformReview();
 const excluded=new Set([...review.dismissedIds,...review.avatars.map(a=>a.id)].map(x=>String(x||"").toLowerCase()));
 const map=new Map((q.avatars||[]).filter(a=>a?.id).map(a=>[a.id,a]));
 let added=0,touched=0;
 for(const a of incoming){
  if(excluded.has(String(a.id).toLowerCase()))continue;
  if(!map.has(a.id))added++;
  touched++;
  map.set(a.id,{...a,quarantineReason:reason,quarantinedAt:new Date().toISOString()});
 }
 if(touched)await writeQ([...map.values()],`Ava-Valt: quarantine ${added} unresolved platform avatar(s)`);
 return {quarantined:added,total:map.size};
}
export async function quarantineUnknownFromLiveDb(){
 const db=await readDb();
 const unknown=db.avatars.filter(a=>!hasKnownPlatform(a));
 if(!unknown.length)return {moved:0,total:db.avatars.length,quarantined:(await readQ()).avatars?.length||0};
 // Save a copy first. Only after preservation succeeds do we remove those exact IDs from live DB.
 const q=await quarantineRecords(unknown,{reason:"live-db-unknown-platform"});
 const r=await removeIdsAndSave(unknown.map(a=>a.id),`Ava-Valt strict platform mode: move ${unknown.length} Unknown record(s) to quarantine`);
 return {moved:r.removed,total:r.total,quarantined:q.total};
}
export async function repairQuarantinedPlatforms({
 limit=12,
 timeBudgetMs=24000,
 cooldownHours=12,
 force=false,
 concurrency=4
}={}){
 const started=Date.now();
 const q=await readQ(), source=filterExcluded((q.avatars||[]).filter(a=>a?.id),await readOptOuts());
 if(!source.length)return {checked:0,restored:0,movedToReview:0,remaining:0,eligible:0,deferred:0,sourceCounts:{},platformCounts:{PC:0,Android:0,iOS:0}};

 const cooldownMs=Math.max(0,Number(cooldownHours)||0)*60*60*1000;
 const now=Date.now();

 // Oldest/never-checked records first. Failed records cool down so one stubborn
 // avatar cannot permanently block the rest of the quarantine.
 const eligible=source.filter(a=>{
   if(force)return true;
   const next=Date.parse(a?.nextPlatformRetryAt||0)||0;
   if(next>now)return false;
   const last=Date.parse(a?.lastPlatformRetryAt||0)||0;
   return !last || now-last>=cooldownMs;
 }).sort((a,b)=>{
   const at=Date.parse(a?.lastPlatformRetryAt||0)||0;
   const bt=Date.parse(b?.lastPlatformRetryAt||0)||0;
   return at-bt;
 });

 const candidates=eligible.slice(0,Math.max(1,Math.min(Number(limit)||12,100)));
 if(!candidates.length)return {
   checked:0,restored:0,movedToReview:0,remaining:source.length,eligible:0,deferred:source.length,
   sourceCounts:{},platformCounts:{PC:0,Android:0,iOS:0}
 };

 const batch=await enrichNewAvatarsPlatforms(candidates,{
   limit:candidates.length,
   concurrency:Math.max(1,Math.min(Number(concurrency)||4,8)),
   timeBudgetMs:Math.max(3000,Number(timeBudgetMs)||24000)
 });

 const resolved=[], unresolved=[], deferred=[];
 for(const a of batch.avatars||[]){
   if(hasKnownPlatform(a))resolved.push(a);
   else if(a.platformMetadataState==="DEFERRED")deferred.push(a);
   else unresolved.push(a);
 }

 // Only restore records with no unresolved opt-out request. Marker-bearing records
 // are held in quarantine until their claimed creator control is reviewed.
 const safeResolved=(await stageMarkerRequests(resolved)).allow;
 // Restore verified records first.
 if(safeResolved.length){
   const clean=safeResolved.map(a=>{
     const {
       quarantineReason,quarantinedAt,lastPlatformRetryAt,nextPlatformRetryAt,
       platformRetryCount,...rest
     }=a;
     return {...rest,platformMetadataState:rest.platformMetadataState==="OWNER_VERIFIED"?"OWNER_VERIFIED":"AUTO_RESOLVED"};
   });
   await mergeAndSave(clean,`Ava-Valt: auto restore ${clean.length} platform-resolved quarantined avatar(s)`);
 }

 // Preserve every genuinely checked-but-unresolved avatar in the manual review
 // file first. If that write fails, the quarantine list remains untouched.
 // Not-started / deferred lookups stay in quarantine for another repair pass.
 const review=await moveToPlatformReview(unresolved);
 const movedIds=new Set(review.ids);

 // Re-read before writing quarantine so avatars added by another request aren't lost.
 const fresh=await readQ();
 const resolvedIds=new Set(safeResolved.map(a=>a.id));
 const deferredById=new Map(deferred.map(a=>[a.id,a]));
 const checkedIds=new Set((batch.avatars||[]).map(a=>a?.id).filter(Boolean));
 const next=[];

 for(const original of (fresh.avatars||[])){
   if(!original?.id)continue;
   if(resolvedIds.has(original.id))continue;
   if(!checkedIds.has(original.id)){next.push(original);continue}

   if(movedIds.has(String(original.id).toLowerCase()))continue;
   // No platform lookup actually started, so retain the record in quarantine.
   // This guards against Vercel time budgets / incomplete provider responses.
   if(deferredById.has(original.id)){
     next.push({...original,platformMetadataState:"DEFERRED"});
     continue;
   }
   // Safety: if no review record was saved, never discard the avatar.
   next.push(original);
 }

 await writeQ(next,`Ava-Valt: quarantine repair checked ${batch.stats?.attempted??0}, restored ${safeResolved.length}, moved ${movedIds.size} to review`);

 return {
   checked:batch.stats?.attempted??0,
   restored:safeResolved.length,
   movedToReview:movedIds.size,
   needsReview:review.total,
   remaining:next.length,
   eligible:eligible.length,
   deferred:Math.max(0,source.length-candidates.length),
   sourceCounts:batch.stats?.sourceCounts||{},
   platformCounts:batch.stats?.platformCounts||{PC:0,Android:0,iOS:0},
   timeMs:Date.now()-started,
   timeBudgetReached:!!batch.stats?.timeBudgetReached
 };
}

export async function quarantineStats(){
 const q=await readQ(); return {quarantined:(q.avatars||[]).length};
}


export async function listQuarantined({search="",page=1,pageSize=50}={}){
 const q=await readQ();
 const term=String(search||"").trim().toLowerCase();
 let rows=(q.avatars||[]).filter(a=>a?.id);
 if(term)rows=rows.filter(a=>[
   a.id,a.name,a.author,a.authorName,a.authorId
 ].some(v=>String(v||"").toLowerCase().includes(term)));
 rows.sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id)));
 const size=Math.max(1,Math.min(Number(pageSize)||50,100));
 const current=Math.max(1,Number(page)||1);
 const start=(current-1)*size;
 return {
   total:rows.length,page:current,pageSize:size,
   pages:Math.max(1,Math.ceil(rows.length/size)),
   avatars:rows.slice(start,start+size)
 };
}

function cleanManualPlatforms(platforms){
 const allowed=new Set(["PC","Android","iOS"]);
 return [...new Set((platforms||[]).filter(x=>allowed.has(x)))];
}

export async function ownerVerifyQuarantinedAvatar(id,platforms){
 const chosen=cleanManualPlatforms(platforms);
 if(!id||!chosen.length)throw new Error("Choose at least one platform.");
 const q=await readQ();
 const current=(q.avatars||[]).find(a=>a?.id===id);
 if(!current)throw new Error("That avatar is not in platform quarantine.");
 if(!filterExcluded([current],await readOptOuts()).length)throw new Error("Avatar is excluded by creator opt-out policy.");
 const markers=detectOptOutMarkers(current);
 if(markers.avatar||markers.creator){await stageMarkerRequests([current]);throw new Error("This avatar contains an opt-out marker; review its ownership in Avatar Opt-Outs before adding it.");}

 const {quarantineReason,quarantinedAt,lastPlatformRetryAt,platformMetadataState,...base}=current;
 const verified={
   ...base,
   platforms:chosen,
   metadataProvider:"Owner verified from VRChat website",
   metadataCheckedAt:new Date().toISOString(),
   platformMetadataCheckedAt:new Date().toISOString(),
   platformMetadataState:"OWNER_VERIFIED"
 };

 // Write to the live DB first. If quarantine cleanup fails afterwards, the record
 // remains safely duplicated rather than being lost.
 await mergeAndSave([verified],`Ava-Valt: owner verified ${id} for ${chosen.join(" / ")}`);

 const fresh=await readQ();
 const remaining=(fresh.avatars||[]).filter(a=>a?.id!==id);
 await writeQ(remaining,`Ava-Valt: remove owner-verified ${id} from platform quarantine`);
 return {ok:true,id,platforms:chosen,remaining:remaining.length};
}

export async function ownerVerifyQuarantinedBatch(items){
 const results=[];
 for(const item of (items||[]).slice(0,50)){
   try{
     results.push(await ownerVerifyQuarantinedAvatar(item?.id,item?.platforms));
   }catch(e){
     results.push({ok:false,id:item?.id||null,error:e?.message||String(e)});
   }
 }
 return {
   processed:results.length,
   succeeded:results.filter(x=>x.ok).length,
   failed:results.filter(x=>!x.ok).length,
   results
 };
}
