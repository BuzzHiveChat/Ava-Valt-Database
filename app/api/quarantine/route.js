import {ownerAuthorized} from "../../../lib/guard";
import {listQuarantined,ownerVerifyQuarantinedAvatar,ownerVerifyQuarantinedBatch} from "../../../lib/platformQuarantine";
export const dynamic="force-dynamic";
export const revalidate=0;
export const maxDuration=60;

export async function GET(req){
 if(!await ownerAuthorized())return Response.json({error:"Owner access required"},{status:403});
 try{
  const u=new URL(req.url);
  const data=await listQuarantined({
   search:u.searchParams.get("search")||"",
   page:Number(u.searchParams.get("page")||1),
   pageSize:Number(u.searchParams.get("pageSize")||50)
  });
  return Response.json(data,{headers:{"Cache-Control":"no-store"}});
 }catch(e){return Response.json({error:e.message},{status:500})}
}

export async function POST(req){
 if(!await ownerAuthorized())return Response.json({error:"Owner access required"},{status:403});
 try{
  const b=await req.json();
  if(Array.isArray(b?.items)){
   return Response.json(await ownerVerifyQuarantinedBatch(b.items));
  }
  return Response.json(await ownerVerifyQuarantinedAvatar(b?.id,b?.platforms));
 }catch(e){return Response.json({error:e.message},{status:500})}
}
