import test from 'node:test';
import assert from 'node:assert/strict';
import {findExactKitsuneAvatar,kitsunePlatformsFromRecord,kitsuneExactPlatformLookup} from '../lib/kitsuneLookup.mjs';
import {reviewProviderLookup} from '../lib/platformAutoReview.js';

const ID='avtr_e1161d4f-6876-464a-a988-89dcaaf4534c';
const OTHER='avtr_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});

test('exact ID wins over names and unrelated avatar cards',()=>{
 const r=findExactKitsuneAvatar({data:{avatars:[
  {id:OTHER,name:'Charging Apple Dog Rui',platform:'PC + Quest'},
  {id:ID,name:'Charging Apple Dog Rui',platform:'PC'}]}},ID);
 assert.equal(r.id,ID);
 assert.deepEqual(kitsunePlatformsFromRecord(r),['PC']);
});

test('translate explicit PC + Quest to PC + Android; recognise nested true flags',()=>{
 assert.deepEqual(kitsunePlatformsFromRecord({platformLabel:'PC + QUEST'}),['PC','Android']);
 assert.deepEqual(kitsunePlatformsFromRecord({platforms:{pc:true,quest:true,ios:false}}),['PC','Android']);
 assert.deepEqual(kitsunePlatformsFromRecord({supported_platforms:['standalonewindows','android']}),['PC','Android']);
});

test('unknown, false and empty performance are not treated as proof',()=>{
 assert.deepEqual(kitsunePlatformsFromRecord({platforms:{pc:false,quest:false},performance:{pc:'Unknown',android:'None'}}),[]);
});

test('exact-ID VRCX lookup reads metadata without scraping HTML',async()=>{
 const requested=[];
 const r=await kitsuneExactPlatformLookup({id:ID},{fetchImpl:async url=>{
  requested.push(url);
  return json({results:[{id:OTHER,platforms:['PC']},{id:ID,platformLabel:'PC + Quest'}]});
 }});
 assert.deepEqual(r.platforms,['PC','Android']);
 assert.equal(r.provider,'KitsuneDB (VRCX API)');
 assert.equal(r.matched,true);
 assert.equal(requested.length,1);
 assert.match(requested[0],/\/api\/integrations\/avatars\/vrcx\?/);
});

test('matching avatar with no API platform fields remains owner review, never guesses from badge',async()=>{
 const r=await kitsuneExactPlatformLookup({id:ID},{fetchImpl:async()=>json([{id:ID,name:'Charging Apple Dog Rui'}])});
 assert.deepEqual(r.platforms,[]);
 assert.equal(r.matched,true);
 assert.match(r.reason,/did not expose/i);
 assert.match(r.sourceUrl,/\/avatars\?/);
});

test('401 and 429 stop without trying another query',async()=>{
 for(const status of [401,429]){
  let calls=0;
  const r=await kitsuneExactPlatformLookup({id:ID},{fetchImpl:async()=>{calls++;return json({error:'denied'},status)}});
  assert.equal(r.status,status);assert.equal(calls,1);
 }
});

test('automatic lookup falls back to Kitsune only when NekoSune lacks data',async()=>{
 const old=globalThis.fetch;
 try{
  const urls=[];
  globalThis.fetch=async url=>{
   urls.push(String(url));
   if(String(url).includes('nekosunevr.co.uk'))return new Response(`<p>${ID} No platform information</p>`,{status:200});
   return json([{id:ID,platforms:{pc:true,quest:true}}]);
  };
  const r=await reviewProviderLookup({id:ID,name:'Charging Apple Dog Rui'});
  assert.deepEqual(r.platforms,['PC','Android']);
  assert.equal(urls.length,2);
 }finally{globalThis.fetch=old;}
});
