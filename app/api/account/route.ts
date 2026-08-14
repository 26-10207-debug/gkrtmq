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

  const stats = await DB.prepare(`
    SELECT COUNT(*) AS contributionCount, COALESCE(SUM(view_count), 0) AS totalViews
    FROM contributions WHERE owner_id = ? AND status = 'published'
  `).bind(user.userId).first<{ contributionCount: number; totalViews: number }>();

  return Response.json({ user, stats: stats ?? { contributionCount: 0, totalViews: 0 } });
}
