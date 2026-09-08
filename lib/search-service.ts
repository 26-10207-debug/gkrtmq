import { aliasesFor, compactSearch, initials, isInitialQuery, normalizeSearch, parseSearch, quoteFts, readJson, shortToken, snippet, synonymGroups, type QueryTerm, type SearchHit, type SearchInput, type SearchResponse } from "./search-model";
import { visibleSearchDocument } from "./search-schema";

type Row = { id: string; source_id: string; source_type: SearchHit["sourceType"]; title: string; description: string; subject: string; tags_json: string; year: string | null; grade: string | null; school: string | null; exam: string | null; file_type: string; source_url: string; source_name: string; created_at: string; view_count: number; summary_json: string; index_status: SearchHit["indexStatus"]; index_message: string; thumbnail_key: string | null; preview_key: string | null; duplicate_key: string; duplicate_count: number; total: number; chunk_id: number | null; matched_content: string | null; matched_location: string | null };
export async function searchReady(DB: D1Database) { try { const value = await DB.prepare("SELECT value FROM search_v2_control WHERE key='active'").first<{ value: string }>(); return value?.value === "1"; } catch (error) { if (/no such table/i.test(String(error))) return false; throw error; } }

function termBranch(term: QueryTerm, termNo: number, variant: string, expanded: boolean, bindings: Array<string | number>) {
  const needle = term.phrase ? normalizeSearch(variant) : compactSearch(variant); const column = term.phrase ? "normalized" : "compact";
  if (isInitialQuery(term.value)) { bindings.push(term.value); return `SELECT id AS document_id, ${termNo} AS term_no, 0 AS expanded, NULL AS chunk_id, 1 AS weight FROM search_v2_documents WHERE instr(title_initials,?)>0`; }
  const short = Array.from(needle).length < 3;
  bindings.push(short ? shortToken(compactSearch(needle)) : `${column}:${quoteFts(needle)}`, needle);
  return `SELECT c.document_id, ${termNo} AS term_no, ${expanded?1:0} AS expanded, c.id+CASE WHEN c.field='meta' THEN 1000000000000 ELSE 0 END AS chunk_id, CASE WHEN c.field='meta' THEN 4 ELSE 1 END AS weight FROM ${short ? "search_v2_short" : "search_v2_fts"} JOIN search_v2_chunks c ON c.id=${short ? "search_v2_short" : "search_v2_fts"}.rowid WHERE ${short ? "search_v2_short" : "search_v2_fts"} MATCH ? AND instr(c.${column},?)>0`;
}

export function buildSearchQuery(input: SearchInput, offset = 0) {
  const parsed = parseSearch(input); const positive = parsed.terms.filter(t => !t.excluded); const excluded = parsed.terms.filter(t => t.excluded);
  const bindings: Array<string | number> = []; const branches: string[] = [];
  positive.forEach((term, no) => aliasesFor(term).forEach((value, i) => branches.push(termBranch(term, no, value, i > 0, bindings))));
  const hits = branches.length ? branches.join(" UNION ALL ") : "SELECT id AS document_id, 0 AS term_no, 0 AS expanded, NULL AS chunk_id, 0 AS weight FROM search_v2_documents";
  const conditions = [visibleSearchDocument];
  for (const term of excluded) { const needle = term.phrase ? term.value : compactSearch(term.value); conditions.push(`NOT EXISTS (SELECT 1 FROM search_v2_chunks x WHERE x.document_id=d.id AND instr(x.${term.phrase ? "normalized" : "compact"},?)>0)`); bindings.push(needle); }
  for (const [key, value] of Object.entries(parsed.filters)) {
    if (!value) continue;
    if (key === "type") { const types: Record<string, string> = { "사용자 자료": "contribution", "공개 참고": "reference", "공개 폴더": "folder", "기본 자료": "builtin" }; const kind = types[value] || value; if (["contribution", "reference", "folder", "builtin"].includes(kind)) { conditions.push("d.source_type=?"); bindings.push(kind); } else { conditions.push("json_extract(d.summary_json,'$.type')=?"); bindings.push(value); } }
    else if (key === "filetype") { conditions.push("instr(' '||d.file_type||' ',' '||?||' ')>0"); bindings.push(value.toLowerCase().replace(/^\./,"")); }
    else if (key === "site") { conditions.push("(d.source_host=? OR substr(d.source_host,-length(?)-1)='.'||?)"); const host = value.toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./,""); bindings.push(host,host,host); }
    else if (key === "school") { conditions.push("replace(d.school,'고등학교','고')=replace(?,'고등학교','고')"); bindings.push(value); }
    else { const columns: Record<string, string> = { subject: "subject", year: "year", grade: "grade", exam: "exam" }; if (columns[key]) { conditions.push(`d.${columns[key]}=?`); bindings.push(value); } }
  }
  if (input.duplicates) { conditions.push("d.duplicate_key=?"); bindings.push(input.duplicates); }
  const title = compactSearch(parsed.text);
  // All term matches are intersected at document level, before sorting and paging.
  const titleBindings: Array<string | number> = [title, title, title, title];
  const eachTitle = positive.length ? positive.map(t => { titleBindings.push(compactSearch(t.value)); return "instr(d.compact_title,?)>0"; }).join(" AND ") : "0";
  const limit = Math.max(1, Math.min(Number(input.limit) || 20, 50));
  const order = input.sort === "newest" ? "created_at DESC, relevance_tier, hit_weight DESC, id" : input.sort === "views" ? "view_count DESC, relevance_tier, hit_weight DESC, id" : "relevance_tier, expansion_penalty, hit_weight DESC, view_count DESC, id";
  const termCount=Math.max(positive.length,1);
  const penalty=Array.from({length:termCount},(_,i)=>`MIN(CASE WHEN term_no=${i} THEN expanded ELSE 1 END)`).join("+");
  const weight=Array.from({length:termCount},(_,i)=>`MAX(CASE WHEN term_no=${i} THEN weight ELSE 0 END)`).join("+");
  const sql = `WITH hits AS (${hits}), matched AS (SELECT document_id,${penalty} AS expansion_penalty,${weight} AS hit_weight,MIN(chunk_id) AS chunk_id FROM hits GROUP BY document_id HAVING COUNT(DISTINCT term_no)=${termCount}), filtered AS (SELECT d.id,d.compact_title,d.duplicate_key,d.created_at,d.view_count,m.expansion_penalty,m.hit_weight,m.chunk_id%1000000000000 AS chunk_id FROM matched m JOIN search_v2_documents d ON d.id=m.document_id WHERE ${conditions.join(" AND ")}), ranked AS (SELECT d.*,CASE WHEN ?<>'' AND compact_title=? THEN 0 WHEN ?<>'' AND instr(compact_title,?)=1 THEN 1 WHEN ${eachTitle} THEN 2 WHEN expansion_penalty=0 AND hit_weight>=4 THEN 3 WHEN expansion_penalty=0 THEN 4 ELSE 5 END AS relevance_tier FROM filtered d), grouped AS (SELECT *,COUNT(*) OVER(PARTITION BY duplicate_key) AS duplicate_count,ROW_NUMBER() OVER(PARTITION BY duplicate_key ORDER BY ${order}) AS duplicate_order FROM ranked), representatives AS (SELECT * FROM grouped ${input.duplicates ? "" : "WHERE duplicate_order=1"}) SELECT d.*,page.duplicate_count,page.total,page.chunk_id,c.content AS matched_content,c.location_json AS matched_location FROM (SELECT *,(SELECT COUNT(*) FROM representatives) AS total FROM representatives ORDER BY ${order} LIMIT ? OFFSET ?) page JOIN search_v2_documents d ON d.id=page.id LEFT JOIN search_v2_chunks c ON c.id=page.chunk_id`;

  const parameters=[...bindings,...titleBindings,limit+1,offset];
  if(parameters.length>100)throw new Error("검색 조건을 조금 줄여 주세요.");
  return { sql, bindings: parameters, parsed, limit };
}

function encodeCursor(offset: number, version: string, signature: string) { return btoa(unescape(encodeURIComponent(JSON.stringify({ offset, version, signature })))); }
export async function searchLibrary(DB: D1Database, input: SearchInput, diagnostics=false): Promise<SearchResponse> {
  const signature = JSON.stringify({query:input.query,subject:input.subject||"",year:input.year||"",grade:input.grade||"",school:input.school||"",exam:input.exam||"",filetype:input.filetype||"",site:input.site||"",type:input.type||"",sort:input.sort||"relevance",limit:input.limit||20,duplicates:input.duplicates||""}); let offset = 0;
  let cursorVersion: string | undefined;
  if (input.cursor) { try { const decoded = JSON.parse(decodeURIComponent(escape(atob(input.cursor)))); if (decoded.signature !== signature || !Number.isSafeInteger(decoded.offset) || decoded.offset < 0 || decoded.offset > 1_000_000) throw new Error(); offset = decoded.offset; cursorVersion=decoded.version; } catch { throw new Error("검색 결과가 갱신되었습니다. 처음부터 다시 검색해 주세요."); } }
  const query = buildSearchQuery(input, offset);
  const queries = [DB.prepare(query.sql).bind(...query.bindings), DB.prepare(`SELECT DISTINCT d.subject FROM search_v2_documents d WHERE ${visibleSearchDocument} ORDER BY d.subject LIMIT 60`),DB.prepare("SELECT value FROM search_v2_control WHERE key='version'")];
  const [found, subjects,versionRows] = await DB.batch(queries); const version=String(versionRows.results[0]?.value||"0");
  if(cursorVersion!==undefined&&cursorVersion!==version)throw new Error("검색 결과가 갱신되었습니다. 처음부터 다시 검색해 주세요.");
  const all = found.results as unknown as Row[]; const rows = all.slice(0,query.limit);
  const results: SearchHit[] = rows.map(row => { const summary = readJson<Record<string,unknown>>(row.summary_json, {}); return { ...summary, id: row.source_id, sourceType: row.source_type, title: row.title, description: row.description, subject: row.subject, tags: readJson<string[]>(row.tags_json, []), year: row.year, grade: row.grade, school: row.school, exam: row.exam, fileType: row.file_type, sourceUrl: row.source_url, sourceName: row.source_name, createdAt: row.created_at, viewCount: row.view_count, indexStatus: row.index_status, indexMessage: row.index_message, ...(row.thumbnail_key ? { thumbnailUrl: `/api/search/preview?id=${encodeURIComponent(row.id)}&kind=thumbnail&v=${version}` } : {}), ...(row.preview_key ? { previewUrl: `/api/search/preview?id=${encodeURIComponent(row.id)}&kind=preview&v=${version}` } : {}), searchSnippet: snippet(row.matched_content || row.description, query.parsed.terms), matchLocation: readJson(row.matched_location, {}), duplicateCount: row.duplicate_count || 1, duplicateKey: row.duplicate_key, isSummary: 1 }; });
  return { ...(diagnostics?{diagnostics:{statements:3,rowsRead:[found,subjects,versionRows].reduce((n,r)=>n+(r.meta?.rows_read||0),0)}}:{}), results, related: [...new Set(query.parsed.terms.flatMap(t => aliasesFor(t)).filter(t => !query.parsed.terms.some(x => x.value===t)))].slice(0,6), subjects: subjects.results.map(r=>String(r.subject)), nextCursor: all.length>query.limit ? encodeCursor(offset+query.limit,version,signature) : null, total: rows[0]?.total || 0, indexVersion: version, appliedFilters: query.parsed.filters, engine: "v2" };
}

function distance(a: string,b: string) { const x=Array.from(a), y=Array.from(b); let prev=Array.from({length:y.length+1},(_,i)=>i); x.forEach((c,i)=>{const next=[i+1]; y.forEach((d,j)=>next.push(Math.min(next[j]+1,prev[j+1]+1,prev[j]+(c===d?0:1))));prev=next;});return prev[y.length]; }
export async function suggestSearch(DB: D1Database, raw: string) {
  const q=normalizeSearch(raw).slice(0,160); if(Array.from(q).length<2) return {suggestions:[]};
  const compact=compactSearch(q); const result=await DB.prepare(`SELECT d.title,d.tags_json FROM search_v2_documents d WHERE ${visibleSearchDocument} AND (instr(d.compact_title,?)=1 OR instr(d.title_initials,?)=1) ORDER BY d.normalized_title LIMIT 8`).bind(compact,initials(q)).all<{title:string;tags_json:string}>();
  const suggestions: Array<{text:string;kind:string}> = result.results.map(r=>({text:r.title,kind:"title"}));
  for(const group of synonymGroups) for(const value of group) if(suggestions.length<8 && compactSearch(value).startsWith(compact) && value!==q && !suggestions.some(s=>s.text===value)) suggestions.push({text:value,kind:"term"});
  if(suggestions.length===0 && !/\d/u.test(q) && q.length>=3 && q.length<=24) { const rows=await DB.prepare(`SELECT d.title,d.tags_json FROM search_v2_documents d WHERE ${visibleSearchDocument} ORDER BY d.updated_at DESC LIMIT 500`).all<{title:string;tags_json:string}>(); const candidates=[...new Set(rows.results.flatMap(r=>[...r.title.split(/\s+/u),...readJson<string[]>(r.tags_json,[])]))]; const close=candidates.map(text=>({text,score:distance(compact,compactSearch(text))})).filter(x=>x.score===1&&!/\d/u.test(x.text)).sort((a,b)=>a.text.localeCompare(b.text)); for(const item of close.slice(0,3))suggestions.push({text:item.text,kind:"correction"}); }
  return {suggestions:suggestions.slice(0,8)};
}
