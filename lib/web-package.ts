import { strFromU8, unzipSync } from "fflate";
import { contentTypeFor, isTextSource } from "./upload-types";

export const MAX_PACKAGE_BYTES = 16 * 1024 * 1024;
export const MAX_PACKAGE_FILES = 256;
export type WebPackage = { files: Record<string, Uint8Array>; entry: string | null; viewport?: {width:number;height:number;mode?:"fit"|"mobile"} };

export function safePackagePath(path: string) {
  if (!path || path.startsWith("/") || /[\\?#:]/.test(path) || [...path].some((char) => char.charCodeAt(0) < 32)) return null;
  const parts = path.split("/").filter((part) => part !== ".");
  if (parts.some((part) => !part || part === "..")) return null;
  return parts.join("/");
}

export function unpackWebPackage(bytes: Uint8Array, name: string): WebPackage {
  if (!/\.zip$/i.test(name)) {
    if (safePackagePath(name) !== name || bytes.byteLength > MAX_PACKAGE_BYTES) throw new Error("올바르지 않은 파일 이름 또는 크기입니다.");
    return { files: { [name]: bytes }, entry: /\.html?$/i.test(name) ? name : null };
  }
  let total = 0; let count = 0;
  const files = unzipSync(bytes, { filter: (file) => {
    if (++count > MAX_PACKAGE_FILES) throw new Error("ZIP은 최대 256개 항목까지 열 수 있습니다.");
    total += file.originalSize;
    if (total > MAX_PACKAGE_BYTES || file.originalSize > MAX_PACKAGE_BYTES) throw new Error("ZIP의 압축 해제 용량은 16MB까지입니다.");
    if (file.name.endsWith("/")) return false;
    if (safePackagePath(file.name) !== file.name) throw new Error("ZIP에 올바르지 않은 파일 경로가 있습니다.");
    return !file.name.startsWith("__MACOSX/");
  } });
  if (Object.values(files).reduce((sum, file) => sum + file.byteLength, 0) > MAX_PACKAGE_BYTES) throw new Error("ZIP의 압축 해제 용량은 16MB까지입니다.");
  let entry: string | null = null; let viewport: WebPackage["viewport"];
  const manifestName = Object.keys(files).find((path) => /(^|\/)dcl\.json$/.test(path));
  if (manifestName) {
    if (files[manifestName].byteLength > 16_384) throw new Error("dcl.json 설명 파일이 너무 큽니다.");
    const manifest = JSON.parse(strFromU8(files[manifestName])) as { version?: number; entry?: string; viewport?: WebPackage["viewport"] };
    if (manifest.version !== 1 || typeof manifest.entry !== "string") throw new Error("dcl.json에는 version: 1과 entry가 필요합니다.");
    if(manifest.viewport){const v=manifest.viewport;if(!Number.isInteger(v.width)||!Number.isInteger(v.height)||v.width<240||v.width>4096||v.height<240||v.height>4096||(v.mode!==undefined&&!["fit","mobile"].includes(v.mode)))throw new Error("화면 크기는 240–4096 사이 정수로 지정해 주세요.");viewport=v;}
    const prefix = manifestName.slice(0, manifestName.lastIndexOf("/") + 1);
    entry = safePackagePath(prefix + manifest.entry);
    if (!entry || !Object.hasOwn(files, entry) || !/\.html?$/i.test(entry)) throw new Error("설명 파일의 HTML 시작점을 찾을 수 없습니다.");
  } else {
    const candidates = Object.keys(files).filter((path) => /(^|\/)index\.html?$/i.test(path)).sort((a, b) => a.split("/").length - b.split("/").length);
    entry = files["index.html"] ? "index.html" : candidates.length === 1 ? candidates[0] : null;
  }
  return { files, entry, viewport };
}

export function packageText(pkg: WebPackage) {
  const paths = Object.keys(pkg.files);
  let result = `파일 목록:\n${paths.join("\n")}\n`;
  for (const path of paths) {
    if (!isTextSource(path, contentTypeFor(path)) || result.length >= 100_000) continue;
    result += `\n--- ${path} ---\n${strFromU8(pkg.files[path].subarray(0, 100_000))}\n`;
  }
  return result.slice(0, 100_000);
}
