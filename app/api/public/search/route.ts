import { inputFromUrl } from "@/app/api/search/route";
import { searchPublic } from "@/lib/public-library";
export async function GET(request: Request) {
  const url = new URL(request.url);
  try{return Response.json(await searchPublic(url.searchParams.get("q") || "", url.origin,inputFromUrl(url)), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });}
  catch(error){const message=error instanceof Error?error.message:"검색 오류";const expected=/검색어|검색 단어|검색 조건|처음부터/.test(message);return Response.json({error:expected?message:"검색을 완료하지 못했습니다. 다시 시도해 주세요."},{status:expected?400:503,headers:{"Access-Control-Allow-Origin":"*","Cache-Control":"no-store"}});}
}
