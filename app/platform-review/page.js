"use client";
import {useEffect,useState} from "react";

export default function PlatformReview(){
 const [me,setMe]=useState(null),[data,setData]=useState(null),[search,setSearch]=useState(""),[page,setPage]=useState(1);
 const [draft,setDraft]=useState({}),[busy,setBusy]=useState(false),[msg,setMsg]=useState("");
 const ticked=Object.entries(draft).filter(([,platforms])=>Array.isArray(platforms)&&platforms.length>0);
 const load=async(p=page,q=search)=>{
  const r=await fetch(`/api/platform-review?page=${p}&pageSize=50&search=${encodeURIComponent(q)}&t=${Date.now()}`,{cache:"no-store"});
  const j=await r.json();setData(r.ok?j:{error:j.error||"Could not load review queue"});
 };
 useEffect(()=>{fetch("/api/me",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(u=>{
  setMe(u||{isOwner:false});if(u?.isOwner)load(1,"");
 }).catch(()=>setMe({isOwner:false}));},[]);
 const chosen=id=>draft[id]||[];
 const toggle=(id,p)=>{const set=new Set(chosen(id));set.has(p)?set.delete(p):set.add(p);setDraft(d=>({...d,[id]:[...set]}));};
 async function autoAction(action){
  if(action==="auto-resume"&&!confirm("Only resume after checking that the third-party metadata provider permits these requests. Continue?"))return;
  setBusy(true);setMsg(action==="auto-run"?"Checking the next limited metadata batch...":"Resuming metadata review...");
  try{
   const r=await fetch("/api/platform-review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action})});
   const j=await r.json();if(!r.ok)throw new Error(j.error||"Auto review failed");
   setMsg(j.skipped?`Auto Review: ${j.reason}`:action==="auto-resume"?"Review queue resumed.":`Checked ${j.checked} avatar(s); ${j.suggested} platform suggestion(s) found. Review evidence before adding.`);
   await load(page,search);
  }catch(e){setMsg(e.message||String(e))}finally{setBusy(false)}
 }
 async function lookup(a,provider){
  setBusy(true);setMsg(`Looking up ${a.id} with ${provider}...`);
  try{
   const endpoint=provider==="NekoSuneVR"?"/api/providers/nekosune-test":"/api/providers/kitsune-test";
   const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:a.id,name:a.name||""})});
   const j=await r.json();if(!r.ok)throw new Error(j.error||"Provider lookup failed");
   if(Array.isArray(j.platforms)&&j.platforms.length){setDraft(d=>({...d,[a.id]:j.platforms.filter(x=>["PC","Android","iOS"].includes(x))}));
    setMsg(`${provider} reports ${j.platforms.join(" + ")} for ${a.id}. Please confirm those platforms before VERIFY & ADD.`);
   }else if(provider==="KitsuneDB")setMsg(j.reason||"KitsuneDB returned no confirmed platform metadata. Open its website to check this avatar manually.");
   else setMsg(`${provider} did not provide verified platform evidence for this avatar.`);
  }catch(e){setMsg(e.message||String(e))}finally{setBusy(false)}
 }
 async function act(a,action){
  const platforms=chosen(a.id);
  if(action==="verify"&&!platforms.length){setMsg("Choose confirmed PC, Android, and/or iOS platforms first.");return}
  const prompt=action==="verify"
   ?`Verify ${a.id} as ${platforms.join(" + ")} and ADD it to the live database? Only confirm platforms that you checked.`
   :`Remove ${a.id} from Needs Review and ignore future UNKNOWN-platform rediscovery? This does NOT delete anything from the live database.`;
  if(!confirm(prompt))return;
  setBusy(true);
  try{
   const r=await fetch("/api/platform-review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,id:a.id,platforms})});
   const j=await r.json();if(!r.ok)throw new Error(j.error||"Update failed");
   setMsg(j.cleanupError|| (action==="verify"?`Verified and added ${a.id}. ${j.remaining} left for review.`:`Dismissed ${a.id}. ${j.remaining} left for review.`));
   setDraft(d=>{const next={...d};delete next[a.id];return next});await load(page,search);
  }catch(e){setMsg(e.message||String(e))}finally{setBusy(false)}
 }
 async function importAllTicked(){
  const items=ticked.map(([id,platforms])=>({id,platforms}));
  if(!items.length){setMsg("Tick at least one confirmed platform on each avatar you want to import.");return;}
  if(!confirm(`IMPORT ${items.length} avatar(s) with their ticked platforms into the live GitHub database?\n\nOnly continue if you personally checked that every ticked platform is correct. Automatic suggestions alone are NOT proof.\n\nThe import will use batches of up to 50.`))return;
  setBusy(true);
  let succeeded=0,failed=0,added=0,updated=0;
  const errors=[],warnings=[];
  try{
   for(let i=0;i<items.length;i+=50){
    const batch=items.slice(i,i+50);
    setMsg(`Importing selected avatars: ${i+1}–${i+batch.length} of ${items.length}...`);
    const r=await fetch("/api/platform-review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"verify-batch",items:batch})});
    const j=await r.json();if(!r.ok)throw new Error(j.error||"Batch import failed");
    succeeded+=j.succeeded||0;failed+=j.failed||0;added+=j.added||0;updated+=j.updated||0;
    if(j.cleanupError)warnings.push(j.cleanupError);
    const imported=new Set((j.results||[]).filter(x=>x.ok).map(x=>x.id));
    setDraft(current=>{const next={...current};for(const id of imported)delete next[id];return next;});
    errors.push(...(j.results||[]).filter(x=>!x.ok).map(x=>`${x.id||"Unknown ID"}: ${x.error}`));
   }
   setMsg(`Finished importing ${succeeded} of ${items.length} ticked avatar(s): ${added} new, ${updated} existing updated, ${failed} failed.${errors.length?` Failed: ${errors.slice(0,5).join(" | ")}${errors.length>5?" (more failures; see the remaining ticks)":""}.`:""}${warnings.length?` WARNING: ${warnings.join(" | ")}`:""}`);
  }catch(e){setMsg(`Import stopped after ${succeeded} succeeded and ${failed} failed. Remaining ticks are still selected. ${e.message||String(e)}`);}
  finally{setBusy(false);setPage(1);await load(1,search);}
 }
 if(!me)return <main><h1>Platform Needs Review</h1><p>Loading...</p></main>;
 if(!me.isOwner)return <main><h1>Platform Needs Review</h1><section className="card">Owner access required.</section></main>;
 return <main>
  <div className="eyebrow">AVA-VALT OWNER TOOLS</div>
  <h1>Platform Needs Review</h1>
  <p className="muted">KitsuneDB API results are matched by exact avatar ID. If the website shows PC + Quest but its API omits that metadata, open KitsuneDB and check the avatar manually (PC + Quest = PC + Android). No platforms are guessed. When Quarantine Repair checks an avatar but cannot confirm its platform, the avatar moves here instead of staying in Quarantine. It is NOT added to the live database. Unchecked/deferred avatars remain quarantined until they have actually been checked.</p>
  <p><a href="/quarantine">← Back to Quarantine</a> · <a href="/">Admin home</a></p>
  <section className="card">
   <h2>Automatic metadata review · up to 5 per hour</h2>
   <p className="muted">Checks ONE avatar at a time: NekoSuneVR exact-ID metadata first, then KitsuneDB’s advertised VRCX API if the first has no platform evidence. It does NOT scrape the VRChat website, log into VRChat, or add unverified avatars to your live database. VRChat links below are for your manual review. Provider terms still apply; a single avatar check may make requests to two third-party providers.</p>
   <p><b>Worker:</b> {data?.autoReview?.enabled?"Enabled on server":"Disabled — set PLATFORM_REVIEW_AUTO_ENABLED=true in Vercel"}</p>
   <p><b>Last run:</b> {data?.autoReview?.lastRunAt?new Date(data.autoReview.lastRunAt).toLocaleString():"Not run"} · <b>Last suggested:</b> {data?.autoReview?.lastSuggested??0}</p>
   {data?.autoReview?.blocked&&<p className="err">Provider denied access (401/403). Automatic checks have stopped until you review provider permission and resume.</p>}
   {data?.autoReview?.pausedUntil&&<p className="muted">Rate-limit cooldown until {new Date(data.autoReview.pausedUntil).toLocaleString()}.</p>}
   <div className="row">
    <button disabled={busy||!data?.autoReview?.enabled||data?.autoReview?.blocked} onClick={()=>autoAction("auto-run")}>CHECK NEXT BATCH NOW</button>
    {data?.autoReview?.blocked&&<button className="secondary" disabled={busy} onClick={()=>autoAction("auto-resume")}>RESUME AFTER PERMISSION CHECK</button>}
   </div>
   <p className="muted">For automatic hourly runs, enable the included GitHub Actions workflow and configure its two secrets. Server-side rate limits apply even if you click this button repeatedly.</p>
  </section>
  {msg&&<section className="card"><b>{msg}</b></section>}
  <section className="card">
   <form onSubmit={e=>{e.preventDefault();setPage(1);load(1,search)}} className="row">
    <input aria-label="Search avatars" placeholder="Search avatar name, creator or avtr_ ID" value={search} onChange={e=>setSearch(e.target.value)}/>
    <button disabled={busy} type="submit">SEARCH</button>
    <button disabled={busy} type="button" className="secondary" onClick={()=>{setSearch("");setPage(1);load(1,"")}}>CLEAR</button>
   </form>
   <p><b>{data?.total??"—"}</b> avatar(s) awaiting manual review.</p>
   <p className="muted">Tick the confirmed PC / Android / iOS boxes on any avatars you want to add, then use the button below. You can also tick avatars on other pages; selections remain until you import, clear them or reload this page. Only you, the Owner, can use this.</p>
   <div className="row">
    <button type="button" disabled={busy||!ticked.length} onClick={importAllTicked}>IMPORT ALL TICKED ({ticked.length})</button>
    <button type="button" className="secondary" disabled={busy||!ticked.length} onClick={()=>setDraft({})}>CLEAR ALL TICKS</button>
   </div>
   {data?.error&&<p className="err">{data.error}</p>}
  </section>
  {(data?.avatars||[]).map(a=>{const selected=chosen(a.id);return <section key={a.id} className="card">
   <div className="row" style={{alignItems:"flex-start"}}>
    {(a.thumbnailImageUrl||a.imageUrl)?<img alt="" src={a.thumbnailImageUrl||a.imageUrl} width={92} height={92} style={{objectFit:"cover",borderRadius:10}}/>:null}
    <div style={{flex:1,minWidth:250}}>
     <h2 style={{margin:"0 0 8px"}}>{a.name||a.id}</h2>
     <p className="muted">by {a.author||a.authorName||a.authorId||"Unknown creator"}</p>
     <code>{a.id}</code>
     <p className="muted">Last platform lookup: {a.autoReviewLastCheckedAt?new Date(a.autoReviewLastCheckedAt).toLocaleString():a.platformMetadataCheckedAt?new Date(a.platformMetadataCheckedAt).toLocaleString():"Not recorded"}</p>
     {Array.isArray(a.autoReviewSuggestion)&&a.autoReviewSuggestion.length>0&&<div style={{padding:"10px",border:"1px solid #6e9",borderRadius:10,marginBottom:10}}>
      <b>Automatic suggestion: {a.autoReviewSuggestion.join(" + ")}</b>
      <p className="muted">Source: {a.autoReviewProvider||"Third-party lookup"} · {a.autoReviewEvidence||"platform metadata"} · NOT owner-verified yet.</p>
      <button type="button" className="secondary" disabled={busy} onClick={()=>setDraft(d=>({...d,[a.id]:a.autoReviewSuggestion}))}>COPY SUGGESTION TO CHECKBOXES</button>
      {a.autoReviewUrl&&<a className="button secondary" target="_blank" rel="noreferrer" href={a.autoReviewUrl}>VIEW SOURCE</a>}
     </div>}
     {a.autoReviewResult&&a.autoReviewResult!=="SUGGESTED"&&<p className="muted">Automatic check: {a.autoReviewResult.replaceAll("_"," ")}</p>}
     <div className="row" style={{margin:"10px 0"}}>
      { ["PC","Android","iOS"].map(p=><label key={p}><input type="checkbox" checked={selected.includes(p)} onChange={()=>toggle(a.id,p)}/> {p}</label>)}
      <button className="secondary" disabled={busy} onClick={()=>setDraft(d=>({...d,[a.id]:["PC","Android","iOS"]}))}>ALL THREE</button>
     </div>
     <div className="row">
      <a className="button secondary" target="_blank" rel="noreferrer" href={`https://vrchat.com/home/avatar/${a.id}`}>OPEN VRCHAT</a>
      <button disabled={busy} className="secondary" onClick={()=>lookup(a,"NekoSuneVR")}>LOOK UP NEKOSUNEVR</button>
      <button disabled={busy} className="secondary" onClick={()=>lookup(a,"KitsuneDB")}>LOOK UP KITSUNEDB API</button>
      <a className="button secondary" href={`https://avtr.fumikoecho.net/avatars?search=${encodeURIComponent(a.id)}`} target="_blank" rel="noreferrer">OPEN KITSUNEDB ↗</a>
      <button disabled={busy||!selected.length} onClick={()=>act(a,"verify")}>VERIFY & ADD</button>
      <button disabled={busy} className="danger" onClick={()=>act(a,"dismiss")}>REMOVE FROM REVIEW</button>
     </div>
    </div>
   </div>
  </section>})}
  <div className="row" style={{justifyContent:"space-between"}}>
   <button className="secondary" disabled={busy||(data?.page||1)<=1} onClick={()=>{setPage(page-1);load(page-1,search)}}>← PREVIOUS</button>
   <span>Page {data?.page||1} / {data?.pages||1}</span>
   <button className="secondary" disabled={busy||(data?.page||1)>=(data?.pages||1)} onClick={()=>{setPage(page+1);load(page+1,search)}}>NEXT →</button>
  </div>
 </main>;
}
