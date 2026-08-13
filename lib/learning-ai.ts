export type LearningAsset = {
  title: string;
  subject: string;
  topic: string;
  difficulty: string;
  oneSentenceSummary: string;
  prerequisites: string[];
  coreConcepts: Array<{ name: string; explanation: string; evidence: string }>;
  examples: Array<{
    title: string;
    situation: string;
    explanation: string;
    takeaway: string;
  }>;
  counterexamples: Array<{ claim: string; correction: string; explanation: string }>;
  misconceptions: Array<{ misconception: string; correction: string }>;
  recallQuestions: Array<{
    prompt: string;
    answer: string;
    rubric: string[];
    difficulty: string;
  }>;
  searchKeywords: string[];
  qualityFlags: string[];
};

type OpenAIResponse = {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

const learningAssetSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "subject",
    "topic",
    "difficulty",
    "oneSentenceSummary",
    "prerequisites",
    "coreConcepts",
    "examples",
    "counterexamples",
    "misconceptions",
    "recallQuestions",
    "searchKeywords",
    "qualityFlags",
  ],
  properties: {
    title: { type: "string" },
    subject: { type: "string" },
    topic: { type: "string" },
    difficulty: { type: "string" },
    oneSentenceSummary: { type: "string" },
    prerequisites: { type: "array", items: { type: "string" } },
    coreConcepts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "explanation", "evidence"],
        properties: {
          name: { type: "string" },
          explanation: { type: "string" },
          evidence: { type: "string" },
        },
      },
    },
    examples: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "situation", "explanation", "takeaway"],
        properties: {
          title: { type: "string" },
          situation: { type: "string" },
          explanation: { type: "string" },
          takeaway: { type: "string" },
        },
      },
    },
    counterexamples: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "correction", "explanation"],
        properties: {
          claim: { type: "string" },
          correction: { type: "string" },
          explanation: { type: "string" },
        },
      },
    },
    misconceptions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["misconception", "correction"],
        properties: {
          misconception: { type: "string" },
          correction: { type: "string" },
        },
      },
    },
    recallQuestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["prompt", "answer", "rubric", "difficulty"],
        properties: {
          prompt: { type: "string" },
          answer: { type: "string" },
          rubric: { type: "array", items: { type: "string" } },
          difficulty: { type: "string" },
        },
      },
    },
    searchKeywords: { type: "array", items: { type: "string" } },
    qualityFlags: { type: "array", items: { type: "string" } },
  },
} as const;

function toBase64(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let offset = 0; offset < view.length; offset += 0x8000) {
    binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function extractOutputText(response: OpenAIResponse) {
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  throw new Error("AI 응답에서 구조화된 결과를 찾지 못했습니다.");
}

export async function structureContribution(options: {
  apiKey: string;
  bytes: ArrayBuffer;
  contentType: string;
  filename: string;
  title: string;
  sourceNote: string;
}) {
  const dataUrl = `data:${options.contentType};base64,${toBase64(options.bytes)}`;
  const content = options.contentType.startsWith("image/")
    ? [{ type: "input_image", image_url: dataUrl }]
    : [
        {
          type: "input_file",
          filename: options.filename,
          file_data: dataUrl,
          detail: options.contentType === "application/pdf" ? "high" : undefined,
        },
      ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.6-terra",
      store: false,
      reasoning: { effort: "medium" },
      instructions:
        "당신은 학습 자료 구조화 엔진이다. 원본을 그대로 게시하지 말고, 근거에 충실한 학습 객체로 다시 구성한다. 능동 회상과 다양한 예시를 우선한다. 원본에서 확인할 수 없는 사실은 만들지 말고 qualityFlags에 기록한다. 한국어로 작성한다.",
      input: [
        {
          role: "user",
          content: [
            ...content,
            {
              type: "input_text",
              text: `기여 제목: ${options.title}\n출처 메모: ${options.sourceNote || "없음"}\n이 자료를 개념, 예시, 반례, 오개념, 능동 회상 질문이 포함된 표준 학습 객체로 변환하세요.`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "learning_asset",
          strict: true,
          schema: learningAssetSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`AI 분석 요청 실패 (${response.status}): ${message.slice(0, 300)}`);
  }

  const payload = (await response.json()) as OpenAIResponse;
  return JSON.parse(extractOutputText(payload)) as LearningAsset;
}

export async function createPersonalPlan(options: {
  apiKey: string;
  topic: string;
  goal: string;
  minutes: number;
  level: string;
  method: string;
}) {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["title", "reason", "steps"],
    properties: {
      title: { type: "string" },
      reason: { type: "string" },
      steps: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "minutes", "tool", "description"],
          properties: {
            title: { type: "string" },
            minutes: { type: "integer" },
            tool: {
              type: "string",
              enum: ["core_info", "example", "counterexample", "misconception", "active_recall"],
            },
            description: { type: "string" },
          },
        },
      },
    },
  } as const;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.6-luna",
      store: false,
      instructions:
        "검증된 학습 도구만 조합하는 학습 플래너다. 주어진 총 시간을 넘지 말고, 예시와 능동 회상을 우선한다. 한국어로 작성한다.",
      input: `주제=${options.topic}, 목표=${options.goal}, 시간=${options.minutes}분, 수준=${options.level}, 선호=${options.method}`,
      text: {
        format: { type: "json_schema", name: "study_plan", strict: true, schema },
      },
    }),
  });

  if (!response.ok) throw new Error(`AI 플랜 생성 실패 (${response.status})`);
  return JSON.parse(extractOutputText((await response.json()) as OpenAIResponse));
}
