import { ensureSchema, getRuntimeEnv } from "@/db/runtime";

export async function GET(request: Request) {
  await ensureSchema();
  const topic = new URL(request.url).searchParams.get("topic")?.trim();
  const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit") || 100), 1), 100);
  const { DB } = getRuntimeEnv();
  const result = topic
    ? await DB.prepare(`
        SELECT id, title, description, topic, subject, source_name AS sourceName,
               source_url AS sourceUrl, license_note AS licenseNote,
               access_mode AS accessMode, tags_json AS tagsJson,
               created_at AS createdAt, updated_at AS updatedAt
        FROM reference_library WHERE topic = ? ORDER BY source_name, title LIMIT ?
      `).bind(topic, limit).all()
    : await DB.prepare(`
        SELECT id, title, description, topic, subject, source_name AS sourceName,
               source_url AS sourceUrl, license_note AS licenseNote,
               access_mode AS accessMode, tags_json AS tagsJson,
               created_at AS createdAt, updated_at AS updatedAt
        FROM reference_library ORDER BY source_name, title LIMIT ?
      `).bind(limit).all();

  return Response.json({ references: result.results });
}
