import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureSchema, getRuntimeEnv } from "@/db/runtime";

export async function GET(request: Request) {
  await ensureSchema();
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "자료 ID가 필요합니다." }, { status: 400 });

  const { DB, UPLOADS } = getRuntimeEnv();
  const row = await DB.prepare(`
    SELECT object_key AS objectKey, original_name AS originalName, content_type AS contentType
    FROM contributions
    WHERE id = ? AND status IN ('published', 'published_ai')
  `).bind(id).first<{ objectKey: string; originalName: string; contentType: string }>();
  if (!row) return Response.json({ error: "자료를 찾을 수 없습니다." }, { status: 404 });

  const object = await UPLOADS.get(row.objectKey);
  if (!object) return Response.json({ error: "저장된 파일을 찾을 수 없습니다." }, { status: 404 });

  await DB.prepare("UPDATE contributions SET view_count = view_count + 1 WHERE id = ?").bind(id).run();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", row.contentType || "application/octet-stream");
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.originalName)}`);
  headers.set("Cache-Control", "private, max-age=60");
  return new Response(object.body, { headers });
}
