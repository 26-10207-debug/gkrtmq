import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureSchema, getRuntimeEnv } from "@/db/runtime";
import { structureContribution } from "@/lib/learning-ai";
import { MechanicalOptions, processMechanically } from "@/lib/mechanical-tools";
import { customMaterialsForReview, hasImageSelection, normalizeCustomMaterials } from "@/lib/custom-materials";
import { publicAttachments, StoredAttachment } from "@/lib/contribution-attachments";
import { normalizeSubject, normalizeTags, syncContributionSearchIndex } from "@/lib/search-index";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_UPLOAD_COUNT = 5;
const MAX_TOTAL_UPLOAD_BYTES = 32 * 1024 * 1024;
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
         attachments_json AS attachmentsJson,
         subject, tags_json AS tagsJson,
         created_at AS createdAt`;

function contributionForClient(row: Record<string, unknown>) {
  const attachments = (() => {
    try {
      const parsed = JSON.parse(String(row.attachmentsJson || "[]"));
      if (Array.isArray(parsed)) return parsed.filter((item): item is StoredAttachment => Boolean(item && typeof item === "object" && typeof (item as StoredAttachment).originalName === "string" && typeof (item as StoredAttachment).contentType === "string" && typeof (item as StoredAttachment).objectKey === "string"));
    } catch {
      // Records created before multi-file support use the original file columns.
    }
    return [{ originalName: String(row.originalName || "파일"), contentType: String(row.contentType || "application/octet-stream"), objectKey: "", size: 0 }];
  })();
  const { attachmentsJson: _attachmentsJson, ...contribution } = row;
  return { ...contribution, attachments: publicAttachments(attachments) };
}

function providedTextsFromForm(form: FormData) {
  const fallback = String(form.get("extractedText") ?? "").trim().slice(0, 100_000);
  try {
    const parsed = JSON.parse(String(form.get("extractedTexts") ?? "[]"));
    if (Array.isArray(parsed)) return parsed.map((value) => typeof value === "string" ? value.trim().slice(0, 100_000) : "");
  } catch {
    // The legacy extractedText value is still accepted.
  }
  return [fallback];
}

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

  return Response.json({ contributions: result.results.map((item) => contributionForClient(item as Record<string, unknown>)) });
}

export async function POST(request: Request) {
  await ensureSchema();
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "자료를 올리려면 로그인이 필요합니다." }, { status: 401 });

  const form = await request.formData();
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  const legacyFile = form.get("file");
  if (!files.length && legacyFile instanceof File) files.push(legacyFile);
  const title = String(form.get("title") ?? "").trim();
  const sourceNote = String(form.get("sourceNote") ?? "").trim();
  const subject = normalizeSubject(form.get("subject"));
  const tags = normalizeTags(form.get("tags"));
  const providedTexts = providedTextsFromForm(form);
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

  if (!files.length || !title) return Response.json({ error: "제목과 1개 이상의 파일이 필요합니다." }, { status: 400 });
  if (files.length > MAX_UPLOAD_COUNT) return Response.json({ error: `한 자료에는 최대 ${MAX_UPLOAD_COUNT}개 파일까지 올릴 수 있습니다.` }, { status: 413 });
  if (!licenseConfirmed) return Response.json({ error: "기여 권한과 선택한 공개 방식에 동의해야 합니다." }, { status: 400 });
  if (mechanicalOptions.textOnly && hasImageSelection(customMaterials)) return Response.json({ error: "이미지에서 선택한 암기 영역을 공개하려면 원본 공개를 유지해야 합니다." }, { status: 400 });
  if (files.some((file) => file.size > MAX_UPLOAD_BYTES)) return Response.json({ error: "현재는 파일당 8MB까지 업로드할 수 있습니다." }, { status: 413 });
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_UPLOAD_BYTES) return Response.json({ error: "한 자료의 전체 파일 용량은 32MB까지입니다." }, { status: 413 });
  if (files.some((file) => !ALLOWED_TYPES.has(file.type))) return Response.json({ error: "지원하지 않는 파일 형식이 포함되어 있습니다." }, { status: 415 });

  const runtime = getRuntimeEnv();
  const id = crypto.randomUUID();
  const attachments: StoredAttachment[] = await Promise.all(files.map(async (file, index) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "upload";
    const objectKey = `${publishMode === "instant" ? "published" : "review-queue"}/${id}/${index}-${safeName}`;
    const bytes = await file.arrayBuffer();
    await runtime.UPLOADS.put(objectKey, bytes, {
      httpMetadata: { contentType: file.type },
      customMetadata: { contributionId: id, originalName: file.name, ownerId: user.userId, publishMode, attachmentIndex: String(index) },
    });
    return { originalName: file.name, contentType: file.type, objectKey, size: file.size };
  }));
  const effectiveMechanicalOptions: MechanicalOptions = {
    ...mechanicalOptions,
    // AI 검수에는 원본 이미지·파일을 전달하지 않고, 추출 텍스트만 전달한다.
    ocr: mechanicalOptions.ocr || (publishMode === "ai_review" && providedTexts.some((text, index) => !text && Boolean(files[index]))),
  };
  const hasMechanicalTools = providedTexts.some(Boolean) || Object.values(effectiveMechanicalOptions).some(Boolean);
  const initialStatus = publishMode === "ai_review"
    ? "mechanical_processing"
    : mechanicalOptions.textOnly ? "mechanical_processing" : "published";

  await runtime.DB.batch([
    runtime.DB.prepare(`
      INSERT INTO users (id, email, display_name, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP
    `).bind(user.userId, user.email, user.displayName),
    runtime.DB.prepare(`
      INSERT INTO contributions
        (id, title, original_name, content_type, object_key, source_note, status,
         owner_id, owner_email, owner_display_name, publish_mode, mechanical_options, mechanical_status, custom_materials_json, attachments_json, subject, tags_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, title, attachments[0].originalName, attachments[0].contentType, attachments[0].objectKey, sourceNote, initialStatus, user.userId, user.email, user.displayName, publishMode, JSON.stringify(effectiveMechanicalOptions), hasMechanicalTools ? "processing" : "none", JSON.stringify(customMaterials), JSON.stringify(attachments), subject, JSON.stringify(tags)),
  ]);

  const mechanicalResults = await Promise.all(files.map(async (file, index) => processMechanically({
    input: { ...mechanicalOptions, ocr: mechanicalOptions.ocr || (publishMode === "ai_review" && !providedTexts[index]) },
    bytes: await file.arrayBuffer(), contentType: file.type, filename: file.name, providedText: providedTexts[index],
    azureEndpoint: runtime.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT, azureApiKey: runtime.AZURE_DOCUMENT_INTELLIGENCE_KEY,
  })));
  const mechanicalStatus = !hasMechanicalTools ? "none" : mechanicalResults.some((result) => result.status === "failed") ? "failed" : mechanicalResults.some((result) => result.status === "awaiting_ocr") ? "awaiting_ocr" : "completed";
  const extractedText = mechanicalResults.map((result, index) => result.text ? `--- ${files[index].name} ---\n${result.text}` : "").filter(Boolean).join("\n\n").slice(0, 100_000);
  const questions = mechanicalResults.flatMap((result) => result.questions).slice(0, 100).map((question, index) => ({ ...question, number: index + 1 }));
  const recallCards = mechanicalResults.flatMap((result) => result.recallCards).slice(0, 30);
  const mechanicalError = mechanicalResults.map((result) => result.error).filter(Boolean).join(" ").slice(0, 500) || null;
  const textOnly = mechanicalOptions.textOnly && mechanicalStatus === "completed";
  const instantStatus = publishMode === "instant"
    ? mechanicalOptions.textOnly
      ? mechanicalStatus === "completed" ? "published" : mechanicalStatus === "awaiting_ocr" ? "awaiting_ocr" : "mechanical_failed"
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
    extractedText || null,
    questions.length ? JSON.stringify(questions) : null,
    recallCards.length ? JSON.stringify(recallCards) : null,
    textOnly ? 1 : 0,
    mechanicalError,
    id,
  ).run();

  const baseContribution = {
    id, title, originalName: attachments[0].originalName, contentType: attachments[0].contentType, sourceNote, subject, tags,
    ownerDisplayName: user.displayName, viewCount: 0, publishMode,
    creditsAwarded: 0, createdAt: new Date().toISOString(), isMine: 1,
    mechanicalStatus, extractedTextPreview: extractedText.slice(0, 1200),
    questionsJson: questions.length ? JSON.stringify(questions) : null,
    recallJson: recallCards.length ? JSON.stringify(recallCards) : null,
    textOnly: textOnly ? 1 : 0, mechanicalError, attachments: publicAttachments(attachments),
    customMaterialsJson: JSON.stringify(customMaterials),
  };

  if (publishMode === "instant") {
    if (instantStatus === "published") await syncContributionSearchIndex(runtime.DB, id);
    const message = instantStatus === "published"
      ? textOnly
        ? "원본을 공개하지 않고 텍스트 기반 학습 자료로 저장했습니다."
        : "자료가 즉시 공개되었습니다. 즉시 공개 자료에는 크레딧이 지급되지 않습니다."
      : mechanicalStatus === "awaiting_ocr"
        ? "텍스트 전용 저장을 위해 OCR 대기열에 보관했습니다. OCR 연결 후 텍스트만 공개됩니다."
        : `기계적 처리에 실패해 자료를 비공개로 보관했습니다. ${mechanicalError || ""}`;
    return Response.json({
      contribution: { ...baseContribution, status: instantStatus },
      message,
    }, { status: instantStatus === "published" ? 201 : 202 });
  }

  if (mechanicalStatus !== "completed") {
    const status = mechanicalStatus === "awaiting_ocr" ? "awaiting_ocr" : "review_failed";
    const message = mechanicalStatus === "awaiting_ocr"
      ? "Azure OCR 연결을 기다리고 있습니다. 원본 파일은 AI에 전달되지 않았습니다."
      : `OCR 텍스트 추출에 실패해 AI 검수를 시작하지 않았습니다. ${mechanicalError || ""}`;
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
      extractedText,
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
    await syncContributionSearchIndex(runtime.DB, id);

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
  const body = await request.json() as { id?: unknown; title?: unknown; sourceNote?: unknown; subject?: unknown; tags?: unknown };
  const id = String(body.id ?? "").trim();
  const title = String(body.title ?? "").trim();
  const sourceNote = String(body.sourceNote ?? "").trim();
  const subject = normalizeSubject(body.subject);
  const tags = normalizeTags(body.tags);
  if (!id || !title) return Response.json({ error: "자료 ID와 제목이 필요합니다." }, { status: 400 });
  if (title.length > 160 || sourceNote.length > 2000) return Response.json({ error: "제목 또는 설명이 너무 깁니다." }, { status: 400 });
  const { DB } = getRuntimeEnv();
  const owned = await DB.prepare("SELECT id FROM contributions WHERE id = ? AND owner_id = ?")
    .bind(id, user.userId).first<{ id: string }>();
  if (!owned) return Response.json({ error: "수정할 권한이 없거나 자료를 찾지 못했습니다." }, { status: 404 });
  await DB.prepare("UPDATE contributions SET title = ?, source_note = ?, subject = ?, tags_json = ? WHERE id = ? AND owner_id = ?")
    .bind(title, sourceNote, subject, JSON.stringify(tags), id, user.userId).run();
  await syncContributionSearchIndex(DB, id);
  const contribution = await DB.prepare(`${contributionSelect}, CASE WHEN owner_id = ? THEN 1 ELSE 0 END AS isMine FROM contributions WHERE id = ?`)
    .bind(user.userId, id).first();
  return Response.json({ contribution, message: "자료 정보가 저장되었습니다." });
}
