// Read-only KitsuneDB VRCX integration. Do not scrape avatar listing HTML or
// infer one avatar's platform from another avatar's card/badge.
import {platformSetFromAny} from './platforms.js';

export const KITSUNE_SITE='https://avtr.fumikoecho.net/avatars';
export const KITSUNE_API='https://avtr.fumikoecho.net/api/integrations/avatars/vrcx';
const VALID_ID=/^avtr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LABELS={pc:'PC',windows:'PC',standalonewindows:'PC',quest:'Android',android:'Android',ios:'iOS',iphone:'iOS',ipad:'iOS'};

export const kitsuneLink=id=>`${KITSUNE_SITE}?search=${encodeURIComponent(String(id||''))}`;

export function findExactKitsuneAvatar(payload,id){
 const needle=String(id||'').trim().toLowerCase();
 if(!VALID_ID.test(needle))return null;
 const seen=new Set();
 function walk(value,depth=0){
  if(!value||typeof value!=='object'||seen.has(value)||depth>5)return null;
  seen.add(value);
  if(Array.isArray(value)){
   for(const entry of value){const match=walk(entry,depth+1);if(match)return match;}
   return null;
  }
  const recordId=[value.id,value.avatarId,value.avatar_id,value.vrcId,value.vrc_id].find(x=>typeof x==='string'&&x.toLowerCase()===needle);
  if(recordId)return value;
  for(const key of ['avatars','items','results','data','docs','avatar','result','record']){
   const match=walk(value[key],depth+1);if(match)return match;
  }
  return null;
 }
 return walk(payload);
}

function explicitObjectFlags(obj){
 const out=new Set();
 if(!obj||typeof obj!=='object'||Array.isArray(obj))return out;
 for(const [key,val] of Object.entries(obj)){
  const p=LABELS[key.toLowerCase()];if(!p)continue;
  if(val===true||val===1||val==='true'||val==='supported'||val?.supported===true||val?.available===true)out.add(p);
 }
 return out;
}
function plausible(val){
 return val!==null&&val!==undefined&&!/^(?:|unknown|none|n\/a|unsupported|false|0|unavailable|not supported|no build|missing|not available)$/i.test(String(val).trim());
}

export function kitsunePlatformsFromRecord(record){
 if(!record||typeof record!=='object')return [];
 const out=new Set();
 for(const [key,part] of Object.entries({
  platforms:record.platforms,platform:record.platform,
  compatibility:record.compatibility,
  supportedPlatforms:record.supportedPlatforms,
  supported_platforms:record.supported_platforms,
  platformLabel:record.platformLabel,platform_label:record.platform_label,
  platformDisplay:record.platformDisplay,platform_display:record.platform_display,
  platformBadges:record.platformBadges,buildPlatforms:record.buildPlatforms,
  platformSupport:record.platformSupport,platformsSupported:record.platformsSupported
 })){
  if(part==null)continue;
  for(const p of explicitObjectFlags(part))out.add(p);
  if(Array.isArray(part)||typeof part==='string'){
   const field=key==='compatibility'?'compatibility':'platforms';
   for(const p of platformSetFromAny({[field]:part}))out.add(p);
  }
 }
 for(const p of explicitObjectFlags(record))out.add(p);
 // Only recognise positive performance fields, never 'unknown'/'none'.
 const perf=record.performance||record.perf||{};
 const perfSources=[
  ['PC',perf.standalonewindows,perf.pc,record.performancePc,record.performance_pc],
  ['Android',perf.android,perf.quest,record.performanceAndroid,record.performance_android],
  ['iOS',perf.ios,record.performanceIos,record.performance_ios]
 ];
 for(const [name,...values] of perfSources){
  if(values.some(v=>typeof v==='string'&&plausible(v)))out.add(name);
 }
 // VRChat unityPackages explicitly label each available build.
 for(const entry of (Array.isArray(record.unityPackages)?record.unityPackages:Array.isArray(record.unity_packages)?record.unity_packages:[])){
  if(entry&&typeof entry==='object'){
   for(const p of platformSetFromAny({platforms:[entry.platform,entry.platformName,entry.targetPlatform].filter(Boolean)}))out.add(p);
  }
 }
 return [...out].sort((a,b)=>['PC','Android','iOS'].indexOf(a)-['PC','Android','iOS'].indexOf(b));
}

export async function kitsuneExactPlatformLookup(avatar,{fetchImpl=fetch,timeoutMs,attemptsLimit=2}={}){
 const id=String(avatar?.id||'').trim();
 const siteUrl=kitsuneLink(id);
 if(!VALID_ID.test(id))return {platforms:[],provider:null,sourceUrl:siteUrl,status:0,reason:'Invalid avatar ID',attempts:[]};
 if(process.env.KITSUNE_API_ENABLED==='false'||process.env.KITSUNE_WEBSITE_PLATFORM_FALLBACK==='false')
  return {platforms:[],provider:null,sourceUrl:siteUrl,status:0,reason:'KitsuneDB lookup disabled',attempts:[]};
 const attempts=[];
 let matched=false,lastStatus=0,hadResponse=false;
 const timeout=Math.max(1000,Math.min(12000,Number(timeoutMs||process.env.KITSUNE_API_TIMEOUT_MS)||4500));
 for(const key of ['search','avatarId'].slice(0,Math.max(1,Math.min(2,Number(attemptsLimit)||2)))){
  const url=new URL(KITSUNE_API);
  url.searchParams.set(key,id);url.searchParams.set('n','25');
  try{
   const response=await fetchImpl(url.toString(),{
    headers:{Accept:'application/json','User-Agent':process.env.KITSUNE_API_USER_AGENT||'Ava-Valt-Importer/2.24'},
    cache:'no-store',signal:AbortSignal.timeout(timeout)
   });
   lastStatus=response.status;
   if(!response.ok){
    attempts.push({mode:key,status:response.status,matched:false});
    // Respect access-denied and rate-limit signals. Never retry via a different endpoint.
    if([401,403,429].includes(response.status))return {platforms:[],provider:null,sourceUrl:siteUrl,status:response.status,reason:'Provider denied or rate-limited access',attempts};
    continue;
   }
   hadResponse=true;
   const raw=await response.text();
   if(raw.length>3_000_000){attempts.push({mode:key,status:200,error:'Response too large'});continue;}
   let data;try{data=JSON.parse(raw)}catch{attempts.push({mode:key,status:200,error:'Invalid JSON'});continue;}
   const record=findExactKitsuneAvatar(data,id);
   matched ||=!!record;
   const platforms=kitsunePlatformsFromRecord(record);
   attempts.push({mode:key,status:200,matched:!!record,platforms:platforms.length});
   if(platforms.length)return {
    platforms,provider:'KitsuneDB (VRCX API)',
    evidence:'Exact avtr_ ID and explicit provider platform metadata (owner confirmation required)',
    url:siteUrl,sourceUrl:siteUrl,status:200,matched:true,attempts
   };
  }catch(e){
   attempts.push({mode:key,status:0,error:e?.message||String(e)});
  }
 }
 return {platforms:[],provider:null,url:siteUrl,sourceUrl:siteUrl,status:lastStatus,
  matched,attempts,
  reason:matched?'KitsuneDB matched this avatar, but its VRCX API did not expose supported platform evidence. Check the website badge manually.':hadResponse?'No exact avatar-ID match in KitsuneDB API results.':'KitsuneDB API request failed.'};
}
