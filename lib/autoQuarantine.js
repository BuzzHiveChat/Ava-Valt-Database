import {getSettings,saveSettings} from "./settings";
import {repairQuarantinedPlatforms} from "./platformQuarantine";

export async function runAutomaticQuarantineRepair({force=false}={}){
 const settings=await getSettings();
 if(!settings.autoQuarantineRepair&&!force){
   return {skipped:true,reason:"Automatic quarantine repair is off",settings};
 }
 try{
   const r=await repairQuarantinedPlatforms({
     limit:Number(settings.quarantineRepairBatch||12),
     cooldownHours:Number(settings.quarantineRetryCooldownHours||12),
     timeBudgetMs:Number(process.env.AUTO_QUARANTINE_REPAIR_BUDGET_MS||24000),
     concurrency:Number(process.env.AUTO_QUARANTINE_REPAIR_CONCURRENCY||4),
     force
   });
   const next=await saveSettings({
     ...await getSettings(),
     lastQuarantineRepair:new Date().toISOString(),
     lastQuarantineChecked:r.checked||0,
     lastQuarantineRestored:r.restored||0,
     lastQuarantineMovedToReview:r.movedToReview||0,
     lastQuarantineRemaining:r.remaining??null,
     lastQuarantineError:null
   },"Record automatic Ava-Valt quarantine repair");
   return {skipped:false,...r,settings:next};
 }catch(e){
   await saveSettings({
     ...await getSettings(),
     lastQuarantineRepair:new Date().toISOString(),
     lastQuarantineChecked:0,
     lastQuarantineRestored:0,
     lastQuarantineError:e?.message||String(e)
   },"Record automatic Ava-Valt quarantine repair error").catch(()=>{});
   throw e;
 }
}
