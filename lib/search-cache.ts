import {visibleSearchDocument} from './search-schema';
import type {SearchResponse} from './search-model';

const fields=['fingerprint','content_version','title','description','subject','tags_json','year','grade','school','exam','file_type','source_url','source_name','summary_json','duplicate_key','view_count','thumbnail_key','preview_key'];
const proof=(row:Record<string,unknown>)=>JSON.stringify([...fields.map(key=>row[key]),row.chunk_id??null,row.matched_content??null,row.matched_location??null]);
type Entry={expires:number;bytes:number;response:SearchResponse;proofs:Map<string,string>;chunkIds:number[]};
const caches=new WeakMap<D1Database,Map<string,Entry>>();
export const subjectQuery=`SELECT s.subject FROM (SELECT DISTINCT subject FROM search_v2_documents) s WHERE EXISTS(SELECT 1 FROM search_v2_documents d WHERE d.subject=s.subject AND ${visibleSearchDocument}) ORDER BY s.subject LIMIT 60`;

export async function readSearchCache(DB:D1Database,key:string,diagnostics:boolean):Promise<{hit?:SearchResponse;validation:{statements:number;rowsRead:number}}>{
  const none={validation:{statements:0,rowsRead:0}};
  const cache=caches.get(DB),entry=cache?.get(key);if(!entry)return none;
  if(entry.expires<=Date.now()){cache!.delete(key);return none;}
  const ids=[...entry.proofs.keys()];
  // Every hit rechecks visibility and document content generations in one snapshot.
  const [current,version,subjects]=await DB.batch([
    DB.prepare(`SELECT d.id,d.index_status,d.index_message,${fields.map(f=>'d.'+f).join(',')},c.id AS chunk_id,c.content AS matched_content,c.location_json AS matched_location FROM search_v2_documents d LEFT JOIN search_v2_chunks c ON c.document_id=d.id AND c.id IN (${entry.chunkIds.map(()=>'?').join(',')||'-1'}) AND c.field<>'staging' WHERE d.id IN (${ids.map(()=>'?').join(',')}) AND ${visibleSearchDocument}`).bind(...entry.chunkIds,...ids),
    DB.prepare("SELECT value FROM search_v2_control WHERE key='version'"),DB.prepare(subjectQuery)
  ]);
  const validation={statements:3,rowsRead:[current,version,subjects].reduce((n,r)=>n+(r.meta?.rows_read||0),0)};
  if(String(version.results[0]?.value||'0')!==entry.response.indexVersion||current.results.length!==ids.length||current.results.some(row=>entry.proofs.get(String(row.id))!==proof(row))){cache!.delete(key);return {validation};}
  const result=structuredClone(entry.response);const states=new Map(current.results.map(row=>[String(row.id),row]));
  for(const hit of result.results){const row=states.get(hit.sourceType+':'+hit.id)!;hit.indexStatus=row.index_status as typeof hit.indexStatus;hit.indexMessage=String(row.index_message||'');}
  result.subjects=subjects.results.map(row=>String(row.subject));
  return {hit:{...result,...(diagnostics?{diagnostics:{...validation,cacheHit:true}}:{})},validation};
}

export function writeSearchCache(DB:D1Database,key:string,response:SearchResponse,rows:Array<Record<string,unknown>>){
  // Folder text depends on child visibility; do not reuse it between requests.
  if(!response.results.length||response.results.length>20||response.results.some(r=>r.sourceType==='folder'))return;
  const clean=structuredClone(response);delete (clean as SearchResponse & {diagnostics?:unknown}).diagnostics;
  const proofs=new Map(rows.map(row=>[String(row.id),proof(row)]));
  const bytes=new TextEncoder().encode(JSON.stringify([key,clean,[...proofs]])).length;if(bytes>100_000)return;
  let cache=caches.get(DB);if(!cache){cache=new Map();caches.set(DB,cache);}
  cache.delete(key);for(const [k,v]of cache)if(v.expires<=Date.now())cache.delete(k);
  cache.set(key,{expires:Date.now()+30_000,bytes,response:clean,proofs,chunkIds:rows.map(row=>Number(row.chunk_id)).filter(n=>Number.isSafeInteger(n)&&n>0)});
  let size=[...cache.values()].reduce((n,e)=>n+e.bytes,0);
  while(cache.size>40||size>1_000_000){const first=cache.keys().next().value!;size-=cache.get(first)!.bytes;cache.delete(first);}
}
