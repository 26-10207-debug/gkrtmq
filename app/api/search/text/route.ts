import {ensureSchema,getRuntimeEnv} from '@/db/runtime';
import {publicSections} from '@/lib/public-sections';
import {readJson} from '@/lib/search-model';
export async function GET(request:Request){
  await ensureSchema();const {DB}=getRuntimeEnv();const p=new URL(request.url).searchParams;
  const offset=Number(p.get('offset')||0),attachment=Number(p.get('attachment')||0),page=Number(p.get('page')||0),line=Number(p.get('line')||0);
  if([offset,attachment,page,line].some(n=>!Number.isSafeInteger(n)||n<0))return Response.json({error:'구간 번호를 확인해 주세요.'},{status:400});
  const clauses:string[]=[],values:Array<string|number>=[];
  if(p.has('attachment')){clauses.push("COALESCE(json_extract(c.location_json,'$.attachment'),0)=?");values.push(attachment);}
  if(page>0){clauses.push("json_extract(c.location_json,'$.page')=?");values.push(page);}
  if(p.get('path')){clauses.push("json_extract(c.location_json,'$.path')=?");values.push(p.get('path')!);}
  if(line>0){clauses.push("COALESCE(json_extract(c.location_json,'$.line'),0)+length(c.content)-length(replace(c.content,char(10),''))>=?");values.push(line);}
  const {doc,rows}=await publicSections(DB,p.get('id')||'',offset,clauses,values);
  if(!doc)return Response.json({error:'공개 자료를 찾지 못했습니다.'},{status:404,headers:{'Cache-Control':'no-store'}});
  return Response.json({title:doc.title,status:doc.index_status,message:doc.index_message,sections:rows.slice(0,10).map(r=>({text:r.content,...readJson(r.location_json,{})})),nextOffset:rows.length>10?offset+10:null},{headers:{'Cache-Control':'no-store'}});
}
