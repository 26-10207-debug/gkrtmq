"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";

const subscribe = () => () => {};

export default function ConnectionGuide() {
  const origin = useSyncExternalStore(subscribe, () => window.location.origin, () => "");
  const [copied, setCopied] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(`${origin}/api/mcp`); setCopied(true); } catch { setCopied(false); } }
  return <main className="connection-guide">
    <Link className="back-button" href="/">← Dumb Can Learn</Link>
    <h1>내 GPT에서 자료 가져오기</h1>
    <p>ChatGPT·Codex에 덤캔런을 연결하면 공개 학습 자료를 검색하고 원문과 코드를 읽을 수 있습니다.</p>
    <section><h2>MCP 연결</h2><label htmlFor="mcp-url">연결 URL</label><div className="connection-url"><input id="mcp-url" readOnly value={origin ? `${origin}/api/mcp` : ""} onFocus={(event) => event.currentTarget.select()} /><button type="button" className="primary-button" onClick={copy}>{copied ? "복사됨" : "복사"}</button></div>
      <ol><li>사용하는 ChatGPT·Codex의 MCP 서버 연결 설정을 엽니다.</li><li>위 URL을 추가하고, 인증 방식은 ‘없음’을 선택합니다.</li><li>연결 후 “덤캔런에서 돌림힘 자료를 찾아 설명해 줘”처럼 요청합니다.</li></ol>
      <p>공개 자료 조회에는 OpenAI API 키가 필요하지 않습니다. 비공개 초안·계정 정보·개인 학습 기록은 제공하지 않습니다. 연결 기능의 이용 가능 여부는 사용하는 앱과 계정 설정에 따라 다릅니다.</p>
      <a href="https://developers.openai.com/plugins/build/mcp-server" target="_blank" rel="noreferrer">공식 MCP 연결 안내 ↗</a>
    </section>
    <section><h2>가져올 수 있는 내용</h2><ul><li>자료·참고 자료·공개 폴더 검색</li><li>자료 본문, 학습 도구 내용, 출처와 첨부 파일 목록</li><li>코드와 텍스트 원문, ZIP 안의 파일 목록과 개별 소스</li></ul><p>이미지·영상 등은 원본 링크로 제공합니다. 자료를 GPT에 연결해도 업로드한 프로그램이 자동으로 실행되지는 않습니다.</p></section>
    <section id="web-materials"><h2>GPT로 실행 자료 만들기</h2><p>아래 요청을 GPT에 전달하고, 완성된 HTML 또는 ZIP을 ‘자료 기여’에서 업로드하세요.</p>
      <blockquote>덤캔런에 올릴 학습 자료를 만들어 줘. 브라우저에서 실행되는 HTML·CSS·JavaScript로 만들고, 휴대폰에서도 터치로 사용할 수 있게 해 줘. 단일 HTML 또는 index.html과 필요한 파일을 포함한 ZIP으로 제공해 줘. 서버와 API 키 없이 동작하도록 하고, 설명과 출처를 README.md에 함께 적어 줘.</blockquote>
      <p>파일당 20MB, 최대 5개, 합계 32MB까지 보관합니다. 웹 ZIP 실행은 압축 해제 후 16MB·256개 항목까지 지원합니다. 설치형 프로그램과 개발용 소스는 보관할 수 있으며, 웹 실행에는 브라우저용 빌드가 필요합니다.</p>
      <div className="connection-downloads"><a className="primary-button" href="/examples/learning-game.zip" download>학습 게임 예제 ZIP</a><a className="secondary-button" href="/web-material-guide.md" target="_blank" rel="noreferrer">제작 규격 보기</a></div>
    </section>
    <details><summary>개발용 공개 API</summary><p>인증 없이 공개 자료를 읽는 API입니다.</p><code>GET /api/public/search?q=검색어</code><code>GET /api/public/materials/자료ID</code><p>MCP 도구: search, fetch, read_file</p></details>
  </main>;
}
