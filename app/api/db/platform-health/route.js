import {readPlatformReview} from "../../../../lib/platformReview";
export const dynamic="force-dynamic";
export const revalidate=0;

import {authorized} from "../../../../lib/guard";
import {readDb} from "../../../../lib/db";
import {quarantineStats} from "../../../../lib/platformQuarantine";
export async function GET(){
 if(!await authorized())return Response.json({error:"Unauthorized"},{status:401});
 try{
  const db=await readDb();
  let complete=0,unknown=0,pc=0,android=0,ios=0;
  for(const a of db.avatars){
   const raw=Array.isArray(a.platforms)?a.platforms:(typeof a.platforms==="string"?a.platforms.split(/[•,]/):[]);
   const ps=raw.map(x=>String(x).trim().toLowerCase()).filter(Boolean);
   if(!ps.length||ps.some(x=>x==="unknown"))unknown++; else complete++;
   if(ps.some(x=>/pc|windows/.test(x)))pc++;
   if(ps.some(x=>/android|quest/.test(x)))android++;
   if(ps.some(x=>/ios|iphone|ipad/.test(x)))ios++;
  }
  const q=await quarantineStats().catch(()=>({quarantined:0}));
  const review=await readPlatformReview().then(x=>x.avatars.length).catch(()=>null);
  return Response.json({total:db.avatars.length,complete,unknown,pc,android,ios,quarantined:q.quarantined||0,needsReview:review,done:unknown===0});
 }catch(e){return Response.json({error:e.message},{status:500})}
}
