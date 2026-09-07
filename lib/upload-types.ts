/** Storage accepts any file. Preview and execution are explicit capabilities. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_UPLOAD_COUNT = 5;
export const MAX_TOTAL_UPLOAD_BYTES = 32 * 1024 * 1024;

const MIME: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  webp: "image/webp", gif: "image/gif", avif: "image/avif", svg: "image/svg+xml",
  txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json",
  html: "text/html", htm: "text/html", css: "text/css", js: "text/javascript",
  mjs: "text/javascript", wasm: "application/wasm", zip: "application/zip",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
export function extension(name: string) { return name.split(".").pop()?.toLowerCase() || ""; }
export function contentTypeFor(name: string, declared = "") {
  return MIME[extension(name)] || (/^[\w.+-]+\/[\w.+-]+$/.test(declared) ? declared : "application/octet-stream");
}
export function isTextSource(name: string, type = "") {
  return /^(text\/|application\/(json|xml|javascript))/.test(type) ||
    /\.(txt|md|mdx|csv|tsv|json|jsonl|xml|yaml|yml|toml|ini|log|html?|css|scss|js|mjs|cjs|jsx|ts|tsx|py|ipynb|java|c|h|cpp|hpp|cs|rs|go|rb|php|sql|sh|ps1|r|lua|tex)$/i.test(name);
}
export function isWebPackage(name: string) { return /\.(html?|zip)$/i.test(name); }
export function isSafeInlineType(type: string) {
  return /^(image\/(png|jpeg|webp|gif|avif)|audio\/[\w.+-]+|video\/[\w.+-]+|application\/pdf)$/.test(type);
}
export function downloadHeaders(name: string, type: string, inline = true) {
  const headers = new Headers({
    "Content-Type": type || "application/octet-stream",
    "Content-Disposition": `${inline && isSafeInlineType(type) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Cache-Control": "private, max-age=60",
  });
  return headers;
}
