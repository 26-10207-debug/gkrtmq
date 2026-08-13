import { ensureSchema, getRuntimeEnv } from "@/db/runtime";

export async function GET(request: Request) {
  await ensureSchema();
  const learnerId = new URL(request.url).searchParams.get("learnerId")?.trim();
  if (!learnerId) return Response.json({ progress: [] });

  const { DB } = getRuntimeEnv();
  const result = await DB.prepare(`
    SELECT asset_id AS assetId, mode, completed_items AS completedItems,
           score, updated_at AS updatedAt
    FROM learning_progress
    WHERE learner_id = ?
    ORDER BY updated_at DESC
  `).bind(learnerId).all();
  return Response.json({ progress: result.results });
}

export async function POST(request: Request) {
  await ensureSchema();
  const payload = (await request.json()) as {
    learnerId?: string;
    assetId?: string;
    mode?: string;
    completedItems?: number;
    score?: number;
  };
  if (!payload.learnerId || !payload.assetId || !payload.mode) {
    return Response.json({ error: "학습 기록 정보가 부족합니다." }, { status: 400 });
  }

  const { DB } = getRuntimeEnv();
  await DB.prepare(`
    INSERT INTO learning_progress
      (learner_id, asset_id, mode, completed_items, score, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (learner_id, asset_id, mode) DO UPDATE SET
      completed_items = excluded.completed_items,
      score = excluded.score,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    payload.learnerId,
    payload.assetId,
    payload.mode,
    Math.max(0, Math.floor(payload.completedItems ?? 0)),
    Math.max(0, Math.min(100, Math.floor(payload.score ?? 0))),
  ).run();

  return Response.json({ ok: true });
}
