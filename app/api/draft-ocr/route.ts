import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureSchema, getRuntimeEnv } from "@/db/runtime";
import { StoredAttachment } from "@/lib/contribution-attachments";
import { processMechanically } from "@/lib/mechanical-tools";

function parsed<T>(value: unknown, fallback: T): T { try { return JSON.parse(String(value || "")) as T; } catch { return fallback; } }
function monthStart() { const date = new Date(); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00Z`; }
async function sha256(bytes: ArrayBuffer) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((value) => value.toString(16).padStart(2, "0")).join(""); }

export async function POST(request: Request) {
  await ensureSchema();
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json() as { draftId?: unknown; attachmentIndex?: unknown; force?: unknown };
  const id = String(body.draftId || ""); const index = Math.max(0, Number(body.attachmentIndex || 0)); const runtime = getRuntimeEnv();
  const row = await runtime.DB.prepare("SELECT attachments_json AS attachmentsJson, extracted_texts_json AS extractedTextsJson FROM contribution_drafts WHERE id=? AND owner_id=?").bind(id, user.userId).first<{ attachmentsJson: string; extractedTextsJson: string }>();
  if (!row) return Response.json({ error: "초안을 찾지 못했습니다." }, { status: 404 });
  const attachments = parsed<StoredAttachment[]>(row.attachmentsJson, []).filter((item) => item.role !== "corrected"); const texts = parsed<string[]>(row.extractedTextsJson, []); const attachment = attachments[index];
  if (!attachment) return Response.json({ error: "파일을 찾지 못했습니다." }, { status: 404 });
  if (texts[index]?.trim() && !body.force) return Response.json({ text: texts[index], cached: true, pages: 0 });
  const object = await runtime.UPLOADS.get(attachment.objectKey); if (!object) return Response.json({ error: "원본 파일을 찾지 못했습니다." }, { status: 404 }); const bytes = await new Response(object.body).arrayBuffer(); const fileHash = await sha256(bytes);
  if (!body.force) {
    const cached = await runtime.DB.prepare("SELECT extracted_text AS text, pages FROM ocr_cache WHERE file_hash = ?").bind(fileHash).first<{ text: string; pages: number }>();
    if (cached?.text) { texts[index] = cached.text; await runtime.DB.prepare("UPDATE contribution_drafts SET extracted_texts_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?").bind(JSON.stringify(texts), id, user.userId).run(); return Response.json({ text: cached.text, cached: true, pages: 0, sourcePages: cached.pages }); }
  }
  if (!runtime.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || !runtime.AZURE_DOCUMENT_INTELLIGENCE_KEY) return Response.json({ error: "Azure OCR API 연결이 필요합니다.", code: "api_not_configured" }, { status: 503 });
  const month = await runtime.DB.prepare("SELECT COALESCE(SUM(estimated_usd_micros),0) AS cost FROM api_usage_ledger WHERE created_at>=?").bind(monthStart()).first<{ cost: number }>();
  if (Number(month?.cost || 0) >= 30_000_000) return Response.json({ error: "이번 달 API 안전 예산에 도달했습니다." }, { status: 429 });
  const result = await processMechanically({ input: { ocr: true, textOnly: false, splitQuestions: false, createRecall: false }, bytes, contentType: attachment.contentType, filename: attachment.originalName, azureEndpoint: runtime.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT, azureApiKey: runtime.AZURE_DOCUMENT_INTELLIGENCE_KEY });
  if (result.status !== "completed") return Response.json({ error: result.error || "OCR에 실패했습니다." }, { status: 502 });
  texts[index] = result.text; const pages = Math.max(1, result.pages || 1); const micros = pages * 1500;
  await runtime.DB.batch([
    runtime.DB.prepare("UPDATE contribution_drafts SET extracted_texts_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?").bind(JSON.stringify(texts), id, user.userId),
    runtime.DB.prepare("INSERT INTO ocr_cache (file_hash,extracted_text,pages,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(file_hash) DO UPDATE SET extracted_text=excluded.extracted_text,pages=excluded.pages,updated_at=CURRENT_TIMESTAMP").bind(fileHash, result.text, pages),
    runtime.DB.prepare("INSERT INTO api_usage_ledger (user_id,draft_id,kind,model,pages,estimated_usd_micros) VALUES (?,?,?,?,?,?)").bind(user.userId, id, "ocr", "azure-read", pages, micros),
  ]);
  return Response.json({ text: result.text, cached: false, pages });
}
