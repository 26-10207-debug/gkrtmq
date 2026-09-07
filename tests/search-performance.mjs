import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

// Execute both real route implementations against identical SQLite fixtures.
// No production DB, account, or upload is touched.
const db = new DatabaseSync(':memory:');
db.exec(`CREATE VIRTUAL TABLE search_documents USING fts5(source_id UNINDEXED,source_type UNINDEXED,subject,title,tags,body);
CREATE TABLE search_synonyms(canonical TEXT,alias TEXT,subject TEXT);
CREATE TABLE contributions(id TEXT PRIMARY KEY,title TEXT,original_name TEXT,content_type TEXT,source_note TEXT,owner_display_name TEXT,view_count INTEGER,created_at TEXT,status TEXT,publish_mode TEXT,mechanical_status TEXT,extracted_text TEXT,questions_json TEXT,recall_json TEXT,text_only INTEGER,mechanical_error TEXT,custom_materials_json TEXT,attachments_json TEXT,subject TEXT,tags_json TEXT,owner_id TEXT);
CREATE TABLE reference_library(id TEXT,title TEXT,description TEXT,topic TEXT,subject TEXT,source_name TEXT,source_url TEXT,license_note TEXT,access_mode TEXT,tags_json TEXT);
CREATE TABLE public_folders(id TEXT,title TEXT,description TEXT,subject TEXT,tags_json TEXT,folder_type TEXT,owner_display_name TEXT,visibility_state TEXT);
CREATE TABLE public_folder_items(folder_id TEXT,contribution_id TEXT,page_start INTEGER,page_end INTEGER);`);
db.exec(`INSERT INTO search_synonyms VALUES('돌림힘','토크','물리학'),('돌림힘','모멘트','물리학'),('돌림힘','돌림힘','물리학')`);
for (let i=0;i<110;i++) {
  const title=i%3===0?`보인고 2026 국어 ${i}`:`2025 물리 시험 ${i}`;
  const body=('가나다라 자료 설명 '.repeat(3000)) + (i%2?'관성 마찰력 돌림힘':'관성    법칙') + ' 2026 ' + '추가 문장 '.repeat(6000);
  const subject=i%3===0?'국어':'물리학'; const id='c'+i;
  db.prepare('INSERT INTO contributions VALUES('+Array(21).fill('?').join(',')+')').run(id,title,'paper.txt','text/plain','기출', 'tester', i,'2026-01-01','published','instant','ready',body,'[]','{}',0,null,'{}','[]',subject,'["2026"]','owner');
  db.prepare('INSERT INTO search_documents VALUES(?,?,?,?,?,?)').run(id,'contribution',subject,title,'2026',body);
}
db.exec(`INSERT INTO public_folders VALUES('f1','보인고 2026 국어','모음','국어','[]','regular','tester','published');
INSERT INTO public_folder_items VALUES('f1','c0',NULL,NULL);
INSERT INTO search_documents VALUES('f1','folder','국어','보인고 2026 국어','','관성');
INSERT INTO reference_library VALUES('r1','관성 법칙','돌림힘 관성','물리학','물리학','reference','https://example.invalid','','external_link','[]');
INSERT INTO search_documents VALUES('r1','reference','물리학','관성 법칙','','돌림힘 관성');`);
let stats;
const helperExports = {};
new Function('exports',ts.transpileModule(readFileSync(new URL('../lib/contribution-summary.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(helperExports);
const adapter={prepare(sql){let bindings=[];const run=()=>{const start=performance.now();const results=db.prepare(sql).all(...bindings);stats.bytes+=Buffer.byteLength(JSON.stringify(results));stats.queries++;return {results,meta:{duration:performance.now()-start}}};const stmt={bind(...values){bindings=values;return stmt},async all(){return run()},async first(){return run().results[0]??null}};return stmt},async batch(stmts){return Promise.all(stmts.map(s=>s.all()))}};
function route(source) {
  source=source.replace(/^import .*;\r?\n/gm,'');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports={};new Function('exports','getChatGPTUser','ensureSchema','getRuntimeEnv','requestTiming','contributionToolColumns',code)(exports,async()=>({userId:'owner'}),async()=>{},()=>({DB:adapter}),()=>({mark(){},headers(){return {}}}),helperExports.contributionToolColumns);return exports.GET;
}
const before=route(execFileSync(process.env.GIT_EXE||'git',['show','8f3d3f722a806ec479dd7bcc705a11d41e653152:app/api/search/route.ts'],{encoding:'utf8'}));
const after=route(readFileSync(new URL('../app/api/search/route.ts',import.meta.url),'utf8'));
let oldBytes=0,newBytes=0,checks=0;
for(const q of ['국어','보인고','2026','관성','찰','토크','관성 법칙','없는단어']) {
  for(const extra of ['', '&subject='+encodeURIComponent('국어'), '&sort=views','&type='+encodeURIComponent('공개 폴더')]) {
    const request=new Request('http://localhost/api/search?q='+encodeURIComponent(q)+extra);
    stats={bytes:0,queries:0}; const a=await (await before(request)).json();const measuredBefore={...stats};
    stats={bytes:0,queries:0}; const b=await (await after(request)).json();
    const key=x=>[x.sourceType,x.id,x.searchRank,x.searchExactScore];
    assert.deepEqual(b.results.map(key),a.results.map(key),q+extra);
    assert.deepEqual(b.related,a.related); assert.deepEqual(b.subjects,a.subjects);
    oldBytes+=measuredBefore.bytes;newBytes+=stats.bytes;checks++;
  }
}
assert.ok(newBytes<oldBytes*.55,'candidate body transfer must fall substantially');
db.exec(`UPDATE contributions SET custom_materials_json='{"recall":{"shortCards":[{"question":"질문","answer":"정답"}]}}' WHERE id='c0'`);
stats={bytes:0,queries:0};
const summary=await (await after(new Request('http://localhost/api/search?q='+encodeURIComponent('보인고 2026 국어 0')+'&summary=1'))).json();
const card=summary.results.find(x=>x.id==='c0'); assert.equal(card.isSummary,1);assert.equal(card.materialCount,1);assert.equal(card.customMaterialsJson,null);assert.ok(card.extractedTextPreview.length<=160);
// A replaced/private record must not leak even if a stale search row remains.
db.exec("UPDATE contributions SET status='replaced' WHERE id='c0'");stats={bytes:0,queries:0};
const result=await (await after(new Request('http://localhost/api/search?q='+encodeURIComponent('보인고 2026 국어 0')))).json();
assert.ok(!result.results.some(row=>row.id==='c0'));
console.log(JSON.stringify({passed:true,searchComparisons:checks,oldDatabaseResultBytes:oldBytes,newDatabaseResultBytes:newBytes,reductionPercent:Math.round((1-newBytes/oldBytes)*100)}));
