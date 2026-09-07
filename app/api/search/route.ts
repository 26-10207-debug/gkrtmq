import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureSchema, getRuntimeEnv } from "@/db/runtime";
import { requestTiming } from "@/lib/request-timing";
import { contributionToolColumns } from "@/lib/contribution-summary";

type SearchDocument = { sourceId: string; sourceType: "contribution" | "reference" | "folder"; subject: string; title: string; tags: string; body?: string; snippet: string; rank: number; exactScore?: number };

function safeMatchTerm(value: string) {
  return value.replace(/["'():*^~{}\[\]\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function readTags(value: unknown) {
  try { const parsed = JSON.parse(String(value || "[]")); return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : []; } catch { return []; }
}

function normalized(value: unknown) { return String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim(); }

function exactnessScore(row: SearchDocument, query: string) {
  const needle = normalized(query); const title = normalized(row.title); const subject = normalized(row.subject); const tags = normalized(row.tags); const body = normalized(row.body);
  if (title === needle) return 0;
  if (title.startsWith(needle)) return 1;
  if (tags.split(/\s+/).includes(needle)) return 2;
  if (title.includes(needle)) return 3;
  if (subject === needle || tags.includes(needle)) return 4;
  if (body.includes(needle)) return 5;
  return 6;
}

function substringSnippet(body: string | undefined, query: string) {
  const source = String(body || "").replace(/\s+/g, " ").trim(); if (!source) return "";
  const index = normalized(source).indexOf(normalized(query)); if (index < 0) return source.slice(0, 150);
  const start = Math.max(0, index - 58); const end = Math.min(source.length, index + query.length + 88);
  return `${start ? "…" : ""}${source.slice(start, index)}[[${source.slice(index, index + query.length)}]]${source.slice(index + query.length, end)}${end < source.length ? "…" : ""}`;
}

export async function GET(request: Request) {
  const timing = requestTiming();
  await ensureSchema();
  timing.mark("schema");
  const url = new URL(request.url);
  const query = safeMatchTerm(url.searchParams.get("q") || "");
  const subject = (url.searchParams.get("subject") || "전체").trim();
  const type = (url.searchParams.get("type") || "전체").trim();
  const sort = (url.searchParams.get("sort") || "relevance").trim();
  const summary = url.searchParams.get("summary") === "1";
  const { DB } = getRuntimeEnv();
  const [user, subjectRows, synonymRows] = await Promise.all([
    getChatGPTUser(),
    DB.prepare("SELECT DISTINCT subject FROM search_documents WHERE subject <> '' ORDER BY subject LIMIT 40").all(),
    DB.prepare("SELECT canonical FROM search_synonyms WHERE lower(alias) = lower(?) LIMIT 6").bind(query).all(),
  ]);
  timing.mark("metadata");
  const subjects = subjectRows.results as Array<{ subject: string }>;
  if (!query) return Response.json({ results: [], related: [], subjects: subjects.map((row) => row.subject) }, { headers: timing.headers() });

  const canonicals = [...new Set([query, ...(synonymRows.results as Array<{ canonical: string }>).map((row) => row.canonical)])];
  const aliases: string[] = [];
  const aliasResults = await DB.batch(canonicals.map(canonical => DB.prepare("SELECT alias FROM search_synonyms WHERE canonical = ? LIMIT 12").bind(canonical))) as Array<{ results: Array<{ alias: string }> }>;
  for (const rows of aliasResults) {
    aliases.push(...(rows.results as Array<{ alias: string }>).map((row) => row.alias));
  }
  timing.mark("synonyms");
  const terms = [...new Set([query, ...aliases].map(safeMatchTerm).filter((term) => term.length >= 2))].slice(0, 16);
  const match = terms.map((term) => `"${term.replace(/"/g, "")}"`).join(" OR ");
  const addFilters = (clauses: string[], bindings: (string | number)[]) => {
    if (subject && subject !== "전체") { clauses.push("subject = ?"); bindings.push(subject); }
    if (type === "사용자 자료") clauses.push("source_type = 'contribution'");
    if (type === "공개 참고") clauses.push("source_type = 'reference'");
    if (type === "공개 폴더") clauses.push("source_type = 'folder'");
  };
  const combinedRows = new Map<string, SearchDocument>();
  // Keep the original matching predicates. Return a window around a literal
  // match rather than transferring up to 180KB for every candidate. If the
  // literal differs (e.g. whitespace/Unicode normalization), retain the whole
  // body so existing normalized ranking and phrase matching stay intact.
  const bodyProjection = `CASE WHEN instr(lower(body), lower(?)) > 0
    THEN substr(body, max(1, instr(lower(body), lower(?)) - 80), 400) ELSE body END AS body`;
  let fulltextStatement: ReturnType<typeof DB.prepare> | undefined;
  if (match) {
    const clauses = ["search_documents MATCH ?"]; const bindings: (string | number)[] = [match]; addFilters(clauses, bindings);
    fulltextStatement = DB.prepare(`SELECT source_id AS sourceId, source_type AS sourceType, subject, title, tags, ${bodyProjection},
        snippet(search_documents, 5, '[[', ']]', '…', 18) AS snippet,
        bm25(search_documents, 0, 0, 5, 14, 9, 2) AS rank
      FROM search_documents WHERE ${clauses.join(" AND ")} LIMIT 60`).bind(query, query, ...bindings);
  }
  const partialClauses = ["(instr(lower(title), lower(?)) > 0 OR instr(lower(tags), lower(?)) > 0 OR instr(lower(body), lower(?)) > 0)"];
  const partialBindings: (string | number)[] = [query, query, query]; addFilters(partialClauses, partialBindings);
  const partialStatement = DB.prepare(`SELECT source_id AS sourceId, source_type AS sourceType, subject, title, tags, ${bodyProjection}, 999999 AS rank
    FROM search_documents WHERE ${partialClauses.join(" AND ")} LIMIT 60`).bind(query, query, ...partialBindings);
  // One database round trip; merge full-text candidates first to preserve ties.
  const candidateResults = await DB.batch(fulltextStatement ? [fulltextStatement, partialStatement] : [partialStatement]) as Array<{ results: SearchDocument[] }>;
  if (fulltextStatement) {
    for (const row of candidateResults[0].results) combinedRows.set(`${row.sourceType}:${row.sourceId}`, { ...row, exactScore: exactnessScore(row, query) });
  }
  const partialResult = candidateResults[candidateResults.length - 1];
  for (const row of partialResult.results as SearchDocument[]) {
    const key = `${row.sourceType}:${row.sourceId}`; const existing = combinedRows.get(key); const snippet = substringSnippet(row.body, query); const exactScore = exactnessScore(row, query);
    combinedRows.set(key, existing ? { ...existing, body: row.body, snippet: snippet || existing.snippet, exactScore: Math.min(existing.exactScore ?? 6, exactScore) } : { ...row, snippet, exactScore });
  }
  timing.mark("search");
  const searchRows = [...combinedRows.values()];

  const contributionIds = searchRows.filter((row) => row.sourceType === "contribution").map((row) => row.sourceId);
  const referenceIds = searchRows.filter((row) => row.sourceType === "reference").map((row) => row.sourceId);
  const folderIds = searchRows.filter((row) => row.sourceType === "folder").map((row) => row.sourceId);
  const contributionMap = new Map<string, Record<string, unknown>>();
  const referenceMap = new Map<string, Record<string, unknown>>();
  const folderMap = new Map<string, Record<string, unknown>>();
  const detailQueries: Array<{ statement: ReturnType<typeof DB.prepare>; target: Map<string, Record<string, unknown>>; attachments?: boolean }> = [];
  if (contributionIds.length) {
    const placeholders = contributionIds.map(() => "?").join(",");
    const statement = DB.prepare(`SELECT id, title, original_name AS originalName, content_type AS contentType, source_note AS sourceNote,
      owner_display_name AS ownerDisplayName, view_count AS viewCount, created_at AS createdAt, status, publish_mode AS publishMode,
      mechanical_status AS mechanicalStatus, substr(extracted_text,1,${summary ? 160 : 1200}) AS extractedTextPreview,
      ${contributionToolColumns(summary)}, text_only AS textOnly, mechanical_error AS mechanicalError,
      attachments_json AS attachmentsJson, subject, tags_json AS tagsJson, CASE WHEN owner_id = ? THEN 1 ELSE 0 END AS isMine,
      (SELECT f.title FROM public_folder_items fi JOIN public_folders f ON f.id = fi.folder_id WHERE fi.contribution_id = contributions.id AND f.folder_type = 'book' LIMIT 1) AS bookFolderTitle,
      (SELECT fi.page_start FROM public_folder_items fi JOIN public_folders f ON f.id = fi.folder_id WHERE fi.contribution_id = contributions.id AND f.folder_type = 'book' LIMIT 1) AS pageStart,
      (SELECT fi.page_end FROM public_folder_items fi JOIN public_folders f ON f.id = fi.folder_id WHERE fi.contribution_id = contributions.id AND f.folder_type = 'book' LIMIT 1) AS pageEnd
      FROM contributions WHERE status IN ('published', 'published_ai') AND id IN (${placeholders})`).bind(user?.userId || "", ...contributionIds);
    detailQueries.push({ statement, target: contributionMap, attachments: true });
  }
  if (referenceIds.length) {
    const placeholders = referenceIds.map(() => "?").join(",");
    const statement = DB.prepare(`SELECT id, title, description, topic, subject, source_name AS sourceName, source_url AS sourceUrl,
      license_note AS licenseNote, access_mode AS accessMode, tags_json AS tagsJson FROM reference_library WHERE id IN (${placeholders})`).bind(...referenceIds);
    detailQueries.push({ statement, target: referenceMap });
  }
  if (folderIds.length) {
    const placeholders = folderIds.map(() => "?").join(",");
    const statement = DB.prepare(`SELECT f.id, f.title, f.description, f.subject, f.tags_json AS tagsJson, f.folder_type AS folderType, f.owner_display_name AS ownerDisplayName,
      COUNT(fi.contribution_id) AS itemCount FROM public_folders f LEFT JOIN public_folder_items fi ON fi.folder_id = f.id
      WHERE f.visibility_state = 'published' AND f.id IN (${placeholders}) GROUP BY f.id`).bind(...folderIds);
    detailQueries.push({ statement, target: folderMap });
  }
  if (detailQueries.length) {
    const detailResults = await DB.batch(detailQueries.map(({ statement }) => statement)) as Array<{ results: Array<Record<string, unknown>> }>;
    detailQueries.forEach(({ target, attachments }, index) => {
      for (const row of detailResults[index].results) {
        target.set(String(row.id), attachments ? { ...row, attachments: (() => { try { return JSON.parse(String(row.attachmentsJson || "[]")); } catch { return []; } })() } : row);
      }
    });
  }
  const results = searchRows.map((row) => {
    const source = row.sourceType === "contribution" ? contributionMap.get(row.sourceId) : row.sourceType === "reference" ? referenceMap.get(row.sourceId) : folderMap.get(row.sourceId);
    if (!source) return null;
    return { ...source, sourceType: row.sourceType, searchSnippet: row.snippet || "", searchRank: Number(row.rank || 0), searchExactScore: row.exactScore ?? 6, tags: readTags(source.tagsJson) };
  }).filter(Boolean) as Array<Record<string, unknown> & { sourceType: string; searchRank: number; searchExactScore: number }>;
  results.sort((a, b) => sort === "views" ? Number(b.viewCount || 0) - Number(a.viewCount || 0) : sort === "rating" ? 0 : a.searchExactScore - b.searchExactScore || a.searchRank - b.searchRank || Number(b.viewCount || 0) - Number(a.viewCount || 0));
  timing.mark("results");
  return Response.json({
    results: results.slice(0, 30),
    related: [...new Set([...aliases, ...results.flatMap((item) => Array.isArray(item.tags) ? item.tags : [])].filter((item) => item && item !== query))].slice(0, 6),
    subjects: subjects.map((row) => row.subject),
  }, { headers: timing.headers() });
}
