export type CustomMaterials = {
  memorization: { title: string; items: string[] };
  recall: {
    shortCards: Array<{ question: string; answer: string }>;
    quizzes: Array<{ question: string; options: string[]; answerIndex: number; explanation: string }>;
    sequences: Array<{ prompt: string; items: string[] }>;
    diagrams: Array<{ title: string; nodes: string[]; blankIndex: number; explanation: string }>;
  };
  examples: Array<{ situation: string; explanation: string; takeaway: string }>;
};

export function emptyCustomMaterials(): CustomMaterials {
  return {
    memorization: { title: "", items: [] },
    recall: { shortCards: [], quizzes: [], sequences: [], diagrams: [] },
    examples: [],
  };
}

function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function lines(value: unknown, limit: number, itemLimit: number) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item, itemLimit)).filter(Boolean).slice(0, limit);
}

function hasText(value: unknown) {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasText);
  return Boolean(value && typeof value === "object" && Object.values(value).some(hasText));
}

export function normalizeCustomMaterials(raw: string): CustomMaterials {
  if (raw.length > 40_000) throw new Error("자료 구체화 내용은 40,000자까지 저장할 수 있습니다.");
  let parsed: unknown = {};
  try {
    parsed = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    throw new Error("자료 구체화 내용을 읽을 수 없습니다. 다시 작성해 주세요.");
  }
  const value = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  const result = emptyCustomMaterials();
  const memory = value.memorization && typeof value.memorization === "object" ? value.memorization as Record<string, unknown> : {};
  result.memorization.items = lines(memory.items, 12, 500);
  result.memorization.title = result.memorization.items.length ? text(memory.title, 100) || "암기 액기스" : "";

  const recall = value.recall && typeof value.recall === "object" ? value.recall as Record<string, unknown> : {};
  const shortCards = Array.isArray(recall.shortCards) ? recall.shortCards : [];
  result.recall.shortCards = shortCards.slice(0, 20).flatMap((item) => {
    const card = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const question = text(card.question, 240);
    const answer = text(card.answer, 600);
    if (!question && !answer) return [];
    if (!question || !answer) throw new Error("짧은 회상 카드는 질문과 답을 모두 입력해 주세요.");
    return [{ question, answer }];
  });

  const quizzes = Array.isArray(recall.quizzes) ? recall.quizzes : [];
  result.recall.quizzes = quizzes.slice(0, 10).flatMap((item) => {
    const quiz = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const question = text(quiz.question, 240);
    const options = lines(quiz.options, 4, 160);
    const answerIndex = Number.isInteger(quiz.answerIndex) ? Number(quiz.answerIndex) : -1;
    const explanation = text(quiz.explanation, 600);
    if (!hasText(quiz)) return [];
    if (!question || options.length < 2 || answerIndex < 0 || answerIndex >= options.length) throw new Error("빠른 선택 퀴즈에는 질문, 2개 이상의 선택지, 정답을 입력해 주세요.");
    return [{ question, options, answerIndex, explanation }];
  });

  const sequences = Array.isArray(recall.sequences) ? recall.sequences : [];
  result.recall.sequences = sequences.slice(0, 10).flatMap((item) => {
    const sequence = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const prompt = text(sequence.prompt, 240);
    const items = lines(sequence.items, 8, 160);
    if (!hasText(sequence)) return [];
    if (!prompt || items.length < 2) throw new Error("순서 맞추기에는 안내 문장과 2개 이상의 순서 항목을 입력해 주세요.");
    return [{ prompt, items }];
  });

  const diagrams = Array.isArray(recall.diagrams) ? recall.diagrams : [];
  result.recall.diagrams = diagrams.slice(0, 8).flatMap((item) => {
    const diagram = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const nodes = lines(diagram.nodes, 6, 160);
    const blankIndex = Number.isInteger(diagram.blankIndex) ? Number(diagram.blankIndex) : -1;
    const title = text(diagram.title, 120) || "개념 구조 빈칸 채우기";
    const explanation = text(diagram.explanation, 600);
    if (!hasText(diagram)) return [];
    if (nodes.length < 2 || blankIndex < 0 || blankIndex >= nodes.length) throw new Error("빈칸 채우기에는 2개 이상의 개념 상자와 빈칸 위치를 입력해 주세요.");
    return [{ title, nodes, blankIndex, explanation }];
  });

  const examples = Array.isArray(value.examples) ? value.examples : [];
  result.examples = examples.slice(0, 12).flatMap((item) => {
    const example = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const situation = text(example.situation, 700);
    const explanation = text(example.explanation, 1000);
    const takeaway = text(example.takeaway, 300);
    if (!situation && !explanation && !takeaway) return [];
    if (!situation || !explanation || !takeaway) throw new Error("예시는 상황, 설명, 기억할 핵심을 모두 입력해 주세요.");
    return [{ situation, explanation, takeaway }];
  });
  return result;
}

export function hasCustomMaterials(materials: CustomMaterials) {
  return Boolean(
    materials.memorization.items.length || materials.recall.shortCards.length ||
    materials.recall.quizzes.length || materials.recall.sequences.length ||
    materials.recall.diagrams.length || materials.examples.length,
  );
}

export function customMaterialsForReview(materials: CustomMaterials) {
  if (!hasCustomMaterials(materials)) return "없음";
  return JSON.stringify(materials);
}
