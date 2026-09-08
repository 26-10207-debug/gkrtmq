import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureSchema, getRuntimeEnv } from "@/db/runtime";
import { loadRuntimePackage, tokenHash, type RuntimeSession } from "@/lib/material-runtime";

export async function POST(request: Request) {
  await ensureSchema();
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "이 사이트에서 실행해 주세요." }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 4096) return Response.json({ error: "요청이 너무 큽니다." }, { status: 413 });
  let body: { id?: string; kind?: string; attachment?: number };
  try { body = JSON.parse(raw); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(); }
  catch { return Response.json({ error: "올바른 JSON 요청이 필요합니다." }, { status: 400 }); }
  if (typeof body.id !== "string" || !body.id || body.id.length > 200 || !Number.isInteger(body.attachment) || Number(body.attachment) < 0) return Response.json({ error: "자료와 파일을 선택해 주세요." }, { status: 400 });
  const sourceKind = body.kind === "draft" ? "draft" : "public";
  const user = sourceKind === "draft" ? await getChatGPTUser() : null;
  if (sourceKind === "draft" && !user) return Response.json({ error: "초안을 실행하려면 로그인이 필요합니다." }, { status: 401 });
  const session: RuntimeSession = { sourceId: body.id, sourceKind, attachmentIndex: body.attachment!, ownerId: user?.userId || null };
  try {
    const pkg = await loadRuntimePackage(session);
    const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const { DB } = getRuntimeEnv(); const now = Date.now();
    await DB.prepare("DELETE FROM material_runtime_sessions WHERE expires_at < ?").bind(now).run();
    const active = await DB.prepare("SELECT COUNT(*) AS count FROM material_runtime_sessions WHERE source_id = ?").bind(session.sourceId).first<{ count: number }>();
    if (Number(active?.count) >= 100) return Response.json({ error: "실행 요청이 많습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
    await DB.prepare("INSERT INTO material_runtime_sessions(token_hash, source_id, source_kind, attachment_index, owner_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)").bind(await tokenHash(token), session.sourceId, session.sourceKind, session.attachmentIndex, session.ownerId, now + 60 * 60 * 1000).run();
    return Response.json({ url: `/api/runtime/${token}/${pkg.entry!.split("/").map(encodeURIComponent).join("/")}`, expiresAt: now + 60 * 60 * 1000,viewport:pkg.viewport }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "실행 자료를 열지 못했습니다." }, { status: 422 }); }
}
