
import {authorized,ownerAuthorized} from "../../../lib/guard";
import {getSettings,saveSettings} from "../../../lib/settings";
export async function GET(){
 if(!await authorized())return Response.json({error:"Unauthorized"},{status:401});
 return Response.json(await getSettings());
}
export async function POST(req){
 if(!await ownerAuthorized())return Response.json({error:"Owner access required"},{status:403});
 const old=await getSettings(), body=await req.json(), clean={...old};
 if(typeof body.enabled==="boolean"){
   if(body.enabled){clean.enabled=true;clean.stopRequested=false}
   else if(old.running){clean.stopRequested=true} else {clean.enabled=false;clean.stopRequested=false}
 }
 if(Number.isFinite(Number(body.maxAddPerRun)))clean.maxAddPerRun=Math.min(Math.max(Number(body.maxAddPerRun),1),1000);
 if(typeof body.strictPlatformMode==="boolean")clean.strictPlatformMode=body.strictPlatformMode;
 if(Array.isArray(body.searchTerms))clean.searchTerms=body.searchTerms.map(String).map(x=>x.trim()).filter(Boolean).slice(0,50);
 if(body.providerEnabled&&typeof body.providerEnabled==="object")clean.providerEnabled={...old.providerEnabled,...body.providerEnabled};
 return Response.json(await saveSettings(clean,clean.stopRequested?"Request Ava-Valt importer stop":"Update Ava-Valt importer controls"));
}
