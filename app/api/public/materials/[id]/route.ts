import { fetchPublic } from "@/lib/public-library";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json(await fetchPublic((await context.params).id, new URL(request.url).origin,Number(new URL(request.url).searchParams.get("offset")||0)), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "공개 자료를 찾을 수 없습니다." }, { status: 404 }); }
}
