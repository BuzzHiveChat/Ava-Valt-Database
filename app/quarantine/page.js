"use client";
import {useEffect,useMemo,useState} from "react";

export default function Quarantine(){
 const [me,setMe]=useState(null),[data,setData]=useState(null),[page,setPage]=useState(1),[search,setSearch]=useState(""),[settings,setSettings]=useState(null);
 const [draft,setDraft]=useState({}),[selected,setSelected]=useState({}),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false);

 async function load(p=page,q=search){
  const r=await fetch(`/api/quarantine?page=${p}&pageSize=50&search=${encodeURIComponent(q)}&t=${Date.now()}`,{cache:"no-store"});
  if(r.status===403){setData({error:"Owner access required"});return}
  const j=await r.json();setData(j);
 }
 async function loadSettings(){
  const r=await fetch(`/api/settings?t=${Date.now()}`,{cache:"no-store"});
  if(r.ok)setSettings(await r.json());
 }
 async function saveAuto(patch){
  const r=await fetch("/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(patch)});
  const j=await r.json();
  if(!r.ok)return setMsg(j.error||"Could not save automatic repair settings.");
  setSettings(j);setMsg("Automatic quarantine repair settings saved.");
 }
 async function runAutoRepair(){
  setBusy(true);setMsg("Automatically checking quarantined avatars now...");
  const r=await fetch("/api/quarantine/repair",{method:"POST"});
  const j=await r.json();setBusy(false);
  if(!r.ok)return setMsg(j.error||"Automatic quarantine repair failed.");
  setMsg(`Automatic repair finished: ${j.checked||0} checked • ${j.restored||0} restored • ${j.movedToReview||0} moved to Needs Review • ${j.remaining||0} still quarantined.`);
  await Promise.all([load(page,search),loadSettings()]);
 }
 useEffect(()=>{
  fetch("/api/me",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(u=>{setMe(u);if(u?.isOwner){load(1,"");loadSettings()}});
 },[]);

 function platformsFor(id){return draft[id]||[]}
 function toggle(id,p){
  const cur=new Set(platformsFor(id));
  cur.has(p)?cur.delete(p):cur.add(p);
  setDraft({...draft,[id]:[...cur]});
 }
 function all(id){setDraft({...draft,[id]:["PC","Android","iOS"]})}
 async function testNekoSune(a){
  setBusy(true);setMsg(`Checking NekoSuneVR exact platform data for ${a.id}...`);
  const r=await fetch("/api/providers/nekosune-test",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:a.id,name:a.name||""})});
  const j=await r.json();setBusy(false);
  if(!r.ok)return setMsg(j.error||"NekoSuneVR test failed.");
  if(j.platforms?.length){
   setDraft({...draft,[a.id]:j.platforms});
   setMsg(`NekoSuneVR found: ${j.platforms.join(" + ")}. I ticked those platform boxes for you — review them, then VERIFY & ADD.`);
  }else{
   setMsg(`NekoSuneVR returned no platform data for this exact avatar ID.`);
  }
 }

 async function testKitsune(a){
  setBusy(true);setMsg(`Checking KitsuneDB's VRCX API for ${a.id}...`);
  const r=await fetch("/api/providers/kitsune-test",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:a.id,name:a.name||""})});
  const j=await r.json();setBusy(false);
  if(!r.ok)return setMsg(j.error||"KitsuneDB test failed.");
  if(j.platforms?.length){
   setDraft({...draft,[a.id]:j.platforms});
   setMsg(`KitsuneDB API found: ${j.platforms.join(" + ")}. I ticked those platform boxes for you — review them, then VERIFY & ADD.`);
  }else{
   setMsg(`${j.reason||"KitsuneDB API returned no platform metadata. Open KitsuneDB and manually confirm the avatar badge."}`);
  }
 }

 async function verifyOne(id){
  const platforms=platformsFor(id);
  if(!platforms.length)return setMsg("Choose PC, Android, iOS, or ALL first.");
  if(!confirm(`You are manually confirming ${id} works on: ${platforms.join(", ")}.\n\nOnly continue if you checked this on VRChat.`))return;
  setBusy(true);setMsg(`Adding ${id} to the live database...`);
  const r=await fetch("/api/quarantine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,platforms})});
  const j=await r.json();
  setBusy(false);
  if(!r.ok)return setMsg(j.error||"Could not verify avatar.");
  const nd={...draft};delete nd[id];setDraft(nd);
  const ns={...selected};delete ns[id];setSelected(ns);
  setMsg(`Added ${id} as ${j.platforms.join(" / ")}. ${j.remaining} still quarantined.`);
  await load(page,search);
 }
 async function verifySelected(){
  const ids=Object.keys(selected).filter(id=>selected[id]&&platformsFor(id).length);
  if(!ids.length)return setMsg("Tick avatars and choose their platform(s) first.");
  if(!confirm(`Add ${ids.length} manually verified avatar(s) to the live database?\n\nOnly continue for avatars you personally checked.`))return;
  setBusy(true);setMsg(`Adding ${ids.length} verified avatar(s)...`);
  const r=await fetch("/api/quarantine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:ids.map(id=>({id,platforms:platformsFor(id)}))})});
  const j=await r.json();setBusy(false);
  if(!r.ok)return setMsg(j.error||"Batch verification failed.");
  setMsg(`Finished: ${j.succeeded||0} added • ${j.failed||0} failed.`);
  setDraft({});setSelected({});
  await load(page,search);
 }
 function submitSearch(e){e.preventDefault();setPage(1);load(1,search)}

 if(me&&!me.isOwner)return <main><h1>Platform Quarantine</h1><div className="card"><h2>Owner only</h2><p>High Staff can use normal import and repair tools, but manual platform verification is locked to the Owner.</p></div></main>;
 if(!me)return <main><h1>Platform Quarantine</h1><p>Loading...</p></main>;

 return <main>
  <div className="eyebrow">AVA-VALT OWNER TOOLS</div>
  <h1>Platform Quarantine</h1>
  <p className="muted">Manually check an avatar on the VRChat website, tick every platform it really supports, then add it back to the live database. This never guesses platform support.</p>

  <p><a className="button secondary" href="/platform-review">OPEN PLATFORM NEEDS REVIEW →</a></p>
  {msg&&<div className="card"><b>{msg}</b></div>}

  <section className="card">
   <div className="eyebrow">AUTOMATIC REPAIR</div>
   <h2 style={{marginTop:6}}>Auto Quarantine Repair</h2>
   <p className="muted">Vercel automatically retries quarantined avatars. NekoSuneVR exact-ID platform data is checked first, then KitsuneDB, avtr.zip, CuteDB and the other enabled metadata providers. The VRChat API is disabled by default and is only an optional final fallback. Verified avatars are restored to the live database. Checked-but-unresolved avatars move to Platform Needs Review; avatars not checked yet remain quarantined.</p>
   {settings&&<>
    <label style={{display:"block",marginBottom:12}}>
     <input type="checkbox" checked={settings.autoQuarantineRepair!==false} onChange={e=>saveAuto({autoQuarantineRepair:e.target.checked})}/> Automatic quarantine repair
    </label>
    <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"end"}}>
     <label>Avatars per automatic pass<br/><input type="number" min="1" max="100" value={settings.quarantineRepairBatch||12} onChange={e=>setSettings({...settings,quarantineRepairBatch:+e.target.value})}/></label>
     <label>Base retry cooldown (hours)<br/><input type="number" min="1" max="168" value={settings.quarantineRetryCooldownHours||12} onChange={e=>setSettings({...settings,quarantineRetryCooldownHours:+e.target.value})}/></label>
     <button onClick={()=>saveAuto({quarantineRepairBatch:settings.quarantineRepairBatch,quarantineRetryCooldownHours:settings.quarantineRetryCooldownHours})}>SAVE AUTO SETTINGS</button>
     <button disabled={busy} onClick={runAutoRepair}>RUN AUTO REPAIR NOW</button>
    </div>
    <p style={{marginTop:14}}>
     Last automatic pass: <b>{settings.lastQuarantineRepair?new Date(settings.lastQuarantineRepair).toLocaleString():"Never"}</b><br/>
     Checked: <b>{settings.lastQuarantineChecked||0}</b> • Restored: <b>{settings.lastQuarantineRestored||0}</b> • Moved to Review: <b>{settings.lastQuarantineMovedToReview||0}</b> • Remaining: <b>{settings.lastQuarantineRemaining??data?.total??"—"}</b>
    </p>
    {settings.lastQuarantineError&&<p className="error">{settings.lastQuarantineError}</p>}
   </>}
  </section>

  <section className="card">
   <form onSubmit={submitSearch} style={{display:"flex",gap:8,alignItems:"center"}}>
    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, author or avtr_ ID" style={{flex:1}}/>
    <button type="submit">SEARCH</button>
    <button type="button" className="secondary" onClick={()=>{setSearch("");setPage(1);load(1,"")}}>CLEAR</button>
   </form>
   <p><b>{data?.total??"—"}</b> unresolved avatar(s) in quarantine.</p>
   <button disabled={busy} onClick={verifySelected}>VERIFY & ADD SELECTED</button>
  </section>

  {(data?.avatars||[]).map(a=>{
   const ps=platformsFor(a.id);
   const isSelected=!!selected[a.id];
   return <section className="card" key={a.id}>
    <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
     {a.thumbnailImageUrl||a.imageUrl?<img src={a.thumbnailImageUrl||a.imageUrl} alt="" width="92" height="92" style={{objectFit:"cover",borderRadius:10}}/>:null}
     <div style={{flex:1}}>
      <div style={{display:"flex",gap:10,alignItems:"center"}}>
       <input type="checkbox" checked={isSelected} onChange={e=>setSelected({...selected,[a.id]:e.target.checked})}/>
       <h2 style={{margin:0}}>{a.name||a.id}</h2>
      </div>
      <p className="muted">by {a.author||a.authorName||a.authorId||"Unknown creator"}</p>
      <code>{a.id}</code>
      <div style={{marginTop:10,display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
       {["PC","Android","iOS"].map(p=><label key={p}><input type="checkbox" checked={ps.includes(p)} onChange={()=>toggle(a.id,p)}/> {p}</label>)}
       <button type="button" className="secondary" onClick={()=>all(a.id)}>ALL THREE</button>
      </div>
      <div style={{marginTop:12,display:"flex",gap:8,flexWrap:"wrap"}}>
       <a className="button secondary" target="_blank" rel="noreferrer" href={`https://vrchat.com/home/avatar/${a.id}`}>OPEN ON VRCHAT</a>
       <button className="secondary" disabled={busy} onClick={()=>testNekoSune(a)}>TEST NEKOSUNEVR</button>
       <button className="secondary" disabled={busy} onClick={()=>testKitsune(a)}>TEST KITSUNEDB</button>
       <button disabled={busy||!ps.length} onClick={()=>verifyOne(a.id)}>VERIFY & ADD TO DATABASE</button>
      </div>
      <p className="muted" style={{marginTop:10}}>Last automatic retry: {a.lastPlatformRetryAt?new Date(a.lastPlatformRetryAt).toLocaleString():"Not retried yet"} • Reason: {a.quarantineReason||"Unknown platform"}</p>
     </div>
    </div>
   </section>
  })}

  <div style={{display:"flex",gap:8,justifyContent:"space-between",alignItems:"center"}}>
   <button className="secondary" disabled={(data?.page||1)<=1} onClick={()=>{const p=Math.max(1,page-1);setPage(p);load(p,search)}}>← PREVIOUS</button>
   <span>Page {data?.page||1} / {data?.pages||1}</span>
   <button className="secondary" disabled={(data?.page||1)>=(data?.pages||1)} onClick={()=>{const p=page+1;setPage(p);load(p,search)}}>NEXT →</button>
  </div>
 </main>
}
