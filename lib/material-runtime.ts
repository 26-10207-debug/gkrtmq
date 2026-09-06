import { getRuntimeEnv } from "@/db/runtime";
import { storedAttachments } from "@/lib/contribution-attachments";
import { contentTypeFor } from "@/lib/upload-types";
import { MAX_PACKAGE_BYTES, safePackagePath, unpackWebPackage, type WebPackage } from "@/lib/web-package";

export type RuntimeSession = { sourceId: string; sourceKind: "draft" | "public"; attachmentIndex: number; ownerId: string | null };
export async function tokenHash(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((part) => part.toString(16).padStart(2, "0")).join("");
}
export async function runtimeAttachments(session: RuntimeSession) {
  const { DB } = getRuntimeEnv();
  const row = session.sourceKind === "draft"
    ? await DB.prepare("SELECT attachments_json AS attachmentsJson FROM contribution_drafts WHERE id = ? AND owner_id = ?").bind(session.sourceId, session.ownerId).first<{ attachmentsJson: string }>()
    : await DB.prepare("SELECT attachments_json AS attachmentsJson, original_name AS originalName, content_type AS contentType, object_key AS objectKey FROM contributions WHERE id = ? AND status IN ('published','published_ai') AND text_only = 0").bind(session.sourceId).first<{ attachmentsJson: string; originalName: string; contentType: string; objectKey: string }>();
  if (!row) throw new Error("실행할 자료를 찾을 수 없습니다.");
  const legacy = row as { originalName?: string; contentType?: string; objectKey?: string };
  return storedAttachments(row.attachmentsJson, { originalName: legacy.originalName || "", contentType: legacy.contentType || "", objectKey: legacy.objectKey || "" });
}
let cached: { key: string; value: WebPackage } | null = null;
export async function loadRuntimePackage(session: RuntimeSession) {
  const attachments = await runtimeAttachments(session);
  const attachment = attachments[session.attachmentIndex];
  if (!attachment || !/\.(html?|zip)$/i.test(attachment.originalName)) throw new Error("HTML 파일 또는 웹용 ZIP을 선택해 주세요.");
  const bundle = /\.zip$/i.test(attachment.originalName) ? [attachment] : attachments.filter((file) => file.role !== "corrected");
  const key = attachment.objectKey + ":" + bundle.map((file) => file.objectKey).join("|");
  if (cached?.key === key) return cached.value;
  cached = null;
  const { UPLOADS } = getRuntimeEnv();
  const files: Record<string, Uint8Array> = Object.create(null);
  let total = 0; let pkg: WebPackage | null = null;
  for (const file of bundle) {
    const object = await UPLOADS.get(file.objectKey);
    if (!object) throw new Error("원본 파일을 찾을 수 없습니다.");
    total += object.size;
    if (total > MAX_PACKAGE_BYTES) throw new Error("한 번에 실행할 자료는 16MB까지입니다.");
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (/\.zip$/i.test(attachment.originalName)) pkg = unpackWebPackage(bytes, file.originalName);
    else {
      if (safePackagePath(file.originalName) !== file.originalName) throw new Error("파일 이름에 경로로 사용할 수 없는 문자가 있습니다. 이름을 바꾸거나 ZIP으로 올려 주세요.");
      if (Object.hasOwn(files, file.originalName)) throw new Error("동일한 파일 이름이 있습니다. 폴더를 포함한 ZIP으로 올려 주세요.");
      files[file.originalName] = bytes;
    }
  }
  pkg ||= { files, entry: attachment.originalName };
  if (!pkg.entry) throw new Error("실행할 index.html을 찾지 못했습니다. 웹용 빌드 파일을 ZIP에 넣거나 dcl.json에 시작 파일을 지정해 주세요.");
  cached = { key, value: pkg };
  return pkg;
}
export function runtimeHeaders(path: string, prefix: string) {
  const cdns = "https://cdn.jsdelivr.net https://esm.sh https://unpkg.com";
  const csp = `sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' ${prefix} ${cdns}; style-src 'unsafe-inline' ${prefix} https://fonts.googleapis.com; img-src ${prefix} data: blob:; media-src ${prefix} blob:; font-src ${prefix} https://fonts.gstatic.com data:; connect-src ${prefix} ${cdns}; worker-src ${prefix} blob:; frame-src 'none'; base-uri 'none'; form-action 'none'`;
  return new Headers({ "Content-Type": contentTypeFor(path), "Content-Security-Policy": csp, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store", "Permissions-Policy": "camera=(), microphone=(), geolocation=()" });
}

export const runtimeBridge = `<script>(()=>{const pending=new Map();let n=0;window.DCL=Object.freeze({loadState:()=>call('loadState'),saveState:value=>call('saveState',value)});function call(method,value){return new Promise((resolve,reject)=>{const id=String(++n);const timer=setTimeout(()=>{pending.delete(id);reject(new Error('저장 연결 시간이 초과되었습니다.'))},15000);pending.set(id,{resolve,reject,timer});parent.postMessage({channel:'dcl-runtime-v1',id,method,value},'*')})}addEventListener('message',e=>{if(e.source!==parent||e.data?.channel!=='dcl-runtime-v1'||!e.data.reply)return;const p=pending.get(e.data.id);if(!p)return;clearTimeout(p.timer);pending.delete(e.data.id);e.data.error?p.reject(new Error(e.data.error)):p.resolve(e.data.value)});addEventListener('load',()=>parent.postMessage({channel:'dcl-runtime-v1',method:'ready'},'*'));addEventListener('error',()=>parent.postMessage({channel:'dcl-runtime-v1',method:'runtimeError'},'*'));})();</script>`;
