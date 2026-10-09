import {authorized} from "../../../../lib/guard";
import {searchProviders} from "../../../../lib/providers";
import {getSettings} from "../../../../lib/settings";
import {readDb} from "../../../../lib/db";

const ID=/^avtr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const maxDuration=60;
export async function POST(req){
 if(!await authorized())return Response.json({error:"Unauthorized"},{status:401});
 try{
  const {ids=[]}=await req.json();
  if(!Array.isArray(ids)||ids.length>20||ids.some(id=>typeof id!=="string"||!ID.test(id)))return Response.json({error:"Submit up to 20 valid VRChat avatar IDs."},{status:400});
  const unique=[...new Set(ids.map(x=>x.toLowerCase()))];
  const db=await readDb();
  const existing=new Map(db.avatars.filter(a=>a?.id).map(a=>[a.id.toLowerCase(),a]));
  const settings=await getSettings();
  const enabled=Object.entries(settings.providerEnabled||{}).filter(([,on])=>on).map(([name])=>name);
  // Fetch each exact ID rather than treating fuzzy provider matches as the requested avatar.
  const entries=[];
  // Bounded parallelism: even 20 Discord submissions should complete promptly.
  for(let i=0;i<unique.length;i+=4){
   const batch=await Promise.all(unique.slice(i,i+4).map(async id=>{
    const prior=existing.get(id);
    if(prior)return {id,existing:true,avatar:prior,source:"Live database"};
    try{
     const result=enabled.length?await searchProviders({query:id,mode:"search",limit:60,providers:enabled}):{avatars:[]};
     const avatar=result.avatars.find(a=>a.id?.toLowerCase()===id);
     return {id,existing:false,avatar:avatar||null,source:avatar?.metadataProvider||null};
    }catch{return {id,existing:false,avatar:null,source:null};}
   }));
   entries.push(...batch);
  }
  return Response.json({entries});
 }catch(e){return Response.json({error:e.message},{status:500});}
}
