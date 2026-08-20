export type SourceSelection =
  | { kind: "text"; value: string }
  | { kind: "image"; x: number; y: number; width: number; height: number; label: string };

export type ConceptShape = "cube" | "tetrahedron" | "square_pyramid";

export const conceptShapeDefinitions: Record<ConceptShape, { label: string; vertices: number; edges: Array<[number, number]> }> = {
  cube: { label: "정육면체", vertices: 8, edges: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]] },
  tetrahedron: { label: "사면체", vertices: 4, edges: [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]] },
  square_pyramid: { label: "사각뿔", vertices: 5, edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4]] },
};

export type ConceptModel = { shape: ConceptShape; topic: string; vertices: string[]; edges: string[] };

export type CustomMaterials = {
  memorization: { title: string; items: string[]; selections: SourceSelection[] };
  recall: {
    shortCards: Array<{ question: string; answer: string }>;
    flashCards: Array<{ cue: string; value: string }>;
    quizzes: Array<{ question: string; options: string[]; answerIndex: number; explanation: string }>;
    sequences: Array<{ prompt: string; items: string[] }>;
    diagrams: Array<{ title: string; nodes: string[]; blankIndex: number; explanation: string }>;
    conceptModels: ConceptModel[];
  };
  examples: Array<{ situation: string; misconception: string; contrast: string; explanation: string; takeaway: string }>;
};

export function emptyCustomMaterials(): CustomMaterials {
  return { memorization: { title: "", items: [], selections: [] }, recall: { shortCards: [], flashCards: [], quizzes: [], sequences: [], diagrams: [], conceptModels: [] }, examples: [] };
}

function text(value: unknown, limit: number) { return typeof value === "string" ? value.trim().slice(0, limit) : ""; }
function lines(value: unknown, limit: number, itemLimit: number) { return Array.isArray(value) ? value.map((item) => text(item, itemLimit)).filter(Boolean).slice(0, limit) : []; }
function hasText(value: unknown): boolean { return typeof value === "string" ? value.trim().length > 0 : Array.isArray(value) ? value.some(hasText) : Boolean(value && typeof value === "object" && Object.values(value).some(hasText)); }
function number(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : NaN; }

function normalizedCrop(value: Record<string, unknown>): SourceSelection | null {
  const x = number(value.x); const y = number(value.y); const width = number(value.width); const height = number(value.height);
  if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.001 || y + height > 1.001) return null;
  return { kind: "image", x: Math.min(x, .999), y: Math.min(y, .999), width: Math.min(width, 1 - x), height: Math.min(height, 1 - y), label: text(value.label, 120) || "선택한 암기 영역" };
}

export function hasImageSelection(materials: CustomMaterials) { return materials.memorization.selections.some((selection) => selection.kind === "image"); }

export function normalizeCustomMaterials(raw: string): CustomMaterials {
  if (raw.length > 70_000) throw new Error("자료 구체화 내용은 70,000자까지 저장할 수 있습니다.");
  let parsed: unknown = {};
  try { parsed = raw.trim() ? JSON.parse(raw) : {}; } catch { throw new Error("자료 구체화 내용을 읽을 수 없습니다. 다시 작성해 주세요."); }
  const value = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  const result = emptyCustomMaterials();
  const memory = value.memorization && typeof value.memorization === "object" ? value.memorization as Record<string, unknown> : {};
  result.memorization.items = lines(memory.items, 12, 500);
  result.memorization.selections = (Array.isArray(memory.selections) ? memory.selections : []).slice(0, 16).flatMap((item) => {
    const selection = item && typeof item === "object" ? item as Record<string, unknown> : {};
    if (selection.kind === "text") { const selectedText = text(selection.value, 1_400); return selectedText ? [{ kind: "text" as const, value: selectedText }] : []; }
    if (selection.kind === "image") { const crop = normalizedCrop(selection); return crop ? [crop] : []; }
    return [];
  });
  result.memorization.title = result.memorization.items.length || result.memorization.selections.length ? text(memory.title, 100) || "암기 액기스" : "";

  const recall = value.recall && typeof value.recall === "object" ? value.recall as Record<string, unknown> : {};
  result.recall.shortCards = (Array.isArray(recall.shortCards) ? recall.shortCards : []).slice(0, 20).flatMap((item) => {
    const card = item && typeof item === "object" ? item as Record<string, unknown> : {}; const question = text(card.question, 100); const answer = text(card.answer, 220);
    if (!question && !answer) return []; if (!question || !answer) throw new Error("짧은 회상 키워드는 단서와 정답을 모두 입력해 주세요."); return [{ question, answer }];
  });
  result.recall.flashCards = (Array.isArray(recall.flashCards) ? recall.flashCards : []).slice(0, 40).flatMap((item) => {
    const card = item && typeof item === "object" ? item as Record<string, unknown> : {}; const cue = text(card.cue, 120); const cardValue = text(card.value, 300);
    if (!cue && !cardValue) return []; if (!cue || !cardValue) throw new Error("단순 암기 카드는 표지와 암기값을 모두 입력해 주세요."); return [{ cue, value: cardValue }];
  });
  result.recall.quizzes = (Array.isArray(recall.quizzes) ? recall.quizzes : []).slice(0, 10).flatMap((item) => {
    const quiz = item && typeof item === "object" ? item as Record<string, unknown> : {}; const question = text(quiz.question, 240); const options = lines(quiz.options, 4, 160); const answerIndex = Number.isInteger(quiz.answerIndex) ? Number(quiz.answerIndex) : -1; const explanation = text(quiz.explanation, 600);
    if (!hasText(quiz)) return []; if (!question || options.length < 2 || answerIndex < 0 || answerIndex >= options.length) throw new Error("빠른 선택 퀴즈에는 질문, 2개 이상의 선택지, 정답을 입력해 주세요."); return [{ question, options, answerIndex, explanation }];
  });
  result.recall.sequences = (Array.isArray(recall.sequences) ? recall.sequences : []).slice(0, 10).flatMap((item) => {
    const sequence = item && typeof item === "object" ? item as Record<string, unknown> : {}; const prompt = text(sequence.prompt, 240); const items = lines(sequence.items, 8, 160);
    if (!hasText(sequence)) return []; if (!prompt || items.length < 2) throw new Error("순서 맞추기에는 안내 문장과 2개 이상의 순서 항목을 입력해 주세요."); return [{ prompt, items }];
  });
  // Earlier 2D diagrams remain readable, but only 3D models are created by the new editor.
  result.recall.diagrams = (Array.isArray(recall.diagrams) ? recall.diagrams : []).slice(0, 8).flatMap((item) => {
    const diagram = item && typeof item === "object" ? item as Record<string, unknown> : {}; const nodes = lines(diagram.nodes, 6, 160); const blankIndex = Number.isInteger(diagram.blankIndex) ? Number(diagram.blankIndex) : -1; const title = text(diagram.title, 120) || "개념 구조 빈칸 채우기"; const explanation = text(diagram.explanation, 600);
    if (!hasText(diagram)) return []; if (nodes.length < 2 || blankIndex < 0 || blankIndex >= nodes.length) throw new Error("기존 개념 구조에는 2개 이상의 개념 상자와 빈칸 위치를 입력해 주세요."); return [{ title, nodes, blankIndex, explanation }];
  });
  result.recall.conceptModels = (Array.isArray(recall.conceptModels) ? recall.conceptModels : []).slice(0, 6).flatMap((item) => {
    const model = item && typeof item === "object" ? item as Record<string, unknown> : {}; const shape = model.shape === "cube" || model.shape === "tetrahedron" || model.shape === "square_pyramid" ? model.shape : null;
    if (!hasText(model)) return []; if (!shape) throw new Error("3D 개념도 도형을 선택해 주세요.");
    const definition = conceptShapeDefinitions[shape]; const topic = text(model.topic, 140); const vertices = lines(model.vertices, definition.vertices, 120); const edges = lines(model.edges, definition.edges.length, 160);
    if (!topic || vertices.length !== definition.vertices || edges.length !== definition.edges.length) throw new Error(`${definition.label} 개념도에는 주제, 꼭짓점 ${definition.vertices}개, 연결 설명 ${definition.edges.length}개를 모두 입력해 주세요.`); return [{ shape, topic, vertices, edges }];
  });
  result.examples = (Array.isArray(value.examples) ? value.examples : []).slice(0, 12).flatMap((item) => {
    const example = item && typeof item === "object" ? item as Record<string, unknown> : {}; const situation = text(example.situation, 700); const misconception = text(example.misconception, 700); const contrast = text(example.contrast, 900); const explanation = text(example.explanation, 1000); const takeaway = text(example.takeaway, 300);
    if (!situation && !misconception && !contrast && !explanation && !takeaway) return []; if (!situation || !explanation || !takeaway) throw new Error("예시는 상황, 설명, 기억할 핵심을 모두 입력해 주세요."); return [{ situation, misconception, contrast, explanation, takeaway }];
  });
  return result;
}

export function hasCustomMaterials(materials: CustomMaterials) { return Boolean(materials.memorization.items.length || materials.memorization.selections.length || materials.recall.shortCards.length || materials.recall.flashCards.length || materials.recall.quizzes.length || materials.recall.sequences.length || materials.recall.diagrams.length || materials.recall.conceptModels.length || materials.examples.length); }
export function customMaterialsForReview(materials: CustomMaterials) { return hasCustomMaterials(materials) ? JSON.stringify(materials) : "없음"; }
