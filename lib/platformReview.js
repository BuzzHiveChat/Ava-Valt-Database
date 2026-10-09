import {getRepoFile,putRepoFile} from "./githubFile";
import {upsertOwnerVerifiedAndSave} from "./db";
import {hasKnownPlatform} from "./platforms";
import {readOptOuts,filterExcluded,detectOptOutMarkers,stageMarkerRequests,creatorIdOf} from "./optOut";

const PATH=()=>process.env.PLATFORM_NEEDS_REVIEW_PATH||"platform-needs-review.json";
const key=id=>String(id||"").trim().toLowerCase();
const allowed=new Set(["PC","Android","iOS"]);

export async function readPlatformReview(){
 try{
  const f=await getRepoFile(PATH());
  const json=JSON.parse(f.text||"{}");
  const doc=Array.isArray(json)?{avatars:json}:json;
  return {version:1,updated:doc.updated||null,avatars:Array.isArray(doc.avatars)?doc.avatars:[],dismissedIds:Array.isArray(doc.dismissedIds)?doc.dismissedIds:[],autoReview:doc.autoReview||{}};
 }catch(e){
  if(e.message==="NOT_FOUND")return {version:1,updated:null,avatars:[],dismissedIds:[],autoReview:{}};
  throw e;
 }
}
async function writeReview(doc,message){
 const next={version:1,updated:new Date().toISOString(),avatars:doc.avatars||[],dismissedIds:doc.dismissedIds||[],autoReview:doc.autoReview||{}};
 await putRepoFile(PATH(),JSON.stringify(next,null,2)+"\n",message);
 return next;
}

// Preserve the failed-lookup avatars BEFORE the quarantine list drops them.
// This is deliberately a separate queue: nothing here is put into the live DB.
export async function moveToPlatformReview(avatars){
 const incoming=filterExcluded((avatars||[]).filter(a=>a?.id&&!hasKnownPlatform(a)),await readOptOuts());
 if(!incoming.length)return {moved:0,total:(await readPlatformReview()).avatars.length,ids:[]};
 const doc=await readPlatformReview();
 const dismissed=new Set(doc.dismissedIds.map(key));
 const records=new Map(doc.avatars.filter(a=>a?.id).map(a=>[key(a.id),a]));
 let moved=0;
 const ids=[];
 for(const a of incoming){
  const k=key(a.id);
  if(dismissed.has(k))continue;
  if(!records.has(k))moved++;
  const previous=records.get(k)||{};
  records.set(k,{...a,...previous,platforms:[],platformMetadataState:"NEEDS_OWNER_REVIEW",reviewReason:"platform-unresolved-after-repair",movedToReviewAt:previous.movedToReviewAt||new Date().toISOString()});
  ids.push(k);
 }
 if(ids.length){
  await writeReview({...doc,avatars:[...records.values()]},`Ava-Valt: move ${ids.length} unresolved platform avatar(s) to owner review`);
 }
 return {moved,total:records.size,ids};
}

export async function listPlatformReview({search="",page=1,pageSize=50}={}){
 const doc=await readPlatformReview();
 const term=String(search||"").trim().toLowerCase();
 let rows=doc.avatars.filter(a=>a?.id);
 if(term)rows=rows.filter(a=>[a.id,a.name,a.author,a.authorName,a.authorId].some(v=>String(v||"").toLowerCase().includes(term)));
 rows.sort((a,b)=>String(a.movedToReviewAt||"").localeCompare(String(b.movedToReviewAt||"")));
 const size=Math.max(1,Math.min(Number(pageSize)||50,100));
 const current=Math.max(1,Number(page)||1);
 return {total:rows.length,page:current,pageSize:size,pages:Math.max(1,Math.ceil(rows.length/size)),avatars:rows.slice((current-1)*size,current*size),autoReview:{...doc.autoReview,enabled:process.env.PLATFORM_REVIEW_AUTO_ENABLED==="true"}};
}

const MAX_BATCH=50;
function verifiedRecord(original,platforms){
 const {
  quarantineReason,quarantinedAt,lastPlatformRetryAt,nextPlatformRetryAt,
  platformRetryCount,reviewReason,movedToReviewAt,autoReviewLease,autoReviewNextTryAt,
  autoReviewLastCheckedAt,autoReviewResult,autoReviewSuggestion,autoReviewProvider,
  autoReviewEvidence,autoReviewUrl,...clean
 }=original;
 const timestamp=new Date().toISOString();
 return {...clean,platforms,metadataProvider:"Owner verified",
  metadataCheckedAt:timestamp,platformMetadataCheckedAt:timestamp,
  platformMetadataState:"OWNER_VERIFIED"};
}

// One owner-confirmed request updates the live DB in one write and then removes
// only the successfully saved IDs from Needs Review. Failed IDs remain reviewable.
export async function ownerVerifyReviewedBatch(items){
 if(!Array.isArray(items)||!items.length||items.length>MAX_BATCH)
  throw new Error(`Choose 1–${MAX_BATCH} avatars per import batch.`);
 const doc=await readPlatformReview();
 const rows=new Map(doc.avatars.filter(a=>a?.id).map(a=>[key(a.id),a]));
 const policy=await readOptOuts();
 const pendingAvatarIds=new Set((policy.pending||[]).filter(x=>x.type==="avatar").map(x=>key(x.id)));
 const pendingCreatorIds=new Set((policy.pending||[]).filter(x=>x.type==="creator").map(x=>key(x.id)));
 const seen=new Set(),results=[],ready=[];
 for(const item of items){
  const id=key(item?.id),original=rows.get(id);
  const platforms=item?.platforms;
  let error=null;
  if(!id)error="An avatar ID is required.";
  else if(seen.has(id))error="This avatar was included twice.";
  else if(!original)error="Avatar is no longer in Needs Review. Refresh the page.";
  else if(!Array.isArray(platforms)||!platforms.length||platforms.some(p=>!allowed.has(p)))
   error="Select only confirmed PC, Android and/or iOS platforms.";
  else if(!filterExcluded([original],policy).length)error="Excluded by creator opt-out policy.";
  else if(pendingAvatarIds.has(id)||pendingCreatorIds.has(key(creatorIdOf(original))))
   error="This avatar has a pending opt-out request. Review it in Avatar Opt-Outs.";
  else {
   const markers=detectOptOutMarkers(original);
   if(markers.avatar||markers.creator){
    try{await stageMarkerRequests([original]);error="Avatar has an opt-out marker. Review it in Avatar Opt-Outs.";}
    catch(e){error=`Opt-out review could not be staged: ${e.message}`;}
   }
  }
  seen.add(id);
  if(error)results.push({ok:false,id:item?.id||null,error});
  else {
   const unique=[...new Set(platforms)];
   ready.push(verifiedRecord(original,unique));
   results.push({ok:true,id:original.id,platforms:unique});
  }
 }

 let savedIds=[],added=0,updated=0;
 if(ready.length){
  const saved=await upsertOwnerVerifiedAndSave(ready,`Ava-Valt: owner verified ${ready.length} reviewed avatar(s)`);
  const savedKeys=new Set(saved.savedIds.map(key));
  savedIds=saved.savedIds;added=saved.added;updated=saved.updated;
  for(const result of results)if(result.ok&&!savedKeys.has(key(result.id))){
   result.ok=false;result.error="Avatar was excluded by creator opt-out policy during import.";
   delete result.platforms;
  }
 }
 let cleanupError=null,remaining=doc.avatars.length;
 if(savedIds.length){
  try{
   const fresh=await readPlatformReview();
   const savedKeys=new Set(savedIds.map(key));
   const rest=fresh.avatars.filter(a=>!savedKeys.has(key(a?.id)));
   if(rest.length!==fresh.avatars.length)
    await writeReview({...fresh,avatars:rest},`Ava-Valt: clear ${fresh.avatars.length-rest.length} owner-verified review avatar(s)`);
   remaining=rest.length;
  }catch(e){cleanupError=`Avatars were saved to the live database, but could not be cleared from Needs Review: ${e.message}`;}
 }
 return {ok:true,processed:results.length,succeeded:results.filter(r=>r.ok).length,
  failed:results.filter(r=>!r.ok).length,added,updated,remaining,results,cleanupError};
}

export async function ownerVerifyReviewedAvatar(id,platforms){
 const batch=await ownerVerifyReviewedBatch([{id,platforms}]);
 const result=batch.results[0];
 if(!result.ok)throw new Error(result.error);
 return {ok:true,id:result.id,platforms:result.platforms,remaining:batch.remaining,cleanupError:batch.cleanupError};
}

// Dismissal is persistent for unknown-platform imports, but DOES NOT delete anything
// from the live DB. It can be undone in the future by an Owner if desired.
export async function ownerDismissReviewedAvatar(id){
 if(!key(id))throw new Error("An avatar ID is required.");
 const doc=await readPlatformReview();
 const existing=doc.avatars.find(a=>key(a?.id)===key(id));
 if(!existing)throw new Error("Avatar is no longer in Needs Review. Refresh the page.");
 const remaining=doc.avatars.filter(a=>key(a?.id)!==key(id));
 const dismissedIds=[...new Set([...doc.dismissedIds.map(key),key(id)])];
 await writeReview({...doc,avatars:remaining,dismissedIds},`Ava-Valt: owner dismissed unresolved avatar ${id}`);
 return {ok:true,id:existing.id,remaining:remaining.length};
}
