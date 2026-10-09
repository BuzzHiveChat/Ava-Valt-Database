import {platformSetFromAny,normalizeAvatarPlatforms,hasKnownPlatform} from "./platforms";
import {lookupExtraPlatform} from "./extraPlatformProviders";
import {readDb,replaceAndSave} from "./db";
import {getSettings} from "./settings";
import {vrchatAvatar} from "./vrchat";
import {kitsuneWebsitePlatformLookup} from "./kitsuneWebsite";
import {nekoSuneExactPlatformLookup} from "./nekosuneWebsite";

const endpoints={
 AvtrZip:"https://vrcx.avtr.zip",
 KitsuneDB:"https://avtr.fumikoecho.net/api/integrations/avatars/vrcx",
 CuteDB:"https://avtr.icu/vrcx",
 PAW:"https://paw-api.amelia.fun/vrcx_search",
 VRCDB:"https://vrcx.vrcdb.com/avatars/Avatar/VRCX",
 VRCWB:"https://avatarwbvrcxsearch.worldbalancer.com/vrcx_search",
 NSVR:"https://vrcavatarsearch.nekosunevr.co.uk/vrcx_search"
};
const H={"Accept":"application/json","User-Agent":"VRCX/Ava-Valt-Web-Importer-2.23","Referer":"https://vrcx.app","VRCX-ID":"ava-valt-web-importer"};
const list=j=>Array.isArray(j)?j:(Array.isArray(j?.avatars)?j.avatars:Array.isArray(j?.results)?j.results:Array.isArray(j?.data)?j.data:Array.isArray(j?.items)?j.items:[]);
const now=()=>new Date().toISOString();
function platforms(x){return platformSetFromAny(x)}

async function requestLookup(base,key,id){
 try{
  const u=new URL(base);u.searchParams.set(key,id);u.searchParams.set("n","20");
  const r=await fetch(u,{headers:H,cache:"no-store",signal:AbortSignal.timeout(Number(process.env.COMMUNITY_PLATFORM_PROVIDER_TIMEOUT_MS||3500))});
  if(!r.ok)return null;
  const j=await r.json();
  return list(j).find(a=>(a.id||a.avatarId||a.avatar_id||a.vrcId||a.vrc_id)===id)||null;
 }catch{return null}
}
async function lookup(base,id){
 const r=await Promise.allSettled([requestLookup(base,"avatarId",id),requestLookup(base,"search",id)]);
 for(const x of r)if(x.status==="fulfilled"&&x.value)return x.value;
 return null;
}
async function nsvrHtml(id){
 try{
  const r=await fetch(`https://vrcavatarsearch.nekosunevr.co.uk/avatarlookup?avatarId=${encodeURIComponent(id)}`,{
   headers:{"Accept":"text/html","User-Agent":"Ava-Valt-Web-Importer/2.23"},cache:"no-store",
   signal:AbortSignal.timeout(Number(process.env.COMMUNITY_PLATFORM_PROVIDER_TIMEOUT_MS||3500))
  });
  if(!r.ok)return null;
  const html=await r.text(),m=html.match(/Platform:\s*([^<\n]+)/i);
  if(!m)return null;
  return {id,platforms:m[1].split(",").map(x=>x.trim()).filter(Boolean)};
 }catch{return null}
}
function merge(old,x,provider){
 const ps=platforms(x),out={...old};
 if(ps.length)out.platforms=ps;
 const mappings=[
  ["name","name"],["authorId","authorId"],["authorName","authorName"],["author","author"],
  ["description","description"],["imageUrl","imageUrl"],["thumbnailImageUrl","thumbnailImageUrl"],
  ["releaseStatus","releaseStatus"],["createdAt","createdAt"],["updatedAt","updatedAt"],
  ["created_at","created_at"],["updated_at","updated_at"]
 ];
 for(const [dst,src] of mappings)if((out[dst]==null||out[dst]===""||out[dst]==="Unknown")&&x?.[src])out[dst]=x[src];
 out.metadataProvider=provider;out.metadataCheckedAt=now();out.platformMetadataCheckedAt=now();
 return out;
}
async function communityLookup(id,enabled){
 const jobs=enabled.map(async name=>{
  let hit=await lookup(endpoints[name],id);
  if(!hit&&name==="NSVR")hit=await nsvrHtml(id);
  if(!hit)return null;
  const ps=platforms(hit);
  return ps.length?{name,hit}:null;
 });
 const settled=await Promise.allSettled(jobs);
 for(const x of settled)if(x.status==="fulfilled"&&x.value)return x.value;
 return null;
}

export async function enrichNewAvatarPlatform(avatar){
 if(!avatar?.id)return avatar;
 const normalized=normalizeAvatarPlatforms(avatar);
 if(hasKnownPlatform(normalized))return normalized;

 const settings=await getSettings();
 const enabled=Object.entries(settings.providerEnabled||{}).filter(([,v])=>v).map(([k])=>k).filter(k=>endpoints[k]);

 // V2.23: NekoSuneVR's public exact-ID page is the first resolver because it
 // exposes an explicit Platform field, e.g. "Android, PC".
 if(enabled.includes("NSVR")){
  try{
   const ns=await nekoSuneExactPlatformLookup(avatar);
   if(ns.platforms?.length)return {
    ...avatar,
    platforms:ns.platforms,
    metadataProvider:ns.provider,
    metadataEvidence:ns.evidence,
    metadataCheckedAt:now(),
    platformMetadataCheckedAt:now()
   };
  }catch{}
 }

 // KitsuneDB is already an IMPORT provider. Resolve supported platforms
 // through its advertised VRCX integration using the exact avtr_ ID.
 // Do not infer from an unrelated card on the website's search page.
 if(enabled.includes("KitsuneDB")){
  try{
   const kw=await kitsuneWebsitePlatformLookup(avatar);
   if(kw.platforms?.length)return {
    ...avatar,
    platforms:kw.platforms,
    metadataProvider:kw.provider,
    metadataEvidence:kw.evidence,
    metadataCheckedAt:now(),
    platformMetadataCheckedAt:now()
   };
  }catch{}
 }

 // Other enabled community providers are queried together so a slow/dead
 // service cannot make the whole resolver wait provider-by-provider.
 const otherEnabled=enabled.filter(x=>x!=="KitsuneDB");
 if(otherEnabled.length){
  const c=await communityLookup(avatar.id,otherEnabled);
  if(c)return merge(avatar,c.hit,c.name);
 }

 // Optional public metadata databases remain useful fallbacks.
 try{
  const extra=await lookupExtraPlatform(avatar.id);
  if(extra.platforms?.length)return {...avatar,platforms:extra.platforms,metadataProvider:extra.provider,metadataCheckedAt:now(),platformMetadataCheckedAt:now()};
 }catch{}

 // VRChat API is now the final optional fallback instead of the first dependency.
 // If the VRChat session is unavailable, KitsuneDB/community resolution still works.
 if(process.env.VRCHAT_API_PLATFORM_FALLBACK==="true"){
  try{
   const v=await vrchatAvatar(avatar.id);
   if(v.ok&&v.platforms?.length)return {...avatar,platforms:v.platforms,metadataProvider:"VRChat API",metadataCheckedAt:now(),platformMetadataCheckedAt:now()};
  }catch{}
 }
 return {...avatar,platforms:[],platformMetadataCheckedAt:now(),platformMetadataState:"UNRESOLVED"};
}

export async function enrichNewAvatarsPlatforms(avatars,{limit=100,concurrency=4,timeBudgetMs=22000}={}){
 const input=(avatars||[]).filter(a=>a?.id);
 const started=Date.now(),result=new Array(input.length);
 let cursor=0,attempted=0,resolvedByLookup=0,deferred=0;
 const sourceCounts={},platformCounts={PC:0,Android:0,iOS:0};

 for(let i=0;i<input.length;i++){
  const n=normalizeAvatarPlatforms(input[i]);
  if(hasKnownPlatform(n))result[i]=n;
 }

 async function worker(){
  while(true){
   if(Date.now()-started>=timeBudgetMs)return;
   let i=-1;
   while(cursor<input.length){
    const next=cursor++;
    if(!result[next]){i=next;break}
   }
   if(i<0)return;
   if(attempted>=limit){deferred++;continue}
   attempted++;
   try{
    const e=await enrichNewAvatarPlatform(input[i]);
    result[i]=normalizeAvatarPlatforms(e);
    if(hasKnownPlatform(result[i]))resolvedByLookup++;
   }catch{
    result[i]={...input[i],platforms:[],platformMetadataState:"UNRESOLVED"};
   }
  }
 }
 const workers=Array.from({length:Math.max(1,Math.min(Number(concurrency)||1,8))},()=>worker());
 await Promise.all(workers);

 // Anything never started because the time budget expired is deferred, not falsely "unresolved".
 for(let i=0;i<input.length;i++)if(!result[i]){result[i]={...input[i],platforms:[],platformMetadataState:"DEFERRED"};deferred++}

 let verified=0,unresolved=0;
 for(const a of result){
  if(hasKnownPlatform(a)){
   verified++;
   for(const p of platformSetFromAny(a))if(platformCounts[p]!=null)platformCounts[p]++;
   const src=a.metadataProvider||"Provider search";
   sourceCounts[src]=(sourceCounts[src]||0)+1;
  }else unresolved++;
 }
 return {
  avatars:result,stats:{
   input:input.length,attempted,resolvedByLookup,verified,unresolved,deferred,
   alreadyVerified:verified-resolvedByLookup,sourceCounts,platformCounts,
   timeMs:Date.now()-started,timeBudgetReached:Date.now()-started>=timeBudgetMs
  }
 };
}

export async function repairExistingPlatforms({limit=100,timeBudgetMs=45000}={}){
 const started=Date.now(),db=await readDb();
 const unknown=db.avatars.filter(a=>!hasKnownPlatform(a));
 const candidates=[...unknown].sort((a,b)=>{
  const at=Date.parse(a?.platformMetadataCheckedAt||a?.metadataCheckedAt||0)||0;
  const bt=Date.parse(b?.platformMetadataCheckedAt||b?.metadataCheckedAt||0)||0;
  return at-bt;
 }).slice(0,Math.min(Math.max(Number(limit)||1,1),500));

 const updated=new Map(db.avatars.map(a=>[a.id,a]));
 let fixed=0,checked=0;
 for(const a of candidates){
  if(Date.now()-started>=timeBudgetMs)break;
  checked++;
  try{
   const e=await enrichNewAvatarPlatform(a);
   if(hasKnownPlatform(e)){updated.set(a.id,e);fixed++}
   else updated.set(a.id,e);
  }catch{
   updated.set(a.id,{...a,platformMetadataCheckedAt:now(),platformMetadataState:"UNRESOLVED"});
  }
 }
 if(checked)await replaceAndSave([...updated.values()],`Ava-Valt platform repair: checked ${checked}, fixed ${fixed}`);
 return {checked,fixed,remaining:Math.max(0,unknown.length-fixed),total:db.avatars.length,timeBudgetReached:Date.now()-started>=timeBudgetMs};
}
