import {ensureSchema,getRuntimeEnv} from "@/db/runtime";
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403});
 const id=new URL(request.url).searchParams.get('id')||'';if(!id||id.length>200)return new Response(null,{status:400});
 await ensureSchema();const {DB}=getRuntimeEnv();const publicRow=await DB.prepare("SELECT id FROM contributions WHERE id=? AND status IN ('published','published_ai')").bind(id).first();if(!publicRow)return new Response(null,{status:404});
 const cookie=request.headers.get('cookie')?.match(/(?:^|;\s*)dcl_view=([a-f0-9-]{36})(?:;|$)/)?.[1],visitor=cookie||crypto.randomUUID(),day=Math.floor(Date.now()/86400000),key=id+':'+visitor+':'+day;
 await DB.batch([DB.prepare("DELETE FROM search_v2_views WHERE expires_at<?").bind(Date.now()),DB.prepare("UPDATE contributions SET view_count=view_count+1 WHERE id=? AND NOT EXISTS(SELECT 1 FROM search_v2_views WHERE id=?)").bind(id,key),DB.prepare("UPDATE search_v2_documents SET view_count=(SELECT view_count FROM contributions WHERE id=?) WHERE source_type='contribution' AND source_id=?").bind(id,id),DB.prepare("INSERT OR IGNORE INTO search_v2_views(id,expires_at) VALUES(?,?)").bind(key,Date.now()+86400000)]);
 return new Response(null,{status:204,headers:{'Cache-Control':'no-store',...(!cookie?{'Set-Cookie':`dcl_view=${visitor}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax${new URL(request.url).protocol==='https:'?'; Secure':''}`}:{})}});
}
