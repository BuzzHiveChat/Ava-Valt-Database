import test from 'node:test';
import assert from 'node:assert/strict';
import {platformSetFromAny} from '../lib/platforms.js';
import {searchProviders} from '../lib/providers.js';
const ID='avtr_00000000-0000-0000-0000-000000000002';
const json=x=>new Response(JSON.stringify(x),{status:200,headers:{'Content-Type':'application/json'}});

test('strict platform detector accepts positives, but rejects unknown/None and negative labels',()=>{
 assert.deepEqual(platformSetFromAny({platforms:[],platformLabel:'PC + Quest'}),['PC','Android']);
 assert.deepEqual(platformSetFromAny({performance:{android:'None',pc:'Unknown',ios:'Unavailable'}}),[]);
 assert.deepEqual(platformSetFromAny({platforms:'PC, Quest unsupported'}),['PC']);
 assert.deepEqual(platformSetFromAny({platforms:{pc:true,quest:false}}),['PC']);
 assert.deepEqual(platformSetFromAny({platforms:['standalonewindows'],performance:{android:'Good'}}),['PC','Android']);
});

test('IMPORT selecting KitsuneDB only performs one provider search and keeps Quest evidence',async()=>{
 const old=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async url=>{calls.push(String(url));return json({data:{avatars:[null,{id:ID,name:'Example',platforms:[],platformLabel:'PC + Quest'}]}})};
  const result=await searchProviders({query:'dog',mode:'search',limit:5,providers:['KitsuneDB']});
  assert.equal(calls.length,1);
  assert.match(calls[0],/avtr\.fumikoecho\.net/);
  assert.match(calls[0],/search=dog/);
  assert.deepEqual(result.avatars[0].platforms,['PC','Android']);
  assert.equal(result.health[0].provider,'KitsuneDB');
 }finally{globalThis.fetch=old;}
});

test('no enabled providers means no requests, never silently search all',async()=>{
 const old=globalThis.fetch;
 try{
  globalThis.fetch=async()=>{throw new Error('Should not make a provider request')};
  const r=await searchProviders({providers:[]});
  assert.equal(r.avatars.length,0);assert.equal(r.health.length,0);
 }finally{globalThis.fetch=old;}
});

test('unknown first provider does not mask KitsuneDB platform evidence for same ID',async()=>{
 const old=globalThis.fetch;
 try{
  globalThis.fetch=async url=>String(url).includes('vrcx.avtr.zip')
   ?json([{id:ID,name:'Example',platforms:[]}])
   :json([{id:ID,name:'Example',platformLabel:'PC + Quest'}]);
  const r=await searchProviders({query:'Example',providers:['AvtrZip','KitsuneDB'],limit:5});
  assert.equal(r.avatars.length,1);
  assert.deepEqual(r.avatars[0].platforms,['PC','Android']);
  assert.equal(r.avatars[0].metadataProvider,'KitsuneDB');
 }finally{globalThis.fetch=old;}
});
