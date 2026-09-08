import { ensureSchema,getRuntimeEnv } from "@/db/runtime";
import { searchReady,suggestSearch } from "@/lib/search-service";
export async function GET(request:Request){await ensureSchema();const {DB}=getRuntimeEnv();if(!await searchReady(DB))return Response.json({suggestions:[]});try{return Response.json(await suggestSearch(DB,new URL(request.url).searchParams.get("q")||""),{headers:{"Cache-Control":"no-store"}});}catch{return Response.json({error:"추천 검색어를 불러오지 못했습니다."},{status:503});}}
