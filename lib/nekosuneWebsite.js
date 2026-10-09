import {platformSetFromAny} from "./platforms";

const BASE="https://vrcavatarsearch.nekosunevr.co.uk";
const enabled=()=>process.env.NEKOSUNE_WEBSITE_PLATFORM_FALLBACK!=="false";
const timeout=()=>Number(process.env.NEKOSUNE_WEBSITE_TIMEOUT_MS||4500);

function decodeHtml(s=""){
 return String(s)
  .replace(/&nbsp;/gi," ")
  .replace(/&amp;/gi,"&")
  .replace(/&quot;/gi,'"')
  .replace(/&#39;|&apos;/gi,"'")
  .replace(/&lt;/gi,"<")
  .replace(/&gt;/gi,">");
}

function htmlText(html=""){
 return decodeHtml(
  String(html)
   .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
   .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
   .replace(/<[^>]+>/g," ")
 ).replace(/\s+/g," ").trim();
}

export function parseNekoSunePlatformPage(html,id){
 const text=htmlText(html);
 const idLower=String(id||"").toLowerCase();
 if(idLower && !text.toLowerCase().includes(idLower))return [];

 // Exact avatar detail pages expose "Platform: Android, PC" etc.
 const m=text.match(/\bPlatform\s*:\s*([A-Za-z0-9 +,/•|_-]{1,100})(?=\s+(?:Open in VRCX|Switch Avatar|Import to Favorites|Name\s*:|ID\s*:|Author\s*:|$))/i)
        || text.match(/\bPlatform\s*:\s*([A-Za-z0-9 +,/•|_-]{1,60})/i);
 if(!m)return [];
 return platformSetFromAny({platform:m[1]});
}

export async function nekoSuneExactPlatformLookup(avatar){
 if(!enabled()||!avatar?.id)return {platforms:[],provider:null};
 const id=String(avatar.id);
 const url=`${BASE}/avatarlookup?avatarId=${encodeURIComponent(id)}`;
 try{
  const r=await fetch(url,{
   headers:{
    "Accept":"text/html,application/xhtml+xml",
    "Accept-Language":"en-GB,en;q=0.9",
    "User-Agent":process.env.VRCHAT_USER_AGENT||"Ava-Valt/2.23 (platform metadata resolver)"
   },
   cache:"no-store",redirect:"follow",signal:AbortSignal.timeout(timeout())
  });
  if(!r.ok)return {platforms:[],provider:null,status:r.status,url};
  const html=await r.text();
  const platforms=parseNekoSunePlatformPage(html,id);
  return platforms.length
   ? {platforms,provider:"NekoSuneVR Exact Lookup",evidence:"public exact-ID Platform field",url,status:r.status}
   : {platforms:[],provider:null,url,status:r.status};
 }catch(e){
  return {platforms:[],provider:null,url,status:0,error:e?.message||String(e)};
 }
}
