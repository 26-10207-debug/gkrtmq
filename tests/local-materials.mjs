// Creates disposable fixtures in the LOCAL development database only.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const base = 'http://127.0.0.1:3000';
const unique = randomUUID();
let checks = 0;
async function request(path, options = {}, status = 200) {
  const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(90000) });
  assert.equal(response.status, status, `${path}: ${response.status} ${response.status !== status ? await response.text() : ''}`);
  checks++; return response;
}
const json = (body, cookie = '') => ({ method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
async function signup(label) {
  const response = await request('/api/auth/sign-up/email', json({ name: 'Local contract ' + label, email: `${label}-${unique}@example.invalid`, password: randomUUID() }));
  const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie); return cookie;
}
await request('/api/public/search?q=sample');
const owner = await signup('owner'); const other = await signup('other');
const archive = await readFile(new URL('../public/examples/learning-game.zip', import.meta.url));
const form = new FormData(); form.set('title', `Contract-${unique}`); form.set('subject', '수학'); form.append('files', new File([archive], 'learning-game.zip', { type: 'application/zip' }));
const created = await (await request('/api/drafts', { method: 'POST', headers: { Cookie: owner }, body: form }, 201)).json();
const draftId = created.draft.id;
assert.equal(created.draft.attachments.length, 1);
await request(`/api/public/materials/contribution:${draftId}`, {}, 404);
await request('/api/runtime-launch', json({ id: draftId, kind: 'draft', attachment: 0 }), 401);
await request('/api/runtime-launch', json({ id: draftId, kind: 'draft', attachment: 0 }, other), 422);
const launch = await (await request('/api/runtime-launch', json({ id: draftId, kind: 'draft', attachment: 0 }, owner))).json();
const html = await request(launch.url);
assert.match(html.headers.get('Content-Security-Policy'), /sandbox allow-scripts/);
assert.ok(!html.headers.get('Content-Security-Policy').includes('allow-same-origin'));
assert.match(await html.text(), /window.DCL/);
const js = await request(launch.url.replace(/index.html$/, 'game.js'));
assert.match(js.headers.get('Content-Type'), /javascript/);
assert.equal(js.headers.get('Access-Control-Allow-Origin'), '*');
await request(launch.url.replace(/index.html$/, 'missing.js'), {}, 404);
await request('/api/runtime/' + '0'.repeat(64) + '/index.html', {}, 410);
await request(created.draft.attachments[0].url, {}, 401);
await request('/api/runtime-launch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }, 400);
await request('/api/runtime-state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }, 400);
console.log('Draft authorization, sandbox headers, relative JS, expired sessions: passed');

const publish = new FormData();
for (const [key,value] of Object.entries({ draftId, title: `Contract-${unique}`, subject: '수학', sourceNote: 'Local API contract fixture', licenseConfirmed: 'true', publishMode: 'instant', extractedTexts: '["덧셈 게임 소스 코드"]' })) publish.set(key,value);
const published = await (await request('/api/contributions', { method: 'POST', headers: { Cookie: owner }, body: publish }, 201)).json();
const id = published.contribution.id;
const rpc = async (name,args) => (await request('/api/mcp', json({ jsonrpc: '2.0', id: checks, method: 'tools/call', params: { name, arguments: args } }))).json();
const init = await (await request('/api/mcp', json({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'local-contract', version: '1' } } }))).json();
assert.equal(init.result.protocolVersion, '2025-06-18');
await request('/api/mcp', json({ jsonrpc: '2.0', method: 'notifications/initialized' }), 202);
const search = JSON.parse((await rpc('search', { query: unique })).result.content[0].text);
assert.ok(search.results.some(item => item.id === `contribution:${id}`));
const fetched = JSON.parse((await rpc('fetch', { id: `contribution:${id}` })).result.content[0].text);
assert.equal(fetched.files.length,1); assert.ok(fetched.url.includes('material=')); assert.ok(!JSON.stringify(fetched).includes('objectKey'));
const listing = JSON.parse((await rpc('read_file', { id })).result.content[0].text);
assert.equal(listing.entry,'index.html'); assert.ok(listing.files.some(file => file.name === 'game.js'));
const code = JSON.parse((await rpc('read_file', { id, path: 'game.js' })).result.content[0].text);
assert.match(code.text, /DCL.saveState/);
const raw = await request(`/api/files?id=${id}`); assert.match(raw.headers.get('Content-Disposition'), /^attachment;/);
assert.equal((await raw.arrayBuffer()).byteLength,archive.length);
await request(`/api/contributions?id=${id}`);
await request('/api/runtime-launch',json({ id, kind: 'public', attachment: 0 }));
await request('/api/runtime-state',json({id,state:{score:12}},owner));
const state = await (await request(`/api/runtime-state?id=${id}`,{headers:{Cookie:owner}})).json(); assert.equal(state.state.score,12);
const isolated = await (await request(`/api/runtime-state?id=${id}`,{headers:{Cookie:other}})).json(); assert.equal(isolated.state,null);
await request(`/api/runtime-state?id=${id}`,{},401);
await request('/api/runtime-state',{...json({id,state:{score:0}},owner),headers:{...json({},owner).headers,Origin:'https://untrusted.invalid'}},403);
console.log('Public MCP search/fetch/ZIP source, public originals, per-user state: passed');

const any = new FormData(); any.append('files', new File([new Uint8Array([0,1,2,255])], 'data.customformat')); any.set('subject','기타');
const binary = await (await request('/api/drafts',{method:'POST',headers:{Cookie:owner},body:any},201)).json();
assert.equal(binary.draft.attachments[0].contentType,'application/octet-stream');
const tooMany = new FormData(); for(let n=0;n<6;n++)tooMany.append('files',new File(['x'],`${n}.txt`));
await request('/api/drafts',{method:'POST',headers:{Cookie:owner},body:tooMany},413);
const tooLarge = new FormData(); tooLarge.append('files',new File([new Uint8Array(20*1024*1024+1)],'large.bin'));
await request('/api/drafts',{method:'POST',headers:{Cookie:owner},body:tooLarge},413);
await request('/connect'); await request('/web-material-guide.md'); await request('/examples/learning-game.zip');
console.log(`PASS: ${checks} local HTTP checks. No production data used.`);
