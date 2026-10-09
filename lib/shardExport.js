// Safe, opt-in GitHub Pages search index publisher (legacy avatar-index.json stays authoritative).
// 256 stable URLs are chosen to permit preconfigured VRCUrl objects in Udon; do not modify the
// BUCKET_COUNT or bucketForToken without also regenerating world Inspector URLs.
import {readDb} from "./db";
import {getRepoFile,putRepoFile} from "./githubFile";
import {readOptOuts,filterExcluded} from "./optOut";

export const BUCKET_COUNT=256;
export const INDEX_PREFIX="search/v1";
const PROGRESS_PATH="search-export-progress.json";
const MANIFEST_PATH="search-manifest.json";
const BASE="https://buzzhivechat.github.io/Ava-Valt-Database/";
const validId=(id)=>typeof id==="string"&&/^avtr_[\da-f-]{36}$/i.test(id);
const key=id=>id.toLowerCase();
const twoCharTokens=(value)=>{
  let raw=Array.isArray(value)?value.join(" "):String(value??"");
  const words=raw.toLowerCase().match(/[a-z0-9]{2,}/g)||[];
  return words.map(w=>w.slice(0,2));
};
export function bucketForToken(token){
 let h=0;
 for(let i=0;i<token.length;i++)h=((h*31)+token.charCodeAt(i))&255;
 return h;
}
export function shardPath(bucket){
 if(!Number.isInteger(bucket)||bucket<0||bucket>=BUCKET_COUNT)throw new Error("Invalid search bucket");
 return `${INDEX_PREFIX}/${bucket.toString(16).padStart(2,"0")}.json`;
}
function trim(v,max=300){return typeof v==="string"?v.slice(0,max):""}
function slim(a){
 return {
  id:a.id, name:trim(a.name,180),author:trim(a.author||a.authorName,150),
  description:trim(a.description,440),platforms:a.platforms,tags:Array.isArray(a.tags)?a.tags.slice(0,16):trim(a.tags,400),
  performancePc:trim(a.performancePc,70), performanceAndroid:trim(a.performanceAndroid,70),performanceIos:trim(a.performanceIos,70),
  addedAt:trim(a.addedAt,50),updatedAt:trim(a.updatedAt,50)
 };
}
export function buildSearchBuckets(avatars){
 const all=Array.from({length:BUCKET_COUNT},()=>new Map());
 const ids=new Set();let ignored=0;
 for(const a of avatars||[]){
  if(!validId(a?.id)||ids.has(key(a.id))){ignored++;continue}
  ids.add(key(a.id));
  const tokens=new Set([
    ...twoCharTokens(a.name),...twoCharTokens(a.author||a.authorName),...twoCharTokens(a.tags)
  ]);
  // Indexing descriptions would multiply storage heavily; they are still searchable
  // inside a loaded bucket, but only names/authors/tags are used to route the query.
  const record=slim(a);
  for(const token of tokens){all[bucketForToken(token)].set(key(a.id),record)}
 }
 const buckets=all.map((entries,bucket)=>({version:1,bucket,avatars:[...entries.values()]}));
 return {buckets,unique:ids.size,ignored};
}
async function loadProgress(){
 try{return JSON.parse((await getRepoFile(PROGRESS_PATH)).text)}
 catch(e){if(e.message==="NOT_FOUND")return null;throw e}
}
async function storeProgress(progress){
 await putRepoFile(PROGRESS_PATH,JSON.stringify(progress,null,2)+"\n","Ava-Valt: record search export progress");
 return progress;
}
export async function getSearchExportProgress(){return await loadProgress()||{active:false,stage:"NOT STARTED",next:0,total:BUCKET_COUNT}}
async function exclusionFileSha(){try{return (await getRepoFile(process.env.AVATAR_OPTOUT_PATH||"avatar-opt-outs.json")).sha}catch(e){if(e.message==="NOT_FOUND")return "NONE";throw e}}
export async function startSearchExport(){
 const db=await readDb();
 // No deletion, rewriting, or renaming of avatar-index.json.
 return storeProgress({version:1,active:true,stage:"READY",sourceSha:db.sha,sourceCount:db.avatars.length,policySha:await exclusionFileSha(),
  next:0,total:BUCKET_COUNT,startedAt:new Date().toISOString(),error:null});
}
export async function publishNextSearchExport({batchSize=6}={}){
 let state=await loadProgress();
 if(!state?.active)throw new Error("No active search export. Start one first.");
 const db=await readDb();
 if(db.sha!==state.sourceSha||(await exclusionFileSha())!==(state.policySha||"NONE")){
  // Do NOT overwrite a newer database: importer/quarantine could have changed it.
  state=await storeProgress({...state,stage:"SOURCE CHANGED",active:false,error:"The database or privacy exclusion policy changed during export. Restart the export to publish a consistent snapshot."});
  return state;
 }
 if(db.avatars.length!==state.sourceCount)throw new Error("Database size differs from export source: restart the export");
 const {buckets,unique,ignored}=buildSearchBuckets(filterExcluded(db.avatars,await readOptOuts()));
 const max=Math.min(BUCKET_COUNT,Math.max(1,Math.min(10,Math.trunc(Number(batchSize)||6))));
 let next=state.next;
 const until=Math.min(BUCKET_COUNT,next+max);
 const maxFileBytes=Number(process.env.SEARCH_EXPORT_MAX_FILE_BYTES||5*1024*1024);
 for(;next<until;next++){
  const file=JSON.stringify(buckets[next])+"\n";
  const bytes=Buffer.byteLength(file);
  if(bytes>maxFileBytes){
   state=await storeProgress({...state,stage:"OVERSIZED BUCKET",active:false,next,error:`Bucket ${next} is ${bytes} bytes (limit ${maxFileBytes}); cannot safely publish. Need a smaller index format.`});
   return state;
  }
  await putRepoFile(shardPath(next),file,`Ava-Valt: publish search bucket ${next+1}/${BUCKET_COUNT}`);
 }
 state=await storeProgress({...state,next,stage:next===BUCKET_COUNT?"FINALIZING":"PUBLISHING",lastUpdatedAt:new Date().toISOString(),unique,ignored});
 if(next===BUCKET_COUNT){
  const manifest={version:1,searchMode:"two-letter-word-prefix",bucketCount:BUCKET_COUNT,
    baseUrl:BASE+INDEX_PREFIX+"/",sourceSha:state.sourceSha,total:unique,generatedAt:new Date().toISOString(),
    note:"Search terms require two letters; matching routes by name, author or tags."};
  // Publish manifest last, only when all buckets were successfully uploaded.
  await putRepoFile(MANIFEST_PATH,JSON.stringify(manifest,null,2)+"\n","Ava-Valt: publish complete search index manifest");
  state=await storeProgress({...state,active:false,stage:"COMPLETE",completedAt:new Date().toISOString()});
 }
 return state;
}
