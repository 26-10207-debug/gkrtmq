"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type View = "search" | "detail" | "study" | "contribute" | "account";
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
  ownerName?: string;
  createdAt?: string;
  isUpload?: boolean;
  isMine?: boolean;
};

type AccountUser = { displayName: string; email: string };
type ContributionRecord = {
  id: string;
  title: string;
  originalName: string;
  contentType: string;
  sourceNote: string;
  ownerDisplayName: string;
  viewCount: number;
  createdAt: string;
  isMine?: number;
};

function contributionToAsset(item: ContributionRecord): Asset {
  return {
    id: item.id,
    title: item.title,
    description: item.sourceNote || `${item.originalName} · 사용자가 직접 올린 학습 자료`,
    type: "사용자 자료",
    tags: ["즉시 공개", item.contentType.split("/").pop()?.toUpperCase() || "파일", item.ownerDisplayName || "기여자"],
    rating: 0,
    reviews: 0,
    views: item.viewCount,
    examples: 0,
    questions: 0,
    fileUrl: `/api/files?id=${encodeURIComponent(item.id)}`,
    sourceNote: item.sourceNote,
    ownerName: item.ownerDisplayName,
    createdAt: item.createdAt,
    isUpload: true,
    isMine: item.isMine === 1,
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

  useEffect(() => {
    let active = true;
    fetch("/api/contributions")
      .then((response) => response.json())
      .then((data: { contributions?: ContributionRecord[] }) => {
        if (active) setCommunityAssets((data.contributions ?? []).map(contributionToAsset));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const allAssets = useMemo(() => [...communityAssets, ...assets], [communityAssets]);

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
        onContribute={() => setView("contribute")}
        onAccount={() => setView("account")}
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
      {view === "account" && <AccountScreen user={user} assets={communityAssets} onBack={() => setView("search")} onOpen={openAsset} />}
    </div>
  );
}

function Header(props: {
  query: string;
  onQueryChange: (value: string) => void;
  onLogo: () => void;
  onContribute: () => void;
  onAccount: () => void;
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
}) {
  const filters = ["전체", "사용자 자료", "개념 설명", "예시·적용", "회상 문제", "오개념"];
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
        <p className="sidebar-note"><span className="status-dot" /> 현재는 기여 자료가 AI 검수 없이 즉시 공개됩니다.</p>
      </aside>

      <main className="results-main">
        <div className="results-heading">
          <div>
            <p className="eyebrow">물리학 · 검색 결과</p>
            <h1>‘{props.query || "전체"}’ 관련 학습 파일</h1>
            <p>{props.assets.length}개 결과 · 예시와 능동 회상 도구가 포함되어 있어요.</p>
          </div>
          <select aria-label="정렬 방식" defaultValue="relevance"><option value="relevance">관련도순</option><option value="rating">평가순</option><option value="views">조회순</option></select>
        </div>
        <div className="related-row">
          <span>연관</span>
          {["토크", "회전 평형", "모멘트 암", "각운동량"].map((item) => <button type="button" key={item} onClick={() => props.onQuery(item)}>{item}</button>)}
        </div>
        <div className="result-list">
          {props.assets.map((asset, index) => (
            <button className="result-card" type="button" key={asset.id} onClick={() => props.onOpen(asset)}>
              <span className="file-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="file-copy">
                <span className="file-title">{asset.title}</span>
                <span className="file-description">{asset.description}</span>
                <span className="tag-row"><span className="tag accent">{asset.tags[0]}</span><span className="tag">{asset.type}</span><span className="tag">{asset.tags[1]}</span></span>
              </span>
              <span className="file-metrics"><strong>★ {asset.rating}</strong><span>평가 {asset.reviews}</span><span>조회 {formatViews(asset.views)}</span></span>
              <span className="card-arrow" aria-hidden="true">→</span>
            </button>
          ))}
          {!props.assets.length && <div className="empty-state"><strong>일치하는 학습 파일이 없습니다.</strong><span>다른 표현이나 연관 개념으로 검색해 보세요.</span></div>}
        </div>
      </main>
    </div>
  );
}

function DetailScreen(props: { asset: Asset; onBack: () => void; onStart: (mode: StudyMode) => void }) {
  if (props.asset.isUpload) {
    return (
      <main className="detail-main">
        <button className="back-button" type="button" onClick={props.onBack}>← 검색 결과</button>
        <section className="detail-hero uploaded-detail">
          <div className="detail-copy">
            <p className="eyebrow">사용자 기여 · 즉시 공개 자료</p>
            <h1>{props.asset.title}</h1>
            <p>{props.asset.description}</p>
            <div className="tag-row"><span className="tag accent">AI 미검수</span><span className="tag">기여자 {props.asset.ownerName || "사용자"}</span><span className="tag">{props.asset.createdAt ? new Date(props.asset.createdAt).toLocaleDateString("ko-KR") : "방금 공개"}</span></div>
          </div>
          <div className="uploaded-file-card">
            <span>원본 학습 자료</span>
            <strong>{props.asset.tags[1]}</strong>
            <p>업로더가 공개한 원본입니다. 정확성과 저작권 여부를 직접 확인해 주세요.</p>
            <a className="primary-button" href={props.asset.fileUrl} target="_blank" rel="noreferrer">파일 열기</a>
          </div>
        </section>
        <section className="upload-notice"><strong>현재 운영 방식</strong><p>이 자료는 요청하신 초기 운영 방식에 따라 AI 분석이나 검수 없이 바로 공개되었습니다. 추후 AI 구조화 기능이 추가되면 별도의 학습 객체 버전을 연결할 수 있습니다.</p></section>
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
    body.set("licenseConfirmed", String(licenseConfirmed));
    try {
      const response = await fetch("/api/contributions", { method: "POST", body });
      const data = await response.json() as { error?: string; message?: string; contribution?: ContributionRecord & { status?: string } };
      setResult({ ok: response.ok, message: data.message || data.error || "처리 결과를 확인할 수 없습니다.", status: data.contribution?.status });
      if (response.ok && data.contribution) onPublished(data.contribution);
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
        <section className="contribution-intro"><p className="eyebrow">자료 기여</p><h1>업로드하면 검색에 바로 공개됩니다.</h1><p>현재 초기 버전에서는 AI 검수 없이 원본 자료를 즉시 공개합니다. 제목과 출처를 정확히 적고, 공유 권한이 있는 자료만 올려주세요.</p><ol><li><span>1</span><div><strong>계정에 연결</strong><p>로그인한 계정 이름으로 기여 기록을 남깁니다.</p></div></li><li><span>2</span><div><strong>파일 안전 저장</strong><p>사진, PDF, 문서를 대용량 저장소에 보관합니다.</p></div></li><li><span>3</span><div><strong>즉시 공개</strong><p>저장이 끝나면 바로 검색 결과와 내 계정에 표시됩니다.</p></div></li></ol></section>
        <form className="contribution-form" onSubmit={submit}>
          <label><span>자료 제목</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: 돌림힘 수업 필기와 예시" required /></label>
          <label className="upload-field"><span>파일</span><input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.docx,.pptx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /><div><strong>{file ? file.name : "파일을 선택하세요"}</strong><small>{file ? `${(file.size / 1024 / 1024).toFixed(2)}MB` : "PDF, 이미지, 문서 · 최대 8MB"}</small></div></label>
          <label><span>출처와 설명</span><textarea value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} placeholder="자료의 출처와 어떤 학습에 도움이 되는지 적어주세요." rows={5} /></label>
          <label className="check-row"><input type="checkbox" checked={licenseConfirmed} onChange={(event) => setLicenseConfirmed(event.target.checked)} /><span>이 자료를 공유할 권한이 있으며, AI 검수 없이 즉시 공개되는 것에 동의합니다.</span></label>
          <button className="primary-button wide" type="submit" disabled={submitting || !file || !title || !licenseConfirmed}>{submitting ? "업로드하고 있어요…" : "즉시 공개하기"}</button>
          {result && <div className={result.ok ? "submission-result success" : "submission-result error"}><strong>{result.ok ? "접수 완료" : "확인 필요"}</strong><p>{result.message}</p>{result.status && <span>현재 상태 · {result.status}</span>}</div>}
        </form>
      </div>
    </main>
  );
}

function AccountScreen({ user, assets: uploadedAssets, onBack, onOpen }: { user: AccountUser | null; assets: Asset[]; onBack: () => void; onOpen: (asset: Asset) => void }) {
  const mine = user ? uploadedAssets.filter((asset) => asset.isMine) : [];
  return (
    <main className="account-main">
      <button className="back-button" type="button" onClick={onBack}>← 검색으로 돌아가기</button>
      <section className="account-hero">
        <div className="account-avatar">{user?.displayName?.slice(0, 1).toUpperCase() || "?"}</div>
        <div><p className="eyebrow">내 계정</p><h1>{user?.displayName || "로그인 정보 없음"}</h1><p>{user?.email || "배포된 사이트에서 ChatGPT 계정으로 로그인하면 계정이 연결됩니다."}</p></div>
        {user && <a className="secondary-button" href="/signout-with-chatgpt?return_to=/">로그아웃</a>}
      </section>
      <section className="account-stats"><div><span>공개한 자료</span><strong>{mine.length}</strong></div><div><span>누적 조회</span><strong>{mine.reduce((sum, asset) => sum + asset.views, 0).toLocaleString("ko-KR")}</strong></div><div><span>계정 상태</span><strong>{user ? "연결됨" : "로컬 미리보기"}</strong></div></section>
      <section className="account-contributions"><div className="section-heading"><div><p className="eyebrow">내 기여</p><h2>내가 올린 자료</h2></div></div>{mine.length ? <div className="result-list">{mine.map((asset, index) => <button className="result-card" type="button" key={asset.id} onClick={() => onOpen(asset)}><span className="file-number">{String(index + 1).padStart(2, "0")}</span><span className="file-copy"><span className="file-title">{asset.title}</span><span className="file-description">{asset.description}</span><span className="tag-row"><span className="tag accent">즉시 공개</span><span className="tag">조회 {asset.views}</span></span></span><span className="card-arrow">→</span></button>)}</div> : <div className="empty-state"><strong>아직 공개한 자료가 없습니다.</strong><span>자료 기여에서 첫 파일을 올려보세요.</span></div>}</section>
    </main>
  );
}
