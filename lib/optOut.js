// Server-only creator opt-out policy. Only Owner-approved entries exclude globally.
// Untrusted provider strings are *requests for review*, never proof of ownership.
import {getRepoFile,putRepoFile} from "./githubFile";
import {readDb,removeIdsAndSave} from "./db";

const PATH=()=>process.env.AVATAR_OPTOUT_PATH||"avatar-opt-outs.json";
const idKey=v=>String(v||"").trim().toLowerCase();
const AVATAR=/^avtr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CREATOR=/^usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bounded=(v,n=240)=>String(v||"").trim().slice(0,n);
const empty=()=>({version:1,updated:null,excludedAvatars:[],excludedCreators:[],pending:[],dismissedRequests:[]});
export const avatarKey=idKey;
export function creatorIdOf(a){return idKey(a?.authorId||a?.creatorId||a?.author?.id||a?.creator?.id)}
export function policySets(doc){return {avatars:new Set((doc?.excludedAvatars||[]).map(a=>idKey(a.id))),creators:new Set((doc?.excludedCreators||[]).map(a=>idKey(a.id)))};}
export function isExcluded(a,doc){if(!a?.id)return false;const {avatars,creators}=policySets(doc);return avatars.has(idKey(a.id))||creators.has(creatorIdOf(a));}
export function filterExcluded(avatars,doc){const {avatars:ids,creators}=policySets(doc);return (avatars||[]).filter(a=>a?.id&&!ids.has(idKey(a.id))&&!creators.has(creatorIdOf(a)));}
export async function readOptOuts(){
 try{const file=await getRepoFile(PATH());const j=JSON.parse(file.text||"{}");return {...empty(),...j,excludedAvatars:Array.isArray(j.excludedAvatars)?j.excludedAvatars:[],excludedCreators:Array.isArray(j.excludedCreators)?j.excludedCreators:[],pending:Array.isArray(j.pending)?j.pending:[],dismissedRequests:Array.isArray(j.dismissedRequests)?j.dismissedRequests:[]};}
 catch(e){if(e.message==="NOT_FOUND")return empty();throw e}
}
async function save(doc,message){const out={...doc,version:1,updated:new Date().toISOString()};await putRepoFile(PATH(),JSON.stringify(out,null,2)+"\n",message);return out;}
const token=(s,m)=>new RegExp(`(?:^|[^a-zA-Z0-9_])${m}(?=$|[^a-zA-Z0-9_])`,"i").test(String(s||""));
export function detectOptOutMarkers(a){
 // Description is often community-provider data; only an Owner may approve a policy.
 const avatarDescription=a?.description||a?.avatarDescription||"";
 const bio=a?.authorBio||a?.authorDescription||a?.creatorBio||"";
 const avatar=token(avatarDescription,"blacklist")?"blacklist":token(avatarDescription,"unlist")?"unlist":null;
 const creator=token(bio,"permanent_unlist")?"permanent_unlist":null;
 return {avatar,creator};
}
export async function stageMarkerRequests(avatars){
 const source=(avatars||[]).filter(a=>AVATAR.test(String(a?.id||"")));
 if(!source.length)return {held:0,queued:0,allow:[]};
 const doc=await readOptOuts();
 const already=new Set(doc.pending.map(x=>`${x.type}:${idKey(x.id)}:${x.marker}`));
 const dismissed=new Set(doc.dismissedRequests.map(x=>`${x.type}:${idKey(x.id)}:${x.marker}`));
 const rows=[];const held=new Set();
 const pendingAvatarIds=new Set(doc.pending.filter(x=>x.type==="avatar").map(x=>idKey(x.id)));
 const pendingCreatorIds=new Set(doc.pending.filter(x=>x.type==="creator").map(x=>idKey(x.id)));
 for(const a of source){
  const match=detectOptOutMarkers(a);
  const candidate=[];
  if(match.avatar)candidate.push({id:idKey(a.id),type:"avatar",marker:match.avatar});
  if(match.creator){const creator=creatorIdOf(a),knownCreator=CREATOR.test(creator);
   candidate.push({id:knownCreator?creator:idKey(a.id),type:knownCreator?"creator":"avatar",marker:"permanent_unlist"});
  }
  for(const m of candidate){
   const k=`${m.type}:${m.id}:${m.marker}`;
   if(dismissed.has(k))continue; // Owner explicitly decided the marker wasn't a valid opt-out.
   held.add(idKey(a.id));
   if(!already.has(k)){
    rows.push({...m,avatarId:idKey(a.id),creatorId:creatorIdOf(a),name:bounded(a.name,140),source:bounded(a.metadataProvider||"provider"),reportedAt:new Date().toISOString()});already.add(k);
   }
  }
  // If there is already an unreviewed opt-out claim, still hold matching records.
  if(pendingAvatarIds.has(idKey(a.id))||pendingCreatorIds.has(creatorIdOf(a)))held.add(idKey(a.id));
 }
 if(rows.length){
  if(doc.pending.length+rows.length>2000)throw new Error("Opt-out review queue is full; Owner review required before importing further marker-bearing avatars.");
  await save({...doc,pending:[...doc.pending,...rows]},`Ava-Valt: stage ${rows.length} possible creator opt-out marker(s)`);
 }
 return {held:held.size,queued:rows.length,allow:source.filter(a=>!held.has(idKey(a.id)))};
}
// Do not let a creator-wide exclusion be claimed by a display-name match.
export async function approveExclusion({type,id,marker="owner-request",reason="",proof="owner-verified"}={}){
 const kind=type==="creator"?"creator":"avatar";
 const value=idKey(id);
 if(!(kind==="creator"?CREATOR:AVATAR).test(value))throw new Error(`Valid ${kind} ID required.`);
 if(!["owner-verified","official-profile-marker","avatar-description-marker","creator-request-verified"].includes(proof))throw new Error("Choose how ownership or the marker was verified.");
 const doc=await readOptOuts();const field=kind==="creator"?"excludedCreators":"excludedAvatars";
 const entry={id:value,marker:bounded(marker,40),reason:bounded(reason,240),verifiedBy:"Owner",proof,approvedAt:new Date().toISOString()};
 const rows=[...doc[field].filter(x=>idKey(x.id)!==value),entry];
 const pending=doc.pending.filter(x=>!(x.type===kind&&idKey(x.id)===value));
 await save({...doc,[field]:rows,pending},`Ava-Valt: approved ${kind} opt-out ${value}`);
 // The policy is durable FIRST, so future import attempts will be blocked even if
 // an external GitHub error prevents immediate cleanup. Owner can retry cleanup.
 const cleanup=await applyOptOutCleanup();
 return {ok:true,entry,cleanup};
}
export async function dismissRequest({type,id,marker}={}){
 const doc=await readOptOuts();const rest=doc.pending.filter(x=>!(x.type===type&&idKey(x.id)===idKey(id)&&x.marker===marker));
 if(rest.length===doc.pending.length)throw new Error("Request not found; refresh the page.");
 const dismissedRequests=[...doc.dismissedRequests.filter(x=>!(x.type===type&&idKey(x.id)===idKey(id)&&x.marker===marker)),{type,id:idKey(id),marker,reviewedAt:new Date().toISOString()}];
 await save({...doc,pending:rest,dismissedRequests},`Ava-Valt: reviewed opt-out marker ${bounded(id,70)}`);
 return {ok:true};
}
export async function revokeExclusion({type,id}={}){
 const doc=await readOptOuts();const field=type==="creator"?"excludedCreators":"excludedAvatars";
 const next=doc[field].filter(x=>idKey(x.id)!==idKey(id));
 if(next.length===doc[field].length)throw new Error("Exclusion not found.");
 await save({...doc,[field]:next},`Ava-Valt: Owner revoked opt-out ${bounded(id,70)}`);
 return {ok:true,note:"Revocation does not automatically republish or restore deleted avatars."};
}
export async function applyOptOutCleanup(){
 const policy=await readOptOuts();
 const live=await readDb();const doomed=live.avatars.filter(a=>isExcluded(a,policy)).map(a=>a.id);
 let removed=0;
 if(doomed.length){const result=await removeIdsAndSave(doomed,"Ava-Valt: remove Owner-verified opt-out avatars");removed=result.removed}
 // Exclude from quarantine & pending review. Writes only when they need editing.
 const summaries={liveRemoved:removed,quarantineRemoved:0,reviewRemoved:0};
 const docs=[{path:process.env.UNKNOWN_PLATFORM_QUARANTINE_PATH||"unknown-platform-quarantine.json",name:"quarantineRemoved"},{path:process.env.PLATFORM_NEEDS_REVIEW_PATH||"platform-needs-review.json",name:"reviewRemoved"}];
 for(const f of docs){
  try{const curr=await getRepoFile(f.path);const doc=JSON.parse(curr.text||"{}");const rows=Array.isArray(doc)?doc:(doc.avatars||[]);
   const kept=filterExcluded(rows,policy);const diff=rows.length-kept.length;
   if(diff){const next=Array.isArray(doc)?kept:{...doc,avatars:kept,updated:new Date().toISOString()};await putRepoFile(f.path,JSON.stringify(next,null,2)+"\n",`Ava-Valt: opt-out cleanup ${f.path}`)}
   summaries[f.name]=diff;
  }catch(e){if(e.message!=="NOT_FOUND")throw e}
 }
 return summaries;
}
