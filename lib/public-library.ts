import {searchLibrary,searchReady} from "./search-service";
import {publicSections} from "./public-sections";
import {readJson,type SearchInput} from "./search-model";
import { ensureSchema, getRuntimeEnv } from "@/db/runtime";
import { storedAttachments } from "@/lib/contribution-attachments";
import { contentTypeFor, isTextSource } from "@/lib/upload-types";
import { safePackagePath, unpackWebPackage } from "@/lib/web-package";

function parsed(value: unknown, fallback: unknown = {}) { try { return JSON.parse(String(value || "")); } catch { return fallback; } }
function flatten(value: unknown, depth = 0): string {
  if (depth > 15) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((item) => flatten(item, depth + 1)).filter(Boolean).join("\n");
  if (value && typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${flatten(item, depth + 1)}`).join("\n");
  return "";
}
const publicOnly = `(source_type = 'contribution' AND EXISTS (SELECT 1 FROM contributions c WHERE c.id = source_id AND c.status IN ('published','published_ai')))
  OR (source_type = 'reference' AND EXISTS (SELECT 1 FROM reference_library r WHERE r.id = source_id))
  OR (source_type = 'folder' AND EXISTS (SELECT 1 FROM public_folders f WHERE f.id = source_id AND f.visibility_state = 'published'))`;
type SearchRow = { sourceId: string; sourceType: string; title: string; body: string; subject: string };
export async function searchPublic(query: string, origin: string, options: Partial<SearchInput> = {}) {
  await ensureSchema(); const { DB } = getRuntimeEnv(); const q = query.trim().slice(0, 160);
  if(await searchReady(DB)){const found=await searchLibrary(DB,{...options,query});return {...found,results:found.results.map(row=>{const id=row.sourceType+":"+row.id;const p=new URLSearchParams({material:id});for(const [k,v]of Object.entries(row.matchLocation))if(v!==undefined)p.set(k,String(v));return {...row,id,url:origin+"/?"+p,text:row.searchSnippet};})};}
  if (!q) return { results: [] };
  const rows = await DB.prepare(`SELECT source_id AS sourceId, source_type AS sourceType, title, substr(body, 1, 600) AS body, subject
    FROM search_documents WHERE (${publicOnly}) AND (instr(lower(title), lower(?)) > 0 OR instr(lower(tags), lower(?)) > 0 OR instr(lower(body), lower(?)) > 0)
    ORDER BY CASE WHEN lower(title) = lower(?) THEN 0 WHEN instr(lower(title), lower(?)) > 0 THEN 1 ELSE 2 END LIMIT 20`).bind(q, q, q, q, q).all<SearchRow>();
  return { results: rows.results.map((row) => ({ id: `${row.sourceType}:${row.sourceId}`, title: row.title, url: `${origin}/?material=${encodeURIComponent(`${row.sourceType}:${row.sourceId}`)}`, text: row.body.slice(0, 300), subject: row.subject })) };
}
export async function fetchPublic(inputId: string, origin: string, offset=0) {
  if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw new Error("본문 구간 번호를 확인해 주세요.");
  await ensureSchema(); const { DB } = getRuntimeEnv();
  const separator = inputId.indexOf(":"); const type = separator < 0 ? "contribution" : inputId.slice(0, separator); const id = separator < 0 ? inputId : inputId.slice(separator + 1);
  if (!id || id.length > 200) throw new Error("자료 ID를 확인해 주세요.");
  const url = `${origin}/?material=${encodeURIComponent(`${type}:${id}`)}`;
  if(await searchReady(DB)){
    const {doc,rows:sectionRows}=await publicSections(DB,type+":"+id,offset);if(!doc)throw new Error("공개 자료를 찾을 수 없습니다.");
    const rows={results:sectionRows};
    const summary=readJson<Record<string,unknown>>(doc.summary_json,{});const sections=rows.results.slice(0,10).map(r=>({text:r.content,...readJson(r.location_json,{})}));
    const items=type==="folder"?(await DB.prepare("SELECT c.id,c.title FROM public_folder_items fi JOIN contributions c ON c.id=fi.contribution_id WHERE fi.folder_id=? AND c.status IN ('published','published_ai') AND EXISTS(SELECT 1 FROM public_folders f WHERE f.id=fi.folder_id AND f.visibility_state='published') ORDER BY fi.position").bind(id).all<{id:string;title:string}>()).results.map(item=>({id:'contribution:'+item.id,title:item.title,url:origin+'/?material='+encodeURIComponent('contribution:'+item.id)})):undefined;
    return {items,id:type+":"+id,title:String(doc.title),url,text:sections.length?sections.map(s=>s.text).join("\n\n"):String(doc.description),sections,nextOffset:rows.results.length>10?offset+10:null,metadata:{lastCheckedAt:summary.lastCheckedAt,collectionState:summary.collectionState,collectionError:summary.collectionError,licenseNote:summary.licenseNote,subject:doc.subject,tags:readJson(doc.tags_json,[]),sourceUrl:doc.source_url,sourceName:doc.source_name,indexStatus:doc.index_status,indexMessage:doc.index_message,truncated:rows.results.length>10},files:(Array.isArray(summary.attachments)?summary.attachments:[]).map((f,i)=>({...f,index:i,name:f.originalName,url:origin+"/api/files?id="+encodeURIComponent(id)+"&attachment="+i}))};
  }
  if (type === "contribution") {
    const row = await DB.prepare(`SELECT id, title, subject, source_note AS sourceNote, owner_display_name AS author, created_at AS createdAt,
      extracted_text AS text, custom_materials_json AS materials, learning_json AS learning, questions_json AS questions,
      recall_json AS recall, tags_json AS tags, text_only AS textOnly, attachments_json AS attachmentsJson,
      original_name AS originalName, content_type AS contentType, object_key AS objectKey
      FROM contributions WHERE id = ? AND status IN ('published','published_ai')`).bind(id).first<Record<string, unknown>>();
    if (!row) throw new Error("공개 자료를 찾을 수 없습니다.");
    const text = [row.sourceNote, row.text, ...[row.materials, row.learning, row.questions, row.recall].map((item) => flatten(parsed(item)))].filter(Boolean).join("\n\n");
    const attachments = Number(row.textOnly) ? [] : storedAttachments(String(row.attachmentsJson || ""), { originalName: String(row.originalName), contentType: String(row.contentType), objectKey: String(row.objectKey) });
    return { id: `contribution:${id}`, title: String(row.title), text: text.slice(0, 40_000), url,
      metadata: { subject: row.subject, author: row.author, createdAt: row.createdAt, tags: parsed(row.tags, []), truncated: text.length > 40_000 },
      files: attachments.map((file, index) => ({ index, name: file.originalName, contentType: file.contentType, size: file.size, url: `${origin}/api/files?id=${encodeURIComponent(id)}&attachment=${index}` })) };
  }
  if (type === "reference") {
    const row = await DB.prepare("SELECT id, title, description, source_url AS sourceUrl, source_name AS sourceName, license_note AS licenseNote FROM reference_library WHERE id = ?").bind(id).first<Record<string, unknown>>();
    if (!row) throw new Error("공개 참고 자료를 찾을 수 없습니다.");
    return { id: `reference:${id}`, title: String(row.title), text: String(row.description), url, metadata: { sourceUrl: row.sourceUrl, sourceName: row.sourceName, licenseNote: row.licenseNote }, files: [] };
  }
  if (type === "folder") {
    const row = await DB.prepare("SELECT title, description FROM public_folders WHERE id = ? AND visibility_state = 'published'").bind(id).first<{ title: string; description: string }>();
    if (!row) throw new Error("공개 폴더를 찾을 수 없습니다.");
    const items = await DB.prepare("SELECT c.id, c.title FROM public_folder_items fi JOIN contributions c ON c.id = fi.contribution_id WHERE fi.folder_id = ? AND c.status IN ('published','published_ai') LIMIT 100").bind(id).all<{ id: string; title: string }>();
    return { id: `folder:${id}`, title: row.title, text: row.description + "\n" + items.results.map((item) => `${item.title} (contribution:${item.id})`).join("\n"), url, metadata: {}, files: [] };
  }
  throw new Error("지원하지 않는 자료 ID입니다.");
}
export async function readPublicFile(id: string, index: number, path: string | undefined, offset: number, origin: string) {
  await ensureSchema(); const { DB, UPLOADS } = getRuntimeEnv();
  id = id.replace(/^contribution:/, "");
  const row = await DB.prepare("SELECT attachments_json AS attachmentsJson, original_name AS originalName, content_type AS contentType, object_key AS objectKey FROM contributions WHERE id = ? AND status IN ('published','published_ai') AND text_only = 0").bind(id).first<{ attachmentsJson: string; originalName: string; contentType: string; objectKey: string }>();
  if (!row) throw new Error("공개 원본을 찾을 수 없습니다.");
  const file = storedAttachments(row.attachmentsJson, row)[index];
  if (!file) throw new Error("첨부 파일 번호를 확인해 주세요.");
  const downloadUrl = `${origin}/api/files?id=${encodeURIComponent(id)}&attachment=${index}`;
  const type = contentTypeFor(file.originalName, file.contentType);
  if (!isTextSource(file.originalName, type) && !/\.zip$/i.test(file.originalName)) return { name: file.originalName, contentType: type, downloadUrl, message: "이미지·영상·문서 원본은 다운로드 URL로 제공합니다. 추출된 본문은 fetch 도구로 읽을 수 있습니다." };
  const object = await UPLOADS.get(file.objectKey); if (!object || object.size > 8 * 1024 * 1024) throw new Error("원본을 읽을 수 없습니다.");
  let bytes: Uint8Array = new Uint8Array(await object.arrayBuffer()); let name = file.originalName;
  if (/\.zip$/i.test(name)) {
    const pkg = unpackWebPackage(bytes, name);
    if (!path) return { name, downloadUrl, entry: pkg.entry, files: Object.keys(pkg.files).map((name) => ({ name, size: pkg.files[name].length, contentType: contentTypeFor(name) })) };
    const safe = safePackagePath(path); if (!safe || !Object.hasOwn(pkg.files, safe)) throw new Error("ZIP 안의 파일 경로를 확인해 주세요.");
    bytes = pkg.files[safe]; name = safe;
    if (!isTextSource(name, contentTypeFor(name))) return { name, downloadUrl, message: "이 파일은 텍스트 형식이 아닙니다." };
  }
  const text = new TextDecoder().decode(bytes); const end = Math.min(offset + 12_000, text.length);
  return { name, downloadUrl, text: text.slice(offset, end), totalCharacters: text.length, nextOffset: end < text.length ? end : null };
}
