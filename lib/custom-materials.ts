export type SourceSelection =
  | { kind: "text"; value: string }
  | { kind: "image"; x: number; y: number; width: number; height: number; label: string; attachmentIndex?: number };

export type ConceptShape = "cube" | "tetrahedron" | "square_pyramid";

export const conceptShapeDefinitions: Record<ConceptShape, { label: string; vertices: number; edges: Array<[number, number]> }> = {
  cube: { label: "정육면체", vertices: 8, edges: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]] },
  tetrahedron: { label: "사면체", vertices: 4, edges: [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]] },
  square_pyramid: { label: "사각뿔", vertices: 5, edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4]] },
};

export type ConceptModel = { shape: ConceptShape; topic: string; vertices: string[]; edges: string[] };

export type ConceptCanvasElement =
  | { id: string; kind: "ellipse" | "rectangle" | "polygon" | "text"; x: number; y: number; width: number; height: number; label: string }
  | { id: string; kind: "arrow"; from: string; to: string; label: string };

export type ConceptCanvas = { title: string; elements: ConceptCanvasElement[] };

export type ConceptGraph3DNode = { id: string; shape: "sphere" | "box" | "text"; x: number; y: number; z: number; label: string };
export type ConceptGraph3DEdge = { id: string; from: string; to: string; label: string; directed: boolean };
export type ConceptGraph3D = {
  title: string;
  nodes: ConceptGraph3DNode[];
  edges: ConceptGraph3DEdge[];
  camera: { x: number; y: number; z: number; zoom: number };
};

export type ImageFix = { attachmentIndex: number; correctedAttachmentIndex?: number; rotation: number; brightness: number; contrast: number; grayscale: boolean; corners: Array<{ x: number; y: number }> };
export type QuestionSet = { title: string; questions: Array<{ prompt: string; answer: string }> };
export type PluginLink = { provider: "geogebra" | "desmos" | "youtube" | "quizlet"; title: string; description: string; url: string };

export type CustomMaterials = {
  memorization: { title: string; items: string[]; selections: SourceSelection[] };
  recall: {
    shortCards: Array<{ question: string; answer: string }>;
    flashCards: Array<{ cue: string; value: string }>;
    quizzes: Array<{ question: string; options: string[]; answerIndex: number; explanation: string }>;
    sequences: Array<{ prompt: string; items: string[] }>;
    diagrams: Array<{ title: string; nodes: string[]; blankIndex: number; blankIndices?: number[]; explanation: string }>;
    conceptModels: ConceptModel[];
    conceptCanvases: ConceptCanvas[];
    conceptGraphs3D: ConceptGraph3D[];
  };
  examples: Array<{ situation: string; misconception: string; contrast: string; explanation: string; takeaway: string }>;
  tools: { imageFixes: ImageFix[]; questionSets: QuestionSet[]; plugins: PluginLink[] };
};

export function emptyCustomMaterials(): CustomMaterials {
  return { memorization: { title: "", items: [], selections: [] }, recall: { shortCards: [], flashCards: [], quizzes: [], sequences: [], diagrams: [], conceptModels: [], conceptCanvases: [], conceptGraphs3D: [] }, examples: [], tools: { imageFixes: [], questionSets: [], plugins: [] } };
}

function text(value: unknown, limit: number) { return typeof value === "string" ? value.trim().slice(0, limit) : ""; }
function lines(value: unknown, limit: number, itemLimit: number) { return Array.isArray(value) ? value.map((item) => text(item, itemLimit)).filter(Boolean).slice(0, limit) : []; }
function hasText(value: unknown): boolean { return typeof value === "string" ? value.trim().length > 0 : Array.isArray(value) ? value.some(hasText) : Boolean(value && typeof value === "object" && Object.values(value).some(hasText)); }
function number(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : NaN; }
function bounded(value: unknown, fallback = 0, min = -10, max = 10) { const parsed = number(value); return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback; }

function normalizedCrop(value: Record<string, unknown>): SourceSelection | null {
  const x = number(value.x); const y = number(value.y); const width = number(value.width); const height = number(value.height);
  if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.001 || y + height > 1.001) return null;
  const attachmentIndex = Number.isInteger(value.attachmentIndex) && Number(value.attachmentIndex) >= 0 ? Number(value.attachmentIndex) : undefined;
  return { kind: "image", x: Math.min(x, .999), y: Math.min(y, .999), width: Math.min(width, 1 - x), height: Math.min(height, 1 - y), label: text(value.label, 120) || "선택한 암기 영역", attachmentIndex };
}

export function hasImageSelection(materials: CustomMaterials) { return materials.memorization.selections.some((selection) => selection.kind === "image"); }

export function normalizeCustomMaterials(raw: string): CustomMaterials {
  if (raw.length > 70_000) throw new Error("자료 구체화 내용은 70,000자까지 저장할 수 있습니다.");
  let parsed: unknown = {};
  try { parsed = raw.trim() ? JSON.parse(raw) : {}; } catch { throw new Error("자료 구체화 내용을 읽을 수 없습니다. 다시 작성해 주세요."); }
  const value = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  const result = emptyCustomMaterials();
  const memory = value.memorization && typeof value.memorization === "object" ? value.memorization as Record<string, unknown> : {};
  result.memorization.items = (Array.isArray(memory.items) ? memory.items : []).slice(0, 12).map((item) => text(item, 500));
  result.memorization.selections = (Array.isArray(memory.selections) ? memory.selections : []).slice(0, 16).flatMap((item) => {
    const selection = item && typeof item === "object" ? item as Record<string, unknown> : {};
    if (selection.kind === "text") { const selectedText = text(selection.value, 1_400); return selectedText ? [{ kind: "text" as const, value: selectedText }] : []; }
    if (selection.kind === "image") { const crop = normalizedCrop(selection); return crop ? [crop] : []; }
    return [];
  });
  result.memorization.title = result.memorization.items.length || result.memorization.selections.length ? text(memory.title, 100) || "암기 액기스" : "";

  const recall = value.recall && typeof value.recall === "object" ? value.recall as Record<string, unknown> : {};
  result.recall.shortCards = (Array.isArray(recall.shortCards) ? recall.shortCards : []).slice(0, 20).map((item) => {
    const card = item && typeof item === "object" ? item as Record<string, unknown> : {}; const question = text(card.question, 100); const answer = text(card.answer, 220);
    return { question, answer };
  });
  result.recall.flashCards = (Array.isArray(recall.flashCards) ? recall.flashCards : []).slice(0, 40).map((item) => {
    const card = item && typeof item === "object" ? item as Record<string, unknown> : {}; const cue = text(card.cue, 120); const cardValue = text(card.value, 300);
    return { cue, value: cardValue };
  });
  result.recall.quizzes = (Array.isArray(recall.quizzes) ? recall.quizzes : []).slice(0, 10).map((item) => {
    const quiz = item && typeof item === "object" ? item as Record<string, unknown> : {}; const question = text(quiz.question, 240); const options = (Array.isArray(quiz.options) ? quiz.options : []).slice(0, 4).map((option) => text(option, 160)); const answerIndex = Number.isInteger(quiz.answerIndex) ? Number(quiz.answerIndex) : 0; const explanation = text(quiz.explanation, 600);
    return { question, options, answerIndex, explanation };
  });
  result.recall.sequences = (Array.isArray(recall.sequences) ? recall.sequences : []).slice(0, 10).map((item) => {
    const sequence = item && typeof item === "object" ? item as Record<string, unknown> : {}; const prompt = text(sequence.prompt, 240); const items = (Array.isArray(sequence.items) ? sequence.items : []).slice(0, 8).map((entry) => text(entry, 160));
    return { prompt, items };
  });
  // Earlier 2D diagrams remain readable, but only 3D models are created by the new editor.
  result.recall.diagrams = (Array.isArray(recall.diagrams) ? recall.diagrams : []).slice(0, 8).flatMap((item) => {
    const diagram = item && typeof item === "object" ? item as Record<string, unknown> : {}; const nodes = lines(diagram.nodes, 6, 160); const blankIndex = Number.isInteger(diagram.blankIndex) ? Number(diagram.blankIndex) : -1; const title = text(diagram.title, 120) || "개념 구조 빈칸 채우기"; const explanation = text(diagram.explanation, 600);
    const blankIndices = Array.isArray(diagram.blankIndices) ? diagram.blankIndices.map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < nodes.length).slice(0, nodes.length) : [Math.max(0, blankIndex)];
    if (!hasText(diagram)) return []; return [{ title, nodes, blankIndex: blankIndices[0] ?? 0, blankIndices, explanation }];
  });
  result.recall.conceptModels = (Array.isArray(recall.conceptModels) ? recall.conceptModels : []).slice(0, 6).flatMap((item) => {
    const model = item && typeof item === "object" ? item as Record<string, unknown> : {}; const shape = model.shape === "cube" || model.shape === "tetrahedron" || model.shape === "square_pyramid" ? model.shape : null;
    if (!hasText(model) && !shape) return []; const safeShape = shape || "cube"; const definition = conceptShapeDefinitions[safeShape]; const topic = text(model.topic, 140); const vertices = Array.from({ length: definition.vertices }, (_, index) => text(Array.isArray(model.vertices) ? model.vertices[index] : "", 120)); const edges = Array.from({ length: definition.edges.length }, (_, index) => text(Array.isArray(model.edges) ? model.edges[index] : "", 160));
    return [{ shape: safeShape, topic, vertices, edges }];
  });
  result.recall.conceptCanvases = (Array.isArray(recall.conceptCanvases) ? recall.conceptCanvases : []).slice(0, 6).flatMap((item) => {
    const canvas = item && typeof item === "object" ? item as Record<string, unknown> : {};
    if (!hasText(canvas)) return [];
    const title = text(canvas.title, 140) || "개념 도형";
    const rawElements = Array.isArray(canvas.elements) ? canvas.elements.slice(0, 48) : [];
    const elements = rawElements.flatMap<ConceptCanvasElement>((raw, index) => {
      const element = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const id = text(element.id, 64) || `element-${index + 1}`;
      if (element.kind === "arrow") {
        const from = text(element.from, 64); const to = text(element.to, 64); const label = text(element.label, 180);
        return from && to ? [{ id, kind: "arrow" as const, from, to, label }] : [];
      }
      const kind = element.kind === "ellipse" || element.kind === "rectangle" || element.kind === "polygon" || element.kind === "text" ? element.kind : null;
      const x = number(element.x); const y = number(element.y); const width = number(element.width); const height = number(element.height); const label = text(element.label, 240);
      if (!kind || ![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 100.01 || y + height > 100.01) return [];
      return [{ id, kind: kind as "ellipse" | "rectangle" | "polygon" | "text", x, y, width, height, label }];
    });
    const nodeIds = new Set(elements.filter((element) => element.kind !== "arrow").map((element) => element.id));
    const validElements = elements.filter((element) => element.kind !== "arrow" || (nodeIds.has(element.from) && nodeIds.has(element.to)));
    return [{ title, elements: validElements }];
  });
  result.recall.conceptGraphs3D = (Array.isArray(recall.conceptGraphs3D) ? recall.conceptGraphs3D : []).slice(0, 6).map((item, graphIndex) => {
    const graph = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const rawNodes = Array.isArray(graph.nodes) ? graph.nodes.slice(0, 48) : [];
    const nodes = rawNodes.map((item, index) => { const node = item && typeof item === "object" ? item as Record<string, unknown> : {}; const shape: ConceptGraph3DNode["shape"] = node.shape === "box" || node.shape === "text" ? node.shape : "sphere"; return { id: text(node.id, 64) || `node-${graphIndex}-${index}`, shape, x: bounded(node.x), y: bounded(node.y), z: bounded(node.z), label: text(node.label, 240) }; });
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = (Array.isArray(graph.edges) ? graph.edges : []).slice(0, 72).flatMap((item, index) => { const edge = item && typeof item === "object" ? item as Record<string, unknown> : {}; const from = text(edge.from, 64); const to = text(edge.to, 64); return from && to && nodeIds.has(from) && nodeIds.has(to) ? [{ id: text(edge.id, 64) || `edge-${graphIndex}-${index}`, from, to, label: text(edge.label, 180), directed: edge.directed !== false }] : []; });
    const cameraValue = graph.camera && typeof graph.camera === "object" ? graph.camera as Record<string, unknown> : {};
    return { title: text(graph.title, 140), nodes, edges, camera: { x: bounded(cameraValue.x, 4, -20, 20), y: bounded(cameraValue.y, 4, -20, 20), z: bounded(cameraValue.z, 7, 2, 30), zoom: bounded(cameraValue.zoom, 1, .4, 3) } };
  });
  result.examples = (Array.isArray(value.examples) ? value.examples : []).slice(0, 12).map((item) => {
    const example = item && typeof item === "object" ? item as Record<string, unknown> : {}; const situation = text(example.situation, 700); const misconception = text(example.misconception, 700); const contrast = text(example.contrast, 900); const explanation = text(example.explanation, 1000); const takeaway = text(example.takeaway, 300);
    return { situation, misconception, contrast, explanation, takeaway };
  });
  const tools = value.tools && typeof value.tools === "object" ? value.tools as Record<string, unknown> : {};
  result.tools.imageFixes = (Array.isArray(tools.imageFixes) ? tools.imageFixes : []).slice(0, 5).map((item) => { const fix = item && typeof item === "object" ? item as Record<string, unknown> : {}; const corners = (Array.isArray(fix.corners) ? fix.corners : []).slice(0, 4).map((point) => { const p = point && typeof point === "object" ? point as Record<string, unknown> : {}; return { x: bounded(p.x, .1, 0, 1), y: bounded(p.y, .1, 0, 1) }; }); const correctedAttachmentIndex = Number.isInteger(fix.correctedAttachmentIndex) && Number(fix.correctedAttachmentIndex) >= 0 ? Number(fix.correctedAttachmentIndex) : undefined; return { attachmentIndex: Math.max(0, Math.floor(bounded(fix.attachmentIndex, 0, 0, 4))), correctedAttachmentIndex, rotation: bounded(fix.rotation, 0, -180, 180), brightness: bounded(fix.brightness, 100, 50, 180), contrast: bounded(fix.contrast, 100, 50, 180), grayscale: fix.grayscale === true, corners: corners.length === 4 ? corners : [{x:.05,y:.05},{x:.95,y:.05},{x:.95,y:.95},{x:.05,y:.95}] }; });
  result.tools.questionSets = (Array.isArray(tools.questionSets) ? tools.questionSets : []).slice(0, 10).map((item) => { const set = item && typeof item === "object" ? item as Record<string, unknown> : {}; return { title: text(set.title, 160), questions: (Array.isArray(set.questions) ? set.questions : []).slice(0, 100).map((raw) => { const q = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}; return { prompt: text(q.prompt, 1200), answer: text(q.answer, 1200) }; }) }; });
  const allowed = new Set(["geogebra", "desmos", "youtube", "quizlet"]);
  result.tools.plugins = (Array.isArray(tools.plugins) ? tools.plugins : []).slice(0, 8).flatMap((item) => { const plugin = item && typeof item === "object" ? item as Record<string, unknown> : {}; const provider = text(plugin.provider, 20); const url = text(plugin.url, 700); if (!allowed.has(provider) || !/^https:\/\//i.test(url)) return []; return [{ provider: provider as PluginLink["provider"], title: text(plugin.title, 160), description: text(plugin.description, 500), url }]; });
  return result;
}

export function hasCustomMaterials(materials: CustomMaterials) { return Boolean(materials.memorization.items.length || materials.memorization.selections.length || materials.recall.shortCards.length || materials.recall.flashCards.length || materials.recall.quizzes.length || materials.recall.sequences.length || materials.recall.diagrams.length || materials.recall.conceptModels.length || materials.recall.conceptCanvases.length || materials.recall.conceptGraphs3D.length || materials.examples.length || materials.tools.imageFixes.length || materials.tools.questionSets.length || materials.tools.plugins.length); }
export function customMaterialsForReview(materials: CustomMaterials) { return hasCustomMaterials(materials) ? JSON.stringify(materials) : "없음"; }
