import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureSchema, getRuntimeEnv } from "@/db/runtime";

type SearchDocument = { sourceId: string; sourceType: "contribution" | "reference" | "folder"; subject: string; title: string; tags: string; snippet: string; rank: number };

function safeMatchTerm(value: string) {
  return value.replace(/["'():*^~{}\[\]\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function readTags(value: unknown) {
  try { const parsed = JSON.parse(String(value || "[]")); return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : []; } catch { return []; }
}

export async function GET(request: Request) {
  await ensureSchema();
  const url = new URL(request.url);
  const query = safeMatchTerm(url.searchParams.get("q") || "");
  const subject = (url.searchParams.get("subject") || "전체").trim();
  const type = (url.searchParams.get("type") || "전체").trim();
  const sort = (url.searchParams.get("sort") || "relevance").trim();
  const { DB } = getRuntimeEnv();
  const user = await getChatGPTUser();
  const subjectRows = await DB.prepare("SELECT DISTINCT subject FROM search_documents WHERE subject <> '' ORDER BY subject LIMIT 40").all();
  const subjects = subjectRows.results as Array<{ subject: string }>;
  if (!query) return Response.json({ results: [], related: [], subjects: subjects.map((row) => row.subject) });

  const synonymRows = await DB.prepare("SELECT canonical FROM search_synonyms WHERE lower(alias) = lower(?) LIMIT 6").bind(query).all();
  const canonicals = [...new Set([query, ...(synonymRows.results as Array<{ canonical: string }>).map((row) => row.canonical)])];
  const aliases: string[] = [];
  for (const canonical of canonicals) {
    const rows = await DB.prepare("SELECT alias FROM search_synonyms WHERE canonical = ? LIMIT 12").bind(canonical).all();
    aliases.push(...(rows.results as Array<{ alias: string }>).map((row) => row.alias));
  }
  const terms = [...new Set([query, ...aliases].map(safeMatchTerm).filter((term) => term.length >= 2))].slice(0, 16);
  const match = terms.map((term) => `"${term.replace(/"/g, "")}"`).join(" OR ");
  const clauses = ["search_documents MATCH ?"];
  const bindings: (string | number)[] = [match];
  if (subject && subject !== "전체") { clauses.push("subject = ?"); bindings.push(subject); }
  if (type === "사용자 자료") clauses.push("source_type = 'contribution'");
  if (type === "공개 참고") clauses.push("source_type = 'reference'");
  if (type === "공개 폴더") clauses.push("source_type = 'folder'");
  const searchRowResult = await DB.prepare(`SELECT source_id AS sourceId, source_type AS sourceType, subject, title, tags,
      snippet(search_documents, 5, '[[', ']]', '…', 18) AS snippet,
      bm25(search_documents, 0, 0, 5, 14, 9, 2) AS rank
    FROM search_documents WHERE ${clauses.join(" AND ")} LIMIT 60`).bind(...bindings).all();
  const searchRows = searchRowResult.results as SearchDocument[];

  const contributionIds = searchRows.filter((row) => row.sourceType === "contribution").map((row) => row.sourceId);
  const referenceIds = searchRows.filter((row) => row.sourceType === "reference").map((row) => row.sourceId);
  const folderIds = searchRows.filter((row) => row.sourceType === "folder").map((row) => row.sourceId);
  const contributionMap = new Map<string, Record<string, unknown>>();
  const referenceMap = new Map<string, Record<string, unknown>>();
  const folderMap = new Map<string, Record<string, unknown>>();
  if (contributionIds.length) {
    const placeholders = contributionIds.map(() => "?").join(",");
    const rows = await DB.prepare(`SELECT id, title, original_name AS originalName, content_type AS contentType, source_note AS sourceNote,
      owner_display_name AS ownerDisplayName, view_count AS viewCount, created_at AS createdAt, status, publish_mode AS publishMode,
      mechanical_status AS mechanicalStatus, substr(extracted_text,1,1200) AS extractedTextPreview, questions_json AS questionsJson,
      recall_json AS recallJson, text_only AS textOnly, mechanical_error AS mechanicalError, custom_materials_json AS customMaterialsJson,
      attachments_json AS attachmentsJson, subject, tags_json AS tagsJson, CASE WHEN owner_id = ? THEN 1 ELSE 0 END AS isMine,
      (SELECT f.title FROM public_folder_items fi JOIN public_folders f ON f.id = fi.folder_id WHERE fi.contribution_id = contributions.id AND f.folder_type = 'book' LIMIT 1) AS bookFolderTitle,
      (SELECT fi.page_start FROM public_folder_items fi JOIN public_folders f ON f.id = fi.folder_id WHERE fi.contribution_id = contributions.id AND f.folder_type = 'book' LIMIT 1) AS pageStart,
      (SELECT fi.page_end FROM public_folder_items fi JOIN public_folders f ON f.id = fi.folder_id WHERE fi.contribution_id = contributions.id AND f.folder_type = 'book' LIMIT 1) AS pageEnd
      FROM contributions WHERE id IN (${placeholders})`).bind(user?.userId || "", ...contributionIds).all();
    (rows.results as Array<Record<string, unknown>>).forEach((row) => contributionMap.set(String(row.id), { ...row, attachments: (() => { try { return JSON.parse(String(row.attachmentsJson || "[]")); } catch { return []; } })() }));
  }
  if (referenceIds.length) {
    const placeholders = referenceIds.map(() => "?").join(",");
    const rows = await DB.prepare(`SELECT id, title, description, topic, subject, source_name AS sourceName, source_url AS sourceUrl,
      license_note AS licenseNote, access_mode AS accessMode, tags_json AS tagsJson FROM reference_library WHERE id IN (${placeholders})`).bind(...referenceIds).all();
    (rows.results as Array<Record<string, unknown>>).forEach((row) => referenceMap.set(String(row.id), row));
  }
  if (folderIds.length) {
    const placeholders = folderIds.map(() => "?").join(",");
    const rows = await DB.prepare(`SELECT f.id, f.title, f.description, f.subject, f.tags_json AS tagsJson, f.folder_type AS folderType, f.owner_display_name AS ownerDisplayName,
      COUNT(fi.contribution_id) AS itemCount FROM public_folders f LEFT JOIN public_folder_items fi ON fi.folder_id = f.id
      WHERE f.visibility_state = 'published' AND f.id IN (${placeholders}) GROUP BY f.id`).bind(...folderIds).all();
    (rows.results as Array<Record<string, unknown>>).forEach((row) => folderMap.set(String(row.id), row));
  }
  const results = searchRows.map((row) => {
    const source = row.sourceType === "contribution" ? contributionMap.get(row.sourceId) : row.sourceType === "reference" ? referenceMap.get(row.sourceId) : folderMap.get(row.sourceId);
    if (!source) return null;
    return { ...source, sourceType: row.sourceType, searchSnippet: row.snippet || "", searchRank: Number(row.rank || 0), tags: readTags(source.tagsJson) };
  }).filter(Boolean) as Array<Record<string, unknown> & { sourceType: string; searchRank: number }>;
  results.sort((a, b) => sort === "views" ? Number(b.viewCount || 0) - Number(a.viewCount || 0) : sort === "rating" ? 0 : a.searchRank - b.searchRank || Number(b.viewCount || 0) - Number(a.viewCount || 0));
  return Response.json({
    results: results.slice(0, 30),
    related: [...new Set([...aliases, ...results.flatMap((item) => Array.isArray(item.tags) ? item.tags : [])].filter((item) => item && item !== query))].slice(0, 6),
    subjects: subjects.map((row) => row.subject),
  });
}
