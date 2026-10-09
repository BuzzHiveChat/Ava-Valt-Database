import {ownerAuthorized} from "../../../../lib/guard";
import {kitsuneWebsitePlatformLookup} from "../../../../lib/kitsuneWebsite";
export const dynamic="force-dynamic";
export const maxDuration=30;
export async function POST(req){
 if(!await ownerAuthorized())return Response.json({error:"Owner access required"},{status:403});
 try{
  const {id,name=""}=await req.json();
  if(!String(id||"").startsWith("avtr_"))return Response.json({error:"Enter an avtr_ ID"},{status:400});
  const result=await kitsuneWebsitePlatformLookup({id,name});
  return Response.json({ok:true,...result},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return Response.json({error:e.message},{status:500})}
}
