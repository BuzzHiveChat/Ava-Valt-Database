
const owner=()=>process.env.GITHUB_OWNER||"BuzzHiveChat";
const repo=()=>process.env.GITHUB_REPO||"Ava-Valt-Database";
const branch=()=>process.env.GITHUB_BRANCH||"main";
const encodedPath=(path)=>String(path).split("/").map(encodeURIComponent).join("/");
const headers=()=>({
 "Accept":"application/vnd.github+json",
 "Authorization":`Bearer ${process.env.GITHUB_TOKEN}`,
 "X-GitHub-Api-Version":"2022-11-28",
 "User-Agent":"Ava-Valt-Web-Admin/2.1"
});
export async function getRepoFile(path){
 const r=await fetch(`https://api.github.com/repos/${owner()}/${repo()}/contents/${encodedPath(path)}?ref=${encodeURIComponent(branch())}`,{headers:headers(),cache:"no-store"});
 if(r.status===404) throw new Error("NOT_FOUND");
 if(!r.ok) throw new Error(`GitHub HTTP ${r.status}: ${(await r.text()).slice(0,300)}`);
 const j=await r.json();
 let text="";
 if(j.content) text=Buffer.from(j.content.replace(/\n/g,""),"base64").toString("utf8");
 else{
   const raw=await fetch(j.download_url,{cache:"no-store"});
   if(!raw.ok)throw new Error(`GitHub raw HTTP ${raw.status}`);
   text=await raw.text();
 }
 return {text,sha:j.sha};
}
export async function putRepoFile(path,text,message,{expectedSha}={}){
 let sha=expectedSha;
 if(expectedSha===undefined){
  try{sha=(await getRepoFile(path)).sha}catch(e){if(e.message!=="NOT_FOUND")throw e}
 }
 const body={message,content:Buffer.from(text).toString("base64"),branch:branch()};
 if(sha)body.sha=sha;
 const r=await fetch(`https://api.github.com/repos/${owner()}/${repo()}/contents/${encodedPath(path)}`,{
   method:"PUT",headers:{...headers(),"Content-Type":"application/json"},body:JSON.stringify(body)
 });
 if(!r.ok)throw new Error(`GitHub write HTTP ${r.status}: ${(await r.text()).slice(0,500)}`);
 return r.json();
}
