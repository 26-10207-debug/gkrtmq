import {getRuntimeEnv} from "@/db/runtime";
import {isIndexer,jobGuard} from "@/lib/indexer-auth";
import {visibleSearchDocument} from "@/lib/search-schema";
export async function POST(request:Request){
 if(!isIndexer(request))return new Response("인증이 필요합니다.",{status:401});
 const {DB,UPLOADS}=getRuntimeEnv(),p=new URL(request.url).searchParams,jobId=p.get("jobId")||"",token=request.headers.get("x-job-lease")||"";
 const job=await DB.prepare(`SELECT j.document_id,j.content_version FROM search_v2_jobs j JOIN search_v2_documents d ON d.id=j.document_id WHERE j.id=? AND j.lease_token=? AND j.status='processing' AND j.lease_until>? AND j.content_version=d.content_version AND ${visibleSearchDocument}`).bind(jobId,token,Date.now()).first<{document_id:string;content_version:number}>();
 if(!job)return new Response("작업이 변경되었습니다.",{status:409});
 if(request.headers.get("content-type")!=="image/webp")return new Response("WebP 미리보기가 필요합니다.",{status:400});
 const reader=request.body?.getReader();if(!reader)return new Response(null,{status:400});
 const parts:Uint8Array[]=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1500000){await reader.cancel();return new Response("미리보기가 너무 큽니다.",{status:413});}parts.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 if(new TextDecoder().decode(bytes.slice(0,4))!=="RIFF"||new TextDecoder().decode(bytes.slice(8,12))!=="WEBP")return new Response("WebP 형식을 확인해 주세요.",{status:400});
 const kind=p.get("kind")==="preview"?"preview":"thumbnail",key=`search-preview/${job.document_id}/${job.content_version}/${crypto.randomUUID()}-${kind}.webp`;
 await UPLOADS.put(key,bytes,{httpMetadata:{contentType:"image/webp"}});
 try{const guard=jobGuard(DB,jobId,token);await DB.batch([guard.start,DB.prepare(`UPDATE search_v2_documents SET ${kind==="preview"?"preview_key":"thumbnail_key"}=? WHERE id=? AND content_version=?`).bind(key,job.document_id,job.content_version),guard.end]);}
 catch{await UPLOADS.delete(key);return new Response("작업이 변경되었습니다.",{status:409});}
 return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}});
}

