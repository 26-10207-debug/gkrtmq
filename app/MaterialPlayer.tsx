"use client";

import { useEffect, useRef, useState } from "react";

type PlayerProps = { sourceId?: string; kind?: "draft" | "public"; attachment?: number };
export function MaterialPlayer(props: PlayerProps) {
  return <RuntimePlayer key={`${props.kind || "public"}:${props.sourceId}:${props.attachment || 0}`} {...props} />;
}
function RuntimePlayer({ sourceId, kind = "public", attachment = 0 }: PlayerProps) {
  const [url, setUrl] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenBusy, setFullscreenBusy] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null); const container = useRef<HTMLDivElement>(null); const previewState = useRef<unknown>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    const syncFullscreen = () => setFullscreen(Boolean(document.fullscreenElement && container.current?.contains(document.fullscreenElement)));
    syncFullscreen();
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);
  async function toggleFullscreen() {
    const player = container.current;
    if (!player || fullscreenBusy) return;
    setFullscreenBusy(true);
    try {
      if (document.fullscreenElement && player.contains(document.fullscreenElement)) {
        await document.exitFullscreen();
      } else if (player.requestFullscreen) {
        await player.requestFullscreen();
      } else {
        setMessage("이 브라우저에서는 전체 화면을 지원하지 않습니다.");
      }
    } catch {
      setMessage(document.fullscreenElement ? "전체 화면을 해제하지 못했습니다. 다시 누르거나 Esc 키를 눌러 주세요." : "전체 화면으로 전환하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setFullscreenBusy(false);
    }
  }
  useEffect(() => {
    async function receive(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || event.origin !== "null" || event.data?.channel !== "dcl-runtime-v1") return;
      const data = event.data as { id?: string; method?: string; value?: unknown };
      if (data.method === "ready") { setBusy(false); return; }
      if (data.method === "runtimeError") { setMessage("자료 안에서 실행 오류가 발생했습니다. 원본 코드나 필요한 파일을 확인해 주세요."); setBusy(false); return; }
      if (typeof data.id !== "string" || data.id.length > 64 || !["loadState", "saveState"].includes(data.method || "")) return;
      const target = event.source as Window;
      try {
        if (JSON.stringify(data.value ?? null).length > 65_536) throw new Error("학습 기록은 64KB까지 저장할 수 있습니다.");
        let value: unknown;
        if (kind === "draft") { if (data.method === "saveState") previewState.current = data.value; value = data.method === "loadState" ? previewState.current : { ok: true }; }
        else {
          const response = await fetch(data.method === "loadState" ? `/api/runtime-state?id=${encodeURIComponent(sourceId!)}` : "/api/runtime-state", data.method === "saveState" ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sourceId, state: data.value }) } : undefined);
          const result = await response.json() as { state?: unknown; error?: string };
          if (!response.ok) throw new Error(result.error || "기록을 저장하지 못했습니다.");
          value = data.method === "loadState" ? result.state : { ok: true };
        }
        target.postMessage({ channel: "dcl-runtime-v1", reply: true, id: data.id, value }, "*");
      } catch (error) { target.postMessage({ channel: "dcl-runtime-v1", reply: true, id: data.id, error: error instanceof Error ? error.message : "저장 오류" }, "*"); }
    }
    window.addEventListener("message", receive); return () => window.removeEventListener("message", receive);
  }, [sourceId, kind]);
  async function start() {
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    setBusy(true); setMessage(""); setUrl("");
    try {
      const response = await fetch("/api/runtime-launch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sourceId, kind, attachment }), signal: controller.signal });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || "실행 자료를 열지 못했습니다.");
      if (!controller.signal.aborted) setUrl(data.url);
    } catch (error) { if (!controller.signal.aborted) { setMessage(error instanceof Error ? error.message : "실행 오류"); setBusy(false); } }
  }
  function stop() {
    abort.current?.abort(); setUrl(""); setBusy(false);
    if (document.fullscreenElement && container.current?.contains(document.fullscreenElement)) {
      void document.exitFullscreen().catch(() => setMessage("전체 화면 해제 버튼을 누르거나 Esc 키를 눌러 주세요."));
    }
  }
  return <div ref={container} className="material-player" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
    <div className="material-player-toolbar"><strong>웹 자료</strong><div>
      {!url ? <button type="button" className="primary-button compact" disabled={!sourceId || busy} onClick={start}>{busy ? "준비 중…" : "▶ 실행"}</button> : <><button type="button" className="secondary-button" onClick={stop}>중지</button><button type="button" className="secondary-button" onClick={start}>다시 시작</button></>}
      {(url || fullscreen) && <button type="button" className="secondary-button" aria-pressed={fullscreen} disabled={fullscreenBusy} onClick={toggleFullscreen}>{fullscreen ? "전체 화면 해제" : "전체 화면"}</button>}
    </div></div>
    {url ? <iframe ref={frame} src={url} title="업로드한 웹 자료 실행" sandbox="allow-scripts" allow="fullscreen" allowFullScreen referrerPolicy="no-referrer" /> : <div className="material-player-empty"><span aria-hidden="true">▷</span><strong>{sourceId ? "준비된 웹 자료를 실행해 보세요" : "원본을 저장하면 실행할 수 있어요"}</strong><p>HTML 파일이나 index.html이 포함된 웹용 ZIP을 열 수 있습니다.</p><a href="/connect#web-materials" target="_blank" rel="noreferrer">제작 방법과 예제</a></div>}
    {busy && url && <p role="status">자료를 불러오는 중입니다…</p>}
    {message && <p className="material-player-message" role="status">{message}</p>}
  </div>;
}

type TextPreviewProps = { url?: string; file?: File };
export function SourceTextPreview(props: TextPreviewProps) {
  return <TextPreviewReader key={props.url || `${props.file?.name}:${props.file?.size}:${props.file?.lastModified}`} {...props} />;
}
function TextPreviewReader({ url, file }: TextPreviewProps) {
  const [text, setText] = useState("본문을 읽는 중…");
  useEffect(() => {
    let active = true; const controller = new AbortController();
    const promise = file ? file.slice(0, 400_000).text() : fetch(url!, { signal: controller.signal }).then((response) => { if (!response.ok) throw new Error(); return response.text(); });
    void promise.then((value) => { if (active) setText(value.slice(0, 100_000) + (value.length > 100_000 ? "\n\n… 전체 내용은 원본 파일에서 확인하세요." : "")); }).catch(() => { if (active) setText("본문을 읽지 못했습니다. 원본 파일을 다운로드해 주세요."); });
    return () => { active = false; controller.abort(); };
  }, [url, file]);
  // Keyboard users must be able to focus and scroll long source files.
  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
  return <pre className="source-code-preview" tabIndex={0} aria-label="원본 코드·텍스트">{text}</pre>;
}
