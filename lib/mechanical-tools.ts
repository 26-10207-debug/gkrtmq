export type MechanicalOptions = {
  ocr: boolean;
  textOnly: boolean;
  splitQuestions: boolean;
  createRecall: boolean;
};

export type MechanicalQuestion = {
  number: number;
  prompt: string;
};

export type RecallCard = {
  prompt: string;
  answer: string;
  source: "question" | "paragraph";
};

export type MechanicalResult = {
  status: "completed" | "awaiting_ocr" | "failed";
  text: string;
  questions: MechanicalQuestion[];
  recallCards: RecallCard[];
  error?: string;
};

function normalizeText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readOcrText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  if (typeof value.text === "string") return value.text;
  if (typeof value.ParsedText === "string") return value.ParsedText;
  if (typeof value.result === "object" && value.result) return readOcrText(value.result);
  if (typeof value.data === "object" && value.data) return readOcrText(value.data);
  if (Array.isArray(value.ParsedResults)) {
    return value.ParsedResults
      .map((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).ParsedText === "string" ? (item as Record<string, string>).ParsedText : "")
      .filter(Boolean)
      .join("\n");
  }
  return null;
}

function azureEndpointUrl(endpoint: string) {
  return `${endpoint.replace(/\/+$/, "")}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-11-30`;
}

function azureResultText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  if (String(value.status ?? "").toLowerCase() !== "succeeded") return null;
  const result = value.analyzeResult;
  return result && typeof result === "object" && typeof (result as Record<string, unknown>).content === "string"
    ? (result as Record<string, string>).content
    : null;
}

export function splitQuestions(text: string): MechanicalQuestion[] {
  const blocks = normalizeText(text)
    .split(/(?=^\s*(?:문제\s*)?\d{1,3}[.)]\s+)/m)
    .map((block) => block.trim())
    .filter((block) => /^(?:문제\s*)?\d{1,3}[.)]\s+/.test(block));

  return blocks.slice(0, 100).map((prompt, index) => ({
    number: index + 1,
    prompt: prompt.replace(/^(?:문제\s*)?\d{1,3}[.)]\s*/, "").trim(),
  }));
}

export function makeRecallCards(text: string, questions: MechanicalQuestion[]): RecallCard[] {
  if (questions.length) {
    return questions.slice(0, 30).map((question) => ({
      prompt: question.prompt,
      answer: "답을 가리고 먼저 직접 풀어 보세요. 원문과 풀이를 다시 확인해 답을 보완합니다.",
      source: "question",
    }));
  }

  return normalizeText(text)
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length >= 30)
    .slice(0, 30)
    .map((paragraph) => ({
      prompt: "이 문단의 핵심을 보지 않고 한두 문장으로 설명해 보세요.",
      answer: paragraph,
      source: "paragraph",
    }));
}

async function waitForAzureResult(operationUrl: string, apiKey: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(operationUrl, { headers: { "Ocp-Apim-Subscription-Key": apiKey } });
    if (!response.ok) throw new Error(`Azure OCR 결과 확인에 실패했습니다. (${response.status})`);
    const payload = await response.json();
    const text = azureResultText(payload);
    if (text?.trim()) return text;
    const status = payload && typeof payload === "object" ? String((payload as Record<string, unknown>).status ?? "") : "";
    if (["failed", "canceled"].includes(status.toLowerCase())) throw new Error("Azure OCR이 문서를 읽지 못했습니다.");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Azure OCR 처리 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");
}

async function requestAzureOcr(options: {
  endpoint: string;
  apiKey: string;
  bytes: ArrayBuffer;
  contentType: string;
}) {
  const response = await fetch(azureEndpointUrl(options.endpoint), {
    method: "POST",
    headers: { "Content-Type": options.contentType, "Ocp-Apim-Subscription-Key": options.apiKey },
    body: options.bytes,
  });
  if (!response.ok) throw new Error(`Azure OCR 요청에 실패했습니다. (${response.status})`);
  const operationUrl = response.headers.get("operation-location");
  if (!operationUrl) throw new Error("Azure OCR 작업 주소를 받지 못했습니다.");
  return waitForAzureResult(operationUrl, options.apiKey);
}

export async function processMechanically(options: {
  input: MechanicalOptions;
  bytes: ArrayBuffer;
  contentType: string;
  filename: string;
  providedText?: string;
  azureEndpoint?: string;
  azureApiKey?: string;
}): Promise<MechanicalResult> {
  const needsText = Boolean(options.providedText?.trim()) || options.input.ocr || options.input.textOnly || options.input.splitQuestions || options.input.createRecall;
  if (!needsText) return { status: "completed", text: "", questions: [], recallCards: [] };

  let text = "";
  if (options.providedText?.trim()) {
    text = options.providedText;
  } else if (options.contentType === "text/plain" || options.contentType === "text/markdown") {
    text = new TextDecoder("utf-8", { fatal: false }).decode(options.bytes);
  } else if (options.input.ocr) {
    if (!options.azureEndpoint || !options.azureApiKey) {
      return {
        status: "awaiting_ocr",
        text: "",
        questions: [],
        recallCards: [],
        error: "Azure Document Intelligence 연결 정보가 아직 설정되지 않았습니다.",
      };
    }
    try {
      text = await requestAzureOcr({
        endpoint: options.azureEndpoint,
        apiKey: options.azureApiKey,
        bytes: options.bytes,
        contentType: options.contentType,
      });
    } catch (error) {
      return {
        status: "failed",
        text: "",
        questions: [],
        recallCards: [],
        error: error instanceof Error ? error.message : "OCR 처리에 실패했습니다.",
      };
    }
  } else {
    return {
      status: "failed",
      text: "",
      questions: [],
      recallCards: [],
      error: "이미지·PDF·문서는 OCR을 선택해야 텍스트 기반 도구를 사용할 수 있습니다.",
    };
  }

  text = normalizeText(text);
  if (!text) return { status: "failed", text: "", questions: [], recallCards: [], error: "읽을 수 있는 텍스트가 없습니다." };
  const questions = options.input.splitQuestions ? splitQuestions(text) : [];
  const recallCards = options.input.createRecall ? makeRecallCards(text, questions) : [];
  return { status: "completed", text, questions, recallCards };
}
