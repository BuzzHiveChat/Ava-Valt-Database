import {authorized} from "../../../../lib/guard";
import {searchProviders} from "../../../../lib/providers";
import {getSettings} from "../../../../lib/settings";

export async function POST(req){
 if(!await authorized())return Response.json({error:"Unauthorized"},{status:401});
 try{
  const body=await req.json();
  const settings=await getSettings();
  const enabled=Object.keys(settings.providerEnabled||{}).filter(name=>settings.providerEnabled[name]);
  const requested=Array.isArray(body.providers)?body.providers:enabled;
  const allowed=requested.filter(name=>enabled.includes(name));
  if(!allowed.length)return Response.json({avatars:[],health:[],notes:["No enabled IMPORT providers selected."]});
  return Response.json(await searchProviders({...body,providers:allowed}));
 }catch(e){return Response.json({error:e.message},{status:500});}
}
