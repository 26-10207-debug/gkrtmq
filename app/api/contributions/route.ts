import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureSchema, getRuntimeEnv } from "@/db/runtime";
import { structureContribution } from "@/lib/learning-ai";
import { MechanicalOptions, processMechanically } from "@/lib/mechanical-tools";
import { customMaterialsForReview, normalizeCustomMaterials } from "@/lib/custom-materials";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const REVIEW_REWARD = 20;
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

const contributionSelect = `
  SELECT id, title, original_name AS originalName, content_type AS contentType,
         source_note AS sourceNote, status, owner_display_name AS ownerDisplayName,
         view_count AS viewCount, publish_mode AS publishMode,
         credits_awarded AS creditsAwarded, error_message AS errorMessage,
         mechanical_options AS mechanicalOptions, mechanical_status AS mechanicalStatus,
         substr(extracted_text, 1, 1200) AS extractedTextPreview,
         questions_json AS questionsJson, recall_json AS recallJson,
         text_only AS textOnly, mechanical_error AS mechanicalError,
         custom_materials_json AS customMaterialsJson,
         created_at AS createdAt`;

export async function GET(request: Request) {
  await ensureSchema();
  const user = await getChatGPTUser();
  const mine = new URL(request.url).searchParams.get("mine") === "1";
  if (mine && !user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { DB } = getRuntimeEnv();
  const mineProjection = user ? ", CASE WHEN owner_id = ? THEN 1 ELSE 0 END AS isMine" : ", 0 AS isMine";
  const result = mine
    ? await DB.prepare(`${contributionSelect}${mineProjection} FROM contributions WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100`).bind(user!.userId, user!.userId).all()
    : user
      ? await DB.prepare(`${contributionSelect}${mineProjection} FROM contributions WHERE status IN ('published', 'published_ai') ORDER BY created_at DESC LIMIT 100`).bind(user.userId).all()
      : await DB.prepare(`${contributionSelect}${mineProjection} FROM contributions WHERE status IN ('published', 'published_ai') ORDER BY created_at DESC LIMIT 100`).all();

  return Response.json({ contributions: result.results });
}

export async function POST(request: Request) {
  await ensureSchema();
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "자료를 올리려면 로그인이 필요합니다." }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  const sourceNote = String(form.get("sourceNote") ?? "").trim();
  let customMaterials;
  try {
    customMaterials = normalizeCustomMaterials(String(form.get("customMaterials") ?? "{}"));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "자료 구체화 내용을 확인해 주세요." }, { status: 400 });
  }
  const licenseConfirmed = form.get("licenseConfirmed") === "true";
  const publishMode = form.get("publishMode") === "ai_review" ? "ai_review" : "instant";
  const mechanicalOptions: MechanicalOptions = {
    ocr: form.get("ocr") === "true",
    textOnly: form.get("textOnly") === "true",
    splitQuestions: form.get("splitQuestions") === "true",
    createRecall: form.get("createRecall") === "true",
  };

  if (!(file instanceof File) || !title) return Response.json({ error: "제목과 파일이 필요합니다." }, { status: 400 });
  if (!licenseConfirmed) return Response.json({ error: "기여 권한과 선택한 공개 방식에 동의해야 합니다." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "현재는 파일당 8MB까지 업로드할 수 있습니다." }, { status: 413 });
  if (!ALLOWED_TYPES.has(file.type)) return Response.json({ error: "지원하지 않는 파일 형식입니다." }, { status: 415 });

  const runtime = getRuntimeEnv();
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "upload";
  const objectKey = `${publishMode === "instant" ? "published" : "review-queue"}/${id}/${safeName}`;
  const bytes = await file.arrayBuffer();
  const effectiveMechanicalOptions: MechanicalOptions = {
    ...mechanicalOptions,
    // AI 검수에는 원본 이미지·파일을 전달하지 않고, 항상 추출 텍스트만 전달한다.
    ocr: mechanicalOptions.ocr || publishMode === "ai_review",
  };
  const hasMechanicalTools = Object.values(effectiveMechanicalOptions).some(Boolean);
  const initialStatus = publishMode === "ai_review"
    ? "ocr_processing"
    : mechanicalOptions.textOnly ? "mechanical_processing" : "published";

  await runtime.UPLOADS.put(objectKey, bytes, {
    httpMetadata: { contentType: file.type },
    customMetadata: { contributionId: id, originalName: file.name, ownerId: user.userId, publishMode },
  });

  await runtime.DB.batch([
    runtime.DB.prepare(`
      INSERT INTO users (id, email, display_name, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP
    `).bind(user.userId, user.email, user.displayName),
    runtime.DB.prepare(`
      INSERT INTO contributions
        (id, title, original_name, content_type, object_key, source_note, status,
         owner_id, owner_email, owner_display_name, publish_mode, mechanical_options, mechanical_status, custom_materials_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, title, file.name, file.type, objectKey, sourceNote, initialStatus, user.userId, user.email, user.displayName, publishMode, JSON.stringify(effectiveMechanicalOptions), hasMechanicalTools ? "processing" : "none", JSON.stringify(customMaterials)),
  ]);

  const mechanical = await processMechanically({
    input: effectiveMechanicalOptions,
    bytes,
    contentType: file.type,
    filename: file.name,
    azureEndpoint: runtime.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT,
    azureApiKey: runtime.AZURE_DOCUMENT_INTELLIGENCE_KEY,
  });
  const mechanicalStatus = hasMechanicalTools ? mechanical.status : "none";
  const textOnly = mechanicalOptions.textOnly && mechanical.status === "completed";
  const instantStatus = publishMode === "instant"
    ? mechanicalOptions.textOnly
      ? mechanical.status === "completed" ? "published" : mechanical.status === "awaiting_ocr" ? "awaiting_ocr" : "mechanical_failed"
      : "published"
    : initialStatus;

  await runtime.DB.prepare(`
    UPDATE contributions
    SET status = ?, mechanical_status = ?, extracted_text = ?, questions_json = ?, recall_json = ?,
        text_only = ?, mechanical_error = ?
    WHERE id = ?
  `).bind(
    instantStatus,
    mechanicalStatus,
    mechanical.text || null,
    mechanical.questions.length ? JSON.stringify(mechanical.questions) : null,
    mechanical.recallCards.length ? JSON.stringify(mechanical.recallCards) : null,
    textOnly ? 1 : 0,
    mechanical.error?.slice(0, 500) ?? null,
    id,
  ).run();

  const baseContribution = {
    id, title, originalName: file.name, contentType: file.type, sourceNote,
    ownerDisplayName: user.displayName, viewCount: 0, publishMode,
    creditsAwarded: 0, createdAt: new Date().toISOString(), isMine: 1,
    mechanicalStatus, extractedTextPreview: mechanical.text.slice(0, 1200),
    questionsJson: mechanical.questions.length ? JSON.stringify(mechanical.questions) : null,
    recallJson: mechanical.recallCards.length ? JSON.stringify(mechanical.recallCards) : null,
    textOnly: textOnly ? 1 : 0, mechanicalError: mechanical.error ?? null,
    customMaterialsJson: JSON.stringify(customMaterials),
  };

  if (publishMode === "instant") {
    const message = instantStatus === "published"
      ? textOnly
        ? "원본을 공개하지 않고 텍스트 기반 학습 자료로 저장했습니다."
        : "자료가 즉시 공개되었습니다. 즉시 공개 자료에는 크레딧이 지급되지 않습니다."
      : mechanical.status === "awaiting_ocr"
        ? "텍스트 전용 저장을 위해 OCR 대기열에 보관했습니다. OCR 연결 후 텍스트만 공개됩니다."
        : `기계적 처리에 실패해 자료를 비공개로 보관했습니다. ${mechanical.error || ""}`;
    return Response.json({
      contribution: { ...baseContribution, status: instantStatus },
      message,
    }, { status: instantStatus === "published" ? 201 : 202 });
  }

  if (mechanical.status !== "completed") {
    const status = mechanical.status === "awaiting_ocr" ? "awaiting_ocr" : "review_failed";
    const message = mechanical.status === "awaiting_ocr"
      ? "Azure OCR 연결을 기다리고 있습니다. 원본 파일은 AI에 전달되지 않았습니다."
      : `OCR 텍스트 추출에 실패해 AI 검수를 시작하지 않았습니다. ${mechanical.error || ""}`;
    await runtime.DB.prepare("UPDATE contributions SET status = ?, error_message = ? WHERE id = ?")
      .bind(status, message.slice(0, 500), id).run();
    return Response.json({
      contribution: { ...baseContribution, status, errorMessage: message },
      message,
    }, { status: 202 });
  }

  if (!runtime.OPENAI_API_KEY) {
    return Response.json({
      contribution: { ...baseContribution, status: "awaiting_ai" },
      message: "AI 검수 대기열에 저장했습니다. 검수가 연결되면 통과 후 공개되고 20크레딧이 지급됩니다.",
    }, { status: 202 });
  }

  await runtime.DB.prepare("UPDATE contributions SET status = 'analyzing', ai_model = 'gpt-5.6-terra' WHERE id = ?").bind(id).run();
  try {
    const learningAsset = await structureContribution({
      apiKey: runtime.OPENAI_API_KEY,
      extractedText: mechanical.text,
      title,
      sourceNote,
      customMaterialsText: customMaterialsForReview(customMaterials),
    });
    const passed = learningAsset.coreConcepts.length > 0
      && learningAsset.examples.length > 0
      && learningAsset.recallQuestions.length >= 2
      && learningAsset.qualityFlags.length === 0;

    if (!passed) {
      const reason = learningAsset.qualityFlags.join(", ") || "학습 구조의 필수 항목이 부족합니다.";
      await runtime.DB.prepare(`
        UPDATE contributions SET status = 'review_rejected', learning_json = ?, error_message = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(JSON.stringify(learningAsset), reason.slice(0, 500), id).run();
      return Response.json({
        contribution: { ...baseContribution, status: "review_rejected", errorMessage: reason },
        message: "AI 검수 기준을 통과하지 못해 공개되지 않았고 크레딧도 지급되지 않았습니다.",
      }, { status: 202 });
    }

    await runtime.DB.batch([
      runtime.DB.prepare(`
        UPDATE contributions
        SET status = 'published_ai', learning_json = ?, error_message = NULL,
            credits_awarded = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(JSON.stringify(learningAsset), REVIEW_REWARD, id),
      runtime.DB.prepare(`
        INSERT INTO credit_ledger (user_id, amount, reason, contribution_id)
        VALUES (?, ?, 'AI 검수 자료 공개 보상', ?)
      `).bind(user.userId, REVIEW_REWARD, id),
      runtime.DB.prepare("UPDATE users SET credit_balance = credit_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(REVIEW_REWARD, user.userId),
    ]);

    return Response.json({
      contribution: { ...baseContribution, status: "published_ai", creditsAwarded: REVIEW_REWARD },
      message: `AI 검수를 통과해 공개되었고 ${REVIEW_REWARD}크레딧이 지급되었습니다.`,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 검수 중 오류가 발생했습니다.";
    await runtime.DB.prepare("UPDATE contributions SET status = 'review_failed', error_message = ? WHERE id = ?").bind(message.slice(0, 500), id).run();
    return Response.json({
      contribution: { ...baseContribution, status: "review_failed", errorMessage: message },
      message: "AI 검수를 완료하지 못했습니다. 자료는 공개되지 않았으며 크레딧도 지급되지 않았습니다.",
    }, { status: 202 });
  }
}

export async function PATCH(request: Request) {
  await ensureSchema();
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json() as { id?: unknown; title?: unknown; sourceNote?: unknown };
  const id = String(body.id ?? "").trim();
  const title = String(body.title ?? "").trim();
  const sourceNote = String(body.sourceNote ?? "").trim();
  if (!id || !title) return Response.json({ error: "자료 ID와 제목이 필요합니다." }, { status: 400 });
  if (title.length > 160 || sourceNote.length > 2000) return Response.json({ error: "제목 또는 설명이 너무 깁니다." }, { status: 400 });
  const { DB } = getRuntimeEnv();
  const owned = await DB.prepare("SELECT id FROM contributions WHERE id = ? AND owner_id = ?")
    .bind(id, user.userId).first<{ id: string }>();
  if (!owned) return Response.json({ error: "수정할 권한이 없거나 자료를 찾지 못했습니다." }, { status: 404 });
  await DB.prepare("UPDATE contributions SET title = ?, source_note = ? WHERE id = ? AND owner_id = ?")
    .bind(title, sourceNote, id, user.userId).run();
  const contribution = await DB.prepare(`${contributionSelect}, CASE WHEN owner_id = ? THEN 1 ELSE 0 END AS isMine FROM contributions WHERE id = ?`)
    .bind(user.userId, id).first();
  return Response.json({ contribution, message: "자료 정보가 저장되었습니다." });
}
