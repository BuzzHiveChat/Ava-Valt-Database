import {ownerAuthorized} from "../../../../lib/guard";
import {getSearchExportProgress,startSearchExport,publishNextSearchExport} from "../../../../lib/shardExport";
export const dynamic="force-dynamic";
export const maxDuration=60;
const noStore={"Cache-Control":"no-store"};
export async function GET(){
 if(!await ownerAuthorized())return Response.json({error:"Owner access required"},{status:403});
 try{return Response.json(await getSearchExportProgress(),{headers:noStore})}
 catch(e){return Response.json({error:e.message},{status:500,headers:noStore})}
}
export async function POST(req){
 if(!await ownerAuthorized())return Response.json({error:"Owner access required"},{status:403});
 try{
  const body=await req.json();
  const data=body.action==="start"?await startSearchExport():
    body.action==="next"?await publishNextSearchExport({batchSize:6}):null;
  if(!data)return Response.json({error:"Expected action=start or next"},{status:400});
  return Response.json(data,{headers:noStore});
 }catch(e){return Response.json({error:e.message},{status:500,headers:noStore})}
}
