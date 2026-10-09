import {ownerAuthorized} from "../../../lib/guard";
import {readOptOuts,approveExclusion,dismissRequest,revokeExclusion,applyOptOutCleanup,stageMarkerRequests,filterExcluded} from "../../../lib/optOut";
import {readDb} from "../../../lib/db";
export const dynamic="force-dynamic";
export const maxDuration=60;
const noCache={"Cache-Control":"no-store"};
export async function GET(){if(!await ownerAuthorized())return Response.json({error:"Owner only"},{status:403});try{return Response.json(await readOptOuts(),{headers:noCache})}catch(e){return Response.json({error:e.message},{status:500})}}
export async function POST(req){if(!await ownerAuthorized())return Response.json({error:"Owner only"},{status:403});try{
 const b=await req.json();let result;
 if(b.action==="approve")result=await approveExclusion(b);
 else if(b.action==="dismiss")result=await dismissRequest(b);
 else if(b.action==="revoke")result=await revokeExclusion(b);
 else if(b.action==="cleanup")result=await applyOptOutCleanup();
 else if(b.action==="scan"){const db=await readDb();const eligible=filterExcluded(db.avatars,await readOptOuts());const r=await stageMarkerRequests(eligible);result={held:r.held,queued:r.queued,available:r.allow.length};}
 else return Response.json({error:"Unknown action"},{status:400});
 return Response.json(result,{headers:noCache});
 }catch(e){return Response.json({error:e.message},{status:500,headers:noCache})}}
