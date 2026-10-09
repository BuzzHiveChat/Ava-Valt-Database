
import {ownerAuthorized} from "../../../../lib/guard";
import {removeUnknownPlatformAvatars} from "../../../../lib/db";
export async function POST(req){
 if(!await ownerAuthorized())return Response.json({error:"Owner access required"},{status:403});
 try{
  const b=await req.json().catch(()=>({}));
  if(b.confirm!=="REMOVE_UNKNOWN")return Response.json({error:"Confirmation required"},{status:400});
  return Response.json({ok:true,...await removeUnknownPlatformAvatars()});
 }catch(e){return Response.json({error:e.message},{status:500})}
}
