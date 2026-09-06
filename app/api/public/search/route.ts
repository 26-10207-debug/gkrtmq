import { searchPublic } from "@/lib/public-library";
export async function GET(request: Request) {
  const url = new URL(request.url);
  return Response.json(await searchPublic(url.searchParams.get("q") || "", url.origin), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
}
