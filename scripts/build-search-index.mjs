// Ava-Valt search index builder; runs on GitHub Actions, not on Vercel or inside Unity.
// Mirrors V2.25's fixed 256 URL hashing; never rename shards or change the algorithm
// without publishing a matching world update.
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const BUCKETS = 256;
const PREFIX = 'search/v1';
const MAX_BUCKET_BYTES = 5 * 1024 * 1024;
const MAX_PAGES_BYTES = 900 * 1024 * 1024;
const BASE_URL = 'https://buzzhivechat.github.io/Ava-Valt-Database/search/v1/';
const validId = id => typeof id === 'string' && /^avtr_[\da-f-]{36}$/i.test(id);
const key = id => id.toLowerCase();
const tokens = value => {
  const raw = Array.isArray(value) ? value.join(' ') : String(value ?? '');
  return (raw.toLowerCase().match(/[a-z0-9]{2,}/g) || []).map(w => w.slice(0, 2));
};
const bucketForToken = token => {
  let h = 0;
  for (let i=0; i<token.length; i++) h = ((h * 31) + token.charCodeAt(i)) & 255;
  return h;
};
const trim = (v, n=300) => typeof v === 'string' ? v.slice(0,n) : '';
const slim = a => ({
  id:a.id, name:trim(a.name,180),author:trim(a.author||a.authorName,150),
  description:trim(a.description,440),platforms:a.platforms,
  tags:Array.isArray(a.tags)?a.tags.slice(0,16):trim(a.tags,400),
  performancePc:trim(a.performancePc,70),performanceAndroid:trim(a.performanceAndroid,70),
  performanceIos:trim(a.performanceIos,70),addedAt:trim(a.addedAt,50),updatedAt:trim(a.updatedAt,50)
});

export function build(inputText) {
  const root = JSON.parse(inputText);
  const avatars = Array.isArray(root) ? root : root.avatars;
  let exclusions = {};
  try { exclusions = JSON.parse(readFileSync('avatar-opt-outs.json', 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const blockedIds = new Set((exclusions.excludedAvatars || []).map(x=>key(x.id)));
  const blockedCreators = new Set((exclusions.excludedCreators || []).map(x=>key(x.id)));
  const creatorKey = a => key(a.authorId || a.creatorId || a.author?.id || a.creator?.id);
  if (!Array.isArray(avatars)) throw new Error('avatar-index.json must contain an array or an object with an avatars array');
  const all=Array.from({length:BUCKETS},()=>new Map());
  const ids=new Set(); let ignored=0;
  for(const a of avatars){
    if(!validId(a?.id)||ids.has(key(a.id))||blockedIds.has(key(a.id))||blockedCreators.has(creatorKey(a))){ignored++;continue;}
    ids.add(key(a.id));
    const ts = new Set([...tokens(a.name),...tokens(a.author||a.authorName),...tokens(a.tags)]);
    const row = slim(a);
    for(const t of ts) all[bucketForToken(t)].set(key(a.id),row);
  }
  const out=[];
  let totalBytes=0;
  for(let bucket=0;bucket<BUCKETS;bucket++){
    const text=JSON.stringify({version:1,bucket,avatars:[...all[bucket].values()]})+'\n';
    const bytes=Buffer.byteLength(text);
    if(bytes>MAX_BUCKET_BYTES)throw new Error(`Bucket ${bucket} is ${bytes} bytes; the 256-file beta has reached its safe 5 MiB shard limit. No files have been published.`);
    totalBytes+=bytes;
    out.push(text);
  }
  if(totalBytes>MAX_PAGES_BYTES)throw new Error(`Search index is ${totalBytes} bytes; too large for the current GitHub Pages setup. No files have been published.`);
  // Equivalent to Git's blob SHA, used by the existing Unity-friendly manifest.
  const sourceSha=createHash('sha1').update(`blob ${Buffer.byteLength(inputText)}\0`).update(inputText).digest('hex');
  const manifest={version:1,searchMode:'two-letter-word-prefix',bucketCount:BUCKETS,
    baseUrl:BASE_URL,sourceSha,total:ids.size,generatedAt:new Date().toISOString(),
    note:'Search terms require two letters; matching routes by name, author or tags.'};
  return {out,manifest,unique:ids.size,ignored,totalBytes};
}

if(process.argv[1] && resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
  const input=readFileSync('avatar-index.json','utf8');
  const data=build(input); // Validate size of EVERY file before writing even one.
  mkdirSync(PREFIX,{recursive:true});
  for(let i=0;i<BUCKETS;i++){
    writeFileSync(`${PREFIX}/${i.toString(16).padStart(2,'0')}.json`,data.out[i]);
  }
  writeFileSync('search-manifest.json',JSON.stringify(data.manifest,null,2)+'\n');
  console.log(`Prepared ${BUCKETS} buckets, ${data.unique} unique avatars, ${data.ignored} duplicate/invalid skipped, ${data.totalBytes} bytes. Git will publish in one commit.`);
}
