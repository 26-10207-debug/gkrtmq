import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureSchema, getRuntimeEnv } from "@/db/runtime";
import { StoredAttachment } from "@/lib/contribution-attachments";

function parsed(value: unknown) { try { return JSON.parse(String(value || "[]")) as StoredAttachment[]; } catch { return []; } }

export async function POST(request: Request) {
  await ensureSchema();
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const form = await request.formData();
  const draftId = String(form.get("draftId") || "");
  const sourceAttachmentIndex = Math.max(0, Number(form.get("sourceAttachmentIndex") || 0));
  const file = form.get("file");
  if (!(file instanceof File) || file.type !== "image/webp" || file.size > 8 * 1024 * 1024) return Response.json({ error: "8MB 이하 WebP 결과가 필요합니다." }, { status: 400 });
  const runtime = getRuntimeEnv();
  const row = await runtime.DB.prepare("SELECT attachments_json AS attachmentsJson FROM contribution_drafts WHERE id = ? AND owner_id = ?").bind(draftId, user.userId).first<{ attachmentsJson: string }>();
  if (!row) return Response.json({ error: "초안을 찾지 못했습니다." }, { status: 404 });
  const attachments = parsed(row.attachmentsJson);
  const sources = attachments.filter((item) => item.role !== "corrected");
  if (!sources[sourceAttachmentIndex]) return Response.json({ error: "보정할 원본을 찾지 못했습니다." }, { status: 404 });
  const previous = attachments.find((item) => item.role === "corrected" && item.sourceAttachmentIndex === sourceAttachmentIndex);
  const objectKey = `drafts/${draftId}/corrected-${sourceAttachmentIndex}-${crypto.randomUUID()}.webp`;
  await runtime.UPLOADS.put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: "image/webp" }, customMetadata: { ownerId: user.userId, draftId, role: "corrected", sourceAttachmentIndex: String(sourceAttachmentIndex) } });
  const corrected: StoredAttachment = { originalName: `${sources[sourceAttachmentIndex].originalName.replace(/\.[^.]+$/, "")}-corrected.webp`, contentType: "image/webp", objectKey, size: file.size, role: "corrected", sourceAttachmentIndex };
  const next = [...attachments.filter((item) => !(item.role === "corrected" && item.sourceAttachmentIndex === sourceAttachmentIndex)), corrected];
  await runtime.DB.prepare("UPDATE contribution_drafts SET attachments_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?").bind(JSON.stringify(next), draftId, user.userId).run();
  if (previous?.objectKey?.startsWith(`drafts/${draftId}/`)) await runtime.UPLOADS.delete(previous.objectKey);
  return Response.json({ correctedAttachmentIndex: next.length - 1, name: corrected.originalName, size: corrected.size });
}
