import {ownerAuthorized} from "../../../../lib/guard";
import {runAutomaticQuarantineRepair} from "../../../../lib/autoQuarantine";
export const maxDuration=60;
export async function POST(){
 if(!await ownerAuthorized())return Response.json({error:"Owner access required"},{status:403});
 try{return Response.json({ok:true,...await runAutomaticQuarantineRepair({force:true})})}
 catch(e){return Response.json({error:e.message},{status:500})}
}
