import {repairExistingPlatforms,enrichNewAvatarsPlatforms} from "./enrich";
import {quarantineUnknownFromLiveDb,repairQuarantinedPlatforms,quarantineRecords} from "./platformQuarantine";
import {hasKnownPlatform,normalizeAvatarPlatforms,platformSetFromAny} from "./platforms";
import {readDb,mergeAndSave} from "./db";
import {searchProviders} from "./providers";
import {getSettings,saveSettings} from "./settings";
import {databaseIntegrity} from "./integrity";
import {readOptOuts,filterExcluded,stageMarkerRequests} from "./optOut";
import {reportCommittedImport} from "../website-integration/report-import.mjs";

const iso=()=>new Date().toISOString();

export async function runAutoImport({force=false}={}){
 let settings=await getSettings();
 if(settings.running)return {skipped:true,reason:"An import is already running",settings};
 if(!settings.enabled&&!force)return {skipped:true,reason:"Auto Import is stopped",settings};

 settings=await saveSettings({...settings,running:true,currentStage:"CHECKING LIVE DATABASE",stageUpdatedAt:iso(),lastError:null},"Ava-Valt importer started");

 let preImportPlatformCheck={checked:0,fixed:0,remaining:null,error:null};
 let strictCleanup={moved:0,quarantined:0,error:null};
 let quarantineRepair={checked:0,restored:0,remaining:0,error:null};
 let integrity={duplicateGroups:0,duplicateRecords:0,invalidIds:0,repaired:false,error:null};

 try{
  try{integrity=await databaseIntegrity({repair:true})}
  catch(e){integrity={duplicateGroups:0,duplicateRecords:0,invalidIds:0,repaired:false,error:e?.message||String(e)}}
  // Strict mode's first job is to guarantee that the LIVE DB has no Unknown records.
  if(settings.strictPlatformMode!==false){
   try{strictCleanup=await quarantineUnknownFromLiveDb()}catch(e){strictCleanup={moved:0,quarantined:0,error:e?.message||String(e)}}
   try{
    quarantineRepair=await repairQuarantinedPlatforms({
     limit:Number(process.env.QUARANTINE_PLATFORM_REPAIR_LIMIT||2),
     timeBudgetMs:Number(process.env.QUARANTINE_PLATFORM_REPAIR_BUDGET_MS||4500)
    });
   }catch(e){quarantineRepair={checked:0,restored:0,remaining:0,error:e?.message||String(e)}}
  }else{
   try{
    const rr=await repairExistingPlatforms({
     limit:Number(process.env.PRE_IMPORT_PLATFORM_REPAIR_LIMIT||3),
     timeBudgetMs:Number(process.env.PRE_IMPORT_PLATFORM_REPAIR_BUDGET_MS||6000)
    });
    preImportPlatformCheck={checked:Number(rr?.checked||0),fixed:Number(rr?.fixed||0),remaining:rr?.remaining??null,error:null};
   }catch(e){preImportPlatformCheck.error=e?.message||String(e)}
  }

  settings=await getSettings();
  if(settings.stopRequested){
   const final=await saveSettings({...settings,enabled:false,stopRequested:false,running:false,currentStage:"STOPPED",stageUpdatedAt:iso()},"Ava-Valt importer stopped during preflight");
   return {skipped:true,reason:"Stopped during platform preflight",preImportPlatformCheck,strictCleanup,quarantineRepair,settings:final};
  }

  settings=await saveSettings({...settings,running:true,currentStage:"DISCOVERING NEW AVATARS",stageUpdatedAt:iso(),lastError:null},"Ava-Valt importer discovering avatars");

  const initial=await readDb();
  const known=new Set(initial.avatars.filter(a=>a?.id).map(a=>a.id));
  const cap=Math.min(Math.max(Number(settings.maxAddPerRun||300),1),1000);
  const chosen=Object.entries(settings.providerEnabled||{}).filter(([,v])=>v).map(([k])=>k);
  const allTerms=(settings.searchTerms?.length?settings.searchTerms:["avatar"]).filter(Boolean);
  const termsPerRun=Math.min(Math.max(Number(process.env.AUTO_IMPORT_TERMS_PER_RUN||3),1),Math.max(1,allTerms.length));
  const discoveryBudgetMs=Math.max(4000,Number(process.env.AUTO_IMPORT_DISCOVERY_BUDGET_MS||12000));
  const discoveryStarted=Date.now();
  const startCursor=Math.abs(Number(settings.searchTermCursor||0))%Math.max(1,allTerms.length);
  const merged=new Map(),health=[],termsTried=[];

  for(let n=0;n<termsPerRun;n++){
   if(Date.now()-discoveryStarted>=discoveryBudgetMs||merged.size>=cap)break;
   const idx=(startCursor+n)%allTerms.length,term=allTerms[idx];
   termsTried.push(term);
   const r=await searchProviders({query:term,mode:"search",limit:250,providers:chosen});
   health.push(...r.health.map(h=>({...h,term})));
   for(const a of r.avatars){
    if(!a?.id||known.has(a.id)||merged.has(a.id))continue;
    merged.set(a.id,normalizeAvatarPlatforms(a));
    if(merged.size>=cap)break;
   }
  }

  settings=await saveSettings({...await getSettings(),running:true,currentStage:"VERIFYING NEW AVATAR PLATFORMS",stageUpdatedAt:iso()},"Ava-Valt importer verifying platforms");

  const optOutPolicy=await readOptOuts();
  const eligible=filterExcluded([...merged.values()].slice(0,cap),optOutPolicy);
  const markerReview=await stageMarkerRequests(eligible);
  const discovered=markerReview.allow;
  const verification=await enrichNewAvatarsPlatforms(discovered,{
   limit:Number(process.env.AUTO_IMPORT_PLATFORM_RESOLVE_LIMIT||100),
   concurrency:Number(process.env.AUTO_IMPORT_PLATFORM_RESOLVE_CONCURRENCY||4),
   timeBudgetMs:Number(process.env.AUTO_IMPORT_PLATFORM_RESOLVE_BUDGET_MS||22000)
  });

  const verified=[],unresolved=[];
  for(const a of verification.avatars){
   if(hasKnownPlatform(a))verified.push(a);else unresolved.push(a);
  }

  if(settings.strictPlatformMode!==false&&unresolved.length){
   await quarantineRecords(unresolved,{reason:"new-import-platform-unresolved"});
  }else if(settings.strictPlatformMode===false){
   verified.push(...unresolved);
  }

  settings=await saveSettings({...await getSettings(),running:true,currentStage:"SAVING VERIFIED AVATARS",stageUpdatedAt:iso()},"Ava-Valt importer saving avatars");

  const additions=verified.slice(0,cap);
  const saved=additions.length
   ?await mergeAndSave(additions,`Ava-Valt auto importer: +up to ${additions.length} platform-verified avatars`)
   :{added:0,total:(await readDb()).avatars.length,conflicts:0};

  const latestSettings=await getSettings();
  const shouldStop=!!latestSettings.stopRequested;
  const keepEnabled=force?!!latestSettings.enabled:!shouldStop;
  const nextCursor=allTerms.length?((startCursor+Math.max(1,termsTried.length))%allTerms.length):0;

  const breakdown={
   discovered:merged.size,excludedOrHeld:merged.size-discovered.length,markerRequestsQueued:markerReview.queued,
   verifiedAtDiscovery:verification.stats.alreadyVerified,
   platformLookupsAttempted:verification.stats.attempted,
   resolvedByLookup:verification.stats.resolvedByLookup,
   verifiedForLiveDb:additions.length,
   quarantined:settings.strictPlatformMode!==false?unresolved.length:0,
   deferred:verification.stats.deferred,
   platformCounts:verification.stats.platformCounts,
   sourceCounts:verification.stats.sourceCounts,
   termsTried,
   verificationTimeMs:verification.stats.timeMs
  };

  const final=await saveSettings({
   ...latestSettings,
   enabled:shouldStop?false:keepEnabled,
   stopRequested:false,running:false,
   lastRun:iso(),lastAdded:saved.added,lastFound:merged.size,lastConflicts:saved.conflicts,lastError:null,lastHealth:health,
   lastBreakdown:breakdown,searchTermCursor:nextCursor,
   currentStage:shouldStop?"STOPPED":"WAITING FOR NEXT RUN",stageUpdatedAt:iso()
  },shouldStop?"Ava-Valt importer stopped after current run":"Record Ava-Valt importer run");

  // This is a server-side notification only. The bot independently fetches
  // the latest GitHub data; we never send an unverified avatar count.
  // Notification failures must not turn a committed import into an error.
  if(saved.added > 0 || Number(quarantineRepair.restored) > 0 ||
     Number(strictCleanup.moved) > 0 || !!integrity.repaired ||
     Number(preImportPlatformCheck.fixed) > 0) {
    await reportCommittedImport('auto');
  }

  return {
   skipped:false,preImportPlatformCheck,strictCleanup,quarantineRepair,
   newFound:merged.size,added:saved.added,total:saved.total,conflicts:saved.conflicts,integrity,
   platformVerifiedFound:additions.length,quarantinedNew:breakdown.quarantined,
   breakdown,stopped:shouldStop,settings:final
  };
 }catch(e){
  const latest=await getSettings().catch(()=>settings);
  await saveSettings({...latest,enabled:latest.stopRequested?false:(force?latest.enabled:true),stopRequested:false,running:false,lastRun:iso(),lastAdded:0,lastError:e.message,currentStage:"ERROR",stageUpdatedAt:iso()},"Record Ava-Valt importer error").catch(()=>{});
  throw e;
 }
}
