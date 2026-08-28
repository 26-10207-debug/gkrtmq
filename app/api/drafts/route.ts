import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureSchema, getRuntimeEnv } from "@/db/runtime";
import { publicAttachments, StoredAttachment, storedAttachments } from "@/lib/contribution-attachments";
import { normalizeSubject, normalizeTags } from "@/lib/search-index";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 5;
const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain", "text/markdown", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation"]);

function parsed<T>(value: unknown, fallback: T): T { try { return JSON.parse(String(value || "")) as T; } catch { return fallback; } }
function draftForClient(row: Record<string, unknown>) {
  const attachments = parsed<StoredAttachment[]>(row.attachmentsJson, []);
  return { ...row, tags: parsed<string[]>(row.tagsJson, []), regularFolderIds: parsed<string[]>(row.regularFolderIdsJson, []), customMaterials: parsed(row.customMaterialsJson, {}), mechanicalOptions: parsed(row.mechanicalOptions, {}), extractedTexts: parsed<string[]>(row.extractedTextsJson, []), attachments: publicAttachments(attachments).map((item, index) => ({ ...item, url: `/api/draft-files?id=${encodeURIComponent(String(row.id))}&attachment=${index}` })) };
}

const projection = `SELECT id, source_contribution_id AS sourceContributionId, title, source_note AS sourceNote, subject,
  tags_json AS tagsJson, custom_materials_json AS customMaterialsJson, mechanical_options AS mechanicalOptions,
  attachments_json AS attachmentsJson, extracted_texts_json AS extractedTextsJson, folder_id AS folderId, regular_folder_ids_json AS regularFolderIdsJson,
  page_start AS pageStart, page_end AS pageEnd, publish_mode AS publishMode, created_at AS createdAt, updated_at AS updatedAt`;

export async function GET(request: Request) {
  await ensureSchema(); const user = await getChatGPTUser(); if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { DB } = getRuntimeEnv(); const id = new URL(request.url).searchParams.get("id");
  if (id) { const row = await DB.prepare(`${projection} FROM contribution_drafts WHERE id = ? AND owner_id = ?`).bind(id, user.userId).first<Record<string, unknown>>(); return row ? Response.json({ draft: draftForClient(row) }) : Response.json({ error: "초안을 찾지 못했습니다." }, { status: 404 }); }
  const rows = await DB.prepare(`${projection} FROM contribution_drafts WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 50`).bind(user.userId).all();
  return Response.json({ drafts: (rows.results as Array<Record<string, unknown>>).map(draftForClient) });
}

export async function POST(request: Request) {
  await ensureSchema(); const user = await getChatGPTUser(); if (!user) return Response.json({ error: "초안을 저장하려면 로그인이 필요합니다." }, { status: 401 });
  const runtime = getRuntimeEnv();
  if ((request.headers.get("content-type") || "").includes("application/json")) {
    const body = await request.json() as { sourceContributionId?: unknown };
    const sourceId = String(body.sourceContributionId || "").trim(); if (!sourceId) return Response.json({ error: "원본 자료가 필요합니다." }, { status: 400 });
    const existing = await runtime.DB.prepare(`${projection} FROM contribution_drafts WHERE source_contribution_id = ? AND owner_id = ?`).bind(sourceId, user.userId).first<Record<string, unknown>>(); if (existing) return Response.json({ draft: draftForClient(existing) });
    const source = await runtime.DB.prepare(`SELECT id, title, source_note AS sourceNote, subject, tags_json AS tagsJson, custom_materials_json AS customMaterialsJson,
      mechanical_options AS mechanicalOptions, attachments_json AS attachmentsJson, extracted_text AS extractedText, publish_mode AS publishMode
      FROM contributions WHERE id = ? AND owner_id = ? AND status IN ('published','published_ai')`).bind(sourceId, user.userId).first<Record<string, unknown>>();
    if (!source) return Response.json({ error: "편집할 공개 자료를 찾지 못했습니다." }, { status: 404 });
    const memberships = await runtime.DB.prepare(`SELECT fi.folder_id AS folderId, fi.page_start AS pageStart, fi.page_end AS pageEnd, f.folder_type AS folderType FROM public_folder_items fi JOIN public_folders f ON f.id = fi.folder_id WHERE fi.contribution_id = ? AND f.owner_id = ?`).bind(sourceId, user.userId).all();
    const book = (memberships.results as Array<{ folderId: string; folderType: string; pageStart?: number | null; pageEnd?: number | null }>).find((item) => item.folderType === "book");
    const regularFolderIds = (memberships.results as Array<{ folderId: string; folderType: string }>).filter((item) => item.folderType === "regular").map((item) => item.folderId);
    const id = crypto.randomUUID(); await runtime.DB.prepare(`INSERT INTO contribution_drafts
      (id, owner_id, source_contribution_id, title, source_note, subject, tags_json, custom_materials_json, mechanical_options, attachments_json, extracted_texts_json, folder_id, regular_folder_ids_json, page_start, page_end, publish_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, user.userId, sourceId, source.title, source.sourceNote, source.subject, source.tagsJson, source.customMaterialsJson, source.mechanicalOptions, source.attachmentsJson, JSON.stringify([String(source.extractedText || "")]), book?.folderId || null, JSON.stringify(regularFolderIds), book?.pageStart || null, book?.pageEnd || null, source.publishMode).run();
    const row = await runtime.DB.prepare(`${projection} FROM contribution_drafts WHERE id = ?`).bind(id).first<Record<string, unknown>>(); return Response.json({ draft: draftForClient(row!) }, { status: 201 });
  }
  const form = await request.formData(); const existingId = String(form.get("id") || "").trim(); const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (!files.length) return Response.json({ error: "한 개 이상의 파일이 필요합니다." }, { status: 400 });
  const id = existingId || crypto.randomUUID(); const owned = existingId ? await runtime.DB.prepare("SELECT attachments_json AS attachmentsJson FROM contribution_drafts WHERE id = ? AND owner_id = ?").bind(id, user.userId).first<{ attachmentsJson: string }>() : null;
  if (existingId && !owned) return Response.json({ error: "수정할 초안을 찾지 못했습니다." }, { status: 404 });
  const current = parsed<StoredAttachment[]>(owned?.attachmentsJson, []); if (current.length + files.length > MAX_FILES) return Response.json({ error: `파일은 최대 ${MAX_FILES}개까지 저장할 수 있습니다.` }, { status: 413 });
  if (files.some((file) => file.size > MAX_FILE_BYTES || !ALLOWED.has(file.type))) return Response.json({ error: "지원하지 않는 파일이 있거나 파일당 8MB를 넘었습니다." }, { status: 415 });
  const added = await Promise.all(files.map(async (file, index) => { const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "upload"; const objectKey = `drafts/${id}/${current.length + index}-${safe}`; await runtime.UPLOADS.put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type }, customMetadata: { ownerId: user.userId, draftId: id } }); return { originalName: file.name, contentType: file.type, objectKey, size: file.size }; }));
  const attachments = [...current, ...added]; const title = String(form.get("title") || files[0].name.replace(/\.[^.]+$/, "")).trim().slice(0, 160); const subject = normalizeSubject(form.get("subject"));
  if (!existingId) await runtime.DB.prepare(`INSERT INTO contribution_drafts (id, owner_id, title, subject, attachments_json) VALUES (?, ?, ?, ?, ?)`).bind(id, user.userId, title, subject, JSON.stringify(attachments)).run(); else await runtime.DB.prepare("UPDATE contribution_drafts SET attachments_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(JSON.stringify(attachments), id).run();
  const row = await runtime.DB.prepare(`${projection} FROM contribution_drafts WHERE id = ?`).bind(id).first<Record<string, unknown>>(); return Response.json({ draft: draftForClient(row!) }, { status: 201 });
}

export async function PATCH(request: Request) {
  await ensureSchema(); const user = await getChatGPTUser(); if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>; const id = String(body.id || "").trim(); if (!id) return Response.json({ error: "초안 ID가 필요합니다." }, { status: 400 });
  const pageStart = body.pageStart === null || body.pageStart === "" ? null : Math.max(1, Number(body.pageStart)); const pageEnd = body.pageEnd === null || body.pageEnd === "" ? null : Math.max(pageStart || 1, Number(body.pageEnd));
  const customMaterials = JSON.stringify(body.customMaterials || {}); if (customMaterials.length > 100_000) return Response.json({ error: "학습 도구 내용이 너무 큽니다." }, { status: 413 });
  const regularFolderIds = Array.isArray(body.regularFolderIds) ? [...new Set(body.regularFolderIds.filter((value): value is string => typeof value === "string"))].slice(0, 20) : [];
  const { DB } = getRuntimeEnv(); const result = await DB.prepare(`UPDATE contribution_drafts SET title = ?, source_note = ?, subject = ?, tags_json = ?, custom_materials_json = ?, mechanical_options = ?, extracted_texts_json = ?, folder_id = ?, regular_folder_ids_json = ?, page_start = ?, page_end = ?, publish_mode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?`).bind(String(body.title || "").trim().slice(0,160), String(body.sourceNote || "").slice(0,3000), normalizeSubject(body.subject), JSON.stringify(normalizeTags(body.tags)), customMaterials, JSON.stringify(body.mechanicalOptions || {}), JSON.stringify(Array.isArray(body.extractedTexts) ? body.extractedTexts : []), String(body.folderId || "") || null, JSON.stringify(regularFolderIds), pageStart, pageEnd, body.publishMode === "ai_review" ? "ai_review" : "instant", id, user.userId).run();
  if (!result.meta.changes) return Response.json({ error: "저장할 초안을 찾지 못했습니다." }, { status: 404 }); const row = await DB.prepare(`${projection} FROM contribution_drafts WHERE id = ?`).bind(id).first<Record<string, unknown>>(); return Response.json({ draft: draftForClient(row!) });
}

export async function DELETE(request: Request) {
  await ensureSchema(); const user = await getChatGPTUser(); if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 }); const id = new URL(request.url).searchParams.get("id") || ""; const { DB, UPLOADS } = getRuntimeEnv(); const row = await DB.prepare("SELECT attachments_json AS attachmentsJson FROM contribution_drafts WHERE id = ? AND owner_id = ?").bind(id, user.userId).first<{ attachmentsJson: string }>(); if (!row) return Response.json({ error: "초안을 찾지 못했습니다." }, { status: 404 }); const attachments = parsed<StoredAttachment[]>(row.attachmentsJson, []); await Promise.all(attachments.filter((item) => item.objectKey.startsWith(`drafts/${id}/`)).map((item) => UPLOADS.delete(item.objectKey))); await DB.prepare("DELETE FROM contribution_drafts WHERE id = ? AND owner_id = ?").bind(id, user.userId).run(); return Response.json({ ok: true });
}
