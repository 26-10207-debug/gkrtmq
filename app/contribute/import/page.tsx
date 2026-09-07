"use client";

import { useRef, useState } from "react";
import { strFromU8, unzipSync } from "fflate";
import "./style.css";

type Entry = { entry: string; name: string; size: number; sha256: string; text?: string };
type Material = { key: string; folder: string; title: string; subject: string; year: number; collection: string; tags: string[]; sourceNote: string; files: Entry[] };
type Manifest = { version: number; batchId: string; materials: Material[] };
type Item = { id: string; title: string; sourceNote: string; attachments: { size: number }[] };
type Folder = { id: string; title: string; items: Item[] };
type Result = { key: string; title: string; id: string; folderId: string; folder: string; files: number; reused: boolean };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const data = await response.json().catch(() => ({ error: `서버 응답을 읽지 못했습니다 (${response.status}).` }));
  if (!response.ok) throw new Error(data.error || `요청 실패 (${response.status})`);
  return data as T;
}
const post = <T,>(url: string, value: unknown) => api<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });

async function unpack(file: File, full: boolean) {
  if (file.size > 32 * 1024 * 1024) throw new Error(`${file.name}: 묶음은 32MB 이하로 나눠 주세요.`);
  let expanded = 0, count = 0;
  const contents = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter(entry) {
    count++; expanded += entry.originalSize;
    if (count > 256 || expanded > 96 * 1024 * 1024 || entry.originalSize > 20 * 1024 * 1024) throw new Error("묶음의 파일 수 또는 용량 제한을 넘었습니다.");
    return full || entry.name === "manifest.json";
  } });
  if (!contents["manifest.json"]) throw new Error(`${file.name}: 분류 목록이 없습니다.`);
  const manifest = JSON.parse(strFromU8(contents["manifest.json"])) as Manifest;
  if (manifest.version !== 1 || !Array.isArray(manifest.materials) || !manifest.materials.length || manifest.materials.length > 150) throw new Error("지원하지 않는 분류 목록입니다.");
  for (const m of manifest.materials) {
    if (!/^[a-f0-9]{24}$/.test(m.key) || !m.title || m.title.length > 160 || !m.subject || !m.folder || m.folder.length > 120 || typeof m.sourceNote !== "string" || m.sourceNote.length > 3000 || !Array.isArray(m.tags) || !Array.isArray(m.files) || !m.files.length || m.files.length > 5) throw new Error("자료의 제목·과목·파일 정보를 확인해 주세요.");
    let size = 0;
    for (const f of m.files) {
      if (!/^files\/[a-f0-9]{64}\.[a-z0-9]+$/.test(f.entry) || !f.name || !/^[a-f0-9]{64}$/.test(f.sha256) || !Number.isSafeInteger(f.size) || f.size < 1 || f.size > 20 * 1024 * 1024 || (f.text && (typeof f.text !== "string" || f.text.length > 100000))) throw new Error("첨부 파일 정보가 올바르지 않습니다.");
      size += f.size;
    }
    if (size > 32 * 1024 * 1024) throw new Error("한 자료의 첨부 파일 합계는 32MB 이하이어야 합니다.");
  }
  return { manifest, contents };
}

export default function ImportPage() {
  const [packages, setPackages] = useState<{ file: File; manifest: Manifest }[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("과목과 연도가 정리된 자료 묶음을 선택하세요.");
  const [error, setError] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [verified, setVerified] = useState(false);
  const stop = useRef(false);
  const all = packages.flatMap(p => p.manifest.materials);
  const folders = [...new Set(all.map(m => m.folder))];
  const resultFolders = [...new Map(results.map(r => [r.folderId, { id: r.folderId, title: r.folder }])).values()];

  async function select(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError(""); setResults([]); setVerified(false); setPackages([]);
    try {
      const chosen = []; const keys = new Set<string>();
      for (const file of Array.from(files).sort((a, b) => a.name.localeCompare(b.name))) {
        setMessage(`${file.name} 분류 목록 확인 중`);
        const { manifest } = await unpack(file, false);
        for (const material of manifest.materials) {
          if (keys.has(material.key)) throw new Error("같은 자료가 여러 묶음에 중복되어 있습니다.");
          keys.add(material.key);
        }
        chosen.push({ file, manifest });
      }
      setPackages(chosen); setMessage("분류 내용을 확인한 뒤 자료 기여를 시작하세요.");
    } catch (e) { setError(e instanceof Error ? e.message : "자료 묶음을 읽지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function run() {
    setBusy(true); setError(""); setVerified(false); stop.current = false;
    const completed: Result[] = [];
    try {
      const { user } = await api<{ user: { userId: string; displayName: string } }>("/api/account");
      const existing = await api<{ folders: Folder[] }>("/api/folders?mine=1");
      const known = new Map(existing.folders.map(f => [f.title, f]));
      setMessage(`${user.displayName} 계정으로 기여 중`);
      for (const pack of packages) {
        const { manifest, contents } = await unpack(pack.file, true);
        for (const m of manifest.materials) {
          if (stop.current) throw new Error("일시 정지했습니다. 다시 시작하면 등록된 자료는 건너뜁니다.");
          setMessage(`${completed.length + 1}/${all.length} · ${m.title}`);
          const uploads: File[] = [];
          for (const f of m.files) {
            const bytes = contents[f.entry];
            if (!bytes || bytes.length !== f.size) throw new Error(`${f.name}: 파일 크기가 목록과 다릅니다.`);
            const buffer = new Uint8Array(bytes).buffer;
            const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))].map(b => b.toString(16).padStart(2, "0")).join("");
            if (hash !== f.sha256) throw new Error(`${f.name}: 원본 확인에 실패했습니다.`);
            uploads.push(new File([buffer], f.name, { type: f.name.endsWith(".pdf") ? "application/pdf" : "application/octet-stream" }));
          }
          let folder = known.get(m.folder);
          if (!folder) {
            folder = (await post<{ folder: Folder }>("/api/folders", { title: m.folder, description: `${m.year}년 고등학교 1학년 ${m.subject} ${m.collection} 자료. 회차별 문제와 수집된 정답·해설을 함께 보관합니다.`, subject: m.subject, tags: [m.collection, m.subject, String(m.year), "고1"], folderType: "regular" })).folder;
            known.set(m.folder, folder);
          }
          let item = folder.items.find(i => i.sourceNote?.includes(`exam-import-20260907/${m.key}`));
          const reused = !!item;
          if (!item) {
            const storageKey = `exam-import-draft:${user.userId}:${m.key}`;
            let draftId = localStorage.getItem(storageKey);
            if (draftId) {
              try { await api(`/api/drafts?id=${encodeURIComponent(draftId)}`); }
              catch { draftId = null; }
            }
            if (!draftId) {
              draftId = (await post<{ draft: { id: string } }>("/api/drafts", { createEmpty: true, title: m.title, subject: m.subject, tags: m.tags, sourceNote: m.sourceNote, regularFolderIds: [folder.id], pageStart: null, pageEnd: null, publishMode: "instant" })).draft.id;
              localStorage.setItem(storageKey, draftId);
            }
            const form = new FormData();
            for (const file of uploads) form.append("files", file);
            for (const [key, value] of Object.entries({ draftId, title: m.title, subject: m.subject, tags: m.tags.join(","), sourceNote: m.sourceNote, licenseConfirmed: "true", publishMode: "instant", ocr: "false", textOnly: "false", splitQuestions: "false", createRecall: "false", extractedTexts: JSON.stringify(m.files.map(f => f.text || "")) })) form.set(key, value);
            const response = await api<{ contribution: Item & { status: string } }>("/api/contributions", { method: "POST", body: form });
            if (response.contribution.status !== "published") throw new Error(`${m.title}: 공개 상태를 확인해 주세요.`);
            item = response.contribution; folder.items.push(item); localStorage.removeItem(storageKey);
          }
          if (item.attachments.length !== m.files.length || item.attachments.some((f, i) => f.size !== m.files[i].size)) throw new Error(`${m.title}: 저장된 첨부 파일을 확인해 주세요.`);
          completed.push({ key: m.key, title: m.title, id: item.id, folderId: folder.id, folder: m.folder, files: m.files.length, reused });
          setResults([...completed]);
        }
      }
      setMessage("공개 폴더와 첨부 파일 수를 확인하고 있습니다.");
      for (const id of new Set(completed.map(r => r.folderId))) {
        const { folder } = await api<{ folder: Folder }>(`/api/folders?id=${encodeURIComponent(id)}`);
        for (const r of completed.filter(r => r.folderId === id)) {
          const item = folder.items.find(i => i.id === r.id);
          if (!item || item.attachments.length !== r.files) throw new Error(`${r.title}: 폴더 연결 확인이 필요합니다.`);
        }
      }
      setVerified(true); setMessage(`${completed.length}개 자료 기여와 폴더 분류를 완료했습니다.`);
    } catch (e) { setError(e instanceof Error ? e.message : "등록 중 오류가 발생했습니다."); }
    finally { setBusy(false); }
  }

  return <main className="exam-import">
    <a href="/">← 자료실</a>
    <h1>자료 일괄 기여</h1>
    <p>과목·연도별로 폴더를 만들고 문제와 정답을 함께 등록합니다.</p>
    <label className="import-picker">분류된 자료 묶음 선택<input type="file" accept=".zip" multiple disabled={busy} onChange={e => void select(e.target.files)} /></label>
    {all.length > 0 && <section><h2>등록할 자료</h2><p>{folders.length}개 폴더 · {all.length}개 자료 · {all.reduce((n, m) => n + m.files.length, 0)}개 파일</p>
      <details><summary>과목·연도별 목록 보기</summary><ul>{folders.map(f => <li key={f}>{f} · {all.filter(m => m.folder === f).length}개 자료</li>)}</ul></details>
      <p>현재 로그인한 계정으로 원본과 추출된 본문을 공개합니다. 이미 등록한 동일 자료는 건너뜁니다.</p>
      <button disabled={busy} onClick={() => void run()}>{results.length ? "등록 상태 확인 / 이어서 기여" : "자료 기여 시작"}</button>
      {busy && <button onClick={() => { stop.current = true; }}>현재 자료까지 마치고 정지</button>}
    </section>}
    <section aria-live="polite"><p data-import-status={verified ? "complete" : busy ? "running" : error ? "error" : "ready"}>{message}</p>
      {all.length > 0 && <progress aria-label="등록 진행률" max={all.length} value={results.length} />}
      <p>{results.length} / {all.length}개 자료 확인 · {results.reduce((n, r) => n + r.files, 0)}개 파일</p>
      {error && <p role="alert">{error}</p>}
    </section>
    {results.length > 0 && <section><h2>기여한 자료</h2><ul>{resultFolders.map(f => <li key={f.id}><a href={`/?material=${encodeURIComponent(`folder:${f.id}`)}`}>{f.title}</a> · {results.filter(r => r.folderId === f.id).length}개 자료</li>)}</ul>
      <details><summary>등록 결과 보기</summary><pre data-import-results>{JSON.stringify({ verified, materials: results.length, files: results.reduce((n, r) => n + r.files, 0), folders: resultFolders, results }, null, 2)}</pre></details>
    </section>}
  </main>;
}
