import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureSchema, getRuntimeEnv } from "@/db/runtime";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export async function GET(request: Request) {
  await ensureSchema();
  const user = await getChatGPTUser();
  const mine = new URL(request.url).searchParams.get("mine") === "1";
  if (mine && !user) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { DB } = getRuntimeEnv();
  const mineProjection = user ? ", CASE WHEN owner_id = ? THEN 1 ELSE 0 END AS isMine" : ", 0 AS isMine";
  const select = `
    SELECT id, title, original_name AS originalName, content_type AS contentType,
           source_note AS sourceNote, status, owner_display_name AS ownerDisplayName,
           view_count AS viewCount, created_at AS createdAt${mineProjection}
    FROM contributions
    WHERE status = 'published'`;
  const result = mine
    ? await DB.prepare(`${select} AND owner_id = ? ORDER BY created_at DESC LIMIT 100`).bind(user!.userId, user!.userId).all()
    : user
      ? await DB.prepare(`${select} ORDER BY created_at DESC LIMIT 100`).bind(user.userId).all()
      : await DB.prepare(`${select} ORDER BY created_at DESC LIMIT 100`).all();

  return Response.json({ contributions: result.results });
}

export async function POST(request: Request) {
  await ensureSchema();
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "자료를 올리려면 로그인이 필요합니다." }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  const sourceNote = String(form.get("sourceNote") ?? "").trim();
  const licenseConfirmed = form.get("licenseConfirmed") === "true";

  if (!(file instanceof File) || !title) {
    return Response.json({ error: "제목과 파일이 필요합니다." }, { status: 400 });
  }
  if (!licenseConfirmed) {
    return Response.json({ error: "기여 권한과 즉시 공개에 동의해야 합니다." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "현재는 파일당 8MB까지 업로드할 수 있습니다." }, { status: 413 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return Response.json({ error: "지원하지 않는 파일 형식입니다." }, { status: 415 });
  }

  const runtime = getRuntimeEnv();
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "upload";
  const objectKey = `published/${id}/${safeName}`;
  const bytes = await file.arrayBuffer();

  await runtime.UPLOADS.put(objectKey, bytes, {
    httpMetadata: { contentType: file.type },
    customMetadata: { contributionId: id, originalName: file.name, ownerId: user.userId },
  });

  await runtime.DB.batch([
    runtime.DB.prepare(`
      INSERT INTO users (id, email, display_name, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        email = excluded.email,
        display_name = excluded.display_name,
        updated_at = CURRENT_TIMESTAMP
    `).bind(user.userId, user.email, user.displayName),
    runtime.DB.prepare(`
      INSERT INTO contributions
        (id, title, original_name, content_type, object_key, source_note, status,
         owner_id, owner_email, owner_display_name)
      VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)
    `).bind(id, title, file.name, file.type, objectKey, sourceNote, user.userId, user.email, user.displayName),
  ]);

  return Response.json(
    {
      contribution: {
        id,
        title,
        originalName: file.name,
        contentType: file.type,
        sourceNote,
        status: "published",
        ownerDisplayName: user.displayName,
        viewCount: 0,
        createdAt: new Date().toISOString(),
        isMine: 1,
      },
      message: "업로드가 완료되어 자료 검색에 즉시 공개되었습니다.",
    },
    { status: 201 },
  );
}
