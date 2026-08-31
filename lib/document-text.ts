"use client";

import { unzipSync, strFromU8 } from "fflate";

function normalizeText(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 100_000);
}

function readDocx(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const documentXml = files["word/document.xml"];
  if (!documentXml) throw new Error("Word 본문을 찾을 수 없습니다.");
  const xml = strFromU8(documentXml);
  const paragraphs = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
  const decoded = paragraphs.map((paragraph) => {
    const withBreaks = paragraph.replace(/<w:(?:br|cr)\b[^/>]*\/?>(?:<\/w:(?:br|cr)>)?/g, "\n");
    return withBreaks.replace(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g, (_, content) => content.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  }).filter(Boolean).join("\n");
  return normalizeText(decoded);
}

async function readPdf(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes });
  const pdf = await task.promise;
  const pages: string[] = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
  }
  return normalizeText(pages.join("\n\n"));
}

export async function extractDocumentText(file: File) {
  const type = file.type;
  if (type === "text/plain" || type === "text/markdown" || /\.(txt|md)$/i.test(file.name)) return normalizeText(await file.text());
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || /\.docx$/i.test(file.name)) return readDocx(bytes);
  if (type === "application/pdf" || /\.pdf$/i.test(file.name)) return readPdf(bytes);
  return "";
}

export function isImageFile(file: File | null) {
  return Boolean(file && ["image/png", "image/jpeg", "image/webp"].includes(file.type));
}
