import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureSchema, getRuntimeEnv } from "@/db/runtime";
import { emptyCustomMaterials, normalizeCustomMaterials } from "@/lib/custom-materials";
import { extractOutputText } from "@/lib/learning-ai";

type Conversation = Array<{ role: "user" | "assistant"; text: string }>;
const MONTHLY_CAP_MICROS = 30_000_000;
const schema = { type: "object", additionalProperties: false, required: ["message","target","proposalJson","sourceDigest"], properties: { message: { type: "string" }, target: { type: "string", enum: ["fastquiz","examples","concept","memorization","blank"] }, proposalJson: { type: "string" }, sourceDigest: { type: "string" } } } as const;
function parsed<T>(value: unknown, fallback: T): T { try { return JSON.parse(String(value || "")) as T; } catch { return fallback; } }
function monthStart() { const now = new Date(); return `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}-01T00:00:00Z`; }
function todayStart() { return new Date().toISOString().slice(0,10) + "T00:00:00Z"; }

export async function GET() {
  await ensureSchema(); const user = await getChatGPTUser(); if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { DB, OPENAI_API_KEY } = getRuntimeEnv();
  const month = await DB.prepare("SELECT COALESCE(SUM(estimated_usd_micros),0) AS cost FROM api_usage_ledger WHERE created_at >= ?").bind(monthStart()).first<{ cost:number }>();
  const day = await DB.prepare("SELECT COUNT(*) AS count FROM api_usage_ledger WHERE user_id = ? AND kind = 'authoring_ai' AND created_at >= ?").bind(user.userId,todayStart()).first<{count:number}>();
  return Response.json({ connected: Boolean(OPENAI_API_KEY), monthlyUsd: Number(month?.cost || 0)/1_000_000, monthlyLimitUsd: 30, dailyUsed: Number(day?.count || 0), dailyLimit: 20, warning: Number(month?.cost || 0) >= MONTHLY_CAP_MICROS*.8 });
}

export async function POST(request: Request) {
  await ensureSchema(); const user = await getChatGPTUser(); if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json() as { draftId?: unknown; message?: unknown; target?: unknown; highQuality?: unknown };
  const draftId = String(body.draftId || ""); const message = String(body.message || "").trim().slice(0,1200); if (!draftId || !message) return Response.json({ error: "초안과 요청을 입력해 주세요." }, { status:400 });
  const { DB, OPENAI_API_KEY } = getRuntimeEnv(); if (!OPENAI_API_KEY) return Response.json({ error: "OpenAI API 연결이 필요합니다.", code:"api_not_configured" }, { status:503 });
  const draft = await DB.prepare("SELECT extracted_texts_json AS extractedTextsJson, custom_materials_json AS customMaterialsJson, ai_conversation_json AS aiConversationJson, source_digest AS sourceDigest, ai_applied_count AS aiAppliedCount FROM contribution_drafts WHERE id = ? AND owner_id = ?").bind(draftId,user.userId).first<Record<string,unknown>>();
  if (!draft) return Response.json({ error:"초안을 찾지 못했습니다." },{status:404});
  const draftUsage = await DB.prepare("SELECT COUNT(*) AS count FROM api_usage_ledger WHERE draft_id = ? AND kind = 'authoring_ai'").bind(draftId).first<{count:number}>();
  if (Number(draftUsage?.count||0) >= 8) return Response.json({ error:"이 초안의 AI 제작 한도 8회를 모두 사용했습니다." },{status:429});
  const daily = await DB.prepare("SELECT COUNT(*) AS count FROM api_usage_ledger WHERE user_id = ? AND kind = 'authoring_ai' AND created_at >= ?").bind(user.userId,todayStart()).first<{count:number}>();
  if (Number(daily?.count||0) >= 20) return Response.json({ error:"오늘의 AI 제작 한도 20회를 모두 사용했습니다." },{status:429});
  const month = await DB.prepare("SELECT COALESCE(SUM(estimated_usd_micros),0) AS cost FROM api_usage_ledger WHERE created_at >= ?").bind(monthStart()).first<{cost:number}>();
  if (Number(month?.cost||0) >= MONTHLY_CAP_MICROS) return Response.json({ error:"이번 달 API 안전 예산에 도달했습니다. 수동 제작 도구는 계속 사용할 수 있습니다." },{status:429});
  const target = ["fastquiz","examples","concept","memorization","blank"].includes(String(body.target)) ? String(body.target) : "fastquiz";
  const highQuality = Boolean(body.highQuality) && Number(month?.cost||0) < MONTHLY_CAP_MICROS*.8 && ["examples","concept"].includes(target);
  const model = highQuality ? "gpt-5.4-mini" : "gpt-5.4-nano"; const maxOutput = highQuality ? 1400 : 900;
  const texts = parsed<string[]>(draft.extractedTextsJson,[]).join("\n\n").slice(0,24000); if (!texts.trim()) return Response.json({ error:"AI 제작 전에 문서 텍스트를 추출하거나 OCR을 실행해 주세요." },{status:400});
  const digest = String(draft.sourceDigest||""); const conversations = parsed<Conversation>(draft.aiConversationJson,[]).slice(-6);
  const response = await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model,store:false,reasoning:{effort:"low"},max_output_tokens:maxOutput,instructions:"당신은 학습 자료 제작 도우미다. 제공된 원문 텍스트에만 근거하고 사실을 만들지 않는다. 한국어로 답한다. target에 맞는 JSON 초안을 proposalJson 문자열에 넣는다. fastquiz={quizzes:[{question,options,answerIndex,explanation}]}, examples={examples:[{situation,misconception,contrast,explanation,takeaway}]}, memorization={items:[string],shortCards:[{question,answer}],flashCards:[{cue,value}]}, blank={diagrams:[{title,nodes,blankIndices,explanation}]}, concept={graph:{title,nodes:[{id,shape,x,y,z,label}],edges:[{id,from,to,label,directed}],camera:{x,y,z,zoom}}}. sourceDigest는 원문 핵심을 1800자 이하로 압축한다.",input:`대상=${target}\n현재 자료=${String(draft.customMaterialsJson||"{}").slice(0,12000)}\n기존 요약=${digest||"없음"}\n최근 대화=${JSON.stringify(conversations)}\n사용자 요청=${message}\n원문=${digest?"요약을 우선 사용":texts}`,text:{format:{type:"json_schema",name:"authoring_proposal",strict:true,schema}}})});
  if (!response.ok) return Response.json({ error:`AI 제작 요청에 실패했습니다. (${response.status})` },{status:502});
  const payload = await response.json() as { output?:unknown[]; usage?:{input_tokens?:number;output_tokens?:number} }; const answer = JSON.parse(extractOutputText(payload as never)) as {message:string;target:string;proposalJson:string;sourceDigest:string};
  let proposal: unknown; try { proposal=JSON.parse(answer.proposalJson); } catch { return Response.json({error:"AI 변경안을 읽지 못했습니다. 다시 요청해 주세요."},{status:502}); }
  const inputTokens=Number(payload.usage?.input_tokens||0),outputTokens=Number(payload.usage?.output_tokens||0); const micros=Math.ceil(model.endsWith("nano")?inputTokens*.2+outputTokens*1.25:inputTokens*.75+outputTokens*4.5);
  const nextConversation=[...conversations,{role:"user" as const,text:message},{role:"assistant" as const,text:answer.message}].slice(-12);
  await DB.batch([DB.prepare("UPDATE contribution_drafts SET ai_conversation_json = ?, source_digest = CASE WHEN source_digest = '' THEN ? ELSE source_digest END, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?").bind(JSON.stringify(nextConversation),answer.sourceDigest.slice(0,1800),draftId,user.userId),DB.prepare("INSERT INTO api_usage_ledger (user_id,draft_id,kind,model,input_tokens,output_tokens,estimated_usd_micros) VALUES (?,?,?,?,?,?,?)").bind(user.userId,draftId,"authoring_ai",model,inputTokens,outputTokens,micros)]);
  return Response.json({message:answer.message,target:answer.target,proposal,model,highQuality,usage:{inputTokens,outputTokens,estimatedUsd:micros/1_000_000}});
}

export async function PATCH(request: Request) {
  await ensureSchema(); const user=await getChatGPTUser(); if(!user) return Response.json({error:"로그인이 필요합니다."},{status:401});
  const body=await request.json() as {draftId?:unknown;target?:unknown;proposal?:unknown}; const draftId=String(body.draftId||""); const target=String(body.target||""); const {DB}=getRuntimeEnv();
  const row=await DB.prepare("SELECT custom_materials_json AS customMaterialsJson FROM contribution_drafts WHERE id=? AND owner_id=?").bind(draftId,user.userId).first<{customMaterialsJson:string}>(); if(!row) return Response.json({error:"초안을 찾지 못했습니다."},{status:404});
  const current=normalizeCustomMaterials(row.customMaterialsJson||"{}"); const proposal=body.proposal&&typeof body.proposal==="object"?body.proposal as Record<string,unknown>:{}; let next={...current};
  if(target==="fastquiz"&&Array.isArray(proposal.quizzes)) next={...current,recall:{...current.recall,quizzes:[...current.recall.quizzes,...proposal.quizzes as never[]]}};
  else if(target==="examples"&&Array.isArray(proposal.examples)) next={...current,examples:[...current.examples,...proposal.examples as never[]]};
  else if(target==="memorization") next={...current,memorization:{...current.memorization,items:[...current.memorization.items,...(Array.isArray(proposal.items)?proposal.items as string[]:[])]},recall:{...current.recall,shortCards:[...current.recall.shortCards,...(Array.isArray(proposal.shortCards)?proposal.shortCards as never[]:[])],flashCards:[...current.recall.flashCards,...(Array.isArray(proposal.flashCards)?proposal.flashCards as never[]:[])]}};
  else if(target==="blank"&&Array.isArray(proposal.diagrams)) next={...current,recall:{...current.recall,diagrams:[...current.recall.diagrams,...proposal.diagrams as never[]]}};
  else if(target==="concept"&&proposal.graph) next={...current,recall:{...current.recall,conceptGraphs3D:[...current.recall.conceptGraphs3D,proposal.graph as never]}}; else return Response.json({error:"적용할 변경안이 없습니다."},{status:400});
  const normalized=normalizeCustomMaterials(JSON.stringify(next)); await DB.prepare("UPDATE contribution_drafts SET custom_materials_json=?, publish_mode='ai_review', ai_review_locked=1, ai_applied_count=ai_applied_count+1, updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?").bind(JSON.stringify(normalized),draftId,user.userId).run();
  return Response.json({customMaterials:normalized,publishMode:"ai_review",aiReviewLocked:true});
}
