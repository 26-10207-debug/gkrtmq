import {visibleSearchDocument} from './search-schema';

export async function publicSections(DB:D1Database,id:string,offset:number,clauses:string[]=[],values:Array<string|number>=[]){
  const [documents,sections]=await DB.batch([
    DB.prepare(`SELECT d.* FROM search_v2_documents d WHERE d.id=? AND ${visibleSearchDocument}`).bind(id),
    DB.prepare(`SELECT c.content,c.location_json FROM search_v2_chunks c JOIN search_v2_documents d ON d.id=c.document_id WHERE d.id=? AND ${visibleSearchDocument} AND c.field IN ('body','authored')${clauses.length?' AND '+clauses.join(' AND '):''} ORDER BY c.ordinal,c.id LIMIT 11 OFFSET ?`).bind(id,...values,offset)
  ]);
  return {doc:documents.results[0] as Record<string,unknown>|undefined,rows:sections.results as Array<{content:string;location_json:string}>};
}
