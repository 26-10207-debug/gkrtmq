import test from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { unpackWebPackage, safePackagePath, MAX_PACKAGE_BYTES } from "../lib/web-package";
import { contentTypeFor, downloadHeaders, isTextSource } from "../lib/upload-types";
import { handleRpc } from "../lib/mcp-protocol";

test("unknown originals stay downloadable; active content cannot execute at raw URLs", () => {
  assert.equal(contentTypeFor("model.unknown"), "application/octet-stream");
  assert.equal(contentTypeFor("index.html", "image/png"), "text/html");
  for (const type of ["text/html", "image/svg+xml", "text/javascript", "application/octet-stream"]) {
    const headers = downloadHeaders("자료.html", type);
    assert.match(headers.get("Content-Disposition")!, /^attachment;/);
    assert.match(headers.get("Content-Security-Policy")!, /sandbox/);
  }
  assert.match(downloadHeaders("photo.jpg", "image/jpeg").get("Content-Disposition")!, /^inline;/);
  assert.ok(isTextSource("lesson.py")); assert.ok(isTextSource("simulation.tsx"));
});
test("ZIP entry detection and explicit entry preserve relative asset paths", () => {
  const pkg = unpackWebPackage(zipSync({ "lesson/index.html": strToU8("<h1>Quiz</h1>"), "lesson/game.js": strToU8("let score=0") }), "quiz.zip");
  assert.equal(pkg.entry, "lesson/index.html"); assert.ok(pkg.files["lesson/game.js"]);
  const explicit = unpackWebPackage(zipSync({ "dcl.json": strToU8('{"version":1,"entry":"pages/quiz.html"}'), "pages/quiz.html": strToU8("Hello") }), "quiz.zip");
  assert.equal(explicit.entry, "pages/quiz.html");
  assert.equal(unpackWebPackage(zipSync({ "script.py": strToU8("print(1)") }), "code.zip").entry, null);
});
test("ZIP traversal, malformed manifests and oversized expanded content are rejected", () => {
  for (const path of ["../secret", "/root", "a/../../b", "a\\b", "a?b", "a#b", "C:x"]) assert.equal(safePackagePath(path), null);
  assert.throws(() => unpackWebPackage(zipSync({ "../evil.html": strToU8("evil") }), "evil.zip"));
  assert.throws(() => unpackWebPackage(zipSync({ "dcl.json": strToU8('{"version":1,"entry":"../index.html"}') }), "evil.zip"));
  assert.throws(() => unpackWebPackage(zipSync({ "huge.txt": new Uint8Array(MAX_PACKAGE_BYTES + 1) }), "large.zip"), /16MB/);
  assert.throws(() => unpackWebPackage(zipSync(Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`${i}.txt`, strToU8("a")]))), "many.zip"), /256/);
});
test("MCP handshake, notifications and tools conform to JSON-RPC contracts", async () => {
  const call = async (name: string, args: Record<string, unknown>) => ({ results: [{ id: args.query, title: name, url: "https://example.test" }] });
  const init = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, call);
  assert.ok(init && "result" in init);
  assert.equal((init?.result as { protocolVersion: string }).protocolVersion, "2025-03-26");
  assert.equal(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, call), null);
  const search = await handleRpc({ jsonrpc: "2.0", id: "q", method: "tools/call", params: { name: "search", arguments: { query: "physics" } } }, call);
  assert.ok(search && "result" in search);
  assert.equal(search?.id, "q");
  assert.equal(JSON.parse((search?.result as { content: { text: string }[] }).content[0].text).results[0].id, "physics");
});
test("MCP rejects invalid requests and cannot invoke writes or invalid arguments", async () => {
  let called = false; const call = async () => { called = true; };
  for (const message of [null, [], { jsonrpc: "2.0", id: {}, method: "ping" }, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "delete", arguments: {} } }, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "read_file", arguments: { id: "x", offset: -1 } } }, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search", arguments: { query: "x", private: true } } }]) {
    const response = await handleRpc(message, call); assert.ok(response && "error" in response);
  }
  assert.equal(called, false);
  const error = await handleRpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "fetch", arguments: { id: "missing" } } }, async () => { throw new Error("Not public"); });
  assert.ok(error && "result" in error);
  assert.equal((error?.result as { isError: boolean }).isError, true);
});
