import test from 'node:test';
import assert from 'node:assert/strict';
import {runPlatformAutoReview} from '../lib/platformAutoReview.js';
process.env.PLATFORM_REVIEW_AUTO_ENABLED='true';
process.env.PLATFORM_REVIEW_PER_HOUR='5';
process.env.GITHUB_TOKEN='unit-test-placeholder';
const NOW=Date.parse('2026-10-08T12:00:00.000Z');
const ID='avtr_00000000-0000-0000-0000-000000000001';
let contents,sha,providerCalls,writes,providerStatus;
const init=()=>{
 contents={version:1,avatars:[{id:ID,name:'Example avatar',platforms:[],author:'Test'}],dismissedIds:[]};
 sha='sha0';providerCalls=0;writes=[];providerStatus=200;
};
const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
globalThis.fetch=async(url,options={})=>{
 const str=String(url);let resource='';
 if(str.includes('api.github.com/repos')){
  resource=str.split('/contents/')[1]?.split('?')[0]||'';
  if(resource==='avatar-opt-outs.json')return respond({message:'Not Found'},404);
  if(resource!=='platform-needs-review.json')throw Error('Unexpected GitHub file: '+resource);
  if(options.method==='PUT'){
   const body=JSON.parse(options.body);
   if(body.sha!==sha)return respond({message:'SHA conflict'},409);
   contents=JSON.parse(Buffer.from(body.content,'base64').toString());
   sha='sha'+(writes.length+1);writes.push(contents);
   return respond({commit:{sha}});
  }
  return respond({sha,content:Buffer.from(JSON.stringify(contents)).toString('base64')});
 }
 if(str.startsWith('https://vrcavatarsearch.nekosunevr.co.uk/')){
  providerCalls++;
  if(providerStatus!==200)return respond('Denied',providerStatus);
  return new Response(`<html><body>${ID} Platform: PC, Android Open in VRCX</body></html>`,{status:200});
 }
 throw Error('Unexpected network request: '+str);
};
test('one exact-ID metadata lookup suggests platforms but never edits live database',async()=>{
 init();
 const a=await runPlatformAutoReview({now:NOW});
 assert.equal(a.checked,1);assert.equal(a.suggested,1);assert.equal(providerCalls,1);
 assert.deepEqual(contents.avatars[0].autoReviewSuggestion,['PC','Android']);
 assert.equal(contents.avatars[0].platforms.length,0);
 assert.equal(writes.length,2);
 const b=await runPlatformAutoReview({now:NOW+1000});
 assert.equal(b.skipped,true);assert.equal(providerCalls,1);
});
test('third-party access denial halts auto-lookup and prevents repeated requests',async()=>{
 init();providerStatus=403;
 const a=await runPlatformAutoReview({now:NOW});
 assert.equal(a.blocked,true);assert.equal(contents.autoReview.blocked,true);
 const b=await runPlatformAutoReview({now:NOW+2000});
 assert.equal(b.skipped,true);assert.equal(providerCalls,1);
});
