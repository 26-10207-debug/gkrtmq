const DEFAULT_SUBJECT = "분류 없음";

export const suggestedSubjects = ["물리학", "영어", "수학", "철학", "기타"];

export function normalizeSubject(value: unknown) {
  const subject = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  return subject || DEFAULT_SUBJECT;
}

export function normalizeTags(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]/)
      : [];
  return [...new Set(values
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.replace(/\s+/g, " ").trim().slice(0, 40))
    .filter(Boolean))].slice(0, 12);
}

function flattenJson(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenJson);
  if (value && typeof value === "object") return Object.values(value).flatMap(flattenJson);
  return [];
}

function jsonText(raw: unknown) {
  try { return flattenJson(JSON.parse(String(raw || "{}"))).join(" "); } catch { return ""; }
}

function tagsFromJson(raw: unknown) {
  try { return normalizeTags(JSON.parse(String(raw || "[]"))); } catch { return []; }
}

type ContributionRow = {
  id: string; title: string; subject: string; tagsJson: string; sourceNote: string;
  extractedText?: string | null; learningJson?: string | null; customMaterialsJson?: string | null;
  questionsJson?: string | null; recallJson?: string | null; status: string;
};

export async function syncContributionSearchIndex(DB: D1Database, id: string) {
  const row = await DB.prepare(`SELECT id, title, subject, tags_json AS tagsJson, source_note AS sourceNote,
    extracted_text AS extractedText, learning_json AS learningJson, custom_materials_json AS customMaterialsJson,
    questions_json AS questionsJson, recall_json AS recallJson, status FROM contributions WHERE id = ?`).bind(id).first<ContributionRow>();
  await DB.prepare("DELETE FROM search_documents WHERE source_id = ? AND source_type = 'contribution'").bind(id).run();
  if (!row || !["published", "published_ai"].includes(row.status)) return;
  const tags = tagsFromJson(row.tagsJson);
  const body = [row.sourceNote, row.extractedText, jsonText(row.learningJson), jsonText(row.customMaterialsJson), jsonText(row.questionsJson), jsonText(row.recallJson)].filter(Boolean).join(" ").slice(0, 180000);
  await DB.prepare("INSERT INTO search_documents (source_id, source_type, subject, title, tags, body) VALUES (?, 'contribution', ?, ?, ?, ?)")
    .bind(row.id, normalizeSubject(row.subject), row.title, tags.join(" "), body).run();
}

export async function syncReferenceSearchIndex(DB: D1Database, id: string) {
  const row = await DB.prepare(`SELECT id, title, subject, tags_json AS tagsJson, description FROM reference_library WHERE id = ?`).bind(id).first<{ id: string; title: string; subject: string; tagsJson: string; description: string }>();
  await DB.prepare("DELETE FROM search_documents WHERE source_id = ? AND source_type = 'reference'").bind(id).run();
  if (!row) return;
  await DB.prepare("INSERT INTO search_documents (source_id, source_type, subject, title, tags, body) VALUES (?, 'reference', ?, ?, ?, ?)")
    .bind(row.id, normalizeSubject(row.subject), row.title, tagsFromJson(row.tagsJson).join(" "), row.description).run();
}

export async function syncFolderSearchIndex(DB: D1Database, id: string) {
  const row = await DB.prepare("SELECT id, title, description, subject, tags_json AS tagsJson, visibility_state AS visibilityState FROM public_folders WHERE id = ?").bind(id).first<{ id: string; title: string; description: string; subject: string; tagsJson: string; visibilityState: string }>();
  await DB.prepare("DELETE FROM search_documents WHERE source_id = ? AND source_type = 'folder'").bind(id).run();
  if (!row || row.visibilityState !== "published") return;
  const items = await DB.prepare(`SELECT c.title, c.tags_json AS tagsJson FROM public_folder_items fi JOIN contributions c ON c.id = fi.contribution_id
    WHERE fi.folder_id = ? AND c.status IN ('published', 'published_ai')`).bind(id).all();
  const itemText = (items.results as Array<{ title: string; tagsJson: string }>).flatMap((item) => [item.title, ...tagsFromJson(item.tagsJson)]).join(" ");
  await DB.prepare("INSERT INTO search_documents (source_id, source_type, subject, title, tags, body) VALUES (?, 'folder', ?, ?, ?, ?)")
    .bind(row.id, normalizeSubject(row.subject), row.title, tagsFromJson(row.tagsJson).join(" "), `${row.description} ${itemText}`.slice(0, 100000)).run();
}

export async function backfillSearchIndex(DB: D1Database) {
  const contributions = await DB.prepare("SELECT id FROM contributions WHERE status IN ('published', 'published_ai')").all();
  const references = await DB.prepare("SELECT id FROM reference_library").all();
  const folders = await DB.prepare("SELECT id FROM public_folders WHERE visibility_state = 'published'").all();
  await DB.prepare("DELETE FROM search_documents").run();
  for (const row of contributions.results as Array<{ id: string }>) await syncContributionSearchIndex(DB, row.id);
  for (const row of references.results as Array<{ id: string }>) await syncReferenceSearchIndex(DB, row.id);
  for (const row of folders.results as Array<{ id: string }>) await syncFolderSearchIndex(DB, row.id);
}
