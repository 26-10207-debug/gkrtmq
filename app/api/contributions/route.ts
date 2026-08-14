import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureSchema, getRuntimeEnv } from "@/db/runtime";
import { structureContribution } from "@/lib/learning-ai";

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
  const licenseConfirmed = form.get("licenseConfirmed") === "true";
  const publishMode = form.get("publishMode") === "ai_review" ? "ai_review" : "instant";

  if (!(file instanceof File) || !title) return Response.json({ error: "제목과 파일이 필요합니다." }, { status: 400 });
  if (!licenseConfirmed) return Response.json({ error: "기여 권한과 선택한 공개 방식에 동의해야 합니다." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "현재는 파일당 8MB까지 업로드할 수 있습니다." }, { status: 413 });
  if (!ALLOWED_TYPES.has(file.type)) return Response.json({ error: "지원하지 않는 파일 형식입니다." }, { status: 415 });

  const runtime = getRuntimeEnv();
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "upload";
  const objectKey = `${publishMode === "instant" ? "published" : "review-queue"}/${id}/${safeName}`;
  const bytes = await file.arrayBuffer();
  const initialStatus = publishMode === "instant" ? "published" : "awaiting_ai";

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
         owner_id, owner_email, owner_display_name, publish_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, title, file.name, file.type, objectKey, sourceNote, initialStatus, user.userId, user.email, user.displayName, publishMode),
  ]);

  const baseContribution = {
    id, title, originalName: file.name, contentType: file.type, sourceNote,
    ownerDisplayName: user.displayName, viewCount: 0, publishMode,
    creditsAwarded: 0, createdAt: new Date().toISOString(), isMine: 1,
  };

  if (publishMode === "instant") {
    return Response.json({
      contribution: { ...baseContribution, status: "published" },
      message: "자료가 즉시 공개되었습니다. 즉시 공개 자료에는 크레딧이 지급되지 않습니다.",
    }, { status: 201 });
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
      bytes,
      contentType: file.type,
      filename: file.name,
      title,
      sourceNote,
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
