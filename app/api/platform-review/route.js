import {ownerAuthorized} from "../../../lib/guard";
import {listPlatformReview,ownerVerifyReviewedAvatar,ownerVerifyReviewedBatch,ownerDismissReviewedAvatar} from "../../../lib/platformReview";
import {runPlatformAutoReview,resumePlatformAutoReview} from "../../../lib/platformAutoReview";
export const dynamic="force-dynamic";
export const revalidate=0;
export const maxDuration=60;

export async function GET(req){
 if(!await ownerAuthorized())return Response.json({error:"Owner access required"},{status:403});
 try{
  const u=new URL(req.url);
  const result=await listPlatformReview({
   search:u.searchParams.get("search")||"",page:Number(u.searchParams.get("page")||1),
   pageSize:Number(u.searchParams.get("pageSize")||50)
  });
  return Response.json(result,{headers:{"Cache-Control":"no-store"}});
 }catch(e){return Response.json({error:e.message},{status:500})}
}

export async function POST(req){
 if(!await ownerAuthorized())return Response.json({error:"Owner access required"},{status:403});
 try{
  const b=await req.json();
  if(b?.action==="verify")return Response.json(await ownerVerifyReviewedAvatar(b.id,b.platforms));
  if(b?.action==="verify-batch")return Response.json(await ownerVerifyReviewedBatch(b.items));
  if(b?.action==="dismiss")return Response.json(await ownerDismissReviewedAvatar(b.id));
  if(b?.action==="auto-run")return Response.json(await runPlatformAutoReview());
  if(b?.action==="auto-resume")return Response.json(await resumePlatformAutoReview());
  return Response.json({error:"Unsupported action"},{status:400});
 }catch(e){return Response.json({error:e.message},{status:400})}
}
