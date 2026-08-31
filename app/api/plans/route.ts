import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureSchema, getRuntimeEnv } from "@/db/runtime";
import { createPersonalPlan } from "@/lib/learning-ai";

type PlanRequest = {
  topic?: string;
  goal?: string;
  minutes?: number;
  level?: string;
  method?: string;
  useAi?: boolean;
};

function buildRulePlan(payload: Required<Omit<PlanRequest, "useAi">>) {
  const recall = payload.method === "회상 중심" ? 0.42 : 0.28;
  const example = payload.method === "예시 중심" ? 0.44 : 0.32;
  const infoMinutes = Math.max(2, Math.round(payload.minutes * (1 - recall - example)));
  const exampleMinutes = Math.max(2, Math.round(payload.minutes * example));
  const recallMinutes = Math.max(2, payload.minutes - infoMinutes - exampleMinutes);
  return {
    title: `${payload.topic} ${payload.minutes}분 기본 코스`,
    reason: "검증된 학습 순서 규칙으로 구성했습니다.",
    steps: [
      { title: "핵심 정보 잡기", minutes: infoMinutes, tool: "core_info", description: "정의와 공식의 의미를 먼저 연결합니다." },
      { title: "예시로 조건 바꾸기", minutes: exampleMinutes, tool: "example", description: "대표 예시와 변형 예시를 비교합니다." },
      { title: "답을 보지 않고 회상하기", minutes: recallMinutes, tool: "active_recall", description: "직접 설명한 뒤 채점 기준과 비교합니다." },
    ],
  };
}

export async function POST(request: Request) {
  await ensureSchema();
  const incoming = (await request.json()) as PlanRequest;
  const payload = {
    topic: incoming.topic?.trim() || "돌림힘",
    goal: incoming.goal?.trim() || "처음 이해하기",
    minutes: Math.max(5, Math.min(60, Math.floor(incoming.minutes ?? 15))),
    level: incoming.level?.trim() || "처음",
    method: incoming.method?.trim() || "균형",
  };

  const runtime = getRuntimeEnv();
  const user = incoming.useAi ? await getChatGPTUser() : null;
  const monthly = incoming.useAi ? await runtime.DB.prepare("SELECT COALESCE(SUM(estimated_usd_micros),0) AS cost FROM api_usage_ledger WHERE created_at >= strftime('%Y-%m-01T00:00:00Z','now')").first<{ cost: number }>() : null;
  if (incoming.useAi && runtime.OPENAI_API_KEY && user && Number(monthly?.cost || 0) < 30_000_000) {
    try {
      let usage = { inputTokens: 0, outputTokens: 0 };
      const plan = await createPersonalPlan({ apiKey: runtime.OPENAI_API_KEY, ...payload, onUsage: (value) => { usage = value; } });
      const micros = Math.ceil(usage.inputTokens * .2 + usage.outputTokens * 1.25);
      await runtime.DB.prepare("INSERT INTO api_usage_ledger (user_id,kind,model,input_tokens,output_tokens,estimated_usd_micros) VALUES (?,'learning_plan','gpt-5.4-nano',?,?,?)").bind(user.userId, usage.inputTokens, usage.outputTokens, micros).run();
      return Response.json({ plan, engine: "ai" });
    } catch {
      return Response.json({ plan: buildRulePlan(payload), engine: "rules_fallback" });
    }
  }

  return Response.json({
    plan: buildRulePlan(payload),
    engine: incoming.useAi ? "rules_fallback" : "rules",
  });
}
