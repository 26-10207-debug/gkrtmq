import sources from "./search-sources.json";
import {digestText,syncSearchV2} from "./search-index-v2";
export async function seedSources(DB:D1Database){for(const source of sources){await DB.prepare("INSERT INTO search_v2_sources(id,name,config_json) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,config_json=excluded.config_json").bind(source.id,source.name,JSON.stringify(source)).run();for(const url of source.seeds)await indexExternal(DB,{sourceId:source.id,url,title:source.title,description:source.note,state:'metadata',checkedAt:null});}}
export async function indexExternal(DB:D1Database,input:Record<string,unknown>){
 const source=sources.find(s=>s.id===input.sourceId);if(!source)throw new Error('허용된 출처를 선택해 주세요.');
 const url=new URL(String(input.url));if(url.protocol!=='https:'||url.username||url.password||url.port||!source.hosts.includes(url.hostname)||!source.paths.some(p=>url.pathname.startsWith(p)))throw new Error('허용 목록 밖의 원문입니다.');url.hash='';
 const id='external-'+await digestText(url.href),title=String(input.title||source.title).slice(0,240),description=String(input.description||source.note).slice(0,1200);
 // These source policies currently allow discovery metadata only. No remote file/body redistribution.
 if(!input.error || !(await DB.prepare('SELECT id FROM reference_library WHERE id=?').bind(id).first())) await DB.prepare("INSERT INTO reference_library(id,title,description,topic,subject,source_name,source_url,license_note,access_mode,tags_json) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,updated_at=CURRENT_TIMESTAMP").bind(id,title,description,'공개 교육 자료','분류 없음',source.name,url.href,source.note,'external_link',JSON.stringify([source.name,'외부 공개 자료'])).run();
 await syncSearchV2(DB,'reference',id);
 if(input.checkedAt)await DB.prepare("UPDATE search_v2_sources SET last_checked=?,last_error=? WHERE id=? AND (last_checked IS NULL OR last_checked<=?)").bind(String(input.checkedAt),String(input.error||'').slice(0,300),source.id,String(input.checkedAt)).run();
 return {id:'reference:'+id,state:'metadata'};
}
