
import {getRepoFile, putRepoFile} from "./githubFile";

export const DEFAULT_SETTINGS={
 enabled:false, stopRequested:false, running:false,
 maxAddPerRun:300,
 strictPlatformMode:true,
 autoQuarantineRepair:true,
 quarantineRepairBatch:12,
 quarantineRetryCooldownHours:12,
 searchTerms:["avatar","furry","cute","fox","dog","cat","robot","dragon"],
 providerEnabled:{avtrDB:false,AvtrZip:true,KitsuneDB:true,CuteDB:true,PAW:true,VRCDB:true,VRCWB:true,NSVR:true},
 lastRun:null,lastAdded:0,lastFound:0,lastError:null,lastHealth:[],lastBreakdown:null,searchTermCursor:0,
 lastQuarantineRepair:null,lastQuarantineChecked:0,lastQuarantineRestored:0,lastQuarantineMovedToReview:0,lastQuarantineRemaining:null,lastQuarantineError:null,
 currentStage:"STOPPED", stageUpdatedAt:null,
 updatedAt:null
};
export async function getSettings(){
 try{
  const f=await getRepoFile(process.env.AUTO_IMPORT_SETTINGS_PATH||"auto-import-settings.json");
  const saved=JSON.parse(f.text||"{}");
  // New providers must not be hidden by an old persisted providerEnabled object.
  // avtrDB blocked the project; never re-enable it from stale saved settings.
  return {...DEFAULT_SETTINGS,...saved,providerEnabled:{...DEFAULT_SETTINGS.providerEnabled,...(saved.providerEnabled||{}),avtrDB:false}};
 }catch{return {...DEFAULT_SETTINGS}}
}
export async function saveSettings(s,message="Update Ava-Valt importer settings"){
 const next={...DEFAULT_SETTINGS,...s,providerEnabled:{...DEFAULT_SETTINGS.providerEnabled,...(s.providerEnabled||{}),avtrDB:false},updatedAt:new Date().toISOString()};
 await putRepoFile(process.env.AUTO_IMPORT_SETTINGS_PATH||"auto-import-settings.json",
   JSON.stringify(next,null,2)+"\n",message);
 return next;
}
