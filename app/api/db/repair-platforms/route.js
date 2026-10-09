
import {authorized} from "../../../../lib/guard";
import {repairExistingPlatforms} from "../../../../lib/enrich";
export const maxDuration=60;
export async function POST(req){
 if(!await authorized())return Response.json({error:"Unauthorized"},{status:401});
 try{const b=await req.json().catch(()=>({}));return Response.json({ok:true,...await repairExistingPlatforms({limit:Number(b.limit)||50})})}
 catch(e){return Response.json({error:e.message},{status:500})}
}
