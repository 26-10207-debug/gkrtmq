import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureSchema, getRuntimeEnv } from "@/db/runtime";

export async function GET(request: Request) {
  await ensureSchema();
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "자료 ID가 필요합니다." }, { status: 400 });

  const { DB } = getRuntimeEnv();
  const result = await DB.prepare(`
    SELECT id, title, status, mechanical_status AS mechanicalStatus,
           extracted_text AS extractedText, questions_json AS questionsJson,
           recall_json AS recallJson, text_only AS textOnly,
           mechanical_error AS mechanicalError
    FROM contributions
    WHERE id = ?
      AND (status IN ('published', 'published_ai') OR owner_id = ?)
  `).bind(id, user.userId).first<{
    id: string;
    title: string;
    status: string;
    mechanicalStatus: string;
    extractedText: string | null;
    questionsJson: string | null;
    recallJson: string | null;
    textOnly: number;
    mechanicalError: string | null;
  }>();
  if (!result) return Response.json({ error: "자료를 찾을 수 없습니다." }, { status: 404 });

  return Response.json({
    ...result,
    questions: result.questionsJson ? JSON.parse(result.questionsJson) : [],
    recallCards: result.recallJson ? JSON.parse(result.recallJson) : [],
  });
}
