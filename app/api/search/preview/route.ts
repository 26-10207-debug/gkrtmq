import {serveR2File} from "@/lib/file-response";
import { ensureSchema,getRuntimeEnv } from "@/db/runtime";
import { publicIndexedDocument } from "@/lib/search-index-v2";
export async function GET(request:Request){await ensureSchema();const {DB,UPLOADS}=getRuntimeEnv();const p=new URL(request.url).searchParams;const doc=await publicIndexedDocument(DB,p.get("id")||"");const key=doc?.[p.get("kind")==="preview"?"preview_key":"thumbnail_key"];if(!key)return new Response("미리보기를 찾지 못했습니다.",{status:404});return serveR2File(request,UPLOADS,String(key),new Headers({"Content-Type":"image/webp","X-Content-Type-Options":"nosniff"}));}
export const HEAD=GET;
