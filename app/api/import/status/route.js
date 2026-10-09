
import {authorized} from "../../../../lib/guard";
import {getSettings} from "../../../../lib/settings";
export async function GET(){
 if(!await authorized())return Response.json({error:"Unauthorized"},{status:401});
 const s=await getSettings();
 return Response.json({
  enabled:!!s.enabled,running:!!s.running,stopRequested:!!s.stopRequested,
  lastRun:s.lastRun,lastAdded:s.lastAdded||0,lastFound:s.lastFound||0,
  lastError:s.lastError||null,lastConflicts:s.lastConflicts||0,lastHealth:s.lastHealth||[]
 });
}
