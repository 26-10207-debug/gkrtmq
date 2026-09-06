import { ensureSchema, getRuntimeEnv } from "@/db/runtime";
import { loadRuntimePackage, runtimeBridge, runtimeHeaders, tokenHash, type RuntimeSession } from "@/lib/material-runtime";
import { safePackagePath } from "@/lib/web-package";

export async function GET(request: Request, context: { params: Promise<{ token: string; path: string[] }> }) {
  await ensureSchema();
  const { token, path: parts } = await context.params;
  if (!/^[a-f0-9]{64}$/.test(token)) return new Response("실행 세션을 찾을 수 없습니다.", { status: 404 });
  const path = safePackagePath(parts.join("/"));
  if (!path) return new Response("올바르지 않은 경로입니다.", { status: 400 });
  const session = await getRuntimeEnv().DB.prepare("SELECT source_id AS sourceId, source_kind AS sourceKind, attachment_index AS attachmentIndex, owner_id AS ownerId FROM material_runtime_sessions WHERE token_hash = ? AND expires_at > ?").bind(await tokenHash(token), Date.now()).first<RuntimeSession>();
  if (!session) return new Response("실행 시간이 만료되었습니다. 자료에서 다시 실행해 주세요.", { status: 410, headers: { "Cache-Control": "no-store" } });
  try {
    const pkg = await loadRuntimePackage(session);
    if (!Object.hasOwn(pkg.files, path)) return new Response("파일을 찾을 수 없습니다.", { status: 404 });
    const bytes = pkg.files[path];
    const prefix = `${new URL(request.url).origin}/api/runtime/${token}/`;
    const headers = runtimeHeaders(path, prefix);
    if (/\.html?$/i.test(path)) {
      const html = new TextDecoder().decode(bytes);
      const body = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, (head) => head + runtimeBridge) : runtimeBridge + html;
      return new Response(body, { headers });
    }
    return new Response(bytes.slice().buffer as ArrayBuffer, { headers });
  } catch { return new Response("자료를 더 이상 실행할 수 없습니다.", { status: 404 }); }
}
export async function OPTIONS() { return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" } }); }
