import { handleRpc } from "@/lib/mcp-protocol";
import { fetchPublic, readPublicFile, searchPublic } from "@/lib/public-library";

const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
export async function POST(request: Request) {
  if (!(request.headers.get("content-type") || "").includes("application/json")) return new Response("Use application/json", { status: 415, headers });
  const raw = await request.text(); if (raw.length > 16_384) return new Response("Request too large", { status: 413, headers });
  let message: unknown;
  try { message = JSON.parse(raw); } catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers }); }
  const origin = new URL(request.url).origin;
  const response = await handleRpc(message, (name, args) => name === "search" ? searchPublic(String(args.query), origin, args) : name === "fetch" ? fetchPublic(String(args.id), origin, Number(args.offset||0)) : readPublicFile(String(args.id), Number(args.attachment || 0), args.path as string | undefined, Number(args.offset || 0), origin));
  return response ? Response.json(response, { headers }) : new Response(null, { status: 202, headers });
}
export async function GET() { return new Response("This stateless MCP endpoint accepts POST. Connection guide: /connect", { status: 405, headers: { ...headers, Allow: "POST, OPTIONS" } }); }
export async function OPTIONS() { return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id" } }); }
