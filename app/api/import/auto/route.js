
import {authorized} from "../../../../lib/guard";
import {runAutoImport} from "../../../../lib/autoImport";
export const maxDuration=60;
export async function POST(){
 if(!await authorized())return Response.json({error:"Unauthorized"},{status:401});
 try{return Response.json({ok:true,...await runAutoImport({force:true})})}
 catch(e){return Response.json({error:e.message},{status:500})}
}
