import {runAutoImport} from "../../../../lib/autoImport";
import {runAutomaticQuarantineRepair} from "../../../../lib/autoQuarantine";
export const maxDuration=60;

export async function GET(req){
 if(!process.env.CRON_SECRET || req.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)
   return Response.json({error:"Unauthorized"},{status:401});
 try{
   // Give quarantine repair a short independent pass on every scheduled cron.
   // It still runs even when the normal Auto Import switch is OFF.
   const quarantine=await runAutomaticQuarantineRepair({force:false}).catch(e=>({error:e.message}));
   const importer=await runAutoImport({force:false}).catch(e=>({error:e.message}));
   return Response.json({ok:!quarantine?.error&&!importer?.error,quarantine,importer});
 }catch(e){return Response.json({error:e.message},{status:500})}
}
