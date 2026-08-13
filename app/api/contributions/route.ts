import { ensureSchema, getRuntimeEnv } from "@/db/runtime";
import { structureContribution } from "@/lib/learning-ai";

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

export async function GET() {
  await ensureSchema();
  const { DB } = getRuntimeEnv();
  const result = await DB.prepare(`
    SELECT id, title, original_name AS originalName, content_type AS contentType,
           status, ai_model AS aiModel, error_message AS errorMessage, created_at AS createdAt
    FROM contributions
    ORDER BY created_at DESC
    LIMIT 20
  `).all();

  return Response.json({ contributions: result.results });
}

export async function POST(request: Request) {
  await ensureSchema();
  const form = await request.formData();
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  const sourceNote = String(form.get("sourceNote") ?? "").trim();
  const licenseConfirmed = form.get("licenseConfirmed") === "true";

  if (!(file instanceof File) || !title) {
    return Response.json({ error: "제목과 파일이 필요합니다." }, { status: 400 });
  }
  if (!licenseConfirmed) {
    return Response.json({ error: "기여 권한과 출처 확인에 동의해야 합니다." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "현재 MVP에서는 파일당 8MB까지 업로드할 수 있습니다." }, { status: 413 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return Response.json({ error: "지원하지 않는 파일 형식입니다." }, { status: 415 });
  }

  const runtime = getRuntimeEnv();
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "upload";
  const objectKey = `raw/${id}/${safeName}`;
  const bytes = await file.arrayBuffer();

  await runtime.UPLOADS.put(objectKey, bytes, {
    httpMetadata: { contentType: file.type },
    customMetadata: { contributionId: id, originalName: file.name },
  });

  await runtime.DB.prepare(`
    INSERT INTO contributions
      (id, title, original_name, content_type, object_key, source_note, status)
    VALUES (?, ?, ?, ?, ?, ?, 'uploaded')
  `).bind(id, title, file.name, file.type, objectKey, sourceNote).run();

  if (!runtime.OPENAI_API_KEY) {
    await runtime.DB.prepare(
      "UPDATE contributions SET status = 'awaiting_ai' WHERE id = ?",
    ).bind(id).run();
    return Response.json(
      {
        contribution: { id, title, status: "awaiting_ai" },
        message: "원본은 안전하게 보관됐으며 AI 연결 후 구조화됩니다. 구조화 전에는 공개되지 않습니다.",
      },
      { status: 202 },
    );
  }

  await runtime.DB.prepare(
    "UPDATE contributions SET status = 'analyzing', ai_model = 'gpt-5.6-terra' WHERE id = ?",
  ).bind(id).run();

  try {
    const learningAsset = await structureContribution({
      apiKey: runtime.OPENAI_API_KEY,
      bytes,
      contentType: file.type,
      filename: file.name,
      title,
      sourceNote,
    });
    await runtime.DB.prepare(`
      UPDATE contributions
      SET status = 'structured', learning_json = ?, error_message = NULL
      WHERE id = ?
    `).bind(JSON.stringify(learningAsset), id).run();

    return Response.json(
      {
        contribution: { id, title, status: "structured" },
        message: "AI가 자료를 표준 학습 객체로 구조화했습니다. 검수 후 공개됩니다.",
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 분석 오류";
    await runtime.DB.prepare(`
      UPDATE contributions SET status = 'analysis_failed', error_message = ? WHERE id = ?
    `).bind(message.slice(0, 500), id).run();
    return Response.json(
      {
        contribution: { id, title, status: "analysis_failed" },
        message: "원본은 보관됐지만 AI 분석에 실패했습니다. 공개되지 않으며 재처리가 필요합니다.",
      },
      { status: 202 },
    );
  }
}
