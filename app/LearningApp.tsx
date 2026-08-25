"use client";

import { CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AuthPanel, SignOutButton } from "./AuthPanel";
import { ConceptCanvas, ConceptCanvasElement, ConceptModel, CustomMaterials, SourceSelection, conceptShapeDefinitions, emptyCustomMaterials, hasCustomMaterials, hasImageSelection } from "@/lib/custom-materials";
import { extractDocumentText, isImageFile } from "@/lib/document-text";
import { ConceptMap } from "./ConceptMap";

type View = "search" | "detail" | "study" | "contribute" | "account" | "pricing" | "folder";
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
  attachments?: Array<{ originalName: string; contentType: string; size: number; url: string }>;
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
  customMaterials?: CustomMaterials;
  subject?: string;
  searchSnippet?: string;
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
  customMaterialsJson?: string;
  subject?: string;
  tags?: string[];
  attachments?: Array<{ originalName: string; contentType: string; size: number }>;
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
  subject?: string;
};

type LearningProgress = {
  assetId: string;
  mode: StudyMode;
  completedItems: number;
  score: number;
  updatedAt: string;
};

type FolderRecord = { id: string; title: string; description: string; subject: string; tags: string[]; ownerDisplayName: string; itemCount?: number; items?: ContributionRecord[]; isMine?: number };

function contributionToAsset(item: ContributionRecord): Asset {
  let customMaterials = emptyCustomMaterials();
  try {
    const parsed = JSON.parse(item.customMaterialsJson || "{}") as Partial<CustomMaterials>;
    customMaterials = { ...customMaterials, ...parsed, memorization: { ...customMaterials.memorization, ...parsed.memorization }, recall: { ...customMaterials.recall, ...parsed.recall } };
  } catch {
    // Older or malformed contribution records simply have no custom materials.
  }
  const materialCount = customMaterials.memorization.items.length + customMaterials.memorization.selections.length + customMaterials.recall.shortCards.length + customMaterials.recall.flashCards.length + customMaterials.recall.quizzes.length + customMaterials.recall.sequences.length + customMaterials.recall.diagrams.length + customMaterials.recall.conceptModels.length + customMaterials.recall.conceptCanvases.length + customMaterials.examples.length;
  const attachments = (item.attachments?.length ? item.attachments : [{ originalName: item.originalName, contentType: item.contentType, size: 0 }]).map((attachment, index) => ({ ...attachment, url: `/api/files?id=${encodeURIComponent(item.id)}&attachment=${index}` }));
  return {
    id: item.id,
    title: item.title,
    description: item.sourceNote || `${item.originalName} · 사용자가 직접 올린 학습 자료`,
    type: "사용자 자료",
    tags: [...(item.tags || []), item.publishMode === "ai_review" ? "AI 검수 완료" : "즉시 공개", item.contentType.split("/").pop()?.toUpperCase() || "파일", materialCount ? `학습 도구 ${materialCount}개` : item.ownerDisplayName || "기여자"].slice(0, 5),
    rating: 0,
    reviews: 0,
    views: item.viewCount,
    examples: 0,
    questions: 0,
    fileUrl: item.textOnly ? undefined : attachments[0]?.url,
    attachments: item.textOnly ? [] : attachments,
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
    customMaterials,
    subject: item.subject || "분류 없음",
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
    subject: item.subject || item.topic.split(" · ")[0] || "분류 없음",
  };
}

function previewForAsset(asset: Asset) {
  const image = asset.attachments?.find((attachment) => attachment.contentType.startsWith("image/"));
  return image?.url;
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
    subject: "물리학",
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
    subject: "물리학",
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
    subject: "물리학",
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
    subject: "물리학",
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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("전체");
  const [subject, setSubject] = useState("전체");
  const [sort, setSort] = useState("relevance");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(assets[0]);
  const [selectedFolder, setSelectedFolder] = useState<FolderRecord | null>(null);
  const [studyMode, setStudyMode] = useState<StudyMode>("info");
  const [studyIndex, setStudyIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState(0);
  const [studyCompleted, setStudyCompleted] = useState(false);
  const [communityAssets, setCommunityAssets] = useState<Asset[]>([]);
  const [referenceAssets, setReferenceAssets] = useState<Asset[]>([]);
  const [searchAssets, setSearchAssets] = useState<Asset[]>([]);
  const [searchFolders, setSearchFolders] = useState<FolderRecord[]>([]);
  const [relatedTerms, setRelatedTerms] = useState<string[]>([]);
  const [searchSubjects, setSearchSubjects] = useState<string[]>(["물리학", "영어", "수학", "철학", "기타", "분류 없음"]);
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState<LearningProgress[]>([]);

  useEffect(() => {
    let active = true;
    if (user) fetch("/api/contributions?mine=1")
      .then((response) => response.json())
      .then((data: { contributions?: ContributionRecord[] }) => {
        if (active) setCommunityAssets((data.contributions ?? []).map(contributionToAsset));
      })
      .catch(() => undefined);
    fetch("/api/references?limit=8")
      .then((response) => response.json())
      .then((data: { references?: ReferenceRecord[] }) => {
        if (active) setReferenceAssets((data.references ?? []).map(referenceToAsset));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setProgress([]);
      return;
    }
    let active = true;
    fetch("/api/progress")
      .then((response) => response.ok ? response.json() : { progress: [] })
      .then((data: { progress?: LearningProgress[] }) => {
        if (active) setProgress(data.progress ?? []);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [user]);

  const allAssets = useMemo(() => [...communityAssets, ...referenceAssets, ...assets], [communityAssets, referenceAssets]);

  useEffect(() => {
    if (!hasSearched || !query) return;
    let active = true;
    setSearching(true);
    const params = new URLSearchParams({ q: query, subject, type: filter, sort });
    fetch(`/api/search?${params}`)
      .then((response) => response.ok ? response.json() : { results: [] })
      .then((data: { results?: Array<ContributionRecord & ReferenceRecord & FolderRecord & { sourceType?: string; searchSnippet?: string; tags?: string[] }>; related?: string[]; subjects?: string[] }) => {
        if (!active) return;
        const folderResults = (data.results || []).filter((item) => item.sourceType === "folder") as unknown as FolderRecord[];
        const dynamic = (data.results || []).filter((item) => item.sourceType !== "folder").map((item) => item.sourceType === "reference" ? referenceToAsset(item) : contributionToAsset(item));
        const staticMatches = assets.filter((asset) => {
          const text = `${asset.title} ${asset.description} ${asset.subject} ${asset.tags.join(" ")}`.toLowerCase();
          return text.includes(query.toLowerCase()) && (subject === "전체" || asset.subject === subject) && (filter === "전체" || asset.type === filter);
        });
        const hydrated = dynamic.map((asset, index) => ({ ...asset, searchSnippet: (data.results || [])[index]?.searchSnippet }));
        setSearchAssets([...hydrated, ...staticMatches]);
        setSearchFolders(folderResults);
        setRelatedTerms(data.related || []);
        if (data.subjects?.length) setSearchSubjects((current) => [...new Set([...current, ...data.subjects!])]);
      })
      .catch(() => { if (active) { setSearchAssets([]); setSearchFolders([]); } })
      .finally(() => { if (active) setSearching(false); });
    return () => { active = false; };
  }, [filter, hasSearched, query, sort, subject]);

  const continuedAsset = useMemo(() => {
    const latest = progress[0];
    return latest ? allAssets.find((asset) => asset.id === latest.assetId) : undefined;
  }, [allAssets, progress]);

  const myAsset = useMemo(() => communityAssets.find((asset) => asset.isMine), [communityAssets]);
  const recommendation = assets[new Date().getDate() % assets.length];
  const reference = referenceAssets[0];

  function openAsset(asset: Asset) {
    setSelectedAsset(asset);
    setView("detail");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function openFolder(folder: FolderRecord) {
    try {
      const response = await fetch(`/api/folders?id=${encodeURIComponent(folder.id)}`);
      const data = await response.json() as { folder?: FolderRecord };
      setSelectedFolder(data.folder || folder);
    } catch { setSelectedFolder(folder); }
    setView("folder"); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showHome() {
    setView("search");
    setHasSearched(false);
    setQuery("");
    setFilter("전체");
    setSubject("전체");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function runSearch(value: string) {
    setQuery(value.trim());
    setFilter("전체");
    setSubject("전체");
    setSort("relevance");
    setHasSearched(Boolean(value.trim()));
    window.requestAnimationFrame(() => document.getElementById("explore")?.scrollIntoView({ behavior: "smooth", block: "start" }));
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
    setStudyCompleted(false);
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
    if (studyIndex >= total - 1) {
      void saveProgress(studyMode, total, confidence ? confidence * 25 : 100);
      setStudyCompleted(true);
      return;
    }
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
        onLogo={showHome}
        onContribute={() => setView(user ? "contribute" : "account")}
        onAccount={() => setView("account")}
        user={user}
        isHome={view === "search"}
      />

      {view === "search" && (
        <SearchScreen
          query={query}
          filter={filter}
          sort={sort}
          hasSearched={hasSearched}
          assets={searchAssets}
          subject={subject}
          subjects={searchSubjects}
          relatedTerms={relatedTerms}
          searching={searching}
          user={user}
          continuedAsset={continuedAsset}
          myAsset={myAsset}
          recommendation={recommendation}
          reference={reference}
          onFilter={setFilter}
          onSubject={setSubject}
          onSort={setSort}
          onSearch={runSearch}
          onOpen={openAsset}
          folders={searchFolders}
          onOpenFolder={openFolder}
          onUpdated={updatePublishedContribution}
          onContribute={() => setView(user ? "contribute" : "account")}
          onResume={(asset, mode) => { openAsset(asset); window.setTimeout(() => startStudy(mode), 0); }}
        />
      )}
      {view === "detail" && <DetailScreen asset={selectedAsset} onBack={() => setView("search")} onStart={startStudy} />}
      {view === "folder" && selectedFolder && <FolderScreen folder={selectedFolder} onBack={() => setView("search")} onOpen={openAsset} />}
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
          completed={studyCompleted}
          onRestart={() => { setStudyIndex(0); setRevealed(false); setAnswer(""); setConfidence(0); setStudyCompleted(false); }}
          onMode={startStudy}
        />
      )}
      {view === "contribute" && <ContributionScreenV2 onBack={showHome} onPublished={addPublishedContribution} />}
      {view === "account" && <AccountScreen user={user} onBack={showHome} onPricing={() => setView("pricing")} onUpdated={updatePublishedContribution} />}
      {view === "pricing" && <PricingScreen onBack={showHome} />}
    </div>
  );
}

function Header(props: {
  onLogo: () => void;
  onContribute: () => void;
  onAccount: () => void;
  user: AccountUser | null;
  isHome: boolean;
}) {
  return (
    <header className={props.isHome ? "topbar topbar-home" : "topbar"}>
      <button className="brand" type="button" onClick={props.onLogo} aria-label="Dumb Can Learn 홈으로">
        <span className="brand-mark">D</span>
        <span>Dumb Can Learn</span>
      </button>
      <div className="header-actions">
        <button className="contribute-button" type="button" onClick={props.onContribute} aria-label="자료 기여 열기"><span aria-hidden="true">＋</span> 자료 기여</button>
        <button className="account-button account-button-compact" type="button" onClick={props.onAccount} aria-label="내 계정 열기">
          <span>{props.user?.displayName?.slice(0, 1).toUpperCase() || "?"}</span>
        </button>
      </div>
    </header>
  );
}

function SearchScreen(props: {
  query: string;
  filter: string;
  subject: string;
  subjects: string[];
  sort: string;
  hasSearched: boolean;
  assets: Asset[];
  folders: FolderRecord[];
  relatedTerms: string[];
  searching: boolean;
  user: AccountUser | null;
  continuedAsset?: Asset;
  myAsset?: Asset;
  recommendation: Asset;
  reference?: Asset;
  onFilter: (value: string) => void;
  onSubject: (value: string) => void;
  onSort: (value: string) => void;
  onSearch: (value: string) => void;
  onOpen: (asset: Asset) => void;
  onOpenFolder: (folder: FolderRecord) => void;
  onUpdated: (item: ContributionRecord) => void;
  onContribute: () => void;
  onResume: (asset: Asset, mode: StudyMode) => void;
}) {
  const filters = ["전체", "사용자 자료", "공개 참고", "공개 폴더"];
  const [draft, setDraft] = useState(props.query);
  useEffect(() => setDraft(props.query), [props.query]);
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    props.onSearch(draft);
  }
  return (
    <>
      <section className="home-hero" aria-labelledby="home-title">
        <div className="hero-orb orb-one" /><div className="hero-orb orb-two" /><div className="hero-orb orb-three" /><div className="hero-orb orb-four" />
        <div className="hero-copy">
          <p className="hero-kicker">능동 회상 · 예시 중심 학습</p>
          <h1 id="home-title">Learn with what you know.</h1>
          <form className="hero-search" onSubmit={submitSearch}>
            <label className="sr-only" htmlFor="home-search">학습 자료 검색</label>
            <input id="home-search" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="무엇을 배우고 싶나요?" />
            <button type="submit" aria-label="검색 실행">⌕</button>
          </form>
          <p className="hero-hint">예: 돌림힘, present perfect, 가족 유사성</p>
        </div>
      </section>

      <main className="explore-main" id="explore">
        {!props.hasSearched ? <DiscoveryGrid {...props} /> : <>
        <div className="chatbot-results-intro">
          <div className="chatbot-avatar" aria-hidden="true">✦</div><div><p className="eyebrow">Dumb Can Learn 탐색 도우미</p><h2>‘{props.query}’에 맞는 학습 결과예요.</h2><p>먼저 보기 좋은 자료 네 개를 골랐어요. 아래로 내려 더 많은 파일과 공개 폴더를 탐색할 수 있어요.</p></div>
        </div>
        <div className="results-heading">
          <div>
            <p className="eyebrow">통합 검색 결과</p>
            <h2>‘{props.query}’ 관련 학습 자료</h2>
            <p>{props.searching ? "공개 학습 내용을 찾고 있어요." : `${props.assets.length}개 결과 · 기여 자료와 출처가 확인된 참고 자료를 함께 보여드려요.`}</p>
          </div>
          <details className="filter-panel"><summary>필터와 정렬 <span>⌄</span></summary><div className="filter-content"><p className="section-label">자료 유형</p><div className="filter-buttons">{filters.map((item) => <button key={item} className={props.filter === item ? "filter-button active" : "filter-button"} type="button" onClick={() => props.onFilter(item)}>{item}</button>)}</div><label className="sort-control">과목<select aria-label="과목" value={props.subject} onChange={(event) => props.onSubject(event.target.value)}><option value="전체">전체 과목</option>{props.subjects.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="sort-control">정렬<select aria-label="정렬 방식" value={props.sort} onChange={(event) => props.onSort(event.target.value)}><option value="relevance">관련도순</option><option value="rating">평가순</option><option value="views">조회순</option></select></label></div></details>
        </div>
        <div className="related-row">
          <span>연관</span>
          {props.relatedTerms.map((item) => <button type="button" key={item} onClick={() => { setDraft(item); props.onSearch(item); }}>{item}</button>)}
        </div>
        <div className="result-card-gallery">
          {props.assets.map((asset, index) => (
            <button className="visual-result-card" type="button" key={asset.id} onClick={() => props.onOpen(asset)}>
              <span className={`result-preview ${previewForAsset(asset) ? "has-image" : ""}`}>{previewForAsset(asset) ? <img src={previewForAsset(asset)} alt="" /> : <b>{asset.subject || "학습"}</b>}</span>
              <span className="file-copy">
                <span className="file-title">{asset.title}</span>
                <span className="file-description">{asset.searchSnippet ? <MarkedSnippet text={asset.searchSnippet} /> : asset.description}</span>
                <span className="tag-row"><span className="tag accent">{asset.subject || "분류 없음"}</span><span className="tag">{asset.type}</span>{asset.tags[0] && <span className="tag">{asset.tags[0]}</span>}{asset.sourceName && <span className="tag">출처 {asset.sourceName}</span>}</span>
              </span>
              <span className="card-arrow" aria-hidden="true">→</span>
            </button>
          ))}
          {props.folders.map((folder) => <button className="visual-result-card folder-result-card" type="button" key={folder.id} onClick={() => props.onOpenFolder(folder)}><span className="result-preview"><b>폴더</b></span><span className="file-copy"><span className="file-title">{folder.title}</span><span className="file-description">{folder.description || `${folder.itemCount || 0}개의 공개 학습 자료`}</span><span className="tag-row"><span className="tag accent">{folder.subject}</span><span className="tag">공개 폴더</span><span className="tag">{folder.itemCount || 0}개 자료</span></span></span><span className="card-arrow">→</span></button>)}
          {!props.assets.length && !props.folders.length && <div className="empty-state"><strong>일치하는 학습 파일이 없습니다.</strong><span>다른 표현이나 연관 개념으로 검색해 보세요.</span></div>}
        </div>
        </>}
      </main>
    </>
  );
}

function MarkedSnippet({ text }: { text: string }) {
  return <>{text.split(/(\[\[.*?\]\])/g).map((part, index) => part.startsWith("[[") && part.endsWith("]]" ) ? <mark key={index}>{part.slice(2, -2)}</mark> : <span key={index}>{part}</span>)}</>;
}

function DiscoveryGrid(props: Pick<Parameters<typeof SearchScreen>[0], "user" | "continuedAsset" | "myAsset" | "recommendation" | "reference" | "onOpen" | "onContribute" | "onResume">) {
  const primary = props.continuedAsset;
  return <section className="discovery-section" aria-labelledby="discovery-title">
    <div className="discovery-heading"><div><p className="eyebrow">나를 위한 학습 공간</p><h2 id="discovery-title">{props.user ? "오늘의 학습을 이어가세요." : "오늘은 무엇을 이해해 볼까요?"}</h2></div><p>짧게 읽고, 직접 떠올리고, 예시로 연결하는 학습 자료입니다.</p></div>
    <div className="discovery-grid">
      <article className="discovery-card priority-card"><span className="card-icon">↗</span><p>{props.user ? "이어 학습하기" : "추천 탐색"}</p><h3>{primary?.title || props.recommendation.title}</h3><small>{primary ? "최근 학습하던 자료를 다시 열어 보세요." : "관심 있는 과목의 예시와 회상 자료부터 시작해 보세요."}</small><button type="button" onClick={() => primary ? props.onResume(primary, "recall") : props.onOpen(props.recommendation)}>{primary ? "회상 학습 재개" : "자료 둘러보기"} <b>→</b></button></article>
      <article className="discovery-card"><span className="card-icon">＋</span><p>내 기여</p><h3>{props.myAsset?.title || "나만의 자료를 더해 보세요"}</h3><small>{props.myAsset ? "내가 공개한 자료를 확인하고 수정할 수 있어요." : "자료 기여로 학습 자료를 공개할 수 있어요."}</small><button type="button" onClick={() => props.myAsset ? props.onOpen(props.myAsset) : props.onContribute()}>{props.myAsset ? "내 자료 열기" : "자료 기여하기"} <b>→</b></button></article>
      <article className="discovery-card"><span className="card-icon">✦</span><p>오늘의 추천</p><h3>{props.recommendation.title}</h3><small>{props.recommendation.description}</small><button type="button" onClick={() => props.onOpen(props.recommendation)}>추천 자료 보기 <b>→</b></button></article>
      <article className="discovery-card"><span className="card-icon">⌁</span><p>공개 참고 자료</p><h3>{props.reference?.title || "검증된 참고 자료를 불러오는 중"}</h3><small>{props.reference ? `${props.reference.sourceName}에서 제공하는 공개 참고 자료입니다.` : "공식·교육 자료를 준비하고 있어요."}</small><button type="button" disabled={!props.reference} onClick={() => props.reference && props.onOpen(props.reference)}>{props.reference ? "참고 자료 열기" : "잠시만 기다려 주세요"} <b>→</b></button></article>
    </div>
  </section>;
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

function AttachmentPreview({ attachments }: { attachments: NonNullable<Asset["attachments"]> }) {
  const images = attachments.filter((attachment) => attachment.contentType.startsWith("image/"));
  const documents = attachments.filter((attachment) => !attachment.contentType.startsWith("image/"));
  if (!attachments.length) return null;
  return <section className="attachment-preview"><div className="attachment-preview-heading"><div><p className="section-label">업로드 원문</p><h2>{images.length ? "이미지 원문" : "첨부 파일"}</h2></div><span>{attachments.length}개</span></div>{images.length > 0 && <div className="full-image-grid">{images.map((attachment) => <figure key={attachment.url}><img src={attachment.url} alt={attachment.originalName} loading="eager" /><figcaption>{attachment.originalName}</figcaption></figure>)}</div>}{documents.length > 0 && <div className="attachment-file-list">{documents.map((attachment) => <a href={attachment.url} target="_blank" rel="noreferrer" key={attachment.url}><span>파일</span><strong>{attachment.originalName}</strong><small>원문 열기 ↗</small></a>)}</div>}</section>;
}

function LearningDetailExperience({ asset, onBack, onStart }: { asset: Asset; onBack: () => void; onStart: (mode: StudyMode) => void }) {
  const preview = previewForAsset(asset); const materials = asset.customMaterials || emptyCustomMaterials();
  const [openTool, setOpenTool] = useState<"recall" | "memory" | "examples" | "concept" | "description" | null>(null);
  const hasRecall = Boolean(materials.recall.shortCards.length || materials.recall.flashCards.length || materials.recall.quizzes.length || materials.recall.sequences.length);
  const hasMemory = Boolean(materials.memorization.items.length || materials.memorization.selections.length);
  const hasExamples = materials.examples.length > 0;
  const hasConcept = Boolean(materials.recall.conceptCanvases.length || materials.recall.conceptModels.length || materials.recall.diagrams.length);
  const hasDescription = Boolean(asset.sourceNote || asset.extractedTextPreview || asset.description);
  const tools = [
    hasRecall && { key: "recall" as const, title: "능동 회상", description: "직접 떠올리고 답을 확인해요." },
    hasMemory && { key: "memory" as const, title: "핵심 암기 자료", description: "골라 둔 핵심만 빠르게 봐요." },
    hasExamples && { key: "examples" as const, title: "예시로 설명", description: "상황과 대조 예시로 연결해요." },
    hasConcept && { key: "concept" as const, title: "개념 도형", description: "개념과 관계를 한눈에 읽어요." },
    hasDescription && { key: "description" as const, title: "자료 설명", description: "원문과 기여 설명을 확인해요." },
  ].filter(Boolean) as Array<{ key: NonNullable<typeof openTool>; title: string; description: string }>;
  return <main className="learning-detail-main"><button className="back-button" type="button" onClick={onBack}>← 검색 결과</button><header className="detail-title-on-background"><p className="eyebrow">{asset.subject || "분류 없음"} · {asset.type}</p><h1>{asset.title}</h1><div className="tag-row"><span className="tag accent">{asset.ownerName || asset.sourceName || "Dumb Can Learn"}</span>{asset.tags.slice(0, 3).map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div></header><section className="learning-detail-split"><div className={`large-asset-preview ${preview ? "has-image" : ""}`}>{preview ? <img src={preview} alt={`${asset.title} 원문 미리보기`} /> : <><span>{asset.isReference ? "참고" : "학습"}</span><b>{asset.subject || "분류 없음"}</b><small>{asset.originalName || asset.sourceName || "대표 미리보기 준비 중"}</small></>}</div><div className="learning-detail-panel"><p>{asset.description}</p><div className="learning-tool-pills">{tools.map((tool) => <button type="button" key={tool.key} className={openTool === tool.key ? "active" : ""} onClick={() => setOpenTool(openTool === tool.key ? null : tool.key)}><span>{tool.title}</span><small>{tool.description}</small><b>→</b></button>)}</div>{asset.isMine && asset.isUpload && <AddToFolder asset={asset} />}{asset.isReference && asset.sourceUrl && <a className="secondary-button" href={asset.sourceUrl} target="_blank" rel="noreferrer">출처 원문 열기 ↗</a>}</div></section>{openTool && <LearningToolContent tool={openTool} asset={asset} materials={materials} onStart={onStart} />}{asset.isUpload && asset.attachments && <AttachmentPreview attachments={asset.attachments} />}{asset.mechanicalStatus && asset.mechanicalStatus !== "none" && <MechanicalToolsPanel asset={asset} />}</main>;
}

function LearningToolContent({ tool, asset, materials, onStart }: { tool: "recall" | "memory" | "examples" | "concept" | "description"; asset: Asset; materials: CustomMaterials; onStart: (mode: StudyMode) => void }) {
  if (tool === "description") return <section className="detail-tool-content"><p className="section-label">자료 설명</p><h2>{asset.title}</h2><p>{asset.sourceNote || asset.description}</p>{asset.extractedTextPreview && <pre>{asset.extractedTextPreview}</pre>}</section>;
  if (tool === "memory") return <section className="detail-tool-content"><p className="section-label">핵심 암기 자료</p><CustomMaterialsPanelV2 materials={{ ...materials, recall: { ...materials.recall, shortCards: [], flashCards: [], quizzes: [], sequences: [], diagrams: [], conceptModels: [], conceptCanvases: [] }, examples: [] }} attachments={asset.attachments || []} /></section>;
  if (tool === "examples") return <section className="detail-tool-content"><p className="section-label">예시로 설명</p><CustomMaterialsPanelV2 materials={{ ...materials, memorization: { ...materials.memorization, items: [], selections: [] }, recall: { ...materials.recall, shortCards: [], flashCards: [], quizzes: [], sequences: [], diagrams: [], conceptModels: [], conceptCanvases: [] } }} attachments={asset.attachments || []} /></section>;
  if (tool === "concept") return <section className="detail-tool-content"><p className="section-label">개념 도형</p><CustomMaterialsPanelV2 materials={{ ...materials, memorization: { ...materials.memorization, items: [], selections: [] }, recall: { ...materials.recall, shortCards: [], flashCards: [], quizzes: [], sequences: [] }, examples: [] }} attachments={asset.attachments || []} /></section>;
  return <section className="detail-tool-content"><p className="section-label">능동 회상</p><button className="primary-button" type="button" onClick={() => onStart("recall")}>회상 학습 시작</button><CustomMaterialsPanelV2 materials={{ ...materials, memorization: { ...materials.memorization, items: [], selections: [] }, recall: { ...materials.recall, diagrams: [], conceptModels: [], conceptCanvases: [] }, examples: [] }} attachments={asset.attachments || []} /></section>;
}

function AddToFolder({ asset }: { asset: Asset }) {
  const [folders, setFolders] = useState<FolderRecord[]>([]); const [folderId, setFolderId] = useState(""); const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/folders?mine=1").then((response) => response.ok ? response.json() : { folders: [] }).then((data: { folders?: FolderRecord[] }) => setFolders(data.folders || [])).catch(() => undefined); }, []);
  async function add() { const folder = folders.find((item) => item.id === folderId); if (!folder) return; const ids = [...new Set([...(folder.items || []).map((item) => item.id), asset.id])]; const response = await fetch("/api/folders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: folder.id, title: folder.title, description: folder.description, subject: folder.subject, tags: folder.tags, contributionIds: ids }) }); setMessage(response.ok ? "폴더에 추가했습니다." : "폴더에 추가하지 못했습니다."); }
  if (!folders.length) return <small className="folder-add-note">내 공개 폴더를 계정 화면에서 먼저 만들어 보세요.</small>;
  return <div className="detail-folder-add"><select aria-label="추가할 공개 폴더" value={folderId} onChange={(event) => setFolderId(event.target.value)}><option value="">공개 폴더에 추가</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}</select><button className="secondary-button" type="button" disabled={!folderId} onClick={() => void add()}>추가</button>{message && <small>{message}</small>}</div>;
}

function DetailScreen(props: { asset: Asset; onBack: () => void; onStart: (mode: StudyMode) => void }) {
  return <LearningDetailExperience asset={props.asset} onBack={props.onBack} onStart={props.onStart} />;
  /* Legacy rich detail sections remain below for a safe future content expansion.
  if (props.asset.isReference) {
    const isExternal = props.asset.accessMode === "external_link";
    return (
      <main className="detail-main">
        <button className="back-button" type="button" onClick={props.onBack}>← 검색 결과</button>
        <section className="detail-hero uploaded-detail">
          <div className="detail-copy">
            <p className="eyebrow">{props.asset.subject || "분류 없음"} · {isExternal ? "외부 학습 자료" : "구조화 참고 자료"}</p>
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
            <strong>{props.asset.textOnly ? "텍스트만 공개" : props.asset.attachments && props.asset.attachments.length > 1 ? `원본 ${props.asset.attachments.length}개` : props.asset.tags[1]}</strong>
            <p>{props.asset.textOnly ? "원본 파일은 열리지 않으며, 추출한 텍스트와 기계적 학습 도구만 제공합니다." : "업로더가 공개한 원본입니다. 정확성과 저작권 여부를 직접 확인해 주세요."}</p>
            {props.asset.fileUrl && !props.asset.attachments?.some((attachment) => attachment.contentType.startsWith("image/")) && <a className="primary-button" href={props.asset.fileUrl} target="_blank" rel="noreferrer">파일 열기</a>}
          </div>
        </section>
        <section className="upload-notice"><strong>공개 방식</strong><p>{props.asset.tags[0] === "AI 검수 완료" ? "AI가 학습 구조와 품질 기준을 확인한 뒤 공개된 자료입니다. 기여자에게 검수 공개 보상 크레딧이 지급되었습니다." : "기여자가 AI 검수 없이 즉시 공개한 원본 자료입니다. 이 방식에는 기여 보상 크레딧이 지급되지 않습니다."}</p></section>
        {props.asset.attachments && <AttachmentPreview attachments={props.asset.attachments} />}
        {props.asset.customMaterials && hasCustomMaterials(props.asset.customMaterials) && <CustomMaterialsPanelV2 materials={props.asset.customMaterials} attachments={props.asset.attachments || []} />}
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

*/}

function CustomMaterialsPanel({ materials }: { materials: CustomMaterials }) {
  const [revealedCards, setRevealedCards] = useState<Record<number, boolean>>({});
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [sequenceOrders, setSequenceOrders] = useState<Record<number, number[]>>({});
  const [diagramAnswers, setDiagramAnswers] = useState<Record<number, string>>({});
  return <section className="custom-materials-panel">
    <div className="mechanical-heading"><div><p className="eyebrow">기여자가 만든 학습 도구</p><h2>암기·회상·예시로 학습하기</h2></div><span>직접 작성</span></div>
    {materials.memorization.items.length > 0 && <article className="memorization-card"><p className="section-label">암기 액기스</p><h3>{materials.memorization.title}</h3><ul>{materials.memorization.items.map((item, index) => <li key={`${item}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b><span>{item}</span></li>)}</ul></article>}
    {materials.recall.shortCards.length > 0 && <div className="custom-tool-section"><p className="section-label">짧은 회상 카드</p><div className="custom-card-grid">{materials.recall.shortCards.map((card, index) => <article key={`${card.question}-${index}`}><span>Q{index + 1}</span><strong>{card.question}</strong><button type="button" className="secondary-button" onClick={() => setRevealedCards((current) => ({ ...current, [index]: !current[index] }))}>{revealedCards[index] ? "답 가리기" : "답 보기"}</button>{revealedCards[index] && <p>{card.answer}</p>}</article>)}</div></div>}
    {materials.recall.quizzes.length > 0 && <div className="custom-tool-section"><p className="section-label">빠른 선택 퀴즈</p>{materials.recall.quizzes.map((quiz, index) => <article className="quiz-card" key={`${quiz.question}-${index}`}><strong>{quiz.question}</strong><div>{quiz.options.map((option, optionIndex) => <button key={option} type="button" className={quizAnswers[index] === optionIndex ? "active" : ""} onClick={() => setQuizAnswers((current) => ({ ...current, [index]: optionIndex }))}>{option}</button>)}</div>{quizAnswers[index] !== undefined && <p className={quizAnswers[index] === quiz.answerIndex ? "answer-correct" : "answer-wrong"}>{quizAnswers[index] === quiz.answerIndex ? "정답입니다." : `정답: ${quiz.options[quiz.answerIndex]}`}{quiz.explanation ? ` ${quiz.explanation}` : ""}</p>}</article>)}</div>}
    {materials.recall.sequences.length > 0 && <div className="custom-tool-section"><p className="section-label">순서 맞추기</p>{materials.recall.sequences.map((sequence, index) => { const order = sequenceOrders[index] || []; const remaining = sequence.items.map((_, itemIndex) => itemIndex).filter((itemIndex) => !order.includes(itemIndex)); const complete = order.length === sequence.items.length; const correct = complete && order.every((itemIndex, orderIndex) => itemIndex === orderIndex); return <article className="sequence-card" key={`${sequence.prompt}-${index}`}><strong>{sequence.prompt}</strong><div className="sequence-selected">{order.length ? order.map((itemIndex, orderIndex) => <button type="button" key={`${itemIndex}-${orderIndex}`} onClick={() => setSequenceOrders((current) => ({ ...current, [index]: current[index].filter((value) => value !== itemIndex) }))}>{orderIndex + 1}. {sequence.items[itemIndex]}</button>) : <span>아래 항목을 순서대로 눌러 보세요.</span>}</div><div className="sequence-options">{remaining.map((itemIndex) => <button type="button" key={itemIndex} onClick={() => setSequenceOrders((current) => ({ ...current, [index]: [...(current[index] || []), itemIndex] }))}>{sequence.items[itemIndex]}</button>)}</div>{complete && <p className={correct ? "answer-correct" : "answer-wrong"}>{correct ? "순서가 맞습니다." : "순서를 다시 조정해 보세요. 선택한 항목을 누르면 되돌릴 수 있습니다."}</p>}</article>; })}</div>}
    {materials.recall.diagrams.length > 0 && <div className="custom-tool-section"><p className="section-label">개념 구조 빈칸 채우기</p>{materials.recall.diagrams.map((diagram, index) => { const expected = diagram.nodes[diagram.blankIndex]; const answer = diagramAnswers[index] || ""; const checked = answer.trim().length > 0; return <article className="diagram-card" key={`${diagram.title}-${index}`}><strong>{diagram.title}</strong><div className="concept-flow">{diagram.nodes.map((node, nodeIndex) => <><div className={nodeIndex === diagram.blankIndex ? "concept-node blank" : "concept-node"} key={`${node}-${nodeIndex}`}>{nodeIndex === diagram.blankIndex ? <input aria-label={`${diagram.title} 빈칸`} value={answer} onChange={(event) => setDiagramAnswers((current) => ({ ...current, [index]: event.target.value }))} placeholder="빈칸" /> : node}</div>{nodeIndex < diagram.nodes.length - 1 && <span key={`arrow-${nodeIndex}`}>→</span>}</>)}</div>{checked && <p className={answer.trim() === expected ? "answer-correct" : "answer-wrong"}>{answer.trim() === expected ? "정답입니다." : `정답: ${expected}`}{diagram.explanation ? ` ${diagram.explanation}` : ""}</p>}</article>; })}</div>}
    {materials.examples.length > 0 && <div className="custom-tool-section"><p className="section-label">예시로 설명</p><div className="example-explain-grid">{materials.examples.map((example, index) => <article key={`${example.situation}-${index}`}><span>예시 {index + 1}</span><h3>{example.situation}</h3><p>{example.explanation}</p><b>{example.takeaway}</b></article>)}</div></div>}
  </section>;
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
  completed: boolean;
  onRestart: () => void;
}) {
  const modeName = modes.find((item) => item.id === props.mode)?.title ?? "학습";
  return (
    <main className="study-main">
      <div className="study-topline">
        <button className="back-button" type="button" onClick={props.onClose}>← 자료로 돌아가기</button>
        <span>{props.asset.title}</span>
        <strong>{modeName}</strong>
      </div>
      {props.completed ? <section className="activity-panel completion-panel"><p className="eyebrow">학습 기록 저장 완료</p><h1>{modeName}을 끝냈습니다.</h1><p>마지막 단계까지 진행한 기록이 저장되었습니다. 지금 바로 다시 풀거나 자료 화면으로 돌아갈 수 있어요.</p><div className="activity-actions"><button className="secondary-button" type="button" onClick={props.onRestart}>처음부터 다시</button><button className="primary-button" type="button" onClick={props.onClose}>자료로 돌아가기</button></div></section> : <>
      {props.mode === "info" && <InfoStudy onMode={props.onMode} />}
      {props.mode === "examples" && <ExampleStudy index={props.index} revealed={props.revealed} answer={props.answer} onAnswer={props.onAnswer} onReveal={props.onReveal} onNext={props.onNext} />}
      {props.mode === "recall" && <RecallStudy index={props.index} revealed={props.revealed} answer={props.answer} confidence={props.confidence} onAnswer={props.onAnswer} onReveal={props.onReveal} onConfidence={props.onConfidence} onNext={props.onNext} />}
      {props.mode === "plan" && <PlanBuilder onStart={props.onMode} />}
      </>}
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
      {props.revealed && <div className="activity-actions"><button className="secondary-button" type="button" onClick={() => props.onNext(examples.length)}>{props.index === examples.length - 1 ? "예시 학습 완료" : "다음 예시"} →</button></div>}
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
          <div className="activity-actions"><button className="secondary-button" type="button" onClick={() => props.onNext(recallQuestions.length)} disabled={!props.confidence}>{props.index === recallQuestions.length - 1 ? "회상 학습 완료" : "다음 질문"} →</button></div>
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
  const [customMaterials, setCustomMaterials] = useState<CustomMaterials>(() => emptyCustomMaterials());
  const [materialsOpen, setMaterialsOpen] = useState(false);
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
    body.set("customMaterials", JSON.stringify(customMaterials));
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
          <section className="materials-launcher"><div><span>직접 만든 학습 도구</span><strong>암기·회상·예시 자료 구체화</strong><p>기여 자료와 함께 공개할 학습 도구를 직접 작성합니다.</p></div><button className="secondary-button" type="button" onClick={() => setMaterialsOpen(true)}>자료 구체화 {hasCustomMaterials(customMaterials) ? "수정" : "시작"}</button></section>
          <label><span>출처와 설명</span><textarea value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} placeholder="자료의 출처와 어떤 학습에 도움이 되는지 적어주세요." rows={5} /></label>
          <label className="check-row"><input type="checkbox" checked={licenseConfirmed} onChange={(event) => setLicenseConfirmed(event.target.checked)} /><span>이 자료를 공유할 권한이 있으며, {publishMode === "instant" ? "검수 없이 즉시 공개되고 크레딧이 지급되지 않는 것" : "AI가 자료를 분석하며 통과한 경우에만 공개·보상되는 것"}에 동의합니다.</span></label>
          <button className="primary-button wide" type="submit" disabled={submitting || !file || !title || !licenseConfirmed}>{submitting ? (publishMode === "instant" ? "공개하고 있어요…" : "AI 검수를 진행하고 있어요…") : (publishMode === "instant" ? "즉시 공개하기 · 0 크레딧" : "AI 검수 요청하기 · 통과 시 +20")}</button>
          {result && <div className={result.ok ? "submission-result success" : "submission-result error"}><strong>{result.ok ? "접수 완료" : "확인 필요"}</strong><p>{result.message}</p>{result.status && <span>현재 상태 · {result.status}</span>}</div>}
        </form>
      </div>
      {materialsOpen && <CustomMaterialsDialog materials={customMaterials} onChange={setCustomMaterials} onClose={() => setMaterialsOpen(false)} />}
    </main>
  );
}

function LineItemsEditor({ value, onChange, placeholder, addLabel = "항목 추가" }: { value: string[]; onChange: (value: string[]) => void; placeholder: string; addLabel?: string }) {
  return <div className="line-items-editor">{value.map((item, index) => <div key={index}><input value={item} placeholder={placeholder} onChange={(event) => onChange(value.map((current, currentIndex) => currentIndex === index ? event.target.value : current))} /><button type="button" aria-label="항목 삭제" onClick={() => onChange(value.filter((_, currentIndex) => currentIndex !== index))}>×</button></div>)}<button className="text-button" type="button" onClick={() => onChange([...value, ""])}>+ {addLabel}</button></div>;
}

function CustomMaterialsDialog({ materials, onChange, onClose }: { materials: CustomMaterials; onChange: (materials: CustomMaterials) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"memory" | "recall" | "examples">("memory");
  const setRecall = (recall: CustomMaterials["recall"]) => onChange({ ...materials, recall });
  const setShortCard = (index: number, key: "question" | "answer", value: string) => setRecall({ ...materials.recall, shortCards: materials.recall.shortCards.map((card, cardIndex) => cardIndex === index ? { ...card, [key]: value } : card) });
  return <div className="materials-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="materials-dialog" role="dialog" aria-modal="true" aria-labelledby="materials-dialog-title"><div className="dialog-heading"><div><p className="eyebrow">자료 구체화</p><h2 id="materials-dialog-title">학습에 바로 쓰이는 자료 만들기</h2></div><button type="button" aria-label="닫기" onClick={onClose}>×</button></div><div className="material-tabs"><button type="button" className={tab === "memory" ? "active" : ""} onClick={() => setTab("memory")}>1. 암기 자료 표시</button><button type="button" className={tab === "recall" ? "active" : ""} onClick={() => setTab("recall")}>2. 회상용 키트 제작</button><button type="button" className={tab === "examples" ? "active" : ""} onClick={() => setTab("examples")}>3. 예시로 설명</button></div>
    {tab === "memory" && <div className="material-tab-content"><p>학습자가 따로 외우면 좋은 정의·공식·판단 기준을 한 줄씩 적어 주세요.</p><label><span>암기 자료 제목</span><input value={materials.memorization.title} onChange={(event) => onChange({ ...materials, memorization: { ...materials.memorization, title: event.target.value } })} placeholder="예: 돌림힘 암기 액기스" /></label><label><span>중요 문장·정의·공식</span><LineItemsEditor value={materials.memorization.items} onChange={(items) => onChange({ ...materials, memorization: { ...materials.memorization, items } })} placeholder="예: 힘의 작용선이 회전축을 지나면 돌림힘은 0이다." addLabel="암기 항목 추가" /></label></div>}
    {tab === "recall" && <div className="material-tab-content recall-authoring"><p>짧고 직접적인 질문과 답을 중심으로 회상 도구를 만듭니다. 비어 있는 항목은 저장되지 않습니다.</p><section><div className="authoring-title"><h3>짧은 회상 카드</h3><button className="text-button" type="button" onClick={() => setRecall({ ...materials.recall, shortCards: [...materials.recall.shortCards, { question: "", answer: "" }] })}>+ 카드 추가</button></div>{materials.recall.shortCards.map((card, index) => <article key={index} className="authoring-card"><button className="remove-card" type="button" aria-label="카드 삭제" onClick={() => setRecall({ ...materials.recall, shortCards: materials.recall.shortCards.filter((_, cardIndex) => cardIndex !== index) })}>×</button><input value={card.question} onChange={(event) => setShortCard(index, "question", event.target.value)} placeholder="짧은 질문" /><textarea value={card.answer} onChange={(event) => setShortCard(index, "answer", event.target.value)} placeholder="짧은 답" rows={2} /></article>)}</section>
      <section><div className="authoring-title"><h3>빠른 선택 퀴즈</h3><button className="text-button" type="button" onClick={() => setRecall({ ...materials.recall, quizzes: [...materials.recall.quizzes, { question: "", options: ["", ""], answerIndex: 0, explanation: "" }] })}>+ 퀴즈 추가</button></div>{materials.recall.quizzes.map((quiz, index) => <article key={index} className="authoring-card"><button className="remove-card" type="button" aria-label="퀴즈 삭제" onClick={() => setRecall({ ...materials.recall, quizzes: materials.recall.quizzes.filter((_, quizIndex) => quizIndex !== index) })}>×</button><input value={quiz.question} onChange={(event) => setRecall({ ...materials.recall, quizzes: materials.recall.quizzes.map((current, quizIndex) => quizIndex === index ? { ...current, question: event.target.value } : current) })} placeholder="질문" /><label><span>선택지 (한 줄에 하나)</span><textarea value={quiz.options.join("\n")} onChange={(event) => setRecall({ ...materials.recall, quizzes: materials.recall.quizzes.map((current, quizIndex) => quizIndex === index ? { ...current, options: event.target.value.split("\n") } : current) })} rows={3} placeholder="선택지 1\n선택지 2" /></label><label><span>정답</span><select value={quiz.answerIndex} onChange={(event) => setRecall({ ...materials.recall, quizzes: materials.recall.quizzes.map((current, quizIndex) => quizIndex === index ? { ...current, answerIndex: Number(event.target.value) } : current) })}>{quiz.options.map((option, optionIndex) => <option value={optionIndex} key={optionIndex}>{option || `선택지 ${optionIndex + 1}`}</option>)}</select></label><textarea value={quiz.explanation} onChange={(event) => setRecall({ ...materials.recall, quizzes: materials.recall.quizzes.map((current, quizIndex) => quizIndex === index ? { ...current, explanation: event.target.value } : current) })} rows={2} placeholder="정답 설명 (선택)" /></article>)}</section>
      <section><div className="authoring-title"><h3>순서 맞추기</h3><button className="text-button" type="button" onClick={() => setRecall({ ...materials.recall, sequences: [...materials.recall.sequences, { prompt: "", items: ["", ""] }] })}>+ 순서 자료 추가</button></div>{materials.recall.sequences.map((sequence, index) => <article key={index} className="authoring-card"><button className="remove-card" type="button" aria-label="순서 자료 삭제" onClick={() => setRecall({ ...materials.recall, sequences: materials.recall.sequences.filter((_, sequenceIndex) => sequenceIndex !== index) })}>×</button><input value={sequence.prompt} onChange={(event) => setRecall({ ...materials.recall, sequences: materials.recall.sequences.map((current, sequenceIndex) => sequenceIndex === index ? { ...current, prompt: event.target.value } : current) })} placeholder="예: 다음 과정을 올바른 순서로 배열하세요." /><label><span>정답 순서 (한 줄에 하나)</span><textarea value={sequence.items.join("\n")} onChange={(event) => setRecall({ ...materials.recall, sequences: materials.recall.sequences.map((current, sequenceIndex) => sequenceIndex === index ? { ...current, items: event.target.value.split("\n") } : current) })} rows={3} /></label></article>)}</section>
      <section><div className="authoring-title"><h3>개념 구조 빈칸 채우기</h3><button className="text-button" type="button" onClick={() => setRecall({ ...materials.recall, diagrams: [...materials.recall.diagrams, { title: "", nodes: ["", ""], blankIndex: 0, explanation: "" }] })}>+ 구조 추가</button></div>{materials.recall.diagrams.map((diagram, index) => <article key={index} className="authoring-card"><button className="remove-card" type="button" aria-label="구조 삭제" onClick={() => setRecall({ ...materials.recall, diagrams: materials.recall.diagrams.filter((_, diagramIndex) => diagramIndex !== index) })}>×</button><input value={diagram.title} onChange={(event) => setRecall({ ...materials.recall, diagrams: materials.recall.diagrams.map((current, diagramIndex) => diagramIndex === index ? { ...current, title: event.target.value } : current) })} placeholder="구조 제목" /><label><span>개념 상자 순서 (한 줄에 하나)</span><textarea value={diagram.nodes.join("\n")} onChange={(event) => setRecall({ ...materials.recall, diagrams: materials.recall.diagrams.map((current, diagramIndex) => diagramIndex === index ? { ...current, nodes: event.target.value.split("\n"), blankIndex: 0 } : current) })} rows={3} /></label><label><span>빈칸으로 만들 상자</span><select value={diagram.blankIndex} onChange={(event) => setRecall({ ...materials.recall, diagrams: materials.recall.diagrams.map((current, diagramIndex) => diagramIndex === index ? { ...current, blankIndex: Number(event.target.value) } : current) })}>{diagram.nodes.map((node, nodeIndex) => <option value={nodeIndex} key={nodeIndex}>{node || `상자 ${nodeIndex + 1}`}</option>)}</select></label><textarea value={diagram.explanation} onChange={(event) => setRecall({ ...materials.recall, diagrams: materials.recall.diagrams.map((current, diagramIndex) => diagramIndex === index ? { ...current, explanation: event.target.value } : current) })} rows={2} placeholder="정답 설명 (선택)" /></article>)}</section></div>}
    {tab === "examples" && <div className="material-tab-content"><p>구체적인 상황과 설명을 연결해 개념이 언제 쓰이는지 보여 주세요.</p><div className="authoring-title"><h3>예시 상황</h3><button className="text-button" type="button" onClick={() => onChange({ ...materials, examples: [...materials.examples, { situation: "", misconception: "", contrast: "", explanation: "", takeaway: "" }] })}>+ 예시 추가</button></div>{materials.examples.map((example, index) => <article key={index} className="authoring-card"><button className="remove-card" type="button" aria-label="예시 삭제" onClick={() => onChange({ ...materials, examples: materials.examples.filter((_, exampleIndex) => exampleIndex !== index) })}>×</button><textarea value={example.situation} onChange={(event) => onChange({ ...materials, examples: materials.examples.map((current, exampleIndex) => exampleIndex === index ? { ...current, situation: event.target.value } : current) })} rows={2} placeholder="예시 상황" /><textarea value={example.explanation} onChange={(event) => onChange({ ...materials, examples: materials.examples.map((current, exampleIndex) => exampleIndex === index ? { ...current, explanation: event.target.value } : current) })} rows={3} placeholder="이 상황에서의 부가 설명" /><input value={example.takeaway} onChange={(event) => onChange({ ...materials, examples: materials.examples.map((current, exampleIndex) => exampleIndex === index ? { ...current, takeaway: event.target.value } : current) })} placeholder="기억할 핵심 문장" /></article>)}</div>}
    <div className="dialog-actions"><span>작성한 내용은 자료와 함께 공개됩니다.</span><button className="primary-button" type="button" onClick={onClose}>저장하고 닫기</button></div></section></div>;
}

function ContributionScreenV2({ onBack, onPublished }: { onBack: () => void; onPublished: (item: ContributionRecord) => void }) {
  const [files, setFiles] = useState<File[]>([]); const [title, setTitle] = useState(""); const [sourceNote, setSourceNote] = useState("");
  const [subject, setSubject] = useState(""); const [tags, setTags] = useState("");
  const [publishMode, setPublishMode] = useState<"instant" | "ai_review">("instant"); const [ocr, setOcr] = useState(false); const [textOnly, setTextOnly] = useState(false); const [splitQuestionSet, setSplitQuestionSet] = useState(false); const [createRecall, setCreateRecall] = useState(false);
  const [customMaterials, setCustomMaterials] = useState<CustomMaterials>(() => emptyCustomMaterials()); const [materialsOpen, setMaterialsOpen] = useState(false); const [extractedTexts, setExtractedTexts] = useState<string[]>([]); const [extracting, setExtracting] = useState(false); const [extractMessages, setExtractMessages] = useState<string[]>([]); const [workspaceTab, setWorkspaceTab] = useState<"description" | "memory" | "examples" | "concept">("description"); const [folders, setFolders] = useState<FolderRecord[]>([]); const [folderId, setFolderId] = useState("");
  const [licenseConfirmed, setLicenseConfirmed] = useState(false); const [submitting, setSubmitting] = useState(false); const [result, setResult] = useState<{ ok: boolean; message: string; status?: string } | null>(null);
  const imageSelected = hasImageSelection(customMaterials);
  const extractedText = useMemo(() => extractedTexts.map((text, index) => text ? `--- ${files[index]?.name || `파일 ${index + 1}`} ---\n${text}` : "").filter(Boolean).join("\n\n"), [extractedTexts, files]);
  useEffect(() => { if (imageSelected) setTextOnly(false); }, [imageSelected]);
  useEffect(() => { fetch("/api/folders?mine=1").then((response) => response.ok ? response.json() : { folders: [] }).then((data: { folders?: FolderRecord[] }) => setFolders(data.folders || [])).catch(() => undefined); }, []);
  async function chooseFiles(next: FileList | File[] | null, append = false) {
    const incoming = Array.from(next || []); if (!incoming.length) return;
    const merged = (append ? [...files, ...incoming] : incoming).filter((file, index, all) => all.findIndex((candidate) => candidate.name === file.name && candidate.size === file.size && candidate.lastModified === file.lastModified) === index).slice(0, 5);
    setFiles(merged); setExtractedTexts([]); setExtractMessages([]); setResult(null); setExtracting(true);
    const readings = await Promise.all(merged.map(async (file) => {
      if (isImageFile(file)) return { text: "", message: "사진 · OCR을 선택하면 텍스트로 바꿉니다." };
      if (/\.pptx$/i.test(file.name)) return { text: "", message: "PPTX · 기존 OCR 처리 흐름을 사용합니다." };
      try { const text = await extractDocumentText(file); return { text, message: text ? `본문 ${text.length.toLocaleString("ko-KR")}자를 바로 읽었습니다.` : "본문이 없어 OCR을 선택해 보세요." }; } catch { return { text: "", message: "본문을 바로 읽지 못했습니다. OCR을 선택해 보세요." }; }
    }));
    setExtractedTexts(readings.map((reading) => reading.text)); setExtractMessages(readings.map((reading) => reading.message)); setExtracting(false);
  }
  function removeFile(index: number) {
    setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setExtractedTexts((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setExtractMessages((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setCustomMaterials((current) => ({ ...current, memorization: { ...current.memorization, selections: current.memorization.selections.reduce<SourceSelection[]>((next, selection) => {
      if (selection.kind !== "image") { next.push(selection); return next; }
      const attachmentIndex = selection.attachmentIndex ?? 0;
      if (attachmentIndex !== index) next.push({ ...selection, attachmentIndex: attachmentIndex > index ? attachmentIndex - 1 : attachmentIndex });
      return next;
    }, []) } }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!files.length) return; setSubmitting(true); setResult(null);
    const body = new FormData(); files.forEach((file) => body.append("files", file)); body.set("title", title); body.set("sourceNote", sourceNote); body.set("subject", subject); body.set("tags", tags); body.set("publishMode", publishMode); body.set("ocr", String(ocr)); body.set("textOnly", String(textOnly)); body.set("splitQuestions", String(splitQuestionSet)); body.set("createRecall", String(createRecall)); body.set("customMaterials", JSON.stringify(customMaterials)); body.set("extractedTexts", JSON.stringify(extractedTexts)); body.set("licenseConfirmed", String(licenseConfirmed));
    try { const response = await fetch("/api/contributions", { method: "POST", body }); const data = await response.json() as { error?: string; message?: string; contribution?: ContributionRecord & { status?: string } }; setResult({ ok: response.ok, message: data.message || data.error || "처리 결과를 확인할 수 없습니다.", status: data.contribution?.status }); if (response.ok && data.contribution && ["published", "published_ai"].includes(data.contribution.status || "")) { onPublished(data.contribution); const folder = folders.find((item) => item.id === folderId); if (folder) await fetch("/api/folders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: folder.id, title: folder.title, description: folder.description, subject: folder.subject, tags: folder.tags, contributionIds: [...new Set([...(folder.items || []).map((item) => item.id), data.contribution.id])] }) }); } } catch { setResult({ ok: false, message: "업로드 중 연결 문제가 발생했습니다. 다시 시도해 주세요." }); } finally { setSubmitting(false); }
  }
  return <ContributionWorkspace onBack={onBack} files={files} title={title} setTitle={setTitle} sourceNote={sourceNote} setSourceNote={setSourceNote} subject={subject} setSubject={setSubject} tags={tags} setTags={setTags} folders={folders} folderId={folderId} setFolderId={setFolderId} publishMode={publishMode} setPublishMode={setPublishMode} ocr={ocr} setOcr={setOcr} textOnly={textOnly} setTextOnly={setTextOnly} splitQuestionSet={splitQuestionSet} setSplitQuestionSet={setSplitQuestionSet} createRecall={createRecall} setCreateRecall={setCreateRecall} customMaterials={customMaterials} setCustomMaterials={setCustomMaterials} filesLoading={extracting} extractMessages={extractMessages} extractedText={extractedText} chooseFiles={chooseFiles} removeFile={removeFile} tab={workspaceTab} setTab={setWorkspaceTab} licenseConfirmed={licenseConfirmed} setLicenseConfirmed={setLicenseConfirmed} submitting={submitting} result={result} submit={submit} />;
  /* Legacy modal contribution layout retained in source while the workspace is adopted.
  return <main className="contribution-main"><button className="back-button" type="button" onClick={onBack}>← 검색으로 돌아가기</button><div className="contribution-grid"><section className="contribution-intro"><p className="eyebrow">자료 기여</p><h1>원문에서 학습 도구까지 만드세요.</h1><p>문서의 글자를 바로 읽고, 암기·회상·예시 도구를 기여 자료와 함께 공개합니다.</p><ol><li><span>1</span><div><strong>원문 바로 읽기</strong><p>Word와 텍스트 PDF는 OCR 없이 본문을 추출합니다.</p></div></li><li><span>2</span><div><strong>자료 구체화</strong><p>원문에서 필요한 부분을 골라 암기와 회상 도구로 바꿉니다.</p></div></li><li><span>3</span><div><strong>공개·검수</strong><p>AI 검수에는 원본 대신 추출 텍스트만 전달됩니다.</p></div></li></ol></section><form className="contribution-form" onSubmit={submit}>
    <fieldset className="publish-mode-field"><legend>공개 방식</legend><div><button className={publishMode === "instant" ? "publish-option active" : "publish-option"} type="button" onClick={() => setPublishMode("instant")}><span>즉시 공개</span><strong>0 크레딧</strong><small>검수 없이 바로 공개</small></button><button className={publishMode === "ai_review" ? "publish-option reward active" : "publish-option reward"} type="button" onClick={() => setPublishMode("ai_review")}><span>AI 검수 공개</span><strong>+20 크레딧</strong><small>텍스트 기준으로 검수</small></button></div></fieldset>
    <label><span>자료 제목</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: 가족 유사성 핵심 필기" required /></label>
    <div className="contribution-classification"><label><span>과목 <small>선택</small></span><input list="subject-options" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="예: 철학, 영어, 생명과학" /><datalist id="subject-options"><option value="물리학" /><option value="영어" /><option value="수학" /><option value="철학" /><option value="기타" /></datalist></label><label><span>자유 태그 <small>쉼표로 구분</small></span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="예: 가족 유사성, 위트겐슈타인" /></label></div>
    <label className="upload-field"><span>파일 여러 개</span><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.docx,.pptx" onChange={(event) => void chooseFiles(event.target.files)} /><div><strong>{files.length ? `${files.length}개 파일 선택됨` : "파일을 선택하세요"}</strong><small>{files.length ? "사진과 문서를 한 자료로 묶어 공개합니다." : "PDF, Word, 이미지, 텍스트 · 최대 5개 · 파일당 8MB"}</small></div></label>
    <label className="camera-field"><span>또는 사진 촬영</span><input type="file" multiple accept="image/png,image/jpeg,image/webp" capture="environment" onChange={(event) => void chooseFiles(event.target.files, true)} /><small>휴대폰에서 촬영한 사진은 기존 선택 목록에 추가됩니다.</small></label>
    {files.length > 0 && <UploadSelectionPreview files={files} onRemove={removeFile} />}
    {files.length > 0 && <div className="document-read-list">{extracting ? <p className="document-read-status">문서 본문을 읽고 있어요…</p> : files.map((file, index) => <p className={extractMessages[index]?.includes("못") ? "document-read-status warning" : "document-read-status"} key={`${file.name}-${index}`}><strong>{file.name}</strong>{extractMessages[index] || "파일을 분석할 준비가 되었습니다."}</p>)}</div>}
    <fieldset className="mechanical-tools"><legend>기계적 처리 도구 <small>AI 검수와 별도로 작동</small></legend><p>{extractedText ? "문서 본문을 바로 읽었습니다. AI 검수에는 모든 자료에서 추출한 텍스트만 전달됩니다." : "이미지와 스캔 문서는 OCR로 글자를 추출합니다. AI 검수에는 원본 파일이 아닌 텍스트만 전달됩니다."}</p><label><input type="checkbox" checked={ocr || (publishMode === "ai_review" && files.some((file, index) => !extractedTexts[index] && !/\.pptx$/i.test(file.name)))} disabled={publishMode === "ai_review" && files.some((file, index) => !extractedTexts[index] && !/\.pptx$/i.test(file.name))} onChange={(event) => setOcr(event.target.checked)} /> 이미지·스캔 문서 글자 인식(Azure OCR)</label><label><input type="checkbox" checked={textOnly} disabled={imageSelected} onChange={(event) => setTextOnly(event.target.checked)} /> 원본 대신 텍스트만 학습 DB에 공개 {imageSelected && "(이미지 암기 영역을 선택해 사용할 수 없음)"}</label><label><input type="checkbox" checked={splitQuestionSet} onChange={(event) => setSplitQuestionSet(event.target.checked)} /> 번호가 있는 문제를 문제별로 나누기</label><label><input type="checkbox" checked={createRecall} onChange={(event) => setCreateRecall(event.target.checked)} /> 규칙 기반 능동 회상 카드 만들기</label></fieldset>
    <section className="materials-launcher"><div><span>직접 만든 학습 도구</span><strong>원문 선택 · 암기 · 회상 · 3D 개념도</strong><p>문장은 드래그해 고르고, 사진은 필요한 부분을 잘라 암기 자료로 만듭니다.</p></div><button className="secondary-button" type="button" disabled={!files.length} onClick={() => setMaterialsOpen(true)}>자료 구체화 {hasCustomMaterials(customMaterials) ? "수정" : "시작"}</button></section>
    <label><span>출처와 설명</span><textarea value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} placeholder="자료의 출처와 어떤 학습에 도움이 되는지 적어주세요." rows={5} /></label><label className="check-row"><input type="checkbox" checked={licenseConfirmed} onChange={(event) => setLicenseConfirmed(event.target.checked)} /><span>이 자료를 공유할 권한이 있으며, {publishMode === "instant" ? "검수 없이 즉시 공개되고 크레딧이 지급되지 않는 것" : "AI가 추출 텍스트를 기준으로 검수하고 통과한 경우에만 공개·보상되는 것"}에 동의합니다.</span></label><button className="primary-button wide" type="submit" disabled={submitting || extracting || !files.length || !title || !licenseConfirmed}>{submitting ? "자료를 처리하고 있어요…" : publishMode === "instant" ? "즉시 공개하기 · 0 크레딧" : "AI 검수 요청하기 · 통과 시 +20"}</button>{result && <div className={result.ok ? "submission-result success" : "submission-result error"}><strong>{result.ok ? "접수 완료" : "확인 필요"}</strong><p>{result.message}</p>{result.status && <span>현재 상태 · {result.status}</span>}</div>}</form></div>{materialsOpen && <CustomMaterialsDialogV2 materials={customMaterials} files={files} extractedText={extractedText} onChange={setCustomMaterials} onClose={() => setMaterialsOpen(false)} />}</main>; */
}

function ContributionWorkspace(props: { onBack: () => void; files: File[]; title: string; setTitle: (value: string) => void; sourceNote: string; setSourceNote: (value: string) => void; subject: string; setSubject: (value: string) => void; tags: string; setTags: (value: string) => void; folders: FolderRecord[]; folderId: string; setFolderId: (value: string) => void; publishMode: "instant" | "ai_review"; setPublishMode: (value: "instant" | "ai_review") => void; ocr: boolean; setOcr: (value: boolean) => void; textOnly: boolean; setTextOnly: (value: boolean) => void; splitQuestionSet: boolean; setSplitQuestionSet: (value: boolean) => void; createRecall: boolean; setCreateRecall: (value: boolean) => void; customMaterials: CustomMaterials; setCustomMaterials: (value: CustomMaterials | ((current: CustomMaterials) => CustomMaterials)) => void; filesLoading: boolean; extractMessages: string[]; extractedText: string; chooseFiles: (files: FileList | File[] | null, append?: boolean) => Promise<void>; removeFile: (index: number) => void; tab: "description" | "memory" | "examples" | "concept"; setTab: (value: "description" | "memory" | "examples" | "concept") => void; licenseConfirmed: boolean; setLicenseConfirmed: (value: boolean) => void; submitting: boolean; result: { ok: boolean; message: string; status?: string } | null; submit: (event: FormEvent) => Promise<void> }) {
  const setRecall = (recall: CustomMaterials["recall"]) => props.setCustomMaterials({ ...props.customMaterials, recall });
  const addSelection = (selection: SourceSelection) => props.setCustomMaterials({ ...props.customMaterials, memorization: { ...props.customMaterials.memorization, selections: [...props.customMaterials.memorization.selections, selection] } });
  const addExample = () => props.setCustomMaterials({ ...props.customMaterials, examples: [...props.customMaterials.examples, { situation: "", misconception: "", contrast: "", explanation: "", takeaway: "" }] });
  return <main className="contribution-workspace"><button className="back-button" type="button" onClick={props.onBack}>← 검색으로 돌아가기</button><form onSubmit={props.submit} className="workspace-form"><aside className="workspace-source"><div className="workspace-heading"><p className="eyebrow">자료 기여</p><h1>원문 작업대</h1><p>여러 파일을 한 자료로 묶고, 필요한 부분을 바로 학습 도구로 바꿉니다.</p></div><label className="upload-field"><span>원문 추가</span><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.docx,.pptx" onChange={(event) => void props.chooseFiles(event.target.files, Boolean(props.files.length))} /><div><strong>{props.files.length ? `${props.files.length}개 파일 선택됨` : "파일을 선택하세요"}</strong><small>PDF, Word, 이미지, 텍스트 · 최대 5개</small></div></label><label className="camera-field"><span>사진 촬영</span><input type="file" multiple accept="image/png,image/jpeg,image/webp" capture="environment" onChange={(event) => void props.chooseFiles(event.target.files, true)} /><small>휴대폰 카메라에서 새 사진을 원문에 추가합니다.</small></label>{props.files.length > 0 && <UploadSelectionPreview files={props.files} onRemove={props.removeFile} />}{props.files.length > 0 && <div className="document-read-list">{props.filesLoading ? <p className="document-read-status">문서 본문을 읽고 있어요…</p> : props.files.map((file, index) => <p className="document-read-status" key={`${file.name}-${index}`}><strong>{file.name}</strong>{props.extractMessages[index] || "원문 준비 완료"}</p>)}</div>}<fieldset className="mechanical-tools compact-tools"><legend>기계적 처리</legend><label><input type="checkbox" checked={props.ocr} onChange={(event) => props.setOcr(event.target.checked)} /> 이미지·스캔 OCR</label><label><input type="checkbox" checked={props.textOnly} onChange={(event) => props.setTextOnly(event.target.checked)} /> 텍스트만 공개</label><label><input type="checkbox" checked={props.splitQuestionSet} onChange={(event) => props.setSplitQuestionSet(event.target.checked)} /> 문제별 나누기</label><label><input type="checkbox" checked={props.createRecall} onChange={(event) => props.setCreateRecall(event.target.checked)} /> 회상 카드 만들기</label></fieldset></aside><section className="workspace-authoring"><header className="workspace-metadata"><label><span>자료 제목</span><input value={props.title} onChange={(event) => props.setTitle(event.target.value)} placeholder="예: 가족 유사성 핵심 필기" required /></label><label><span>카테고리</span><input list="subject-options" value={props.subject} onChange={(event) => props.setSubject(event.target.value)} placeholder="선택 또는 직접 입력" /><datalist id="subject-options"><option value="물리학" /><option value="영어" /><option value="수학" /><option value="철학" /></datalist></label><label><span>태그</span><input value={props.tags} onChange={(event) => props.setTags(event.target.value)} placeholder="쉼표로 구분" /></label><label><span>공개 폴더</span><select value={props.folderId} onChange={(event) => props.setFolderId(event.target.value)}><option value="">폴더에 넣지 않기</option>{props.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}</select></label></header><div className="workspace-tabs"><button type="button" className={props.tab === "description" ? "active" : ""} onClick={() => props.setTab("description")}>설명</button><button type="button" className={props.tab === "memory" ? "active" : ""} onClick={() => props.setTab("memory")}>핵심 암기 자료</button><button type="button" className={props.tab === "examples" ? "active" : ""} onClick={() => props.setTab("examples")}>예시로 설명</button><button type="button" className={props.tab === "concept" ? "active" : ""} onClick={() => props.setTab("concept")}>개념 도형 제작</button></div><section className="workspace-tab-panel">{props.tab === "description" && <><h2>자료 설명</h2><p>자료가 어떤 학습에 도움이 되는지 적어 주세요. AI 검수에는 원본 대신 이 설명과 추출 텍스트만 전달됩니다.</p><textarea value={props.sourceNote} onChange={(event) => props.setSourceNote(event.target.value)} rows={12} placeholder="자료의 출처, 핵심 개념, 학습에 활용하는 방법을 적어 주세요." /></>}{props.tab === "memory" && <MemoryWorkspace materials={props.customMaterials} files={props.files} extractedText={props.extractedText} onChange={props.setCustomMaterials} onAddSelection={addSelection} setRecall={setRecall} />}{props.tab === "examples" && <><div className="authoring-title"><div><h2>예시로 설명</h2><p>상황과 대조 예시를 통해 개념을 실제로 어떻게 쓰는지 보여 주세요.</p></div><button className="secondary-button" type="button" onClick={addExample}>+ 예시 추가</button></div>{props.customMaterials.examples.map((example, index) => <article className="authoring-card" key={index}><button className="remove-card" type="button" onClick={() => props.setCustomMaterials({ ...props.customMaterials, examples: props.customMaterials.examples.filter((_, itemIndex) => itemIndex !== index) })}>×</button>{(["situation", "misconception", "contrast", "explanation", "takeaway"] as const).map((key) => <label key={key}><span>{{ situation: "상황", misconception: "흔한 생각/오해", contrast: "대조 예시", explanation: "개념 설명", takeaway: "기억할 핵심" }[key]}</span>{key === "takeaway" ? <input value={example[key]} onChange={(event) => props.setCustomMaterials({ ...props.customMaterials, examples: props.customMaterials.examples.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: event.target.value } : item) })} /> : <textarea value={example[key]} onChange={(event) => props.setCustomMaterials({ ...props.customMaterials, examples: props.customMaterials.examples.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: event.target.value } : item) })} rows={2} />}</label>)}</article>)}</>}{props.tab === "concept" && <ConceptCanvasEditor canvases={props.customMaterials.recall.conceptCanvases} onChange={(conceptCanvases) => setRecall({ ...props.customMaterials.recall, conceptCanvases })} />}</section><footer className="workspace-publish"><fieldset className="publish-mode-field"><legend>공개 방식</legend><div><button className={props.publishMode === "instant" ? "publish-option active" : "publish-option"} type="button" onClick={() => props.setPublishMode("instant")}>즉시 공개 · 0 크레딧</button><button className={props.publishMode === "ai_review" ? "publish-option reward active" : "publish-option reward"} type="button" onClick={() => props.setPublishMode("ai_review")}>AI 검수 공개 · +20 크레딧</button></div></fieldset><label className="check-row"><input type="checkbox" checked={props.licenseConfirmed} onChange={(event) => props.setLicenseConfirmed(event.target.checked)} /><span>이 자료를 공유할 권한이 있으며 공개 방식에 동의합니다.</span></label><button className="primary-button wide" type="submit" disabled={props.submitting || props.filesLoading || !props.files.length || !props.title || !props.licenseConfirmed}>{props.submitting ? "자료를 처리하고 있어요…" : props.publishMode === "instant" ? "즉시 공개하기 · 0 크레딧" : "AI 검수 요청하기 · 통과 시 +20"}</button>{props.result && <div className={props.result.ok ? "submission-result success" : "submission-result error"}><strong>{props.result.ok ? "접수 완료" : "확인 필요"}</strong><p>{props.result.message}</p></div>}</footer></section></form></main>;
}

function MemoryWorkspace({ materials, files, extractedText, onChange, onAddSelection, setRecall }: { materials: CustomMaterials; files: File[]; extractedText: string; onChange: (value: CustomMaterials | ((current: CustomMaterials) => CustomMaterials)) => void; onAddSelection: (selection: SourceSelection) => void; setRecall: (recall: CustomMaterials["recall"]) => void }) {
  const [selectedText, setSelectedText] = useState(""); const [zoom, setZoom] = useState(1);
  return <div className="memory-workspace"><aside className="source-tool-rail"><button type="button" onClick={() => setZoom((value) => Math.min(1.5, value + .1))}>＋<small>확대</small></button><button type="button" onClick={() => setZoom((value) => Math.max(.7, value - .1))}>−<small>축소</small></button><button type="button" onClick={() => document.getElementById("memory-source")?.scrollIntoView({ behavior: "smooth", block: "center" })}>↔<small>이동</small></button><button type="button" onClick={() => document.getElementById("crop-picker")?.scrollIntoView({ behavior: "smooth", block: "center" })}>▣<small>자르기</small></button></aside><div className="memory-source-stage" id="memory-source" style={{ "--source-zoom": zoom } as CSSProperties}>{extractedText ? <textarea readOnly value={extractedText} onSelect={(event) => { const input = event.currentTarget; setSelectedText(input.value.slice(input.selectionStart, input.selectionEnd).trim()); }} rows={16} aria-label="원문에서 드래그해 암기할 문장을 선택하세요" /> : <p>문서 본문 또는 이미지 원문을 추가하면 여기에 크게 표시됩니다.</p>}</div><div className="memory-editor"><h2>핵심 암기 · 능동 회상</h2><p>왼쪽 원문에서 문장을 고르거나 사진의 영역을 잘라 추가하세요.</p>{selectedText && <button className="secondary-button" type="button" onClick={() => { onAddSelection({ kind: "text", value: selectedText }); setSelectedText(""); }}>선택한 문장 추가</button>}<label><span>암기 자료 제목</span><input value={materials.memorization.title} onChange={(event) => onChange({ ...materials, memorization: { ...materials.memorization, title: event.target.value } })} /></label><LineItemsEditor value={materials.memorization.items} onChange={(items) => onChange({ ...materials, memorization: { ...materials.memorization, items } })} placeholder="중요 문장 또는 공식" addLabel="암기 항목 추가" />{files.some(isImageFile) && <div id="crop-picker"><ImageCropPicker files={files} onAdd={onAddSelection} /></div>}<SelectedSources selections={materials.memorization.selections} onRemove={(index) => onChange({ ...materials, memorization: { ...materials.memorization, selections: materials.memorization.selections.filter((_, itemIndex) => itemIndex !== index) } })} /><div className="authoring-title"><h3>짧은 회상 카드</h3><button className="text-button" type="button" onClick={() => setRecall({ ...materials.recall, shortCards: [...materials.recall.shortCards, { question: "", answer: "" }] })}>+ 카드</button></div>{materials.recall.shortCards.map((card, index) => <article className="authoring-card" key={index}><button className="remove-card" type="button" onClick={() => setRecall({ ...materials.recall, shortCards: materials.recall.shortCards.filter((_, itemIndex) => itemIndex !== index) })}>×</button><input value={card.question} placeholder="짧은 단서" onChange={(event) => setRecall({ ...materials.recall, shortCards: materials.recall.shortCards.map((item, itemIndex) => itemIndex === index ? { ...item, question: event.target.value } : item) })} /><input value={card.answer} placeholder="간결한 정답" onChange={(event) => setRecall({ ...materials.recall, shortCards: materials.recall.shortCards.map((item, itemIndex) => itemIndex === index ? { ...item, answer: event.target.value } : item) })} /></article>)}</div></div>;
}

function ConceptCanvasEditor({ canvases, onChange }: { canvases: ConceptCanvas[]; onChange: (canvases: ConceptCanvas[]) => void }) {
  const canvas = canvases[0] || { title: "새 개념 도형", elements: [] }; const [tool, setTool] = useState<"ellipse" | "rectangle" | "polygon" | "text" | "arrow" | "select">("select"); const [selectedId, setSelectedId] = useState("");
  const save = (next: ConceptCanvas) => onChange([next, ...canvases.slice(1)]); const nodes = canvas.elements.filter((element) => element.kind !== "arrow");
  const addNode = (kind: "ellipse" | "rectangle" | "polygon" | "text") => { const id = `node-${Date.now()}`; save({ ...canvas, elements: [...canvas.elements, { id, kind, x: 14 + (nodes.length * 11) % 58, y: 18 + (nodes.length * 13) % 52, width: kind === "text" ? 18 : 22, height: kind === "text" ? 8 : 14, label: "새 개념" }] }); setSelectedId(id); };
  const selected = nodes.find((element) => element.id === selectedId);
  // @ts-ignore -- selected items are narrowed from the non-arrow node array.
  return <div className="concept-editor"><div className="concept-toolbar"><button className={tool === "select" ? "active" : ""} type="button" onClick={() => setTool("select")}>↖<small>선택</small></button>{(["ellipse", "rectangle", "polygon", "text"] as const).map((kind) => <button className={tool === kind ? "active" : ""} type="button" key={kind} onClick={() => { setTool(kind); addNode(kind); }}>{kind === "ellipse" ? "○" : kind === "rectangle" ? "□" : kind === "polygon" ? "⬠" : "T"}<small>{{ ellipse: "원", rectangle: "사각형", polygon: "다각형", text: "텍스트" }[kind]}</small></button>)}<button className={tool === "arrow" ? "active" : ""} type="button" onClick={() => setTool("arrow")}>→<small>연결선</small></button><button type="button" disabled={!selectedId} onClick={() => { save({ ...canvas, elements: canvas.elements.filter((element) => element.id !== selectedId && (element.kind !== "arrow" || (element.from !== selectedId && element.to !== selectedId))) }); setSelectedId(""); }}>×<small>삭제</small></button></div><div className="concept-editor-main"><label><span>도형 제목</span><input value={canvas.title} onChange={(event) => save({ ...canvas, title: event.target.value })} /></label><div className="concept-editor-canvas" onClick={(event) => { if (tool !== "arrow" || !selectedId) return; const target = event.target as HTMLElement; const id = target.dataset.nodeId; if (id && id !== selectedId) { save({ ...canvas, elements: [...canvas.elements, { id: `arrow-${Date.now()}`, kind: "arrow", from: selectedId, to: id, label: "연결" }] }); setTool("select"); } }}>{nodes.map((element) => <button type="button" data-node-id={element.id} key={element.id} className={`${element.kind} ${selectedId === element.id ? "selected" : ""}`} style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%` }} onClick={(event) => { event.stopPropagation(); if (tool === "arrow" && selectedId && selectedId !== element.id) { save({ ...canvas, elements: [...canvas.elements, { id: `arrow-${Date.now()}`, kind: "arrow", from: selectedId, to: element.id, label: "연결" }] }); setTool("select"); } else setSelectedId(element.id); }}>{element.label}</button>)}{canvas.elements.filter((element) => element.kind === "arrow").map((element) => <span className="concept-editor-link" key={element.id}>↔ {element.label}</span>)}</div>{selected && selected.kind !== "arrow" && <label><span>선택한 요소 문구</span><input value={selected.label} onChange={(event) => save({ ...canvas, elements: canvas.elements.map((element) => element.id === selected.id ? { ...element, label: event.target.value } : element) })} /></label>}<p>도형을 추가하고 선택해 문구를 바꾸세요. 연결선 도구를 누른 뒤 두 개념을 차례로 선택하면 관계가 저장됩니다.</p></div></div>;
}

function UploadSelectionPreview({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  useEffect(() => { const urls = files.map((file) => isImageFile(file) ? URL.createObjectURL(file) : ""); setImageUrls(urls); return () => urls.forEach((url) => { if (url) URL.revokeObjectURL(url); }); }, [files]);
  return <section className="upload-selection-preview" aria-label="선택한 파일 미리보기">{files.map((file, index) => <article key={`${file.name}-${file.lastModified}-${index}`}><button type="button" onClick={() => onRemove(index)} aria-label={`${file.name} 삭제`}>×</button>{imageUrls[index] ? <img src={imageUrls[index]} alt={`${file.name} 미리보기`} /> : <div className="upload-preview-file"><span>파일</span><strong>{file.name.split(".").pop()?.toUpperCase() || "문서"}</strong></div>}<div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)}MB</small></div></article>)}</section>;
}

function CustomMaterialsDialogV2({ materials, files, extractedText, onChange, onClose }: { materials: CustomMaterials; files: File[]; extractedText: string; onChange: (materials: CustomMaterials) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"memory" | "recall" | "examples">("memory"); const [selectedText, setSelectedText] = useState("");
  const setMemory = (memorization: CustomMaterials["memorization"]) => onChange({ ...materials, memorization }); const setRecall = (recall: CustomMaterials["recall"]) => onChange({ ...materials, recall });
  const updateRecall = <K extends keyof CustomMaterials["recall"]>(key: K, value: CustomMaterials["recall"][K]) => setRecall({ ...materials.recall, [key]: value });
  const addSelection = (selection: SourceSelection) => setMemory({ ...materials.memorization, selections: [...materials.memorization.selections, selection] });
  const addModel = () => { const shape = "tetrahedron" as const; const definition = conceptShapeDefinitions[shape]; updateRecall("conceptModels", [...materials.recall.conceptModels, { shape, topic: "", vertices: Array(definition.vertices).fill(""), edges: Array(definition.edges.length).fill("") }]); };
  const updateModel = (index: number, model: ConceptModel) => updateRecall("conceptModels", materials.recall.conceptModels.map((current, currentIndex) => currentIndex === index ? model : current));
  return <div className="materials-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="materials-dialog materials-dialog-v2" role="dialog" aria-modal="true" aria-labelledby="materials-dialog-title"><div className="dialog-heading"><div><p className="eyebrow">자료 구체화</p><h2 id="materials-dialog-title">원문을 학습 도구로 바꾸기</h2></div><button type="button" aria-label="닫기" onClick={onClose}>×</button></div><div className="material-tabs"><button type="button" className={tab === "memory" ? "active" : ""} onClick={() => setTab("memory")}>1. 암기 자료 표시</button><button type="button" className={tab === "recall" ? "active" : ""} onClick={() => setTab("recall")}>2. 회상용 키트 제작</button><button type="button" className={tab === "examples" ? "active" : ""} onClick={() => setTab("examples")}>3. 예시로 설명</button></div>
  {tab === "memory" && <div className="material-tab-content"><p>원문에서 꼭 외울 부분을 직접 고르거나, 직접 작성한 암기 액기스를 더할 수 있습니다.</p><label><span>암기 자료 제목</span><input value={materials.memorization.title} onChange={(event) => setMemory({ ...materials.memorization, title: event.target.value })} placeholder="예: 가족 유사성 암기 액기스" /></label>{extractedText && <section className="source-picker"><div className="authoring-title"><h3>본문에서 문장 고르기</h3><button className="text-button" type="button" disabled={!selectedText} onClick={() => { addSelection({ kind: "text", value: selectedText }); setSelectedText(""); }}>선택한 문장 추가</button></div><textarea readOnly value={extractedText} onSelect={(event) => { const input = event.currentTarget; setSelectedText(input.value.slice(input.selectionStart, input.selectionEnd).trim()); }} rows={10} aria-label="본문에서 드래그해 암기할 문장을 선택하세요" /><small>{selectedText ? `선택됨: ${selectedText.slice(0, 80)}${selectedText.length > 80 ? "…" : ""}` : "문장이나 문단을 드래그해 선택하세요."}</small></section>}{files.some(isImageFile) && <ImageCropPicker files={files} onAdd={addSelection} />}<SelectedSources selections={materials.memorization.selections} onRemove={(index) => setMemory({ ...materials.memorization, selections: materials.memorization.selections.filter((_, selectionIndex) => selectionIndex !== index) })} /><label><span>직접 작성한 중요 문장·정의·공식</span><LineItemsEditor value={materials.memorization.items} onChange={(items) => setMemory({ ...materials.memorization, items })} placeholder="예: 어떤 두 대상은 한 가지 본질보다 겹치는 유사성으로 연결될 수 있다." addLabel="암기 항목 추가" /></label></div>}
  {tab === "recall" && <div className="material-tab-content recall-authoring"><p>단서는 짧게, 정답은 간결하게 적어 직접 떠올리는 시간을 만드세요.</p><section><div className="authoring-title"><h3>짧은 회상 키워드</h3><button className="text-button" type="button" onClick={() => updateRecall("shortCards", [...materials.recall.shortCards, { question: "", answer: "" }])}>+ 키워드 추가</button></div>{materials.recall.shortCards.map((card, index) => <article key={index} className="authoring-card"><button className="remove-card" type="button" onClick={() => updateRecall("shortCards", materials.recall.shortCards.filter((_, cardIndex) => cardIndex !== index))}>×</button><input value={card.question} onChange={(event) => updateRecall("shortCards", materials.recall.shortCards.map((current, cardIndex) => cardIndex === index ? { ...current, question: event.target.value } : current))} placeholder="단서: 가족 유사성" /><input value={card.answer} onChange={(event) => updateRecall("shortCards", materials.recall.shortCards.map((current, cardIndex) => cardIndex === index ? { ...current, answer: event.target.value } : current))} placeholder="짧은 정답" /></article>)}</section><section><div className="authoring-title"><h3>단순 암기 카드</h3><button className="text-button" type="button" onClick={() => updateRecall("flashCards", [...materials.recall.flashCards, { cue: "", value: "" }])}>+ 암기 카드 추가</button></div>{materials.recall.flashCards.map((card, index) => <article key={index} className="authoring-card"><button className="remove-card" type="button" onClick={() => updateRecall("flashCards", materials.recall.flashCards.filter((_, cardIndex) => cardIndex !== index))}>×</button><input value={card.cue} onChange={(event) => updateRecall("flashCards", materials.recall.flashCards.map((current, cardIndex) => cardIndex === index ? { ...current, cue: event.target.value } : current))} placeholder="표지: Begriff" /><input value={card.value} onChange={(event) => updateRecall("flashCards", materials.recall.flashCards.map((current, cardIndex) => cardIndex === index ? { ...current, value: event.target.value } : current))} placeholder="암기값: 개념" /></article>)}</section><QuizEditor materials={materials} updateRecall={updateRecall} /><section><div className="authoring-title"><h3>순서 맞추기</h3><button className="text-button" type="button" onClick={() => updateRecall("sequences", [...materials.recall.sequences, { prompt: "", items: ["", ""] }])}>+ 순서 자료 추가</button></div>{materials.recall.sequences.map((sequence, index) => <article key={index} className="authoring-card"><button className="remove-card" type="button" onClick={() => updateRecall("sequences", materials.recall.sequences.filter((_, sequenceIndex) => sequenceIndex !== index))}>×</button><input value={sequence.prompt} onChange={(event) => updateRecall("sequences", materials.recall.sequences.map((current, sequenceIndex) => sequenceIndex === index ? { ...current, prompt: event.target.value } : current))} placeholder="다음 과정을 올바른 순서로 배열하세요." /><label><span>정답 순서 (한 줄에 하나)</span><textarea value={sequence.items.join("\n")} onChange={(event) => updateRecall("sequences", materials.recall.sequences.map((current, sequenceIndex) => sequenceIndex === index ? { ...current, items: event.target.value.split("\n") } : current))} rows={3} /></label></article>)}</section><section><div className="authoring-title"><h3>3D 개념도</h3><button className="text-button" type="button" onClick={addModel}>+ 3D 도형 추가</button></div>{materials.recall.conceptModels.map((model, index) => <ConceptModelEditor key={index} model={model} onChange={(next) => updateModel(index, next)} onRemove={() => updateRecall("conceptModels", materials.recall.conceptModels.filter((_, modelIndex) => modelIndex !== index))} />)}</section></div>}
  {tab === "examples" && <div className="material-tab-content"><p>상대의 흔한 생각을 먼저 놓고, 그 생각을 흔드는 구체적 예시로 개념을 설명하세요.</p><div className="authoring-title"><h3>오해·대조 예시</h3><button className="text-button" type="button" onClick={() => onChange({ ...materials, examples: [...materials.examples, { situation: "", misconception: "", contrast: "", explanation: "", takeaway: "" }] })}>+ 예시 추가</button></div>{materials.examples.map((example, index) => <article key={index} className="authoring-card"><button className="remove-card" type="button" onClick={() => onChange({ ...materials, examples: materials.examples.filter((_, exampleIndex) => exampleIndex !== index) })}>×</button><textarea value={example.situation} onChange={(event) => onChange({ ...materials, examples: materials.examples.map((current, exampleIndex) => exampleIndex === index ? { ...current, situation: event.target.value } : current) })} rows={2} placeholder="상황: 누군가 가족 유사성을 이해하지 못한다." /><textarea value={example.misconception} onChange={(event) => onChange({ ...materials, examples: materials.examples.map((current, exampleIndex) => exampleIndex === index ? { ...current, misconception: event.target.value } : current) })} rows={2} placeholder="흔한 생각/오해: 모든 범주에는 공통 본질이 하나 있어야 한다." /><textarea value={example.contrast} onChange={(event) => onChange({ ...materials, examples: materials.examples.map((current, exampleIndex) => exampleIndex === index ? { ...current, contrast: event.target.value } : current) })} rows={3} placeholder="대조 예시/반문: 그렇다면 강아지와 고양이는 완전히…" /><textarea value={example.explanation} onChange={(event) => onChange({ ...materials, examples: materials.examples.map((current, exampleIndex) => exampleIndex === index ? { ...current, explanation: event.target.value } : current) })} rows={3} placeholder="개념 설명" /><input value={example.takeaway} onChange={(event) => onChange({ ...materials, examples: materials.examples.map((current, exampleIndex) => exampleIndex === index ? { ...current, takeaway: event.target.value } : current) })} placeholder="기억할 핵심 문장" /></article>)}</div>}<div className="dialog-actions"><span>작성한 내용은 원문과 함께 공개됩니다.</span><button className="primary-button" type="button" onClick={onClose}>저장하고 닫기</button></div></section></div>;
}

function ImageCropPicker({ files, onAdd }: { files: File[]; onAdd: (selection: SourceSelection) => void }) {
  const imageFiles = files.map((file, index) => ({ file, index })).filter(({ file }) => isImageFile(file)); const [attachmentIndex, setAttachmentIndex] = useState(imageFiles[0]?.index ?? 0); const selected = imageFiles.find((item) => item.index === attachmentIndex) ?? imageFiles[0]; const [src, setSrc] = useState(""); const [start, setStart] = useState<{ x: number; y: number } | null>(null); const [crop, setCrop] = useState<{ x: number; y: number; width: number; height: number } | null>(null); const image = useRef<HTMLImageElement>(null);
  useEffect(() => { if (!selected) return; const url = URL.createObjectURL(selected.file); setSrc(url); setCrop(null); return () => URL.revokeObjectURL(url); }, [selected?.file]);
  const point = (event: React.PointerEvent<HTMLImageElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) }; };
  return <section className="source-picker"><div className="authoring-title"><h3>사진에서 암기할 부분 고르기</h3><button className="text-button" type="button" disabled={!crop || !selected} onClick={() => { if (crop && selected) { onAdd({ kind: "image", ...crop, attachmentIndex: selected.index, label: `${selected.file.name}에서 선택한 암기 영역` }); setCrop(null); } }}>선택 영역 추가</button></div>{imageFiles.length > 1 && <label><span>사진 선택</span><select value={attachmentIndex} onChange={(event) => setAttachmentIndex(Number(event.target.value))}>{imageFiles.map(({ file, index }) => <option value={index} key={`${file.name}-${index}`}>{file.name}</option>)}</select></label>}<div className="crop-picker">{src && <img ref={image} src={src} alt="암기할 영역을 드래그해 선택할 원본" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setStart(point(event)); setCrop(null); }} onPointerMove={(event) => { if (!start) return; const end = point(event); setCrop({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }); }} onPointerUp={() => setStart(null)} />}{crop && <span className="crop-overlay" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }} />}</div><small>사진을 드래그해 영역을 정한 뒤 추가하세요. 이 기능을 사용하면 원본도 공개됩니다.</small></section>;
}

function SelectedSources({ selections, onRemove }: { selections: SourceSelection[]; onRemove: (index: number) => void }) { return selections.length ? <div className="selected-sources">{selections.map((selection, index) => <div key={index}><span>{selection.kind === "text" ? selection.value : `사진 영역 · ${selection.label}`}</span><button type="button" onClick={() => onRemove(index)} aria-label="선택 항목 삭제">×</button></div>)}</div> : null; }

function QuizEditor({ materials, updateRecall }: { materials: CustomMaterials; updateRecall: <K extends keyof CustomMaterials["recall"]>(key: K, value: CustomMaterials["recall"][K]) => void }) { return <section><div className="authoring-title"><h3>빠른 선택 퀴즈</h3><button className="text-button" type="button" onClick={() => updateRecall("quizzes", [...materials.recall.quizzes, { question: "", options: ["", ""], answerIndex: 0, explanation: "" }])}>+ 퀴즈 추가</button></div>{materials.recall.quizzes.map((quiz, index) => <article key={index} className="authoring-card"><button className="remove-card" type="button" onClick={() => updateRecall("quizzes", materials.recall.quizzes.filter((_, quizIndex) => quizIndex !== index))}>×</button><input value={quiz.question} onChange={(event) => updateRecall("quizzes", materials.recall.quizzes.map((current, quizIndex) => quizIndex === index ? { ...current, question: event.target.value } : current))} placeholder="질문" /><textarea value={quiz.options.join("\n")} onChange={(event) => updateRecall("quizzes", materials.recall.quizzes.map((current, quizIndex) => quizIndex === index ? { ...current, options: event.target.value.split("\n") } : current))} rows={3} placeholder="선택지 1\n선택지 2" /><select value={quiz.answerIndex} onChange={(event) => updateRecall("quizzes", materials.recall.quizzes.map((current, quizIndex) => quizIndex === index ? { ...current, answerIndex: Number(event.target.value) } : current))}>{quiz.options.map((option, optionIndex) => <option value={optionIndex} key={optionIndex}>{option || `선택지 ${optionIndex + 1}`}</option>)}</select><textarea value={quiz.explanation} onChange={(event) => updateRecall("quizzes", materials.recall.quizzes.map((current, quizIndex) => quizIndex === index ? { ...current, explanation: event.target.value } : current))} rows={2} placeholder="정답 설명 (선택)" /></article>)}</section>; }

function ConceptModelEditor({ model, onChange, onRemove }: { model: ConceptModel; onChange: (model: ConceptModel) => void; onRemove: () => void }) { const definition = conceptShapeDefinitions[model.shape]; const changeShape = (shape: ConceptModel["shape"]) => { const next = conceptShapeDefinitions[shape]; onChange({ shape, topic: model.topic, vertices: Array(next.vertices).fill(""), edges: Array(next.edges.length).fill("") }); }; return <article className="authoring-card concept-model-editor"><button className="remove-card" type="button" onClick={onRemove}>×</button><label><span>도형</span><select value={model.shape} onChange={(event) => changeShape(event.target.value as ConceptModel["shape"])}>{Object.entries(conceptShapeDefinitions).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}</select></label><input value={model.topic} onChange={(event) => onChange({ ...model, topic: event.target.value })} placeholder="주제: 가족 유사성" /><label><span>꼭짓점 개념 {definition.vertices}개</span><LineItemsEditor value={model.vertices} onChange={(vertices) => onChange({ ...model, vertices })} placeholder="꼭짓점 개념" addLabel="" /></label><label><span>변의 연결 설명 {definition.edges.length}개</span><LineItemsEditor value={model.edges} onChange={(edges) => onChange({ ...model, edges })} placeholder="연결고리" addLabel="" /></label></article>; }

function ConceptCanvasView({ canvas }: { canvas: ConceptCanvas }) {
  const [scale, setScale] = useState(1); const nodes = canvas.elements.filter((element) => element.kind !== "arrow"); const arrows = canvas.elements.filter((element) => element.kind === "arrow");
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  // @ts-ignore -- filtered node arrays contain only non-arrow canvas elements.
  return <article className="concept-canvas-view"><header><strong>{canvas.title}</strong><div><button type="button" onClick={() => setScale((value) => Math.max(.7, value - .15))}>−</button><button type="button" onClick={() => setScale((value) => Math.min(1.5, value + .15))}>＋</button></div></header><div className="concept-canvas-stage"><div className="concept-canvas" style={{ transform: `scale(${scale})` }}>{arrows.map((arrow) => { const from = nodeById.get(arrow.from); const to = nodeById.get(arrow.to); if (!from || !to || from.kind === "arrow" || to.kind === "arrow") return null; const x1 = from.x + from.width / 2; const y1 = from.y + from.height / 2; const x2 = to.x + to.width / 2; const y2 = to.y + to.height / 2; return <svg className="concept-arrow" viewBox="0 0 100 100" preserveAspectRatio="none" key={arrow.id}><defs><marker id={`arrow-${arrow.id}`} markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0,0 L0,7 L6,3.5 z" fill="currentColor" /></marker></defs><line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd={`url(#arrow-${arrow.id})`} />{arrow.label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2}>{arrow.label}</text>}</svg>; })}{nodes.map((element) => <div key={element.id} className={`concept-canvas-node ${element.kind}`} style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%` }}>{element.label}</div>)}</div></div></article>;
}

function CustomMaterialsPanelV2({ materials, attachments }: { materials: CustomMaterials; attachments: NonNullable<Asset["attachments"]> }) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({}); const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({}); const [orders, setOrders] = useState<Record<number, number[]>>({}); const dragIndex = useRef<number | null>(null);
  const move = (sequence: number, from: number, to: number) => setOrders((current) => { const order = [...(current[sequence] ?? [])]; const [item] = order.splice(from, 1); order.splice(to, 0, item); return { ...current, [sequence]: order }; });
  return <section className="custom-materials-panel"><div className="mechanical-heading"><div><p className="eyebrow">기여자가 만든 학습 도구</p><h2>원문·암기·회상·예시로 학습하기</h2></div><span>직접 작성</span></div>{(materials.memorization.items.length || materials.memorization.selections.length) > 0 && <article className="memorization-card"><p className="section-label">암기 액기스</p><h3>{materials.memorization.title}</h3>{materials.memorization.selections.map((selection, index) => selection.kind === "text" ? <blockquote key={`text-${index}`}>{selection.value}</blockquote> : attachments[selection.attachmentIndex ?? 0] ? <ImageCropView key={`image-${index}`} selection={selection} imageUrl={attachments[selection.attachmentIndex ?? 0].url} /> : <p key={`image-${index}`}>선택한 이미지 영역</p>)}<ul>{materials.memorization.items.map((item, index) => <li key={`${item}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b><span>{item}</span></li>)}</ul></article>}{materials.recall.shortCards.length > 0 && <div className="custom-tool-section"><p className="section-label">짧은 회상 키워드</p><div className="custom-card-grid">{materials.recall.shortCards.map((card, index) => <article key={index}><span>단서 {index + 1}</span><strong>{card.question}</strong><button className="secondary-button" type="button" onClick={() => setRevealed((current) => ({ ...current, [`short-${index}`]: !current[`short-${index}`] }))}>{revealed[`short-${index}`] ? "정답 가리기" : "떠올린 뒤 확인"}</button>{revealed[`short-${index}`] && <p>{card.answer}</p>}</article>)}</div></div>}{materials.recall.flashCards.length > 0 && <div className="custom-tool-section"><p className="section-label">단순 암기 카드</p><div className="flash-card-grid">{materials.recall.flashCards.map((card, index) => <button className={revealed[`flash-${index}`] ? "flash-card revealed" : "flash-card"} type="button" key={index} onClick={() => setRevealed((current) => ({ ...current, [`flash-${index}`]: !current[`flash-${index}`] }))}><span>{revealed[`flash-${index}`] ? "암기값" : "표지"}</span><strong>{revealed[`flash-${index}`] ? card.value : card.cue}</strong><small>{revealed[`flash-${index}`] ? "다시 표지 보기" : "먼저 떠올린 뒤 탭하세요"}</small></button>)}</div></div>}{materials.recall.quizzes.length > 0 && <div className="custom-tool-section"><p className="section-label">빠른 선택 퀴즈</p>{materials.recall.quizzes.map((quiz, index) => <article className="quiz-card" key={index}><strong>{quiz.question}</strong><div>{quiz.options.map((option, optionIndex) => <button key={optionIndex} type="button" className={quizAnswers[index] === optionIndex ? "active" : ""} onClick={() => setQuizAnswers((current) => ({ ...current, [index]: optionIndex }))}>{option}</button>)}</div>{quizAnswers[index] !== undefined && <p className={quizAnswers[index] === quiz.answerIndex ? "answer-correct" : "answer-wrong"}>{quizAnswers[index] === quiz.answerIndex ? "정답입니다." : `정답: ${quiz.options[quiz.answerIndex]}`}{quiz.explanation ? ` ${quiz.explanation}` : ""}</p>}</article>)}</div>}{materials.recall.sequences.length > 0 && <div className="custom-tool-section"><p className="section-label">순서 맞추기</p>{materials.recall.sequences.map((sequence, index) => { const order = orders[index] ?? sequence.items.map((_, itemIndex) => itemIndex).reverse(); const correct = order.every((item, itemIndex) => item === itemIndex); return <article className="sequence-card sequence-card-v2" key={index}><strong>{sequence.prompt}</strong><p>항목을 드래그하거나 화살표로 순서를 바꾸세요.</p><ol>{order.map((itemIndex, orderIndex) => <li key={itemIndex} draggable onDragStart={() => { dragIndex.current = orderIndex; }} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragIndex.current !== null) move(index, dragIndex.current, orderIndex); dragIndex.current = null; }}><span>{orderIndex + 1}</span><b>{sequence.items[itemIndex]}</b><div><button type="button" disabled={orderIndex === 0} onClick={() => move(index, orderIndex, orderIndex - 1)}>↑</button><button type="button" disabled={orderIndex === order.length - 1} onClick={() => move(index, orderIndex, orderIndex + 1)}>↓</button></div></li>)}</ol><p className={correct ? "answer-correct" : "answer-wrong"}>{correct ? "순서가 맞습니다." : "순서를 조정해 보세요."}</p></article>; })}</div>}{materials.recall.conceptCanvases.length > 0 && <div className="custom-tool-section"><p className="section-label">개념 도형</p>{materials.recall.conceptCanvases.map((canvas, index) => <ConceptCanvasView canvas={canvas} key={index} />)}</div>}{materials.recall.conceptModels.length > 0 && <div className="custom-tool-section"><p className="section-label">기존 3D 개념도</p>{materials.recall.conceptModels.map((model, index) => <ConceptMap key={index} model={model} />)}</div>}{materials.recall.diagrams.length > 0 && <div className="custom-tool-section"><p className="section-label">기존 개념 구조</p>{materials.recall.diagrams.map((diagram, index) => <article className="diagram-card" key={index}><strong>{diagram.title}</strong><div className="concept-flow">{diagram.nodes.map((node, nodeIndex) => <><div className="concept-node" key={`${node}-${nodeIndex}`}>{node}</div>{nodeIndex < diagram.nodes.length - 1 && <span key={`arrow-${nodeIndex}`}>→</span>}</>)}</div><p>{diagram.explanation}</p></article>)}</div>}{materials.examples.length > 0 && <div className="custom-tool-section"><p className="section-label">예시로 설명</p><div className="example-explain-grid">{materials.examples.map((example, index) => <article key={index}><span>예시 {index + 1}</span><h3>{example.situation}</h3>{example.misconception && <p className="example-misconception"><b>흔한 생각</b>{example.misconception}</p>}{example.contrast && <p className="example-contrast"><b>대조 예시</b>{example.contrast}</p>}<p>{example.explanation}</p><b>{example.takeaway}</b></article>)}</div></div>}</section>;
}

function ImageCropView({ selection, imageUrl }: { selection: Extract<SourceSelection, { kind: "image" }>; imageUrl: string }) { return <figure className="memorization-crop" style={{ aspectRatio: `${selection.width} / ${selection.height}` }}><img src={imageUrl} alt={selection.label} style={{ width: `${100 / selection.width}%`, maxWidth: "none", left: `${-(selection.x / selection.width) * 100}%`, top: `${-(selection.y / selection.height) * 100}%` }} /><figcaption>{selection.label}</figcaption></figure>; }

type AccountData = {
  creditBalance: number;
  stats: { contributionCount: number; totalViews: number };
  contributions: Array<{ id: string; title: string; originalName: string; contentType: string; sourceNote: string; status: string; publishMode: string; creditsAwarded: number; viewCount: number; errorMessage?: string | null; createdAt: string; subject?: string; tagsJson?: string; ownerDisplayName?: string; attachmentsJson?: string; customMaterialsJson?: string }>;
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
      <FolderManager contributions={data?.contributions || []} />
      <section className="credit-history"><div className="section-heading"><div><p className="eyebrow">크레딧</p><h2>지급 내역</h2></div></div>{data?.ledger.length ? <div>{data.ledger.map((entry) => <article key={entry.id}><div><strong>{entry.reason}</strong><span>{new Date(entry.createdAt).toLocaleDateString("ko-KR")}</span></div><b>+{entry.amount} C</b></article>)}</div> : <div className="empty-state compact-empty"><strong>아직 크레딧 내역이 없습니다.</strong><span>AI 검수를 통과한 자료가 공개되면 여기에 기록됩니다.</span></div>}</section>
    </main>
  );
}

function FolderManager({ contributions }: { contributions: AccountData["contributions"] }) {
  const [folders, setFolders] = useState<FolderRecord[]>([]); const [title, setTitle] = useState(""); const [subject, setSubject] = useState(""); const [selected, setSelected] = useState<string[]>([]); const [message, setMessage] = useState<string | null>(null);
  const publishable = contributions.filter((item) => ["published", "published_ai"].includes(item.status));
  useEffect(() => { fetch("/api/folders?mine=1").then((response) => response.ok ? response.json() : { folders: [] }).then((data: { folders?: FolderRecord[] }) => setFolders(data.folders || [])).catch(() => undefined); }, []);
  async function create(event: FormEvent) { event.preventDefault(); setMessage(null); const response = await fetch("/api/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, subject, contributionIds: selected }) }); const data = await response.json() as { folder?: FolderRecord; error?: string }; if (!response.ok || !data.folder) { setMessage(data.error || "폴더를 만들지 못했습니다."); return; } setFolders((current) => [data.folder!, ...current]); setTitle(""); setSubject(""); setSelected([]); setMessage("공개 폴더를 만들었습니다."); }
  async function remove(id: string) { await fetch(`/api/folders?id=${encodeURIComponent(id)}`, { method: "DELETE" }); setFolders((current) => current.filter((folder) => folder.id !== id)); }
  return <section className="folder-manager"><div className="section-heading"><div><p className="eyebrow">내 공개 폴더</p><h2>자료를 주제로 묶어 보여 주세요.</h2></div></div><form onSubmit={create}><label><span>폴더 제목</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: 물리 수행평가 준비" required /></label><label><span>과목</span><input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="선택" /></label>{publishable.length > 0 && <div className="folder-source-picker">{publishable.map((item) => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} />{item.title}</label>)}</div>}<button className="primary-button" type="submit">공개 폴더 만들기</button></form>{message && <p className="record-message">{message}</p>}<div className="folder-manager-list">{folders.map((folder) => <article key={folder.id}><div><span>공개 폴더</span><strong>{folder.title}</strong><small>{folder.subject} · {folder.items?.length || folder.itemCount || 0}개 자료</small></div><button className="secondary-button" type="button" onClick={() => void remove(folder.id)}>삭제</button></article>)}</div></section>;
}

function FolderScreen({ folder, onBack, onOpen }: { folder: FolderRecord; onBack: () => void; onOpen: (asset: Asset) => void }) {
  const items = (folder.items || []).map((item) => contributionToAsset(item));
  return <main className="folder-main"><button className="back-button" type="button" onClick={onBack}>← 검색 결과</button><section className="folder-hero"><p className="eyebrow">공개 폴더 · {folder.subject}</p><h1>{folder.title}</h1><p>{folder.description || `${folder.ownerDisplayName}님이 모은 공개 학습 자료입니다.`}</p><div className="tag-row">{folder.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}<span className="tag accent">{items.length}개 자료</span></div></section><section className="result-card-gallery">{items.map((asset) => <button key={asset.id} className="visual-result-card" type="button" onClick={() => onOpen(asset)}><span className={`result-preview ${previewForAsset(asset) ? "has-image" : ""}`}>{previewForAsset(asset) ? <img src={previewForAsset(asset)} alt="" /> : <b>{asset.subject}</b>}</span><span className="file-copy"><span className="file-title">{asset.title}</span><span className="file-description">{asset.description}</span></span><span className="card-arrow">→</span></button>)}</section></main>;
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
