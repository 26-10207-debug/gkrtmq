import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureSchema, getRuntimeEnv } from "@/db/runtime";

async function context(id: string) {
  await ensureSchema(); const user = await getChatGPTUser();
  if (!user) return { error: Response.json({ error: "학습 기록을 저장하려면 로그인해 주세요." }, { status: 401 }) };
  const { DB } = getRuntimeEnv();
  const exists = await DB.prepare("SELECT id FROM contributions WHERE id = ? AND status IN ('published','published_ai')").bind(id).first();
  if (!exists) return { error: Response.json({ error: "공개 자료를 찾을 수 없습니다." }, { status: 404 }) };
  return { DB, user };
}
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") || ""; const result = await context(id);
  if (result.error) return result.error;
  const row = await result.DB!.prepare("SELECT state_json AS state FROM material_runtime_state WHERE user_id = ? AND material_id = ?").bind(result.user!.userId, id).first<{ state: string }>();
  return Response.json({ state: row ? JSON.parse(row.state) : null }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "이 사이트에서 저장해 주세요." }, { status: 403 });
  const raw = await request.text(); if (raw.length > 66_000) return Response.json({ error: "학습 기록은 64KB까지 저장할 수 있습니다." }, { status: 413 });
  let body: { id: string; state: unknown };
  try { body = JSON.parse(raw); if (!body || typeof body.id !== "string" || !body.id || body.id.length > 200) throw new Error(); }
  catch { return Response.json({ error: "자료 ID와 올바른 JSON이 필요합니다." }, { status: 400 }); }
  const result = await context(body.id);
  if (result.error) return result.error;
  const state = JSON.stringify(body.state ?? null); if (new TextEncoder().encode(state).length > 65_536) return Response.json({ error: "학습 기록이 너무 큽니다." }, { status: 413 });
  await result.DB!.prepare("INSERT INTO material_runtime_state(user_id, material_id, state_json) VALUES (?, ?, ?) ON CONFLICT(user_id, material_id) DO UPDATE SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP").bind(result.user!.userId, body.id, state).run();
  return Response.json({ ok: true });
}
