import {runPlatformAutoReview} from "../../../../lib/platformAutoReview";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(req){
 if(!process.env.CRON_SECRET || req.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)
  return Response.json({error:"Unauthorized"},{status:401});
 try{const result=await runPlatformAutoReview();return Response.json(result,{headers:{"Cache-Control":"no-store"}});}
 catch(e){console.error("Platform auto review:",e?.message||e);return Response.json({error:e?.message||"Auto review failed"},{status:500});}
}
