import {platformSetFromAny} from "./platforms";
const UA=process.env.VRCHAT_USER_AGENT||"Ava-Valt/2.17";
const timeout=()=>Number(process.env.EXTRA_PLATFORM_PROVIDER_TIMEOUT_MS||3500);
const uniq=a=>[...new Set(a)];
async function getJson(url){
 const r=await fetch(url,{headers:{"User-Agent":UA,"Accept":"application/json"},signal:AbortSignal.timeout(timeout()),cache:"no-store"});
 if(!r.ok)throw new Error(`HTTP ${r.status}`);
 return r.json();
}
function hit(data,id){
 const a=Array.isArray(data)?data:(data?.avatars||data?.results||data?.data||data?.items||[]);
 if(Array.isArray(a))return a.find(x=>x?.id===id||x?.avatarId===id)||null;
 return (data?.id===id||data?.avatarId===id)?data:null;
}
async function attempt(provider,url,id){
 try{
  const rec=hit(await getJson(url),id);
  let platforms=platformSetFromAny(rec);
  if(provider==="CuteAvatarSearch"){
   const code=String(rec?.platformCode||rec?.platform_code||"").toLowerCase();
   if(code.includes("w"))platforms.push("PC");
   if(code.includes("a"))platforms.push("Android");
   if(code.includes("i"))platforms.push("iOS");
   platforms=uniq(platforms);
  }
  return platforms.length?{provider,platforms}:null;
 }catch{return null}
}
export async function lookupExtraPlatform(id){
 const jobs=[
  attempt("VRCNDb",`https://db.vrcnext.com/api/avatars/${encodeURIComponent(id)}`,id),
  attempt("VRCNDb",`https://db.vrcnext.com/api/avatar/${encodeURIComponent(id)}`,id),
  attempt("VRCNDb",`https://db.vrcnext.com/api/search?search=${encodeURIComponent(id)}`,id),
  attempt("CuteAvatarSearch",`https://avtr.icu/search?q=${encodeURIComponent(id)}`,id),
  attempt("CuteAvatarSearch",`https://avtr.icu/search?search=${encodeURIComponent(id)}`,id)
 ];
 const settled=await Promise.allSettled(jobs);
 for(const x of settled)if(x.status==="fulfilled"&&x.value?.platforms?.length)return x.value;
 return {platforms:[],provider:null};
}
export function platformsFromAny(x){return platformSetFromAny(x)}
