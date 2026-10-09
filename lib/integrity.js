import {readDb,replaceAndSave} from "./db";
import {platformSetFromAny} from "./platforms";

const validId=id=>/^avtr_[0-9a-f-]+$/i.test(String(id||""));
const empty=v=>v==null||v===""||v==="Unknown"||(Array.isArray(v)&&v.length===0);

function score(a){
 let n=0;
 for(const k of ["name","author","authorName","authorId","description","imageUrl","thumbnailImageUrl","createdAt","updatedAt"])
  if(!empty(a?.[k]))n++;
 n+=platformSetFromAny(a).length*4;
 if(a?.metadataProvider)n+=2;
 return n;
}

function mergeDuplicateRows(rows){
 const ordered=[...rows].sort((a,b)=>score(b)-score(a));
 const best={...ordered[0]};
 const platforms=new Set();
 for(const row of ordered){
  for(const p of platformSetFromAny(row))platforms.add(p);
  for(const [k,v] of Object.entries(row||{})){
   if(k==="platforms")continue;
   if(empty(best[k])&&!empty(v))best[k]=v;
  }
 }
 if(platforms.size)best.platforms=[...platforms];
 best.integrityMergedAt=new Date().toISOString();
 if(rows.length>1)best.integrityMergedDuplicates=rows.length;
 return best;
}

export async function databaseIntegrity({repair=false}={}){
 const db=await readDb();
 const groups=new Map(),invalid=[];
 for(const a of db.avatars||[]){
  if(!a?.id||!validId(a.id)){invalid.push(a);continue}
  const key=String(a.id).toLowerCase();
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(a);
 }

 const duplicateGroups=[...groups.values()].filter(x=>x.length>1);
 const duplicateRecords=duplicateGroups.reduce((n,x)=>n+x.length-1,0);
 const unique=[...groups.values()].map(mergeDuplicateRows);

 let repaired=false;
 if(repair&&duplicateRecords>0){
  // Invalid IDs are preserved as-is; this repair is ONLY a duplicate-ID repair.
  await replaceAndSave([...unique,...invalid],
   `Ava-Valt database integrity: merge ${duplicateRecords} duplicate avatar record(s)`,
   4,{preserveMissing:false});
  repaired=true;
 }

 return {
  totalRecords:(db.avatars||[]).length,
  uniqueAvatarIds:groups.size,
  duplicateGroups:duplicateGroups.length,
  duplicateRecords,
  invalidIds:invalid.length,
  repaired,
  totalAfterRepair:unique.length+invalid.length
 };
}
