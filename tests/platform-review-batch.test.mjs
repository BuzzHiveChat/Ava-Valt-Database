import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerVerifyReviewedBatch,ownerVerifyReviewedAvatar} from '../lib/platformReview.js';

const ids=Array.from({length:7},(_,i)=>`avtr_00000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`);
const [newId,existingId,excludedId,markedId,invalidId,concurrentId,singleId]=ids;
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}});
let store,sha,writes,conflictFirst,failCleanup;
function avatar(id,extra={}){return {id,name:'Queue avatar '+id.slice(-2),authorName:'Original creator',platforms:[],autoReviewSuggestion:['PC'],...extra};}
function setup(){
 store={
  'platform-needs-review.json':{version:1,avatars:[
   avatar(newId),avatar(existingId),avatar(excludedId),
   avatar(markedId,{description:'please unlist this avatar'}),
   avatar(invalidId),avatar(singleId)],dismissedIds:[],autoReview:{lastRunAt:'2026-10-08T00:00:00Z'}},
  'avatar-index.json':{version:1,avatars:[{id:existingId,name:'Original live name',description:'Keep this metadata',platforms:[]}]},
  'avatar-opt-outs.json':{version:1,excludedAvatars:[{id:excludedId}],excludedCreators:[],pending:[],dismissedRequests:[]}
 };
 sha={};for(const k of Object.keys(store))sha[k]='sha0';
 writes=[];conflictFirst=false;failCleanup=false;
 globalThis.fetch=async(url,options={})=>{
  const path=String(url).split('/contents/')[1]?.split('?')[0];
  if(!path||!Object.hasOwn(store,path))throw Error('Unexpected request: '+url);
  if(options.method==='PUT'){
   const data=JSON.parse(options.body);
   if(failCleanup&&path==='platform-needs-review.json')return json({message:'Unable to write review queue'},500);
   if(conflictFirst&&path==='avatar-index.json'){
    conflictFirst=false;
    store[path].avatars.push({id:concurrentId,name:'Added concurrently',platforms:['PC']});
    sha[path]='other-commit';
    return json({message:'Conflict'},409);
   }
   if(sha[path]!==data.sha)return json({message:'Conflict'},409);
   store[path]=JSON.parse(Buffer.from(data.content,'base64').toString('utf8'));
   sha[path]='sha'+(writes.length+1);writes.push(path);
   return json({content:{sha:sha[path]}});
  }
  return json({sha:sha[path],content:Buffer.from(JSON.stringify(store[path])).toString('base64')});
 };
}
const platformOf=id=>store['avatar-index.json'].avatars.find(a=>a.id===id)?.platforms;
const queued=id=>store['platform-needs-review.json'].avatars.some(a=>a.id===id);

test('batch verifies ticked avatars in one live DB write, repairs existing UNKNOWN record and keeps failures',async()=>{
 setup();
 const r=await ownerVerifyReviewedBatch([
  {id:newId,platforms:['PC','Android']},
  {id:existingId,platforms:['Android']},
  {id:excludedId,platforms:['PC']},
  {id:markedId,platforms:['PC']},
  {id:invalidId,platforms:['Unknown']}
 ]);
 assert.equal(r.succeeded,2);assert.equal(r.failed,3);
 assert.equal(r.added,1);assert.equal(r.updated,1);
 assert.deepEqual(platformOf(newId),['PC','Android']);
 assert.deepEqual(platformOf(existingId),['Android']);
 assert.equal(store['avatar-index.json'].avatars.find(a=>a.id===existingId).description,'Keep this metadata');
 assert.equal(store['avatar-index.json'].avatars.find(a=>a.id===newId).autoReviewSuggestion,undefined);
 assert.equal(queued(newId),false);assert.equal(queued(existingId),false);
 assert.equal(queued(excludedId),true);assert.equal(queued(markedId),true);assert.equal(queued(invalidId),true);
 assert.equal(store['platform-needs-review.json'].autoReview.lastRunAt,'2026-10-08T00:00:00Z');
 assert.equal(store['avatar-opt-outs.json'].pending.length,1);
 assert.equal(writes.filter(x=>x==='avatar-index.json').length,1);
 assert.equal(writes.filter(x=>x==='platform-needs-review.json').length,1);
});

test('duplicate IDs, unverified platforms and stale entries are rejected without writing live DB',async()=>{
 setup();
 const result=await ownerVerifyReviewedBatch([
  {id:newId,platforms:[]},{id:invalidId,platforms:['PC','Unsupported']},
  {id:'avtr_00000000-0000-0000-0000-000000099999',platforms:['PC']},
  {id:newId,platforms:['PC']}
 ]);
 assert.equal(result.succeeded,0);assert.equal(result.failed,4);
 assert.equal(writes.length,0);
 assert(queued(newId));
 await assert.rejects(()=>ownerVerifyReviewedBatch([]),/Choose 1/);
 await assert.rejects(()=>ownerVerifyReviewedBatch(Array.from({length:51},()=>({id:newId,platforms:['PC']}))),/Choose 1/);
});

test('GitHub SHA conflict retries without losing concurrent additions',async()=>{
 setup();conflictFirst=true;
 const result=await ownerVerifyReviewedBatch([{id:newId,platforms:['PC']}]);
 assert.equal(result.succeeded,1);
 assert.deepEqual(platformOf(concurrentId),['PC']);
 assert.deepEqual(platformOf(newId),['PC']);
});

test('review-queue cleanup failure is explicitly reported and imported avatars are not lost',async()=>{
 setup();failCleanup=true;
 const result=await ownerVerifyReviewedBatch([{id:newId,platforms:['PC']}]);
 assert.equal(result.succeeded,1);
 assert.match(result.cleanupError,/could not be cleared/i);
 assert(queued(newId));
 assert.deepEqual(platformOf(newId),['PC']);
});

test('individual verification also updates existing unknown-platform record',async()=>{
 setup();
 const result=await ownerVerifyReviewedAvatar(existingId,['PC','iOS']);
 assert.equal(result.ok,true);assert.deepEqual(platformOf(existingId),['PC','iOS']);
 assert(!queued(existingId));
});
