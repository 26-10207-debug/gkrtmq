"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AuthPanel, SignOutButton } from "./AuthPanel";

type View = "search" | "detail" | "study" | "contribute" | "account" | "pricing";
type StudyMode = "info" | "examples" | "recall" | "plan";

type Asset = {
  id: string;
  title: string;
  description: string;
  type: string;
  tags: string[];
  rating: number;
  reviews: number;
  views: number;
  examples: number;
  questions: number;
  fileUrl?: string;
  sourceNote?: string;
  originalName?: string;
  ownerName?: string;
  createdAt?: string;
  isUpload?: boolean;
  isMine?: boolean;
  mechanicalStatus?: string;
  extractedTextPreview?: string | null;
  questionsJson?: string | null;
  recallJson?: string | null;
  textOnly?: boolean;
  mechanicalError?: string | null;
  sourceUrl?: string;
  sourceName?: string;
  licenseNote?: string;
  accessMode?: "structured_reference" | "external_link";
  isReference?: boolean;
};

type AccountUser = { displayName: string; email: string; authMethod: "chatgpt" | "app" };
type ContributionRecord = {
  id: string;
  title: string;
  originalName: string;
  contentType: string;
  sourceNote: string;
  ownerDisplayName: string;
  viewCount: number;
  createdAt: string;
  status?: string;
  publishMode?: "instant" | "ai_review";
  creditsAwarded?: number;
  errorMessage?: string | null;
  mechanicalStatus?: string;
  extractedTextPreview?: string | null;
  questionsJson?: string | null;
  recallJson?: string | null;
  textOnly?: number;
  mechanicalError?: string | null;
  isMine?: number;
};

type ReferenceRecord = {
  id: string;
  title: string;
  description: string;
  topic: string;
  sourceName: string;
  sourceUrl: string;
  licenseNote: string;
  accessMode: "structured_reference" | "external_link";
  tagsJson: string;
};

function contributionToAsset(item: ContributionRecord): Asset {
  return {
    id: item.id,
    title: item.title,
    description: item.sourceNote || `${item.originalName} · 사용자가 직접 올린 학습 자료`,
    type: "사용자 자료",
    tags: [item.publishMode === "ai_review" ? "AI 검수 완료" : "즉시 공개", item.contentType.split("/").pop()?.toUpperCase() || "파일", item.ownerDisplayName || "기여자"],
    rating: 0,
    reviews: 0,
    views: item.viewCount,
    examples: 0,
    questions: 0,
    fileUrl: item.textOnly ? undefined : `/api/files?id=${encodeURIComponent(item.id)}`,
    sourceNote: item.sourceNote,
    originalName: item.originalName,
    ownerName: item.ownerDisplayName,
    createdAt: item.createdAt,
    isUpload: true,
    isMine: item.isMine === 1,
    mechanicalStatus: item.mechanicalStatus,
    extractedTextPreview: item.extractedTextPreview,
    questionsJson: item.questionsJson,
    recallJson: item.recallJson,
    textOnly: item.textOnly === 1,
    mechanicalError: item.mechanicalError,
  };
}

function referenceToAsset(item: ReferenceRecord): Asset {
  let tags = ["공식 참고", item.sourceName];
  try {
    const parsed = JSON.parse(item.tagsJson) as unknown;
    if (Array.isArray(parsed) && parsed.every((tag) => typeof tag === "string")) tags = parsed;
  } catch {
    // Keep the safe source labels when a legacy reference has malformed tags.
  }
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    type: "공개 참고",
    tags: [item.accessMode === "external_link" ? "외부 링크" : "구조화 참고", ...tags].slice(0, 4),
    rating: 0,
    reviews: 0,
    views: 0,
    examples: 0,
    questions: 0,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    licenseNote: item.licenseNote,
    accessMode: item.accessMode,
    isReference: true,
  };
}

const assets: Asset[] = [
  {
    id: "torque-core",
    title: "돌림힘을 직관적으로 이해하기",
    description: "문을 미는 위치에 따라 회전 효과가 달라지는 이유부터 τ = rF sinθ까지 연결합니다.",
    type: "개념 설명",
    tags: ["AI 구조화", "전문가 검토", "고등 물리"],
    rating: 4.9,
    reviews: 328,
    views: 12840,
    examples: 12,
    questions: 18,
  },
  {
    id: "torque-examples",
    title: "시소·렌치·문손잡이로 보는 돌림힘",
    description: "같은 힘도 작용점과 방향에 따라 결과가 달라지는 일상 사례를 비교합니다.",
    type: "예시·적용",
    tags: ["AI 통합", "사용자 검증", "그림 8개"],
    rating: 4.8,
    reviews: 241,
    views: 9340,
    examples: 16,
    questions: 8,
  },
  {
    id: "torque-recall",
    title: "돌림힘 능동 회상 세트 — 기본에서 평형까지",
    description: "답을 보기 전 힘의 방향과 회전축을 직접 판단하는 단계별 질문입니다.",
    type: "회상 문제",
    tags: ["난이도 조정", "18문항", "약 12분"],
    rating: 4.7,
    reviews: 190,
    views: 6830,
    examples: 6,
    questions: 18,
  },
  {
    id: "torque-misconceptions",
    title: "자주 틀리는 돌림힘 판단 7가지",
    description: "힘이 클수록 무조건 잘 돈다? 회전축·작용선·모멘트 암의 오개념을 반례로 교정합니다.",
    type: "오개념",
    tags: ["AI 중복 제거", "반례 14개", "교사 추천"],
    rating: 4.6,
    reviews: 118,
    views: 4210,
    examples: 14,
    questions: 7,
  },
];

const examples = [
  {
    eyebrow: "대표 예시",
    title: "문손잡이는 왜 경첩에서 멀리 있을까?",
    situation: "같은 20N의 힘으로 문을 밀 때, 경첩에서 10cm 떨어진 곳과 80cm 떨어진 손잡이를 비교해 보세요.",
    prompt: "어느 쪽이 더 쉽게 열릴지, 그리고 왜 그런지 식을 쓰지 않고 먼저 설명해 보세요.",
    answer: "손잡이 쪽이 회전축에서 8배 멀기 때문에 같은 힘으로도 8배 큰 돌림힘을 만듭니다. 회전 효과는 힘의 크기뿐 아니라 회전축에서 작용선까지의 수직 거리에도 비례합니다.",
    takeaway: "회전축에서 멀수록 같은 힘의 회전 효과가 커진다.",
  },
  {
    eyebrow: "조건을 바꾼 예시",
    title: "손잡이를 비스듬히 밀면 어떻게 될까?",
    situation: "손잡이를 문에 수직으로 미는 대신 문 쪽을 향해 30° 비스듬히 민다고 생각해 보세요.",
    prompt: "힘의 크기와 작용점이 같은데도 문이 덜 잘 열리는 이유를 설명해 보세요.",
    answer: "힘 전체가 회전에 쓰이지 않기 때문입니다. 회전 반지름에 수직인 성분 F sinθ만 돌림힘을 만들고, 반지름 방향 성분은 경첩을 누르거나 당길 뿐 회전시키지 못합니다.",
    takeaway: "돌림힘에는 힘의 수직 성분만 기여한다.",
  },
  {
    eyebrow: "반례",
    title: "아주 큰 힘인데도 돌지 않는 경우",
    situation: "문손잡이를 아무리 세게 밀어도 힘의 작용선이 정확히 경첩을 통과한다면 어떻게 될까요?",
    prompt: "힘이 매우 큰데도 돌림힘이 0일 수 있는 이유를 생각해 보세요.",
    answer: "회전축에서 힘의 작용선까지 수직 거리가 0이므로 돌림힘도 0입니다. 힘의 크기만 보고 회전 여부를 판단하면 안 됩니다.",
    takeaway: "작용선이 회전축을 지나면 힘이 커도 돌림힘은 0이다.",
  },
];

const recallQuestions = [
  {
    prompt: "돌림힘의 크기를 결정하는 세 가지 요소를 말하고, 각각 커질 때 어떤 변화가 생기는지 설명해 보세요.",
    answer: "힘의 크기 F, 회전축에서 작용점까지의 거리 r, 두 벡터 사이 각도의 sinθ가 돌림힘을 결정합니다. τ = rF sinθ이며, 나머지 조건이 같다면 각 요소가 커질수록 돌림힘도 커집니다.",
    rubric: ["힘의 크기 F", "회전축으로부터의 거리 r", "힘의 방향 sinθ", "τ = rF sinθ의 관계"],
  },
  {
    prompt: "문손잡이를 문에 수직으로 미는 것이 가장 효과적인 이유를 힘의 성분 관점에서 설명해 보세요.",
    answer: "문에 수직으로 밀면 힘 전체가 회전 반지름에 수직인 성분이 되어 sinθ = 1입니다. 따라서 같은 힘과 거리에서 돌림힘이 최대가 됩니다.",
    rubric: ["수직 성분", "sinθ = 1", "돌림힘 최대"],
  },
  {
    prompt: "물체가 회전 평형을 이루기 위한 돌림힘 조건은 무엇인가요? 시계 방향과 반시계 방향을 포함해 설명해 보세요.",
    answer: "회전축에 대한 알짜 돌림힘이 0이어야 합니다. 즉, 부호를 고려했을 때 시계 방향 돌림힘의 합과 반시계 방향 돌림힘의 합이 같아야 합니다.",
    rubric: ["알짜 돌림힘 0", "시계 방향 합", "반시계 방향 합", "두 합이 같음"],
  },
];

const modes: Array<{ id: StudyMode; number: string; title: string; description: string; meta: string }> = [
  { id: "info", number: "01", title: "정보만 보기", description: "핵심 개념과 공식을 짧고 명확하게 읽습니다.", meta: "약 4분 · AI 없음" },
  { id: "examples", number: "02", title: "예시로 학습", description: "대표 예시, 조건을 바꾼 예시, 반례를 비교합니다.", meta: "약 10분 · AI 없음" },
  { id: "recall", number: "03", title: "능동 회상", description: "답을 보기 전에 직접 설명하고 채점 기준과 비교합니다.", meta: "약 12분 · AI 없음" },
  { id: "plan", number: "04", title: "학습 코스 만들기", description: "목표와 시간에 맞춰 위 학습 도구를 하나의 코스로 묶습니다.", meta: "기본 또는 AI 맞춤" },
];

function formatViews(value: number) {
  return value >= 10000 ? `${(value / 10000).toFixed(1)}만` : value.toLocaleString("ko-KR");
}

export function LearningApp({ user }: { user: AccountUser | null }) {
  const [view, setView] = useState<View>("search");
  const [query, setQuery] = useState("돌림힘");
  const [filter, setFilter] = useState("전체");
  const [selectedAsset, setSelectedAsset] = useState(assets[0]);
  const [studyMode, setStudyMode] = useState<StudyMode>("info");
  const [studyIndex, setStudyIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState(0);
  const [communityAssets, setCommunityAssets] = useState<Asset[]>([]);
  const [referenceAssets, setReferenceAssets] = useState<Asset[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/contributions")
      .then((response) => response.json())
      .then((data: { contributions?: ContributionRecord[] }) => {
        if (active) setCommunityAssets((data.contributions ?? []).map(contributionToAsset));
      })
      .catch(() => undefined);
    fetch("/api/references")
      .then((response) => response.json())
      .then((data: { references?: ReferenceRecord[] }) => {
        if (active) setReferenceAssets((data.references ?? []).map(referenceToAsset));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const allAssets = useMemo(() => [...communityAssets, ...referenceAssets, ...assets], [communityAssets, referenceAssets]);

  const filteredAssets = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return allAssets.filter((asset) => {
      const matchesQuery = !keyword || `${asset.title} ${asset.description} ${asset.tags.join(" ")}`.toLowerCase().includes(keyword) || keyword === "토크";
      return matchesQuery && (filter === "전체" || asset.type === filter);
    });
  }, [allAssets, filter, query]);

  function openAsset(asset: Asset) {
    setSelectedAsset(asset);
    setView("detail");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addPublishedContribution(item: ContributionRecord) {
    const asset = contributionToAsset(item);
    setCommunityAssets((current) => [asset, ...current.filter((existing) => existing.id !== asset.id)]);
  }

  function updatePublishedContribution(item: ContributionRecord) {
    const asset = contributionToAsset(item);
    setCommunityAssets((current) => current.map((existing) => existing.id === asset.id ? asset : existing));
    setSelectedAsset((current) => current.id === asset.id ? asset : current);
  }

  function startStudy(mode: StudyMode) {
    setStudyMode(mode);
    setStudyIndex(0);
    setRevealed(false);
    setAnswer("");
    setConfidence(0);
    setView("study");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveProgress(mode: StudyMode, completedItems: number, score: number) {
    try {
      await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: selectedAsset.id,
          mode,
          completedItems,
          score,
        }),
      });
    } catch {
      // The learning interaction remains usable if progress syncing is temporarily unavailable.
    }
  }

  function nextItem(total: number) {
    const next = Math.min(studyIndex + 1, total - 1);
    setStudyIndex(next);
    setRevealed(false);
    setAnswer("");
    setConfidence(0);
    void saveProgress(studyMode, next + 1, confidence ? confidence * 25 : 0);
  }

  return (
    <div className="app-shell">
      <Header
        query={query}
        onQueryChange={(value) => { setQuery(value); setView("search"); }}
        onLogo={() => setView("search")}
        onContribute={() => setView(user ? "contribute" : "account")}
        onAccount={() => setView("account")}
        onPricing={() => setView("pricing")}
        user={user}
      />

      {view === "search" && (
        <SearchScreen
          query={query}
          filter={filter}
          assets={filteredAssets}
          onFilter={setFilter}
          onQuery={setQuery}
          onOpen={openAsset}
          onUpdated={updatePublishedContribution}
        />
      )}
      {view === "detail" && <DetailScreen asset={selectedAsset} onBack={() => setView("search")} onStart={startStudy} />}
      {view === "study" && (
        <StudyScreen
          mode={studyMode}
          asset={selectedAsset}
          index={studyIndex}
          revealed={revealed}
          answer={answer}
          confidence={confidence}
          onAnswer={setAnswer}
          onReveal={() => setRevealed(true)}
          onConfidence={(value) => { setConfidence(value); void saveProgress(studyMode, studyIndex + 1, value * 25); }}
          onNext={nextItem}
          onClose={() => setView("detail")}
          onMode={startStudy}
        />
      )}
      {view === "contribute" && <ContributionScreen onBack={() => setView("search")} onPublished={addPublishedContribution} />}
      {view === "account" && <AccountScreen user={user} onBack={() => setView("search")} onPricing={() => setView("pricing")} onUpdated={updatePublishedContribution} />}
      {view === "pricing" && <PricingScreen onBack={() => setView("search")} />}
    </div>
  );
}

function Header(props: {
  query: string;
  onQueryChange: (value: string) => void;
  onLogo: () => void;
  onContribute: () => void;
  onAccount: () => void;
  onPricing: () => void;
  user: AccountUser | null;
}) {
  return (
    <header className="topbar">
      <button className="brand" type="button" onClick={props.onLogo} aria-label="검색 홈으로">
        <span className="brand-mark">L</span>
        <span>학습 DB</span>
      </button>
      <label className="global-search">
        <span aria-hidden="true">⌕</span>
        <input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} aria-label="학습 자료 검색" placeholder="무엇을 배우고 싶나요?" />
      </label>
      <div className="header-actions">
        <button className="pricing-link" type="button" onClick={props.onPricing}>요금제</button>
        <button className="account-button" type="button" onClick={props.onAccount} aria-label="내 계정 열기">
          <span>{props.user?.displayName?.slice(0, 1).toUpperCase() || "?"}</span>
          <b>{props.user?.displayName || "계정"}</b>
        </button>
        <button className="primary-button compact" type="button" onClick={props.onContribute}>자료 기여</button>
      </div>
    </header>
  );
}

function SearchScreen(props: {
  query: string;
  filter: string;
  assets: Asset[];
  onFilter: (value: string) => void;
  onQuery: (value: string) => void;
  onOpen: (asset: Asset) => void;
  onUpdated: (item: ContributionRecord) => void;
}) {
  const filters = ["전체", "사용자 자료", "공개 참고", "개념 설명", "예시·적용", "회상 문제", "오개념"];
  return (
    <div className="search-layout">
      <aside className="filter-panel">
        <p className="section-label">자료 유형</p>
        {filters.map((item) => (
          <button key={item} className={props.filter === item ? "filter-button active" : "filter-button"} type="button" onClick={() => props.onFilter(item)}>
            <span>{item}</span><span>{item === "전체" ? assets.length : assets.filter((asset) => asset.type === item).length}</span>
          </button>
        ))}
        <div className="filter-divider" />
        <p className="section-label">게시 원칙</p>
        <p className="sidebar-note"><span className="status-dot" /> 즉시 공개는 보상 없음 · AI 검수 통과 자료는 크레딧 지급</p>
      </aside>

      <main className="results-main">
        <div className="results-heading">
          <div>
            <p className="eyebrow">물리학 · 검색 결과</p>
            <h1>‘{props.query || "전체"}’ 관련 학습 파일</h1>
            <p>{props.assets.length}개 결과 · 기여 자료와 출처가 확인된 참고 자료를 함께 보여드려요.</p>
          </div>
          <select aria-label="정렬 방식" defaultValue="relevance"><option value="relevance">관련도순</option><option value="rating">평가순</option><option value="views">조회순</option></select>
        </div>
        <div className="related-row">
          <span>연관</span>
          {["토크", "회전 평형", "모멘트 암", "각운동량"].map((item) => <button type="button" key={item} onClick={() => props.onQuery(item)}>{item}</button>)}
        </div>
        <div className="result-list">
          {props.assets.map((asset, index) => (
            <div className="search-result" key={asset.id}>
            <button className="result-card" type="button" onClick={() => props.onOpen(asset)}>
              <span className="file-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="file-copy">
                <span className="file-title">{asset.title}</span>
                <span className="file-description">{asset.description}</span>
                <span className="tag-row"><span className="tag accent">{asset.tags[0]}</span><span className="tag">{asset.type}</span><span className="tag">{asset.tags[1]}</span>{asset.sourceName && <span className="tag">출처 {asset.sourceName}</span>}</span>
              </span>
              <span className="file-metrics"><strong>★ {asset.rating}</strong><span>평가 {asset.reviews}</span><span>조회 {formatViews(asset.views)}</span></span>
              <span className="card-arrow" aria-hidden="true">→</span>
            </button>
            {asset.isMine && asset.isUpload && <SearchContributionEditor asset={asset} onSaved={props.onUpdated} />}
            </div>
          ))}
          {!props.assets.length && <div className="empty-state"><strong>일치하는 학습 파일이 없습니다.</strong><span>다른 표현이나 연관 개념으로 검색해 보세요.</span></div>}
        </div>
      </main>
    </div>
  );
}

function SearchContributionEditor({ asset, onSaved }: { asset: Asset; onSaved: (item: ContributionRecord) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(asset.title);
  const [sourceNote, setSourceNote] = useState(asset.sourceNote || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/contributions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: asset.id, title, sourceNote }) });
      const data = await response.json() as { error?: string; message?: string; contribution?: ContributionRecord };
      if (!response.ok || !data.contribution) {
        setMessage(data.error || "자료를 저장하지 못했습니다.");
        return;
      }
      onSaved(data.contribution);
      setMessage(data.message || "자료 정보가 저장되었습니다.");
      setEditing(false);
    } catch {
      setMessage("저장 중 연결 문제가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="search-edit"><button className="record-edit-button" type="button" onClick={() => { setEditing(!editing); setMessage(null); }}>{editing ? "수정 닫기" : "내 자료 수정"}</button>{editing && <form className="record-edit-form" onSubmit={save}><label><span>제목</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required /></label><label><span>출처와 설명</span><textarea value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} maxLength={2000} rows={3} /></label><div><button className="primary-button compact" type="submit" disabled={saving}>{saving ? "저장 중…" : "저장"}</button><button className="secondary-button" type="button" onClick={() => { setEditing(false); setTitle(asset.title); setSourceNote(asset.sourceNote || ""); }}>취소</button></div></form>}{message && <p className="record-message">{message}</p>}</div>;
}

function DetailScreen(props: { asset: Asset; onBack: () => void; onStart: (mode: StudyMode) => void }) {
  if (props.asset.isReference) {
    const isExternal = props.asset.accessMode === "external_link";
    return (
      <main className="detail-main">
        <button className="back-button" type="button" onClick={props.onBack}>← 검색 결과</button>
        <section className="detail-hero uploaded-detail">
          <div className="detail-copy">
            <p className="eyebrow">물리학 · {isExternal ? "외부 학습 자료" : "구조화 참고 자료"}</p>
            <h1>{props.asset.title}</h1>
            <p>{props.asset.description}</p>
            <div className="tag-row">{props.asset.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
          </div>
          <div className="uploaded-file-card">
            <span>원문·데이터 출처</span>
            <strong>{props.asset.sourceName}</strong>
            <p>{isExternal ? "이 앱은 원문을 저장하거나 재배포하지 않고, 학습에 필요한 외부 자료로 연결합니다." : "이 앱에는 학습에 필요한 요약과 출처 정보만 저장합니다. 최신 내용은 원문에서 확인하세요."}</p>
            {props.asset.sourceUrl && <a className="primary-button" href={props.asset.sourceUrl} target="_blank" rel="noreferrer">출처 열기 ↗</a>}
          </div>
        </section>
        <section className="upload-notice"><strong>이용 및 라이선스</strong><p>{props.asset.licenseNote}</p></section>
      </main>
    );
  }
  if (props.asset.isUpload) {
    return (
      <main className="detail-main">
        <button className="back-button" type="button" onClick={props.onBack}>← 검색 결과</button>
        <section className="detail-hero uploaded-detail">
          <div className="detail-copy">
            <p className="eyebrow">사용자 기여 · 즉시 공개 자료</p>
            <h1>{props.asset.title}</h1>
            <p>{props.asset.description}</p>
            <div className="tag-row"><span className="tag accent">{props.asset.tags[0]}</span><span className="tag">기여자 {props.asset.ownerName || "사용자"}</span><span className="tag">{props.asset.createdAt ? new Date(props.asset.createdAt).toLocaleDateString("ko-KR") : "방금 공개"}</span></div>
          </div>
          <div className="uploaded-file-card">
            <span>{props.asset.textOnly ? "텍스트 기반 학습 자료" : "원본 학습 자료"}</span>
            <strong>{props.asset.textOnly ? "텍스트만 공개" : props.asset.tags[1]}</strong>
            <p>{props.asset.textOnly ? "원본 파일은 열리지 않으며, 추출한 텍스트와 기계적 학습 도구만 제공합니다." : "업로더가 공개한 원본입니다. 정확성과 저작권 여부를 직접 확인해 주세요."}</p>
            {props.asset.fileUrl && <a className="primary-button" href={props.asset.fileUrl} target="_blank" rel="noreferrer">파일 열기</a>}
          </div>
        </section>
        <section className="upload-notice"><strong>공개 방식</strong><p>{props.asset.tags[0] === "AI 검수 완료" ? "AI가 학습 구조와 품질 기준을 확인한 뒤 공개된 자료입니다. 기여자에게 검수 공개 보상 크레딧이 지급되었습니다." : "기여자가 AI 검수 없이 즉시 공개한 원본 자료입니다. 이 방식에는 기여 보상 크레딧이 지급되지 않습니다."}</p></section>
        {(props.asset.mechanicalStatus && props.asset.mechanicalStatus !== "none") && <MechanicalToolsPanel asset={props.asset} />}
      </main>
    );
  }
  return (
    <main className="detail-main">
      <button className="back-button" type="button" onClick={props.onBack}>← 검색 결과</button>
      <section className="detail-hero">
        <div className="detail-copy">
          <p className="eyebrow">물리학 · 역학 · AI 구조화 자료</p>
          <h1>{props.asset.title}</h1>
          <p>{props.asset.description}</p>
          <div className="tag-row"><span className="tag accent">전문가 검토</span><span className="tag">고등학교</span><span className="tag">최종 수정 2일 전</span></div>
        </div>
        <dl className="detail-stats">
          <div><dt>평가</dt><dd>★ {props.asset.rating}</dd></div>
          <div><dt>예시</dt><dd>{props.asset.examples}개</dd></div>
          <div><dt>회상 질문</dt><dd>{props.asset.questions}개</dd></div>
          <div><dt>예상 시간</dt><dd>4–30분</dd></div>
        </dl>
      </section>

      <section className="overview-grid">
        <div>
          <p className="section-label">기본 정보</p>
          <h2>힘이 물체를 회전시키는 효과</h2>
          <p className="lead-copy">돌림힘은 힘의 크기만으로 정해지지 않습니다. 회전축에서 얼마나 떨어져 있는지, 힘이 어느 방향으로 작용하는지가 함께 결정합니다.</p>
          <div className="formula-box"><span>핵심 관계</span><strong>τ = rF sinθ</strong><small>거리 × 힘 × 방향 효과</small></div>
        </div>
        <div className="knowledge-list">
          <div><span>먼저 알면 좋아요</span><strong>힘, 벡터의 성분, 회전축</strong></div>
          <div><span>학습 후 할 수 있어요</span><strong>작용점과 방향으로 회전 효과 판단</strong></div>
          <div><span>가장 흔한 오개념</span><strong>힘이 클수록 항상 더 잘 돈다</strong></div>
        </div>
      </section>

      <section className="mode-section">
        <div className="section-heading"><div><p className="eyebrow">학습 방식 선택</p><h2>어떻게 학습할까요?</h2></div><p>AI 없이 바로 시작하거나, 학습 도구를 코스로 묶을 수 있습니다.</p></div>
        <div className="mode-grid">
          {modes.map((mode) => (
            <button className="mode-card" type="button" key={mode.id} onClick={() => props.onStart(mode.id)}>
              <span className="mode-number">{mode.number}</span>
              <strong>{mode.title}</strong>
              <span>{mode.description}</span>
              <small>{mode.meta}</small>
              <b aria-hidden="true">→</b>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

type ProcessedContribution = {
  mechanicalStatus: string;
  extractedText: string | null;
  questions: Array<{ number: number; prompt: string }>;
  recallCards: Array<{ prompt: string; answer: string; source: string }>;
  mechanicalError: string | null;
};

function MechanicalToolsPanel({ asset }: { asset: Asset }) {
  const [processed, setProcessed] = useState<ProcessedContribution | null>(null);
  const [tab, setTab] = useState<"text" | "questions" | "recall">("text");
  useEffect(() => {
    let active = true;
    fetch(`/api/processed?id=${encodeURIComponent(asset.id)}`).then((response) => response.json()).then((data: ProcessedContribution) => { if (active) setProcessed(data); }).catch(() => undefined);
    return () => { active = false; };
  }, [asset.id]);

  if (!processed) return <section className="mechanical-result"><strong>기계적 처리 결과를 불러오는 중…</strong></section>;
  if (processed.mechanicalStatus === "awaiting_ocr") return <section className="mechanical-result pending"><strong>OCR 연결 대기</strong><p>{processed.mechanicalError || "외부 OCR 연결이 설정되면 글자 인식 후 텍스트와 학습 도구가 생성됩니다."}</p></section>;
  if (processed.mechanicalStatus === "failed") return <section className="mechanical-result error"><strong>기계적 처리 실패</strong><p>{processed.mechanicalError || "처리할 수 있는 텍스트가 없습니다."}</p></section>;
  return <section className="mechanical-result"><div className="mechanical-heading"><div><p className="eyebrow">기계적 학습 도구</p><h2>텍스트에서 바로 만든 학습 재료</h2></div><span>AI 생성 없음</span></div><div className="mechanical-tabs"><button className={tab === "text" ? "active" : ""} type="button" onClick={() => setTab("text")}>추출 텍스트</button><button className={tab === "questions" ? "active" : ""} type="button" onClick={() => setTab("questions")}>문제 {processed.questions.length}</button><button className={tab === "recall" ? "active" : ""} type="button" onClick={() => setTab("recall")}>능동 회상 {processed.recallCards.length}</button></div>{tab === "text" && <pre className="extracted-text">{processed.extractedText || "추출된 텍스트가 없습니다."}</pre>}{tab === "questions" && <ol className="question-split-list">{processed.questions.length ? processed.questions.map((question) => <li key={question.number}><strong>문제 {question.number}</strong><p>{question.prompt}</p></li>) : <li>번호가 있는 문제를 찾지 못했습니다.</li>}</ol>}{tab === "recall" && <div className="recall-card-list">{processed.recallCards.length ? processed.recallCards.map((card, index) => <details key={`${card.prompt}-${index}`}><summary>{card.prompt}</summary><p>{card.answer}</p></details>) : <p>능동 회상 카드를 만들 수 있는 텍스트가 부족합니다.</p>}</div>}</section>;
}

function StudyScreen(props: {
  mode: StudyMode;
  asset: Asset;
  index: number;
  revealed: boolean;
  answer: string;
  confidence: number;
  onAnswer: (value: string) => void;
  onReveal: () => void;
  onConfidence: (value: number) => void;
  onNext: (total: number) => void;
  onClose: () => void;
  onMode: (mode: StudyMode) => void;
}) {
  const modeName = modes.find((item) => item.id === props.mode)?.title ?? "학습";
  return (
    <main className="study-main">
      <div className="study-topline">
        <button className="back-button" type="button" onClick={props.onClose}>← 자료로 돌아가기</button>
        <span>{props.asset.title}</span>
        <strong>{modeName}</strong>
      </div>
      {props.mode === "info" && <InfoStudy onMode={props.onMode} />}
      {props.mode === "examples" && <ExampleStudy index={props.index} revealed={props.revealed} answer={props.answer} onAnswer={props.onAnswer} onReveal={props.onReveal} onNext={props.onNext} />}
      {props.mode === "recall" && <RecallStudy index={props.index} revealed={props.revealed} answer={props.answer} confidence={props.confidence} onAnswer={props.onAnswer} onReveal={props.onReveal} onConfidence={props.onConfidence} onNext={props.onNext} />}
      {props.mode === "plan" && <PlanBuilder onStart={props.onMode} />}
    </main>
  );
}

function InfoStudy({ onMode }: { onMode: (mode: StudyMode) => void }) {
  return (
    <article className="reader-panel">
      <div className="reader-progress"><span>핵심 정보</span><span>약 4분</span></div>
      <p className="eyebrow">돌림힘 · 기본 개념</p>
      <h1>같은 힘도 어디에서, 어느 방향으로 미는지에 따라 회전 효과가 달라집니다.</h1>
      <p className="reader-lead">돌림힘(토크)은 물체를 회전시키려는 힘의 효과입니다. 직선 운동에서 힘이 가속도를 만들듯, 회전 운동에서는 돌림힘이 회전 상태의 변화를 만듭니다.</p>
      <section className="reader-section"><span className="reader-index">01</span><div><h2>회전축에서의 거리</h2><p>힘의 작용점이 회전축에서 멀수록 같은 힘으로 더 큰 돌림힘을 만듭니다. 문손잡이가 경첩 반대편에 있는 이유입니다.</p></div></section>
      <section className="reader-section"><span className="reader-index">02</span><div><h2>힘의 방향</h2><p>회전 반지름에 수직인 힘의 성분만 회전에 기여합니다. 그래서 문을 표면에 수직으로 밀 때 가장 효과적입니다.</p></div></section>
      <section className="reader-section"><span className="reader-index">03</span><div><h2>부호와 평형</h2><p>반시계 방향과 시계 방향에 서로 다른 부호를 줍니다. 두 방향 돌림힘의 합이 같으면 알짜 돌림힘은 0이고 회전 평형입니다.</p></div></section>
      <div className="formula-feature"><span>τ</span><div><strong>rF sinθ</strong><small>단위는 N·m, 방향은 회전 방향으로 구분</small></div></div>
      <div className="reader-actions"><button className="secondary-button" type="button" onClick={() => onMode("examples")}>예시로 이어서 학습</button><button className="primary-button" type="button" onClick={() => onMode("recall")}>기억나는지 확인</button></div>
    </article>
  );
}

function ExampleStudy(props: { index: number; revealed: boolean; answer: string; onAnswer: (value: string) => void; onReveal: () => void; onNext: (total: number) => void }) {
  const item = examples[props.index];
  return (
    <section className="activity-panel">
      <div className="activity-progress"><div><span style={{ width: `${((props.index + 1) / examples.length) * 100}%` }} /></div><small>{props.index + 1} / {examples.length}</small></div>
      <p className="eyebrow">{item.eyebrow}</p>
      <h1>{item.title}</h1>
      <p className="scenario">{item.situation}</p>
      <label className="thinking-field"><span>먼저 자신의 말로 설명해 보세요</span><textarea value={props.answer} onChange={(event) => props.onAnswer(event.target.value)} placeholder={item.prompt} rows={4} /></label>
      {!props.revealed ? <button className="primary-button" type="button" onClick={props.onReveal}>설명 비교하기</button> : (
        <div className="reveal-panel"><span className="reveal-label">핵심 설명</span><p>{item.answer}</p><strong>{item.takeaway}</strong></div>
      )}
      {props.revealed && <div className="activity-actions"><button className="secondary-button" type="button" onClick={() => props.onNext(examples.length)} disabled={props.index === examples.length - 1}>{props.index === examples.length - 1 ? "예시 학습 완료" : "다음 예시"} →</button></div>}
    </section>
  );
}

function RecallStudy(props: { index: number; revealed: boolean; answer: string; confidence: number; onAnswer: (value: string) => void; onReveal: () => void; onConfidence: (value: number) => void; onNext: (total: number) => void }) {
  const item = recallQuestions[props.index];
  return (
    <section className="activity-panel recall-panel">
      <div className="activity-progress"><div><span style={{ width: `${((props.index + 1) / recallQuestions.length) * 100}%` }} /></div><small>{props.index + 1} / {recallQuestions.length}</small></div>
      <p className="eyebrow">능동 회상 · 답을 보기 전에</p>
      <h1>{item.prompt}</h1>
      <label className="thinking-field"><span>내 답변</span><textarea value={props.answer} onChange={(event) => props.onAnswer(event.target.value)} placeholder="완벽하지 않아도 괜찮아요. 기억나는 만큼 적어 보세요." rows={6} /></label>
      {!props.revealed ? <button className="primary-button" type="button" onClick={props.onReveal} disabled={!props.answer.trim()}>정답과 비교하기</button> : (
        <>
          <div className="reveal-panel"><span className="reveal-label">모범 답안</span><p>{item.answer}</p><ul>{item.rubric.map((point) => <li key={point}>{point}</li>)}</ul></div>
          <div className="confidence-box"><strong>얼마나 잘 회상했나요?</strong><div>{["거의 못함", "일부 회상", "대부분 회상", "정확히 회상"].map((label, index) => <button className={props.confidence === index + 1 ? "active" : ""} type="button" key={label} onClick={() => props.onConfidence(index + 1)}>{label}</button>)}</div></div>
          <div className="activity-actions"><button className="secondary-button" type="button" onClick={() => props.onNext(recallQuestions.length)} disabled={!props.confidence || props.index === recallQuestions.length - 1}>{props.index === recallQuestions.length - 1 ? "회상 학습 완료" : "다음 질문"} →</button></div>
        </>
      )}
    </section>
  );
}

function PlanBuilder({ onStart }: { onStart: (mode: StudyMode) => void }) {
  const [goal, setGoal] = useState("처음 이해하기");
  const [minutes, setMinutes] = useState(15);
  const [level, setLevel] = useState("처음");
  const [method, setMethod] = useState("균형");
  const [useAi, setUseAi] = useState(false);
  const [plan, setPlan] = useState<{ title: string; reason: string; steps: Array<{ title: string; minutes: number; tool: string; description: string }> } | null>(null);
  const [engine, setEngine] = useState("");
  const [loading, setLoading] = useState(false);

  async function generatePlan() {
    setLoading(true);
    try {
      const response = await fetch("/api/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: "돌림힘", goal, minutes, level, method, useAi }) });
      const data = await response.json() as { plan: typeof plan; engine: string };
      setPlan(data.plan);
      setEngine(data.engine);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="plan-panel">
      <div className="plan-heading"><p className="eyebrow">학습 코스 만들기</p><h1>오늘의 목표에 맞게 학습 도구를 묶어보세요.</h1><p>기본 코스는 정해진 학습 규칙으로 즉시 생성됩니다. AI 맞춤은 같은 검증된 도구를 수준에 맞게 재배열합니다.</p></div>
      <div className="plan-form">
        <ChoiceGroup label="학습 목표" values={["처음 이해하기", "시험 준비", "빠른 복습"]} value={goal} onChange={setGoal} />
        <ChoiceGroup label="학습 시간" values={["5분", "15분", "30분"]} value={`${minutes}분`} onChange={(value) => setMinutes(Number(value.replace("분", "")))} />
        <ChoiceGroup label="현재 수준" values={["처음", "조금 앎", "익숙함"]} value={level} onChange={setLevel} />
        <ChoiceGroup label="학습 방식" values={["예시 중심", "균형", "회상 중심"]} value={method} onChange={setMethod} />
        <div className="engine-choice"><button className={!useAi ? "active" : ""} type="button" onClick={() => setUseAi(false)}><strong>기본 코스</strong><span>AI 없이 학습 규칙으로 구성</span></button><button className={useAi ? "active" : ""} type="button" onClick={() => setUseAi(true)}><strong>AI 맞춤 코스</strong><span>수준과 요구에 맞춰 도구 재배열</span></button></div>
        <button className="primary-button wide" type="button" onClick={generatePlan} disabled={loading}>{loading ? "코스를 구성하고 있어요…" : "학습 코스 만들기"}</button>
      </div>
      {plan && <div className="generated-plan"><div className="generated-heading"><div><span>{engine === "ai" ? "AI 맞춤" : engine === "rules_fallback" ? "기본 엔진 대체" : "기본 코스"}</span><h2>{plan.title}</h2><p>{plan.reason}</p></div><strong>{plan.steps.reduce((sum, step) => sum + step.minutes, 0)}분</strong></div><ol>{plan.steps.map((step) => <li key={`${step.title}-${step.minutes}`}><span>{step.minutes}분</span><div><strong>{step.title}</strong><p>{step.description}</p></div></li>)}</ol><button className="primary-button" type="button" onClick={() => onStart(plan.steps[0]?.tool === "active_recall" ? "recall" : plan.steps[0]?.tool === "example" ? "examples" : "info")}>이 코스로 시작하기 →</button></div>}
    </section>
  );
}

function ChoiceGroup({ label, values, value, onChange }: { label: string; values: string[]; value: string; onChange: (value: string) => void }) {
  return <fieldset className="choice-group"><legend>{label}</legend><div>{values.map((item) => <button className={value === item ? "active" : ""} type="button" key={item} onClick={() => onChange(item)}>{item}</button>)}</div></fieldset>;
}

function ContributionScreen({ onBack, onPublished }: { onBack: () => void; onPublished: (item: ContributionRecord) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [publishMode, setPublishMode] = useState<"instant" | "ai_review">("instant");
  const [ocr, setOcr] = useState(false);
  const [textOnly, setTextOnly] = useState(false);
  const [splitQuestionSet, setSplitQuestionSet] = useState(false);
  const [createRecall, setCreateRecall] = useState(false);
  const [licenseConfirmed, setLicenseConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; status?: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setSubmitting(true);
    setResult(null);
    const body = new FormData();
    body.set("file", file);
    body.set("title", title);
    body.set("sourceNote", sourceNote);
    body.set("publishMode", publishMode);
    body.set("ocr", String(ocr));
    body.set("textOnly", String(textOnly));
    body.set("splitQuestions", String(splitQuestionSet));
    body.set("createRecall", String(createRecall));
    body.set("licenseConfirmed", String(licenseConfirmed));
    try {
      const response = await fetch("/api/contributions", { method: "POST", body });
      const data = await response.json() as { error?: string; message?: string; contribution?: ContributionRecord & { status?: string } };
      setResult({ ok: response.ok, message: data.message || data.error || "처리 결과를 확인할 수 없습니다.", status: data.contribution?.status });
      if (response.ok && data.contribution && ["published", "published_ai"].includes(data.contribution.status || "")) onPublished(data.contribution);
    } catch {
      setResult({ ok: false, message: "업로드 중 연결 문제가 발생했습니다. 다시 시도해 주세요." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="contribution-main">
      <button className="back-button" type="button" onClick={onBack}>← 검색으로 돌아가기</button>
      <div className="contribution-grid">
        <section className="contribution-intro"><p className="eyebrow">자료 기여</p><h1>공개 방식을 직접 선택하세요.</h1><p>빠르게 공유하거나, AI 검수를 거쳐 학습 자료로 인정받고 크레딧을 받을 수 있습니다.</p><ol><li><span>1</span><div><strong>즉시 공개</strong><p>검수 없이 바로 검색됩니다. 빠르지만 보상 크레딧은 없습니다.</p></div></li><li><span>2</span><div><strong>AI 검수 공개</strong><p>개념·예시·능동 회상 구조와 품질을 확인한 뒤 공개합니다.</p></div></li><li><span>3</span><div><strong>검수 보상</strong><p>AI 검수를 통과해 공개되면 계정에 20크레딧을 지급합니다.</p></div></li></ol></section>
        <form className="contribution-form" onSubmit={submit}>
          <fieldset className="publish-mode-field"><legend>공개 방식</legend><div><button className={publishMode === "instant" ? "publish-option active" : "publish-option"} type="button" onClick={() => { setPublishMode("instant"); setResult(null); }}><span>즉시 공개</span><strong>0 크레딧</strong><small>AI 검수 없이 바로 공개</small></button><button className={publishMode === "ai_review" ? "publish-option reward active" : "publish-option reward"} type="button" onClick={() => { setPublishMode("ai_review"); setResult(null); }}><span>AI 검수 공개</span><strong>+20 크레딧</strong><small>통과한 자료만 공개</small></button></div></fieldset>
          <label><span>자료 제목</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: 돌림힘 수업 필기와 예시" required /></label>
          <label className="upload-field"><span>파일</span><input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.docx,.pptx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /><div><strong>{file ? file.name : "파일을 선택하세요"}</strong><small>{file ? `${(file.size / 1024 / 1024).toFixed(2)}MB` : "PDF, 이미지, 문서 · 최대 8MB"}</small></div></label>
          <label className="camera-field"><span>또는 사진 촬영</span><input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><small>휴대폰에서는 카메라 권한을 요청해 바로 촬영할 수 있습니다. 촬영한 사진도 위 파일로 선택됩니다.</small></label>
          <fieldset className="mechanical-tools"><legend>기계적 처리 도구 <small>AI 검수와 별도로 작동</small></legend><p>텍스트 파일은 바로 처리되고, 이미지·PDF는 Azure OCR로 한국어 텍스트를 추출합니다. AI 검수 공개를 선택하면 OCR은 자동으로 적용되며 AI에는 원본 파일 대신 텍스트만 전달됩니다.</p><label><input type="checkbox" checked={ocr || publishMode === "ai_review"} disabled={publishMode === "ai_review"} onChange={(event) => setOcr(event.target.checked)} /> 이미지·PDF 글자 인식(Azure OCR)</label><label><input type="checkbox" checked={textOnly} onChange={(event) => setTextOnly(event.target.checked)} /> 원본 대신 텍스트만 학습 DB에 공개</label><label><input type="checkbox" checked={splitQuestionSet} onChange={(event) => setSplitQuestionSet(event.target.checked)} /> 번호가 있는 문제를 문제별로 나누기</label><label><input type="checkbox" checked={createRecall} onChange={(event) => setCreateRecall(event.target.checked)} /> 규칙 기반 능동 회상 카드 만들기</label></fieldset>
          <label><span>출처와 설명</span><textarea value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} placeholder="자료의 출처와 어떤 학습에 도움이 되는지 적어주세요." rows={5} /></label>
          <label className="check-row"><input type="checkbox" checked={licenseConfirmed} onChange={(event) => setLicenseConfirmed(event.target.checked)} /><span>이 자료를 공유할 권한이 있으며, {publishMode === "instant" ? "검수 없이 즉시 공개되고 크레딧이 지급되지 않는 것" : "AI가 자료를 분석하며 통과한 경우에만 공개·보상되는 것"}에 동의합니다.</span></label>
          <button className="primary-button wide" type="submit" disabled={submitting || !file || !title || !licenseConfirmed}>{submitting ? (publishMode === "instant" ? "공개하고 있어요…" : "AI 검수를 진행하고 있어요…") : (publishMode === "instant" ? "즉시 공개하기 · 0 크레딧" : "AI 검수 요청하기 · 통과 시 +20")}</button>
          {result && <div className={result.ok ? "submission-result success" : "submission-result error"}><strong>{result.ok ? "접수 완료" : "확인 필요"}</strong><p>{result.message}</p>{result.status && <span>현재 상태 · {result.status}</span>}</div>}
        </form>
      </div>
    </main>
  );
}

type AccountData = {
  creditBalance: number;
  stats: { contributionCount: number; totalViews: number };
  contributions: Array<{ id: string; title: string; originalName: string; sourceNote: string; status: string; publishMode: string; creditsAwarded: number; viewCount: number; errorMessage?: string | null; createdAt: string }>;
  ledger: Array<{ id: number; amount: number; reason: string; contributionId?: string | null; createdAt: string }>;
};

const statusLabels: Record<string, string> = {
  published: "즉시 공개",
  awaiting_ai: "AI 검수 대기",
  analyzing: "AI 검수 중",
  published_ai: "AI 검수 통과",
  review_rejected: "검수 반려",
  review_failed: "검수 오류",
};

function AccountScreen({ user, onBack, onPricing, onUpdated }: { user: AccountUser | null; onBack: () => void; onPricing: () => void; onUpdated: (item: ContributionRecord) => void }) {
  const [data, setData] = useState<AccountData | null>(null);
  useEffect(() => {
    if (!user) return;
    let active = true;
    fetch("/api/account").then((response) => response.json()).then((value: AccountData) => { if (active) setData(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [user]);

  function replaceContribution(updated: ContributionRecord) {
    setData((current) => current ? {
      ...current,
      contributions: current.contributions.map((item) => item.id === updated.id ? { ...item, title: updated.title, sourceNote: updated.sourceNote } : item),
    } : current);
    onUpdated(updated);
  }

  if (!user) {
    return (
      <main className="account-main">
        <button className="back-button" type="button" onClick={onBack}>← 검색으로 돌아가기</button>
        <AuthPanel />
      </main>
    );
  }

  return (
    <main className="account-main">
      <button className="back-button" type="button" onClick={onBack}>← 검색으로 돌아가기</button>
      <section className="account-hero">
        <div className="account-avatar">{user?.displayName?.slice(0, 1).toUpperCase() || "?"}</div>
        <div><p className="eyebrow">내 계정</p><h1>{user?.displayName || "로그인 정보 없음"}</h1><p>{user?.email || "배포된 사이트에서 로그인하면 계정이 연결됩니다."}</p></div>
        {user && <SignOutButton authMethod={user.authMethod} />}
      </section>
      <section className="credit-wallet"><div><span>보유 크레딧</span><strong>{data?.creditBalance ?? 0}<small> C</small></strong><p>AI 검수 통과 자료를 기여하면 20크레딧을 받습니다.</p></div><button className="primary-button" type="button" onClick={onPricing}>크레딧·요금제 보기</button></section>
      <section className="account-stats"><div><span>공개한 자료</span><strong>{data?.stats.contributionCount ?? 0}</strong></div><div><span>누적 조회</span><strong>{(data?.stats.totalViews ?? 0).toLocaleString("ko-KR")}</strong></div><div><span>계정 상태</span><strong>{user ? "연결됨" : "로컬 미리보기"}</strong></div></section>
      <section className="account-contributions">
        <div className="section-heading"><div><p className="eyebrow">내 기여</p><h2>검수·공개 현황</h2></div></div>
        {data?.contributions.length ? <div className="account-records">{data.contributions.map((item) => <ContributionEditor key={item.id} item={item} onSaved={replaceContribution} />)}</div> : <div className="empty-state"><strong>아직 기여 기록이 없습니다.</strong><span>자료 기여에서 공개 방식을 선택해 첫 파일을 올려보세요.</span></div>}
      </section>
      <section className="credit-history"><div className="section-heading"><div><p className="eyebrow">크레딧</p><h2>지급 내역</h2></div></div>{data?.ledger.length ? <div>{data.ledger.map((entry) => <article key={entry.id}><div><strong>{entry.reason}</strong><span>{new Date(entry.createdAt).toLocaleDateString("ko-KR")}</span></div><b>+{entry.amount} C</b></article>)}</div> : <div className="empty-state compact-empty"><strong>아직 크레딧 내역이 없습니다.</strong><span>AI 검수를 통과한 자료가 공개되면 여기에 기록됩니다.</span></div>}</section>
    </main>
  );
}

function ContributionEditor({ item, onSaved }: { item: AccountData["contributions"][number]; onSaved: (item: ContributionRecord) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [sourceNote, setSourceNote] = useState(item.sourceNote || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/contributions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, title, sourceNote }) });
      const data = await response.json() as { error?: string; message?: string; contribution?: ContributionRecord };
      if (!response.ok || !data.contribution) {
        setMessage(data.error || "자료를 저장하지 못했습니다.");
        return;
      }
      onSaved(data.contribution);
      setMessage(data.message || "자료 정보가 저장되었습니다.");
      setEditing(false);
    } catch {
      setMessage("저장 중 연결 문제가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return <article><div><strong>{title}</strong><span>{new Date(item.createdAt).toLocaleDateString("ko-KR")}</span></div><div className="record-meta"><span className={`status-pill ${item.status}`}>{statusLabels[item.status] || item.status}</span><span>{item.publishMode === "ai_review" ? "AI 검수 공개" : "즉시 공개"}</span><b>{item.creditsAwarded > 0 ? `+${item.creditsAwarded} C` : "보상 없음"}</b></div><p className="record-file">{item.originalName}</p>{item.errorMessage && <p>{item.errorMessage}</p>}{!editing ? <button className="record-edit-button" type="button" onClick={() => { setEditing(true); setMessage(null); }}>자료 정보 수정</button> : <form className="record-edit-form" onSubmit={save}><label><span>제목</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required /></label><label><span>출처와 설명</span><textarea value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} maxLength={2000} rows={4} /></label><div><button className="primary-button compact" type="submit" disabled={saving}>{saving ? "저장 중…" : "저장"}</button><button className="secondary-button" type="button" onClick={() => { setEditing(false); setTitle(item.title); setSourceNote(item.sourceNote || ""); }}>취소</button></div></form>}{message && <p className="record-message">{message}</p>}</article>;
}

function PricingScreen({ onBack }: { onBack: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [demoComplete, setDemoComplete] = useState(false);
  const plans = [
    { name: "무료", price: "₩0", description: "검색과 기본 학습 도구", features: ["정보·예시·능동 회상", "즉시 공개 기여", "AI 검수 기여 보상"] },
    { name: "플러스", price: "₩5,900", description: "월 100크레딧 포함", features: ["무료 기능 전체", "AI 맞춤 학습 100회분", "학습 기록 확장"] },
    { name: "프로", price: "₩12,900", description: "월 300크레딧 포함", features: ["플러스 기능 전체", "AI 맞춤 학습 300회분", "고급 학습 분석"] },
  ];
  const offers = ["100 크레딧 · ₩4,900", "300 크레딧 · ₩12,900", "1,000 크레딧 · ₩35,000"];

  return (
    <main className="pricing-main">
      <button className="back-button" type="button" onClick={onBack}>← 검색으로 돌아가기</button>
      <section className="pricing-hero"><p className="eyebrow">요금제와 크레딧</p><h1>필요한 만큼 배우고,<br />좋은 자료로 다시 채우세요.</h1><p>크레딧은 AI 학습 기능에 사용하고, AI 검수를 통과한 자료를 기여하면 다시 받을 수 있습니다.</p><div className="demo-banner"><strong>결제 UI 데모</strong><span>현재는 카드·계좌와 연결되지 않으며 실제 청구나 크레딧 충전이 발생하지 않습니다.</span></div></section>
      <section className="plan-cards">{plans.map((plan) => <article className={plan.name === "플러스" ? "featured" : ""} key={plan.name}><span>{plan.name}</span><strong>{plan.price}<small>{plan.price !== "₩0" ? " / 월" : ""}</small></strong><p>{plan.description}</p><ul>{plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}</ul><button className={plan.name === "무료" ? "secondary-button" : "primary-button"} type="button" onClick={() => { setSelected(`${plan.name} 요금제`); setDemoComplete(false); }}>{plan.name === "무료" ? "현재 요금제" : `${plan.name} 선택`}</button></article>)}</section>
      <section className="credit-shop"><div><p className="eyebrow">일회성 충전</p><h2>크레딧 추가 구매</h2><p>구독 없이 필요한 만큼만 추가하는 화면입니다.</p></div><div>{offers.map((offer) => <button type="button" key={offer} onClick={() => { setSelected(offer); setDemoComplete(false); }}><strong>{offer.split(" · ")[0]}</strong><span>{offer.split(" · ")[1]}</span><b>선택 →</b></button>)}</div></section>
      {selected && <section className="checkout-demo"><div className="checkout-heading"><div><span>선택 항목</span><h2>{selected}</h2></div><button type="button" onClick={() => setSelected(null)}>닫기</button></div><div className="payment-methods"><button className="active" type="button">카드</button><button type="button">계좌이체</button><button type="button">간편결제</button></div><div className="fake-payment-fields"><label><span>결제자 이름</span><input placeholder="홍길동" /></label><label><span>카드 또는 계좌</span><input placeholder="실제 정보는 입력하지 마세요" /></label></div><button className="primary-button wide" type="button" onClick={() => setDemoComplete(true)}>데모 결제 확인</button>{demoComplete && <div className="demo-success"><strong>결제 화면 준비 완료</strong><p>UI 흐름만 확인했습니다. 실제 청구·계좌 연결·크레딧 지급은 실행되지 않았습니다.</p></div>}</section>}
    </main>
  );
}
