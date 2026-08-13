import { getRuntimeEnv } from "@/db/runtime";
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
  const incoming = (await request.json()) as PlanRequest;
  const payload = {
    topic: incoming.topic?.trim() || "돌림힘",
    goal: incoming.goal?.trim() || "처음 이해하기",
    minutes: Math.max(5, Math.min(60, Math.floor(incoming.minutes ?? 15))),
    level: incoming.level?.trim() || "처음",
    method: incoming.method?.trim() || "균형",
  };

  const runtime = getRuntimeEnv();
  if (incoming.useAi && runtime.OPENAI_API_KEY) {
    try {
      const plan = await createPersonalPlan({ apiKey: runtime.OPENAI_API_KEY, ...payload });
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
