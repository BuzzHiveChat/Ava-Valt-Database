"use client";
import {useState} from "react";
const ID=/avtr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const choices=["PC","Android","iOS"];
export default function QuickImport(){
 const [input,setInput]=useState("");const [items,setItems]=useState([]);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("Paste IDs from Discord. Only exact ID matches are accepted from lookup providers.");
 async function lookup(){
  const ids=[...new Set((input.match(ID)||[]).map(x=>x.toLowerCase()))];
  if(!ids.length)return setMessage("Paste at least one valid avtr_ ID.");
  if(ids.length>20)return setMessage("Look up 20 IDs at a time, please.");
  setBusy(true);setMessage("Looking up names… this may take a little while.");
  try{
   const r=await fetch("/api/quick-import/lookup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids})});
   if(r.status===401){location.href="/login";return;}
   const data=await r.json();if(!r.ok)throw Error(data.error||"Lookup failed");
   setItems(data.entries.map(entry=>({...entry,name:entry.avatar?.name&&entry.avatar.name!=="Unknown Avatar"?entry.avatar.name:"",author:entry.avatar?.author&&entry.avatar.author!=="Unknown"?entry.avatar.author:"",platforms:[],selected:!entry.existing})));
   setMessage(`Checked ${data.entries.length} ID(s). Choose platforms and fill in any names the providers couldn't retrieve.`);
  }catch(e){setMessage(e.message)}finally{setBusy(false)}
 }
 function update(id,patch){setItems(old=>old.map(a=>a.id===id?{...a,...patch}:a))}
 async function save(){
  const selected=items.filter(a=>a.selected&&!a.existing);
  if(!selected.length)return setMessage("Select at least one new avatar to import.");
  if(selected.some(a=>!a.name.trim()||!a.platforms.length))return setMessage("Every selected avatar needs a name and at least one platform.");
  if(!confirm(`Import ${selected.length} reviewed avatar(s) into the live GitHub database?`))return;
  setBusy(true);setMessage("Saving reviewed avatars to GitHub…");
  try{
   const avatars=selected.map(a=>({id:a.id,name:a.name.trim(),author:a.author.trim()||"Unknown",authorId:a.avatar?.authorId||"",description:a.avatar?.description||"",imageUrl:a.avatar?.imageUrl||"",thumbnailImageUrl:a.avatar?.thumbnailImageUrl||"",platforms:a.platforms}));
   const r=await fetch("/api/quick-import/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({avatars})});
   if(r.status===401){location.href="/login";return;}
   const data=await r.json();if(!r.ok)throw Error(data.error||(`Save verification failed: ${JSON.stringify(data.missingIds||[])}. Check GitHub database and server logs.`));
   const saved=new Set(data.verifiedIds||[]);
   if(saved.size)setItems(old=>old.map(a=>saved.has(a.id)?{...a,existing:true,selected:false}:a));
   const destination=`${data.destination||"GitHub database"} / ${data.branch||"main"} / ${data.path||"avatar-index.json"}`;
   setMessage(`${data.added} newly added; ${saved.size} confirmed present in GitHub. ${data.duplicates} already present; ${data.excludedOrHeld} excluded/held for creator privacy review.${data.missingIds?.length?` WARNING: ${data.missingIds.length} not verified: ${data.missingIds.join(", ")}.`:""} Destination: ${destination}.`);
  }catch(e){setMessage(e.message)}finally{setBusy(false)}
 }
 return <main style={{maxWidth:1100,margin:"30px auto",padding:"0 18px"}}>
  <p><a href="/">← Back to Ava-Valt Admin</a></p><h1>✨ Quick Import</h1>
  <p className="muted">Paste Discord avatar IDs → fetch names automatically when providers can find them → choose the platform yourself → review → save to GitHub.</p>
  <div className="card"><h2>1. Paste avatar IDs</h2><textarea rows={5} value={input} onChange={e=>setInput(e.target.value)} placeholder="avtr_... (one per line, or paste entire Discord messages)"/><div className="row"><button disabled={busy} onClick={lookup}>{busy?"Please wait…":"FETCH AVATAR NAMES"}</button><span className="muted">Maximum 20 per lookup</span></div></div>
  <div className="card"><h2>2. Review and choose platform</h2><p aria-live="polite">{message}</p>
   {items.map(a=><div key={a.id} style={{borderTop:"1px solid #5555",padding:"16px 0",display:"flex",gap:18,alignItems:"flex-start",flexWrap:"wrap"}}>
    {a.avatar?.thumbnailImageUrl||a.avatar?.imageUrl?<img src={a.avatar.thumbnailImageUrl||a.avatar.imageUrl} alt="Avatar thumbnail" style={{height:90,width:90,objectFit:"cover",borderRadius:10}}/>:null}
    <div style={{flex:"1 1 300px"}}><label><input type="checkbox" disabled={a.existing} checked={a.selected} onChange={e=>update(a.id,{selected:e.target.checked})}/> {a.existing?"Already in database — skipped":"Include in import"}</label><div><small>{a.id}</small></div>
     <div><label>Avatar name <input aria-label={`Avatar name for ${a.id}`} value={a.name} disabled={a.existing} onChange={e=>update(a.id,{name:e.target.value})} placeholder="Enter name if lookup failed"/></label></div>
     <div><label>Creator <input aria-label={`Creator for ${a.id}`} value={a.author} disabled={a.existing} onChange={e=>update(a.id,{author:e.target.value})} placeholder="Unknown"/></label></div>
     <div style={{marginTop:8}}><b>Platforms (choose manually):</b> {choices.map(p=><label key={p} style={{display:"inline-block",marginRight:15}}><input type="checkbox" disabled={a.existing} checked={a.platforms.includes(p)} onChange={e=>update(a.id,{platforms:e.target.checked?[...a.platforms,p]:a.platforms.filter(x=>x!==p)})}/> {p}</label>)}</div>
     <small className="muted">Source: {a.source||"No exact provider match — enter name manually"}</small>
    </div></div>)}
   {!!items.length&&<button disabled={busy} onClick={save}>SAVE REVIEWED AVATARS TO GITHUB</button>}
  </div>
 </main>
}
