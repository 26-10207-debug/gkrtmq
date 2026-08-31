import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureSchema, getRuntimeEnv } from "@/db/runtime";
import { normalizeSubject, normalizeTags } from "@/lib/search-index";
import { syncFolderSearchIndex } from "@/lib/search-index";
import { publicAttachments, storedAttachments } from "@/lib/contribution-attachments";

async function folderForClient(DB: D1Database, id: string, userId?: string) {
  const folder = await DB.prepare(`SELECT id, title, description, subject, tags_json AS tagsJson, folder_type AS folderType, visibility_state AS visibilityState, owner_display_name AS ownerDisplayName,
    owner_id AS ownerId, created_at AS createdAt, updated_at AS updatedAt, CASE WHEN owner_id = ? THEN 1 ELSE 0 END AS isMine
    FROM public_folders WHERE id = ?`).bind(userId || "", id).first<Record<string, unknown>>();
  if (!folder) return null;
  if (folder.visibilityState !== "published" && !folder.isMine) return null;
  const items = await DB.prepare(`SELECT c.id, c.title, c.original_name AS originalName, c.content_type AS contentType,
    c.source_note AS sourceNote, c.subject, c.tags_json AS tagsJson, c.attachments_json AS attachmentsJson,
    c.owner_display_name AS ownerDisplayName, c.created_at AS createdAt, fi.page_start AS pageStart, fi.page_end AS pageEnd
    FROM public_folder_items fi JOIN contributions c ON c.id = fi.contribution_id
    WHERE fi.folder_id = ? AND c.status IN ('published', 'published_ai') ORDER BY CASE WHEN fi.page_start IS NULL THEN 1 ELSE 0 END, fi.page_start, fi.position, fi.created_at`).bind(id).all();
  return {
    ...folder,
    tags: normalizeTags(folder.tagsJson),
    items: (items.results as Array<Record<string, unknown>>).map((item) => ({
      ...item,
      tags: normalizeTags(item.tagsJson),
      attachments: publicAttachments(storedAttachments(String(item.attachmentsJson || ""), { originalName: String(item.originalName || ""), contentType: String(item.contentType || ""), objectKey: "legacy" })).map((attachment, index) => ({ ...attachment, url: `/api/files?id=${encodeURIComponent(String(item.id))}&attachment=${index}` })),
    })),
  };
}

export async function GET(request: Request) {
  await ensureSchema(); const user = await getChatGPTUser(); const url = new URL(request.url); const id = url.searchParams.get("id"); const mine = url.searchParams.get("mine") === "1";
  if (mine && !user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { DB } = getRuntimeEnv();
  if (id) { const folder = await folderForClient(DB, id, user?.userId); return folder ? Response.json({ folder }) : Response.json({ error: "폴더를 찾지 못했습니다." }, { status: 404 }); }
  const result = mine ? await DB.prepare("SELECT id FROM public_folders WHERE owner_id = ? ORDER BY updated_at DESC").bind(user!.userId).all() : await DB.prepare("SELECT id FROM public_folders WHERE visibility_state = 'published' ORDER BY updated_at DESC LIMIT 30").all();
  const folders = await Promise.all((result.results as Array<{ id: string }>).map((row) => folderForClient(DB, row.id, user?.userId)));
  return Response.json({ folders: folders.filter(Boolean) });
}

export async function POST(request: Request) {
  await ensureSchema(); const user = await getChatGPTUser(); if (!user) return Response.json({ error: "폴더를 만들려면 로그인이 필요합니다." }, { status: 401 });
  const body = await request.json() as { title?: unknown; description?: unknown; subject?: unknown; tags?: unknown; contributionIds?: unknown; folderType?: unknown };
  const title = String(body.title || "").trim().slice(0, 120); const description = String(body.description || "").trim().slice(0, 1000);
  if (!title) return Response.json({ error: "폴더 제목을 입력해 주세요." }, { status: 400 });
  const contributionIds = Array.isArray(body.contributionIds) ? [...new Set(body.contributionIds.filter((id): id is string => typeof id === "string"))].slice(0, 50) : [];
  const { DB } = getRuntimeEnv(); const id = crypto.randomUUID();
  const folderType = body.folderType === "book" ? "book" : "regular";
  await DB.prepare("INSERT INTO public_folders (id, owner_id, owner_display_name, title, description, subject, tags_json, folder_type, visibility_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')")
    .bind(id, user.userId, user.displayName, title, description, normalizeSubject(body.subject), JSON.stringify(normalizeTags(body.tags)), folderType).run();
  if (contributionIds.length) {
    const placeholders = contributionIds.map(() => "?").join(",");
    const owned = await DB.prepare(`SELECT id FROM contributions WHERE owner_id = ? AND status IN ('published', 'published_ai') AND id IN (${placeholders})`).bind(user.userId, ...contributionIds).all();
    const inserts = (owned.results as Array<{ id: string }>).map((row, index) => DB.prepare("INSERT INTO public_folder_items (folder_id, contribution_id, position) VALUES (?, ?, ?)").bind(id, row.id, index)); if (inserts.length) await DB.batch(inserts);
  }
  await syncFolderSearchIndex(DB, id); return Response.json({ folder: await folderForClient(DB, id, user.userId) }, { status: 201 });
}

export async function PATCH(request: Request) {
  await ensureSchema(); const user = await getChatGPTUser(); if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json() as { id?: unknown; title?: unknown; description?: unknown; subject?: unknown; tags?: unknown; contributionIds?: unknown };
  const id = String(body.id || "").trim(); if (!id) return Response.json({ error: "폴더 ID가 필요합니다." }, { status: 400 }); const { DB } = getRuntimeEnv();
  const owned = await DB.prepare("SELECT id FROM public_folders WHERE id = ? AND owner_id = ?").bind(id, user.userId).first(); if (!owned) return Response.json({ error: "수정 권한이 없습니다." }, { status: 403 });
  const title = String(body.title || "").trim().slice(0, 120); if (!title) return Response.json({ error: "폴더 제목을 입력해 주세요." }, { status: 400 });
  await DB.prepare("UPDATE public_folders SET title = ?, description = ?, subject = ?, tags_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(title, String(body.description || "").trim().slice(0, 1000), normalizeSubject(body.subject), JSON.stringify(normalizeTags(body.tags)), id).run();
  if (Array.isArray(body.contributionIds)) {
    const requested = [...new Set(body.contributionIds.filter((item): item is string => typeof item === "string"))].slice(0, 50); const placeholders = requested.map(() => "?").join(",");
    const allowed = requested.length ? await DB.prepare(`SELECT id FROM contributions WHERE owner_id = ? AND status IN ('published', 'published_ai') AND id IN (${placeholders})`).bind(user.userId, ...requested).all() : { results: [] };
    await DB.prepare("DELETE FROM public_folder_items WHERE folder_id = ?").bind(id).run();
    const inserts = (allowed.results as Array<{ id: string }>).map((row, index) => DB.prepare("INSERT INTO public_folder_items (folder_id, contribution_id, position) VALUES (?, ?, ?)").bind(id, row.id, index)); if (inserts.length) await DB.batch(inserts);
  }
  await syncFolderSearchIndex(DB, id); return Response.json({ folder: await folderForClient(DB, id, user.userId) });
}

export async function DELETE(request: Request) {
  await ensureSchema(); const user = await getChatGPTUser(); if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") || ""; const { DB } = getRuntimeEnv();
  await DB.batch([DB.prepare("DELETE FROM public_folder_items WHERE folder_id IN (SELECT id FROM public_folders WHERE id = ? AND owner_id = ?)").bind(id, user.userId), DB.prepare("DELETE FROM public_folders WHERE id = ? AND owner_id = ?").bind(id, user.userId)]);
  await syncFolderSearchIndex(DB, id); return Response.json({ ok: true });
}
