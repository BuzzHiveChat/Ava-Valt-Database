import {authorized} from "../../../../lib/guard";
import {readDb,mergeAndSave,replaceAndSave} from "../../../../lib/db";
import {getSettings} from "../../../../lib/settings";
import {enrichNewAvatarsPlatforms} from "../../../../lib/enrich";
import {quarantineRecords} from "../../../../lib/platformQuarantine";
import {hasKnownPlatform} from "../../../../lib/platforms";
import {readOptOuts,filterExcluded,stageMarkerRequests} from "../../../../lib/optOut";
import {reportCommittedImport} from "../../../../website-integration/report-import.mjs";
export const maxDuration=60;

export async function POST(req){
 if(!await authorized())return Response.json({error:"Unauthorized"},{status:401});
 try{
  const {avatars=[],updateExisting=false}=await req.json();
  const allValid=avatars.filter(a=>a?.id?.startsWith("avtr_"));
  const eligible=filterExcluded(allValid,await readOptOuts());
  const markerReview=await stageMarkerRequests(eligible);
  const valid=markerReview.allow;
  const db=await readDb(),existing=new Map(db.avatars.filter(a=>a?.id).map(a=>[a.id,a]));
  const settings=await getSettings();
  const batch=await enrichNewAvatarsPlatforms(valid,{
   limit:Number(process.env.MANUAL_PLATFORM_RESOLVE_LIMIT||100),
   concurrency:Number(process.env.AUTO_IMPORT_PLATFORM_RESOLVE_CONCURRENCY||4),
   timeBudgetMs:Number(process.env.MANUAL_PLATFORM_RESOLVE_BUDGET_MS||25000)
  });

  const verified=[],unresolved=[];
  for(const a of batch.avatars)(hasKnownPlatform(a)?verified:unresolved).push(a);
  if(settings.strictPlatformMode!==false&&unresolved.length)await quarantineRecords(unresolved,{reason:"manual-import-platform-unresolved"});
  if(settings.strictPlatformMode===false)verified.push(...unresolved);

  const additions=verified.filter(a=>!existing.has(a.id));
  const updates=updateExisting?verified.filter(a=>existing.has(a.id)):[];

  let added=0,updated=0,total=db.avatars.length;
  if(additions.length){
   const r=await mergeAndSave(additions,`Ava-Valt manual importer: +${additions.length} platform-verified avatar(s)`);
   added=r.added;total=r.total;
  }
  if(updates.length){
   const latest=await readDb(),map=new Map(latest.avatars.filter(a=>a?.id).map(a=>[a.id,a]));
   for(const a of updates){map.set(a.id,{...map.get(a.id),...a});updated++}
   const r=await replaceAndSave([...map.values()],`Ava-Valt manual importer: update ${updated} avatar(s)`);
   total=r.total;
  }

  // Notify only after successful GitHub writes. Discord is an optional
  // downstream consumer: a webhook failure never fails this import.
  if (added > 0 || updated > 0) await reportCommittedImport('manual');

  return Response.json({
   added,updated,total,excludedOrHeld:allValid.length-valid.length,markerRequestsQueued:markerReview.queued,
   quarantined:settings.strictPlatformMode!==false?unresolved.length:0,
   verified:verified.length,
   breakdown:batch.stats
  });
 }catch(e){return Response.json({error:e.message},{status:500})}
}
