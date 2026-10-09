import crypto from "node:crypto";
import {getRepoFile,putRepoFile} from "./githubFile";
import {nekoSuneExactPlatformLookup} from "./nekosuneWebsite";
import {kitsuneWebsitePlatformLookup} from "./kitsuneWebsite";
import {readOptOuts,filterExcluded,detectOptOutMarkers} from "./optOut";
import {maxPerHour,recentAttempts,remainingSlots,eligibleAvatars,isProviderBlocked,HOUR} from "./platformAutoReviewSchedule.mjs";

const path=()=>process.env.PLATFORM_NEEDS_REVIEW_PATH||"platform-needs-review.json";
const enabled=()=>process.env.PLATFORM_REVIEW_AUTO_ENABLED==="true";
const nowIso=n=>new Date(n).toISOString();
const pauseHours=()=>Math.max(1,Number(process.env.PLATFORM_REVIEW_RATE_LIMIT_BACKOFF_HOURS)||24);
const cooldownHours=()=>Math.max(1,Number(process.env.PLATFORM_REVIEW_RETRY_HOURS)||24);
const key=id=>String(id||"").toLowerCase();
const cleanDoc=raw=>{
 const doc=Array.isArray(raw)?{avatars:raw}:raw;
 return {version:1,updated:doc.updated||null,avatars:Array.isArray(doc.avatars)?doc.avatars:[],dismissedIds:Array.isArray(doc.dismissedIds)?doc.dismissedIds:[],autoReview:doc.autoReview||{}};
};
const encode=d=>JSON.stringify({...d,updated:new Date().toISOString()},null,2)+"\n";
async function readCurrent(){
 const file=await getRepoFile(path());
 return {doc:cleanDoc(JSON.parse(file.text||"{}")),sha:file.sha};
}

// This worker NEVER visits the VRChat website or API, and NEVER restores an
// avatar to the live database. Try a provider's public exact-ID metadata first,
// then KitsuneDB's advertised VRCX API if the first has no platform data.
// Any 401/403/429 prevents fallback: never try to evade a blocked provider.
export async function reviewProviderLookup(avatar){
 const first=await nekoSuneExactPlatformLookup(avatar);
 if(first.platforms?.length||[401,403,429].includes(Number(first.status)))return first;
 if(process.env.PLATFORM_REVIEW_KITSUNE_FALLBACK==='false')return first;
 // Keep hourly Vercel jobs within their execution budget: one exact-ID API query.
 const second=await kitsuneWebsitePlatformLookup(avatar,{attemptsLimit:1,timeoutMs:3000});
 if(second.platforms?.length||[401,403,429].includes(Number(second.status)))return second;
 return {platforms:[],status:second.status||first.status||0,
  provider:second.provider||first.provider||null,
  url:second.url||first.url||null,
  reason:second.reason||first.error||null};
}
export async function runPlatformAutoReview({now=Date.now(),lookup=reviewProviderLookup}={}){
 if(!enabled())return {skipped:true,reason:"PLATFORM_REVIEW_AUTO_ENABLED is not true"};
 const {doc,sha}=await readCurrent();
 const slots=remainingSlots(doc,now,process.env.PLATFORM_REVIEW_PER_HOUR||5);
 if(isProviderBlocked(doc,now))return {skipped:true,reason:doc.autoReview.blocked?"Provider blocked automatic checks; owner must explicitly resume":"Rate-limit backoff active",state:doc.autoReview};
 if(!slots)return {skipped:true,reason:"5-or-fewer platform checks per rolling hour: limit reached",nextAvailableAt:nowIso(Math.min(...recentAttempts(doc.autoReview.attempts,now).map(a=>Date.parse(a.at)))+HOUR)};
 const policy=await readOptOuts();
 const eligible=eligibleAvatars(doc,now).filter(a=>filterExcluded([a],policy).length&&!Object.values(detectOptOutMarkers(a)).some(Boolean));
 const selected=eligible.slice(0,slots);
 if(!selected.length)return {skipped:true,reason:"No eligible unresolved avatars ready for review",total:doc.avatars.length};
 const lease=crypto.randomUUID();
 const date=nowIso(now);
 const selectedIds=new Set(selected.map(a=>key(a.id)));
 // Reserve all slots in GitHub BEFORE sending a single external request. GitHub's
 // expected SHA makes simultaneous hourly/manual runs unable to double-spend slots.
 doc.avatars=doc.avatars.map(a=>selectedIds.has(key(a.id))?{...a,autoReviewLease:lease,autoReviewLastCheckedAt:date,autoReviewNextTryAt:nowIso(now+cooldownHours()*HOUR),autoReviewResult:"CHECKING"}:a);
 doc.autoReview={...doc.autoReview,attempts:[...recentAttempts(doc.autoReview.attempts,now),...selected.map(a=>({id:a.id,at:date}))].slice(-50),lastRunAt:date};
 await putRepoFile(path(),encode(doc),`Ava-Valt: reserve ${selected.length} low-rate platform evidence checks`,{expectedSha:sha});
 const results=[];
 let blocked=false, pausedUntil=null;
 for(const a of selected){
  if(blocked){results.push({id:a.id,result:"DEFERRED",platforms:[]});continue;}
  let r;
  try{r=await lookup({id:a.id,name:a.name||""})}catch(e){r={platforms:[],status:0,error:e?.message||"Provider request failed"}};
  const status=Number(r?.status)||0;
  if(status===401||status===403){blocked=true;results.push({id:a.id,result:"PROVIDER_BLOCKED",status,platforms:[]});continue;}
  if(status===429){blocked=true;pausedUntil=nowIso(now+pauseHours()*HOUR);results.push({id:a.id,result:"RATE_LIMITED",status,platforms:[]});continue;}
  const p=[...new Set((r?.platforms||[]).filter(x=>["PC","Android","iOS"].includes(x)))];
  results.push({id:a.id,result:p.length?"SUGGESTED":status===0?"UNAVAILABLE":"NOT_FOUND",platforms:p,provider:r?.provider||"Third-party exact-ID metadata",evidence:r?.evidence||null,url:r?.url||null,status});
 }
 const fresh=await readCurrent();
 const byId=new Map(results.map(r=>[key(r.id),r]));
 fresh.doc.avatars=fresh.doc.avatars.map(a=>{
  if(a.autoReviewLease!==lease)return a;
  const r=byId.get(key(a.id));if(!r)return a;
  const next={...a,autoReviewLease:null,autoReviewResult:r.result};
  if(r.result==="SUGGESTED"){
   next.autoReviewSuggestion=r.platforms;
   next.autoReviewProvider=r.provider;
   next.autoReviewEvidence=r.evidence;
   next.autoReviewUrl=r.url;
  }
  return next;
 });
 fresh.doc.autoReview={...fresh.doc.autoReview,lastRunAt:date,lastChecked:results.filter(r=>r.result!=="DEFERRED").length,lastSuggested:results.filter(r=>r.result==="SUGGESTED").length};
 if(results.some(r=>r.result==="PROVIDER_BLOCKED")){
  fresh.doc.autoReview.blocked=true;
  fresh.doc.autoReview.lastError="A third-party provider returned 401/403. Automatic review paused until the owner checks permission and resumes.";
 }else if(pausedUntil){
  fresh.doc.autoReview.pausedUntil=pausedUntil;
  fresh.doc.autoReview.lastError="Provider returned 429; automatic review is paused.";
 }else fresh.doc.autoReview.lastError=null;
 await putRepoFile(path(),encode(fresh.doc),`Ava-Valt: record ${results.length} platform review results`,{expectedSha:fresh.sha});
 return {ok:true,checked:results.filter(r=>r.result!=="DEFERRED").length,suggested:results.filter(r=>r.result==="SUGGESTED").length,remaining:fresh.doc.avatars.length,blocked,pausedUntil,results:results.map(r=>({id:r.id,status:r.result,platforms:r.platforms}))};
}

export async function resumePlatformAutoReview(){
 const {doc,sha}=await readCurrent();
 doc.autoReview={...doc.autoReview,blocked:false,pausedUntil:null,lastError:null};
 await putRepoFile(path(),encode(doc),"Ava-Valt: owner resumed metadata provider review",{expectedSha:sha});
 return {ok:true};
}
