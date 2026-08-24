import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureSchema, getRuntimeEnv } from "@/db/runtime";

export async function GET() {
  await ensureSchema();
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { DB } = getRuntimeEnv();
  await DB.prepare(`
    INSERT INTO users (id, email, display_name, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      updated_at = CURRENT_TIMESTAMP
  `).bind(user.userId, user.email, user.displayName).run();

  const [profile, stats, contributions, ledger] = await Promise.all([
    DB.prepare("SELECT credit_balance AS creditBalance FROM users WHERE id = ?").bind(user.userId).first<{ creditBalance: number }>(),
    DB.prepare(`
      SELECT COUNT(*) AS contributionCount, COALESCE(SUM(view_count), 0) AS totalViews
      FROM contributions WHERE owner_id = ? AND status IN ('published', 'published_ai')
    `).bind(user.userId).first<{ contributionCount: number; totalViews: number }>(),
    DB.prepare(`
      SELECT id, title, original_name AS originalName, content_type AS contentType, source_note AS sourceNote, status, publish_mode AS publishMode, credits_awarded AS creditsAwarded,
             view_count AS viewCount, error_message AS errorMessage, created_at AS createdAt, subject, tags_json AS tagsJson,
             owner_display_name AS ownerDisplayName, attachments_json AS attachmentsJson, custom_materials_json AS customMaterialsJson
      FROM contributions WHERE owner_id = ? ORDER BY created_at DESC LIMIT 50
    `).bind(user.userId).all(),
    DB.prepare(`
      SELECT id, amount, reason, contribution_id AS contributionId, created_at AS createdAt
      FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
    `).bind(user.userId).all(),
  ]);

  return Response.json({
    user,
    creditBalance: profile?.creditBalance ?? 0,
    stats: stats ?? { contributionCount: 0, totalViews: 0 },
    contributions: contributions.results,
    ledger: ledger.results,
  });
}
