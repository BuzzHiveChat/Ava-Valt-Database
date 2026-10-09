import {ownerAuthorized} from "../../../../lib/guard";
import {getRepoFile,putRepoFile} from "../../../../lib/githubFile";
import {SEARCH_INDEX_BUILDER,SEARCH_INDEX_WORKFLOW,WORKFLOW_PATH,BUILDER_PATH} from "../../../../lib/searchAutoSyncFiles";
export const dynamic="force-dynamic";
export const maxDuration=60;
const noStore={"Cache-Control":"no-store"};
const repoUrl=`https://github.com/${process.env.GITHUB_OWNER||"BuzzHiveChat"}/${process.env.GITHUB_REPO||"Ava-Valt-Database"}`;

async function getOrNull(path){
 try{return await getRepoFile(path)}
 catch(e){if(e.message==="NOT_FOUND")return null;throw e}
}
async function status(){
 const [workflow,builder,manifest]=await Promise.all([
  getOrNull(WORKFLOW_PATH),getOrNull(BUILDER_PATH),getOrNull("search-manifest.json")
 ]);
 let index=null;
 try{index=manifest?JSON.parse(manifest.text):null}catch(_){/* report missing index below */}
 const ready=!!workflow&&!!builder;
 return {installed:ready,workflowPresent:!!workflow,builderPresent:!!builder,
  versionMatches:ready&&workflow.text===SEARCH_INDEX_WORKFLOW&&builder.text===SEARCH_INDEX_BUILDER,indexedCount:Number.isInteger(index?.total)?index.total:null,
  lastIndexedAt:index?.generatedAt||null,sourceSha:index?.sourceSha||null,
  actionsUrl:repoUrl+"/actions/workflows/ava-valt-search-index.yml"};
}
export async function GET(){
 if(!await ownerAuthorized())return Response.json({error:"Owner access required"},{status:403,headers:noStore});
 try{return Response.json(await status(),{headers:noStore})}
 catch(e){return Response.json({error:e.message},{status:500,headers:noStore})}
}
export async function POST(req){
 if(!await ownerAuthorized())return Response.json({error:"Owner access required"},{status:403,headers:noStore});
 try{
  const body=await req.json();
  if(!["install","run","update-builder"].includes(body?.action))return Response.json({error:"Expected action=install, run, or update-builder"},{status:400,headers:noStore});
  if(body.action==="update-builder"){
   const current=await getOrNull(BUILDER_PATH);
   if(current?.text!==SEARCH_INDEX_BUILDER)await putRepoFile(BUILDER_PATH,SEARCH_INDEX_BUILDER,"Ava-Valt: update opt-out-aware search builder");
   return Response.json({ok:true,message:"Updated the GitHub search builder. Workflow edits may require manual GitHub access; existing workflow still runs when avatar-index.json changes."},{headers:noStore});
  }
  if(body.action==="install"){
   // Write build script FIRST; workflow is added last. Existing database and search files stay intact.
   const currentBuilder=await getOrNull(BUILDER_PATH);
   if(currentBuilder?.text!==SEARCH_INDEX_BUILDER){
    await putRepoFile(BUILDER_PATH,SEARCH_INDEX_BUILDER,"Ava-Valt: install automatic search index builder");
   }
   const currentWorkflow=await getOrNull(WORKFLOW_PATH);
   if(currentWorkflow?.text!==SEARCH_INDEX_WORKFLOW){
    try{await putRepoFile(WORKFLOW_PATH,SEARCH_INDEX_WORKFLOW,"Ava-Valt: enable automatic GitHub search index syncing")}
    catch(e){throw new Error(`Could not install GitHub Actions workflow. Check whether GITHUB_TOKEN permits editing workflows (Actions/Workflows write). ${e.message}`)}
   }
   return Response.json({...await status(),message:"Auto sync installed. Run it once in GitHub Actions, or wait until the next avatar-index.json update. Future website imports and repairs trigger it automatically."},{headers:noStore});
  }
  const {installed}=await status();
  if(!installed)return Response.json({error:"Install automatic sync first."},{status:409,headers:noStore});
  const owner=process.env.GITHUB_OWNER||"BuzzHiveChat";
  const repo=process.env.GITHUB_REPO||"Ava-Valt-Database";
  const branch=process.env.GITHUB_BRANCH||"main";
  const r=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/ava-valt-search-index.yml/dispatches`,{
    method:"POST",headers:{
      "Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28",
      "Authorization":`Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type":"application/json","User-Agent":"Ava-Valt-Web-Admin/2.26"
    },body:JSON.stringify({ref:branch}),cache:"no-store"
  });
  if(!r.ok)throw new Error(`GitHub Actions dispatch HTTP ${r.status}: ${(await r.text()).slice(0,400)}. If your token has no Actions:write permission, use the Run workflow button in GitHub Actions.`);
  return Response.json({...await status(),message:"GitHub accepted the sync request. Check Actions for progress. The world will see it after GitHub Pages refreshes."},{headers:noStore});
 }catch(e){return Response.json({error:e.message||String(e)},{status:500,headers:noStore})}
}
