"use client";
import {useEffect,useState} from "react";
export default function AutoImport(){
 const [s,setS]=useState(null),[msg,setMsg]=useState(""),[health,setHealth]=useState(null),[vrc,setVrc]=useState(null),[me,setMe]=useState(null),[integrity,setIntegrity]=useState(null);
 async function loadHealth(){try{const r=await fetch(`/api/db/platform-health?t=${Date.now()}`,{cache:"no-store"});if(r.ok)setHealth(await r.json())}catch{}}
 async function load(){try{const r=await fetch(`/api/settings?t=${Date.now()}`,{cache:"no-store"});if(r.ok)setS(await r.json());else{const j=await r.json().catch(()=>({}));setMsg(j.error||"Could not load Auto Import settings.")}}catch(e){setMsg(`Could not load Auto Import settings: ${e.message}`)}}
 async function loadVrc(){try{const r=await fetch(`/api/vrchat/status?t=${Date.now()}`,{cache:"no-store"});if(r.ok)setVrc(await r.json())}catch{}}
 async function loadIntegrity(){
  try{
   const r=await fetch(`/api/db/integrity?t=${Date.now()}`,{cache:"no-store"});
   if(r.ok)setIntegrity(await r.json());
   else {
    const j=await r.json().catch(()=>({}));
    setMsg(j.error||"Could not load database integrity.");
   }
  }catch(e){setMsg(`Could not load database integrity: ${e.message}`)}
 }
 async function repairIntegrity(){
  if(!confirm("Check avatar-index.json for duplicate avtr_ IDs and merge duplicate records safely?"))return;
  setMsg("Checking database integrity...");
  try{
   const r=await fetch("/api/db/integrity",{method:"POST"});
   const j=await r.json();
   if(!r.ok){setMsg(j.error||"Database integrity check failed.");return}
   setIntegrity(j);
   setMsg(`Database integrity complete: ${j.duplicateRecords||0} duplicate record(s) found${j.repaired?" and merged":""} • ${j.uniqueAvatarIds||0} unique avatar IDs • ${j.invalidIds||0} invalid/missing IDs.`);
   await Promise.all([load(),loadHealth()]);
  }catch(e){setMsg(`Database integrity check failed: ${e.message}`)}
 }
 useEffect(()=>{load();loadHealth();fetch("/api/me",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(u=>{setMe(u);if(u?.isOwner){loadVrc();loadIntegrity()}}).catch(()=>{});const t=setInterval(()=>{load();loadHealth()},4000);return()=>clearInterval(t)},[]);
 async function save(patch){setMsg("Saving...");const r=await fetch("/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(patch)});const j=await r.json();if(r.ok){setS(j);setMsg("Saved.")}else setMsg(j.error||"Could not save")}
 async function run(){
  setMsg("Running importer — watch the status above for the current stage...");
  try{
    const r=await fetch("/api/import/auto",{method:"POST"});
    const j=await r.json();
    if(!r.ok){setMsg(j.error||`Import failed (HTTP ${r.status})`);return}
    if(j.skipped){setMsg(`AUTO IMPORT SKIPPED: ${j.reason||"No import was performed."}`);return}
    // Never show a fake zero when an import response is missing numeric fields.
    if(!Number.isFinite(j.added)||!Number.isFinite(j.newFound)){
      setMsg("IMPORT STATUS INCOMPLETE: Server did not return its added/found counts. Refresh the status above to check the last run.");return;
    }
    let total=j.total;
    if(!Number.isFinite(total)){
      const db=await fetch("/api/db",{cache:"no-store"}).then(x=>x.ok?x.json():null).catch(()=>null);
      total=Number.isFinite(db?.count)?db.count:null;
    }
    const b=j.breakdown||{};
    setMsg(`AUTO IMPORT FINISHED: ${j.added} added • ${j.newFound} new candidates • ${b.resolvedByLookup??"?"} resolved by lookup • ${b.quarantined??"?"} quarantined • ${total===null?"unknown":total} live total`);
  }catch(e){setMsg(`AUTO IMPORT REQUEST FAILED: ${e.message}`)}
  finally{load()}
}

 async function strictCleanup(){
  if(!confirm("Make the LIVE Ava-Valt database contain 0 Unknown platform records? Unresolved avatars will NOT be deleted — they will be moved to unknown-platform-quarantine.json and retried later."))return;
  setMsg("Cleaning live database — preserving unresolved avatars in quarantine...");
  const r=await fetch("/api/db/strict-platform-cleanup",{method:"POST"});
  const j=await r.json();
  setMsg(r.ok?`Strict platform cleanup complete: ${j.moved||0} unresolved record(s) moved out of the live database • ${j.quarantined||0} preserved in quarantine.`:(j.error||"Cleanup failed"));
  await loadHealth();
 }

 async function removeUnknownPlatforms(){
  const count=health?.unknown??0;
  if(!count){setMsg("There are no Unknown platform avatars to remove.");return}
  if(!confirm(`WARNING: This will permanently remove ${count} avatar record(s) whose platform is still Unknown from avatar-index.json.\n\nRepair them first if you want to keep them.\n\nContinue?`))return;
  if(!confirm(`Final confirmation: remove all ${count} unresolved Unknown-platform avatars?`))return;
  setMsg(`Removing ${count} unresolved Unknown-platform avatars...`);
  const r=await fetch("/api/db/remove-unknown-platforms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirm:"REMOVE_UNKNOWN"})});
  const j=await r.json();
  setMsg(r.ok?`Removed ${j.removed} Unknown-platform avatar record(s) from GitHub. Refreshing database health…`:(j.error||"Removal failed"));
  if(r.ok)await loadHealth();
}
async function repairAllPlatforms(){
  if(!confirm("Repair all remaining Unknown platform records? This may take a while and will use the enabled avatar providers."))return;
  setMsg("Repairing ALL remaining Unknown platforms — keep this page open...");
  let totalFixed=0,totalChecked=0,lastRemaining=null,noProgress=0;
  for(let pass=1;pass<=40;pass++){
   const r=await fetch("/api/db/repair-all-platforms",{method:"POST"});
   const j=await r.json();
   if(!r.ok){setMsg(`Repair stopped: ${j.error||"request failed"} • fixed ${totalFixed} so far`);break}
   totalFixed+=j.fixed||0;totalChecked+=j.checked||0;lastRemaining=j.remaining;
   setMsg(`Repairing database... ${totalFixed} fixed this session • ${j.remaining} still Unknown • pass ${pass}`);
   await loadHealth();
   if(j.complete||j.remaining===0){setMsg(`PLATFORM REPAIR COMPLETE — ${totalFixed} fixed this session • 0 Unknown remaining.`);break}
   if((j.fixed||0)===0)noProgress++;else noProgress=0;
   if(noProgress>=1){setMsg(`Repair reached ${j.remaining} unresolved avatars. The enabled providers did not return platform data for these records, so they were left Unknown rather than guessed.`);break}
  }
  await loadHealth();
}
async function repairPlatforms(){setMsg("Scanning existing avatars with unknown platform data...");const r=await fetch("/api/db/repair-platforms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({limit:50})});const j=await r.json();setMsg(r.ok?`Platform repair: checked ${j.checked}, fixed ${j.fixed}. ${j.remaining===0?"Repair complete!":"Run again to continue."}`:j.error);if(r.ok)loadHealth()}
 if(!s)return <main className="wrap"><h1>Auto Import</h1><p>Loading controls...</p>{msg&&<div className="card"><b>{msg}</b></div>}<p><a className="button secondary" href="/">Back to importer</a></p></main>;
 return <main className="wrap">
  <div className="top"><div><div className="eyebrow">AVA-VALT CONTROL CENTRE</div><h1>Auto Import</h1>{me?.isOwner&&<p><a href="/search-export">Publish GitHub Search Shards (Beta) →</a></p>}<p className="muted">{me?.isOwner?"Owner controls for scheduled database discovery.":"High Staff access — safe import and repair tools only."}</p></div><a className="button secondary" href="/">Back to importer</a></div>
  <section className="card">
   <div className="row"><div><h2>Automatic adding</h2><p className="muted">{s.stopRequested?"Stop requested. The current import will finish safely, then automatic importing will stop.":s.running?"An import is currently running.":s.enabled?"Auto Import is ON. When a run finishes, it stays armed and waits for the next scheduled run until you press Stop.":"Auto Import is OFF. Scheduled runs will not modify the database."}</p></div>
   {me?.isOwner?<button className={s.enabled?"danger":""} onClick={()=>save({enabled:!s.enabled})}>{(s.enabled||s.running)?"STOP AUTO IMPORT":"START AUTO IMPORT"}</button>:<span className="muted">Owner controls locked</span>}</div>
   <div className={"status "+(s.enabled?"good":"")}><b>{s.stopRequested?"STOP REQUESTED — FINISHING CURRENT RUN":s.running?`RUNNING — ${s.currentStage||"WORKING"}`:s.enabled?"AUTO ON — WAITING FOR NEXT RUN":"STOPPED"}</b></div>
   <button onClick={run}>RUN ONCE NOW</button>
  </section>
  <section className="grid">
   <div className="card"><h2>Last run</h2><p>{s.lastRun?new Date(s.lastRun).toLocaleString():"Never"}</p><p><b>{s.lastAdded||0}</b> added • <b>{s.lastFound||0}</b> new candidates{s.lastConflicts?` • ${s.lastConflicts} GitHub conflict${s.lastConflicts===1?"":"s"} safely retried`:""}</p>{s.lastBreakdown&&<><p><b>{s.lastBreakdown.verifiedAtDiscovery||0}</b> already had platform data • <b>{s.lastBreakdown.resolvedByLookup||0}</b> resolved by metadata lookup • <b>{s.lastBreakdown.quarantined||0}</b> quarantined</p><p>PC: {s.lastBreakdown.platformCounts?.PC||0} • Android: {s.lastBreakdown.platformCounts?.Android||0} • iOS: {s.lastBreakdown.platformCounts?.iOS||0}</p><p className="muted">Platform sources: {Object.entries(s.lastBreakdown.sourceCounts||{}).map(([name,count])=>`${name}: ${count}`).join(" • ")||"—"}</p><p className="muted">Terms this run: {(s.lastBreakdown.termsTried||[]).join(", ")||"—"}</p></>}{s.lastError&&<p className="error">{s.lastError}</p>}</div>
   {me?.isOwner&&<div className="card"><h2>Limits</h2><label>Maximum avatars added per run</label><input type="number" min="1" max="1000" value={s.maxAddPerRun} onChange={e=>setS({...s,maxAddPerRun:+e.target.value})}/><button onClick={()=>save({maxAddPerRun:s.maxAddPerRun})}>Save limit</button><hr/><label style={{display:"block",marginTop:12}}><input type="checkbox" checked={s.strictPlatformMode!==false} onChange={e=>{const v=e.target.checked;setS({...s,strictPlatformMode:v});save({strictPlatformMode:v})}}/> Strict platform mode — never add Unknown-platform avatars to the live database</label></div>}
  </section>
  {me?.isOwner&&<section className="card"><h2>Search terms</h2><p className="muted">Comma separated. Keep these broad so providers can return varied avatars.</p><textarea rows="4" value={s.searchTerms.join(", ")} onChange={e=>setS({...s,searchTerms:e.target.value.split(",").map(x=>x.trim())})}/><button onClick={()=>save({searchTerms:s.searchTerms})}>Save search terms</button></section>}
  {me?.isOwner&&<section className="card"><h2>Providers</h2><p className="muted">Turn a provider off if it blocks Ava-Valt, is unreliable, or you no longer want to query it. KitsuneDB (avtr.fumikoecho.net/avatars) is already included and enabled by default. Its VRCX API is used for imports and platform checks. Current provider list also includes avtr.zip, CuteDB, PAW, VRCDB, the updated VRCWB endpoint, and the updated NekoSuneVR/NSVR endpoint.</p>
   {Object.entries(s.providerEnabled).map(([k,v])=><label key={k} style={{display:"block",margin:"10px 0"}}><input type="checkbox" checked={v} onChange={e=>{const p={...s.providerEnabled,[k]:e.target.checked};setS({...s,providerEnabled:p});save({providerEnabled:p})}}/> {k}</label>)}
  </section>}
  {me?.isOwner&&<section className="card"><h2>VRChat API fallback</h2>{vrc?<><div className={"status "+(vrc.connected?"good":"")}><b>{vrc.state}</b></div>{vrc.connected?<p>Connected{vrc.user?` as ${vrc.user}`:""} • {vrc.source}</p>:<p className="muted">{vrc.message}</p>}<button className="secondary" onClick={loadVrc}>CHECK VRCHAT CONNECTION</button></>:<p className="muted">Checking VRChat connection...</p>}<p className="muted">Used only as the final platform-metadata fallback. Credentials/cookies stay server-side and are never returned to this page.</p></section>}
  {me?.isOwner&&<section className="card">
   <h2>Database Integrity</h2>
   <p><b>{integrity?.duplicateRecords??"—"}</b> duplicate record(s) • <b>{integrity?.duplicateGroups??"—"}</b> duplicated avatar ID group(s) • <b>{integrity?.invalidIds??"—"}</b> invalid/missing avatar ID(s)</p>
   <p className="muted">Duplicates are checked by VRChat <code>avtr_...</code> ID, not avatar name. When duplicates are repaired, useful metadata and platform information are merged into one record.</p>
   <button onClick={repairIntegrity}>CHECK & REPAIR DUPLICATES</button>
  </section>}
  <section className="card"><h2>Platform database health</h2>
 {health?<><div className={"status "+(health.done?"good":"")}><b>{health.done?"PLATFORM REPAIR COMPLETE":"REPAIR STILL NEEDED"}</b></div>
 <p><b>{health.total}</b> live avatars • <b>{health.complete}</b> with platform data • <b>{health.unknown}</b> live Unknown</p><p><b>{health.quarantined||0}</b> unresolved avatar(s) safely preserved in platform quarantine for later retries.</p><p className="muted">Automatic quarantine repair: <b>{s.autoQuarantineRepair!==false?"ON":"OFF"}</b>{s.lastQuarantineRepair?` • last pass ${new Date(s.lastQuarantineRepair).toLocaleString()} • ${s.lastQuarantineRestored||0} restored`:""}</p>
 <p>PC: {health.pc} • Android: {health.android} • iOS: {health.ios}</p>
 {health.done&&<p><b>✓ All database records contain platform data.</b></p>}</>:<p className="muted">Counting database records...</p>}
 </section>
 <section className="card"><h2>Repair existing platform data</h2><p className="muted">Checks existing avatars that have no PC / Android / iOS data against enabled providers by avatar ID. It only fills platform data when a provider actually reports it; it does not guess.</p>{me?.isOwner&&<button onClick={strictCleanup}>MAKE LIVE DATABASE 0 UNKNOWN</button>} <button onClick={repairAllPlatforms}>FIX ALL REMAINING UNKNOWN</button>
 <button className="secondary" onClick={repairPlatforms}>SCAN & FIX NEXT 50</button> {me?.isOwner&&<button className="danger" onClick={removeUnknownPlatforms} disabled={!health?.unknown}>REMOVE REMAINING UNKNOWN</button>}</section>
 <section className="card"><h2>Provider health from last run</h2>{!s.lastHealth?.length?<p className="muted">No run data yet.</p>:s.lastHealth.slice(-30).map((h,i)=><p key={i}><b>{h.provider}</b> — {h.state}{h.count?` • ${h.count} results`:""}{h.error?` • ${h.error}`:""} <span className="muted">({h.term})</span></p>)}</section>
  <p>{msg}</p>
 </main>
}