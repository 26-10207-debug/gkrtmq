import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureSchema, getRuntimeEnv } from "@/db/runtime";
import { storedAttachments } from "@/lib/contribution-attachments";

export async function GET(request: Request) {
  await ensureSchema();
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "자료 ID가 필요합니다." }, { status: 400 });
  const attachmentIndex = Number(new URL(request.url).searchParams.get("attachment") ?? "0");
  if (!Number.isInteger(attachmentIndex) || attachmentIndex < 0) return Response.json({ error: "파일 번호가 올바르지 않습니다." }, { status: 400 });

  const { DB, UPLOADS } = getRuntimeEnv();
  const row = await DB.prepare(`
    SELECT object_key AS objectKey, original_name AS originalName, content_type AS contentType, attachments_json AS attachmentsJson,
           text_only AS textOnly
    FROM contributions
    WHERE id = ? AND status IN ('published', 'published_ai')
  `).bind(id).first<{ objectKey: string; originalName: string; contentType: string; attachmentsJson: string | null; textOnly: number }>();
  if (!row) return Response.json({ error: "자료를 찾을 수 없습니다." }, { status: 404 });
  if (row.textOnly) return Response.json({ error: "이 자료는 텍스트 전용으로 보관됩니다." }, { status: 404 });

  const attachment = storedAttachments(row.attachmentsJson, row)[attachmentIndex];
  if (!attachment) return Response.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  const object = await UPLOADS.get(attachment.objectKey);
  if (!object) return Response.json({ error: "저장된 파일을 찾을 수 없습니다." }, { status: 404 });

  await DB.prepare("UPDATE contributions SET view_count = view_count + 1 WHERE id = ?").bind(id).run();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", attachment.contentType || "application/octet-stream");
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`);
  headers.set("Cache-Control", "private, max-age=60");
  return new Response(object.body, { headers });
}
