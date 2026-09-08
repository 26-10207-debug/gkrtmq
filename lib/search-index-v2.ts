import { publicAttachments, storedAttachments } from "./contribution-attachments";
import { builtinAssets, examples, recallQuestions } from "./builtin-materials";
import { compactSearch, flattenText, inferMetadata, initials, normalizeSearch, readJson, shortGrams, splitSections, type SearchKind, type TextSection } from "./search-model";
import { visibleSearchDocument } from "./search-schema";

export async function changeSearchVersion(DB: D1Database) { await DB.prepare("INSERT INTO search_v2_control(key,value) VALUES('version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(crypto.randomUUID()).run(); }
export async function digestText(text: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,"0")).join(""); }
export function deleteChunks(DB: D1Database,id: string, field?: string) {
  const where = "document_id=?"+(field ? " AND field=?" : ""); const values=field?[id,field]:[id];
  return [DB.prepare(`DELETE FROM search_v2_fts WHERE rowid IN (SELECT id FROM search_v2_chunks WHERE ${where})`).bind(...values),DB.prepare(`DELETE FROM search_v2_short WHERE rowid IN (SELECT id FROM search_v2_chunks WHERE ${where})`).bind(...values),DB.prepare(`DELETE FROM search_v2_chunks WHERE ${where}`).bind(...values)];
}
export function deleteSectionChunks(DB:D1Database,id:string,section:TextSection){
  const where="document_id=? AND field='body' AND COALESCE(json_extract(location_json,'$.attachment'),0)=? AND COALESCE(json_extract(location_json,'$.page'),0)=? AND COALESCE(json_extract(location_json,'$.path'),'')=?";
  const values=[id,section.attachment??0,section.page??0,section.path??''];
  return [DB.prepare(`DELETE FROM search_v2_fts WHERE rowid IN(SELECT id FROM search_v2_chunks WHERE ${where})`).bind(...values),DB.prepare(`DELETE FROM search_v2_short WHERE rowid IN(SELECT id FROM search_v2_chunks WHERE ${where})`).bind(...values),DB.prepare(`DELETE FROM search_v2_chunks WHERE ${where}`).bind(...values)];
}
export function chunkStatements(DB:D1Database,id:string,sections:TextSection[],field="body") {
  const statements: D1PreparedStatement[]=[];
  for(const [ordinal,input] of sections.entries()) {
    const identity=`${field}:${input.attachment??0}:${input.page??0}:${input.path??""}:${input.ordinal??ordinal}:`;
    const where="document_id=? AND substr(chunk_key,1,length(?))=?";
    statements.push(DB.prepare(`DELETE FROM search_v2_fts WHERE rowid IN(SELECT id FROM search_v2_chunks WHERE ${where})`).bind(id,identity,identity),DB.prepare(`DELETE FROM search_v2_short WHERE rowid IN(SELECT id FROM search_v2_chunks WHERE ${where})`).bind(id,identity,identity),DB.prepare(`DELETE FROM search_v2_chunks WHERE ${where}`).bind(id,identity,identity));
    for(const section of splitSections([{...input,ordinal:input.ordinal??ordinal}])) {
    const key=field+":"+section.key; const {text,normalized,compact,...location}=section;
    statements.push(DB.prepare("DELETE FROM search_v2_fts WHERE rowid=(SELECT id FROM search_v2_chunks WHERE document_id=? AND chunk_key=?)").bind(id,key),DB.prepare("DELETE FROM search_v2_short WHERE rowid=(SELECT id FROM search_v2_chunks WHERE document_id=? AND chunk_key=?)").bind(id,key));
    statements.push(DB.prepare("INSERT INTO search_v2_chunks(document_id,chunk_key,field,content,normalized,compact,location_json,ordinal) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(document_id,chunk_key) DO UPDATE SET content=excluded.content,normalized=excluded.normalized,compact=excluded.compact,location_json=excluded.location_json,ordinal=excluded.ordinal").bind(id,key,field,text,normalized,compact,JSON.stringify(location),section.ordinal||0));
    statements.push(DB.prepare("INSERT INTO search_v2_fts(rowid,normalized,compact) SELECT id,normalized,compact FROM search_v2_chunks WHERE document_id=? AND chunk_key=?").bind(id,key),DB.prepare("INSERT INTO search_v2_short(rowid,grams) SELECT id,? FROM search_v2_chunks WHERE document_id=? AND chunk_key=?").bind(shortGrams(compact),id,key));
  }
  }
  return statements;
}
export async function writeSections(DB:D1Database,id:string,sections:TextSection[],field="body") { const statements=chunkStatements(DB,id,sections,field); for(let i=0;i<statements.length;i+=75) await DB.batch(statements.slice(i,i+75)); }

export async function syncSearchV2(DB:D1Database,kind:SearchKind,sourceId:string) {
  try { return await sync(DB,kind,sourceId); } catch(error) { if(/no such table: search_v2_/i.test(String(error))) return; throw error; }
}
async function sync(DB:D1Database,kind:SearchKind,sourceId:string) {
  const id=kind+":"+sourceId;
  let row:Record<string,unknown>|null=null; let body=""; let authored=""; let summary:Record<string,unknown>={}; let fingerprint=""; let files:string[]=[]; let sourceUrl=""; let sourceName=""; let description="";
  if(kind==="contribution") {
    row=await DB.prepare("SELECT id,title,subject,tags_json,source_note,original_name,content_type,object_key,attachments_json,status,created_at,view_count,owner_display_name,publish_mode,text_only,extracted_text,custom_materials_json,learning_json,questions_json,recall_json FROM contributions WHERE id=? AND status IN ('published','published_ai')").bind(sourceId).first<Record<string,unknown>>();
    if(row){const attachments=Number(row.text_only)?[]:storedAttachments(String(row.attachments_json||""),{objectKey:String(row.object_key),originalName:String(row.original_name),contentType:String(row.content_type)}); files=attachments.map(a=>a.originalName);description=String(row.source_note||"");sourceName=String(row.owner_display_name||"기여 자료");body=String(row.extracted_text||"");authored=[row.custom_materials_json,row.learning_json,row.questions_json,row.recall_json].map(v=>flattenText(readJson(v,{}))).filter(Boolean).join("\n");fingerprint=await digestText(JSON.stringify([attachments,body,authored]));summary={originalName:row.original_name,contentType:row.content_type,sourceNote:row.source_note,ownerDisplayName:row.owner_display_name,publishMode:row.publish_mode,status:row.status,textOnly:row.text_only,attachments:publicAttachments(attachments),customMaterialsJson:null,extractedTextPreview:body.slice(0,160),materialCount:0};}
  } else if(kind==="reference") {
    row=await DB.prepare("SELECT * FROM reference_library WHERE id=?").bind(sourceId).first<Record<string,unknown>>();
    if(row){description=String(row.description||"");sourceUrl=String(row.source_url||"");sourceName=String(row.source_name||"");fingerprint=await digestText(sourceUrl);summary={description,topic:row.topic,licenseNote:row.license_note,accessMode:row.access_mode,tagsJson:row.tags_json};}
  } else if(kind==="folder") {
    row=await DB.prepare("SELECT id,title,description,subject,tags_json,owner_display_name,folder_type,created_at FROM public_folders WHERE id=? AND visibility_state='published'").bind(sourceId).first<Record<string,unknown>>();
    if(row){const items=await DB.prepare("SELECT c.id,c.title,c.tags_json FROM public_folder_items fi JOIN contributions c ON c.id=fi.contribution_id WHERE fi.folder_id=? AND c.status IN ('published','published_ai') ORDER BY fi.position").bind(sourceId).all<Record<string,unknown>>();description=String(row.description||"");body=items.results.map(x=>[x.title,...readJson<string[]>(x.tags_json,[])].join(" ")).join("\n");fingerprint=await digestText(body);sourceName=String(row.owner_display_name||"");summary={description,ownerDisplayName:row.owner_display_name,folderType:row.folder_type,itemCount:items.results.length};}
  } else {
    const item=builtinAssets.find(x=>x.id===sourceId);if(item){row={...item,tags_json:JSON.stringify(item.tags),view_count:item.views,created_at:""};description=item.description;body=flattenText([examples,recallQuestions]);fingerprint=await digestText(body);sourceName="덤캔런 기본 자료";summary={...item};}
  }
  if(!row){await DB.batch([...deleteChunks(DB,id),DB.prepare("DELETE FROM search_v2_jobs WHERE document_id=?").bind(id),DB.prepare("DELETE FROM search_v2_documents WHERE id=?").bind(id)]);await changeSearchVersion(DB);return;}
  const old=await DB.prepare("SELECT fingerprint,content_version,index_status,duplicate_key FROM search_v2_documents WHERE id=?").bind(id).first<{fingerprint:string;content_version:number;index_status:string;duplicate_key:string}>();
  const changed=!old||old.fingerprint!==fingerprint;const version=old?old.content_version+(changed?1:0):1;
  const tags=readJson<string[]>(row.tags_json,[]);const title=String(row.title);const metadata=inferMetadata(title,tags);const subject=String(row.subject||"분류 없음");const fileType=[...new Set(files.map(x=>x.split(".").pop()?.toLowerCase()||""))].join(" ");let host="";try{host=new URL(sourceUrl).hostname.replace(/^www\./,"");}catch{/* internal document */}
  const status=changed?(kind==="contribution"&&files.length?"pending":kind==="reference"?"unsupported":"completed"):old!.index_status;
  const duplicateKey=changed?(sourceUrl?"url:"+sourceUrl:id):old!.duplicate_key;
  await DB.batch([DB.prepare(`INSERT INTO search_v2_documents(id,source_id,source_type,title,normalized_title,compact_title,title_initials,description,subject,tags_json,year,grade,school,exam,file_type,source_host,source_url,source_name,created_at,view_count,summary_json,fingerprint,content_version,index_status,index_message,duplicate_key) VALUES(${Array(26).fill("?").join(",")}) ON CONFLICT(id) DO UPDATE SET title=excluded.title,normalized_title=excluded.normalized_title,compact_title=excluded.compact_title,title_initials=excluded.title_initials,description=excluded.description,subject=excluded.subject,tags_json=excluded.tags_json,year=excluded.year,grade=excluded.grade,school=excluded.school,exam=excluded.exam,file_type=excluded.file_type,source_host=excluded.source_host,source_url=excluded.source_url,source_name=excluded.source_name,view_count=excluded.view_count,summary_json=excluded.summary_json,thumbnail_key=CASE WHEN fingerprint<>excluded.fingerprint THEN NULL ELSE thumbnail_key END,preview_key=CASE WHEN fingerprint<>excluded.fingerprint THEN NULL ELSE preview_key END,index_message=CASE WHEN fingerprint<>excluded.fingerprint THEN excluded.index_message ELSE index_message END,fingerprint=excluded.fingerprint,content_version=excluded.content_version,index_status=excluded.index_status,duplicate_key=excluded.duplicate_key,updated_at=CURRENT_TIMESTAMP`).bind(id,sourceId,kind,title,normalizeSearch(title),compactSearch(title),initials([title,...tags].join(" ")),description,subject,JSON.stringify(tags),metadata.year,metadata.grade,metadata.school,metadata.exam,fileType,host,sourceUrl,sourceName,String(row.created_at||""),Number(row.view_count||0),JSON.stringify(summary),fingerprint,version,status,kind==="reference"?"제목·설명·원문 링크를 검색합니다.":"",duplicateKey),...deleteChunks(DB,id,"meta"),...chunkStatements(DB,id,[{text:[title,subject,...tags,description,...files,...Object.values(metadata).filter(Boolean),sourceName,host].join("\n")}],"meta")]);
  if(changed){await DB.batch([...deleteChunks(DB,id,"body"),...deleteChunks(DB,id,"authored"),DB.prepare("DELETE FROM search_v2_jobs WHERE document_id=?").bind(id)]);if(body)await writeSections(DB,id,[{text:body}],"body");if(authored)await writeSections(DB,id,[{text:authored}],"authored");if(kind==="contribution"&&files.length)await DB.prepare("INSERT INTO search_v2_jobs(id,document_id,content_version) VALUES(?,?,?)").bind(crypto.randomUUID(),id,version).run();}
  await changeSearchVersion(DB);
}

export async function syncContainingFolders(DB:D1Database,sourceId:string){const rows=await DB.prepare("SELECT DISTINCT folder_id FROM public_folder_items WHERE contribution_id=?").bind(sourceId).all<{folder_id:string}>();for(const row of rows.results)await syncSearchV2(DB,"folder",row.folder_id);}
export async function seedSearchPage(DB:D1Database,kind:SearchKind,offset:number){
  const tables:Record<string,string>={contribution:"SELECT id FROM contributions WHERE status IN ('published','published_ai') ORDER BY id LIMIT 10 OFFSET ?",reference:"SELECT id FROM reference_library ORDER BY id LIMIT 10 OFFSET ?",folder:"SELECT id FROM public_folders WHERE visibility_state='published' ORDER BY id LIMIT 10 OFFSET ?"};
  const ids=kind==="builtin"?builtinAssets.slice(offset,offset+10).map(x=>x.id):(await DB.prepare(tables[kind]).bind(offset).all<{id:string}>()).results.map(x=>x.id);
  for(const id of ids)await syncSearchV2(DB,kind,id);
  return {count:ids.length,nextOffset:ids.length===10?offset+10:null};
}
export async function publicIndexedDocument(DB:D1Database,id:string){return DB.prepare(`SELECT d.* FROM search_v2_documents d WHERE d.id=? AND ${visibleSearchDocument}`).bind(id).first<Record<string,unknown>>();}
