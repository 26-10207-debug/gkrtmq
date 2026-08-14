import { env } from "cloudflare:workers";

export type RuntimeEnv = {
  DB: D1Database;
  UPLOADS: R2Bucket;
  OPENAI_API_KEY?: string;
};

export function getRuntimeEnv(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

let initialization: Promise<void> | null = null;

export function ensureSchema() {
  if (initialization) return initialization;

  const { DB } = getRuntimeEnv();
  initialization = (async () => {
    await DB.batch([
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS contributions (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          original_name TEXT NOT NULL,
          content_type TEXT NOT NULL,
          object_key TEXT NOT NULL,
          source_note TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'uploaded',
          ai_model TEXT,
          learning_json TEXT,
          error_message TEXT,
          owner_id TEXT,
          owner_email TEXT,
          owner_display_name TEXT,
          view_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          display_name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS learning_progress (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          learner_id TEXT NOT NULL,
          asset_id TEXT NOT NULL,
          mode TEXT NOT NULL,
          completed_items INTEGER NOT NULL DEFAULT 0,
          score INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (learner_id, asset_id, mode)
        )
      `),
    ]);

    const columnResult = await DB.prepare("PRAGMA table_info(contributions)").all();
    const columns = new Set(
      columnResult.results.map((row) => String((row as { name?: unknown }).name ?? "")),
    );
    const additions: D1PreparedStatement[] = [];
    if (!columns.has("owner_id")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN owner_id TEXT"));
    if (!columns.has("owner_email")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN owner_email TEXT"));
    if (!columns.has("owner_display_name")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN owner_display_name TEXT"));
    if (!columns.has("view_count")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0"));
    if (additions.length) await DB.batch(additions);

    await DB.batch([
      DB.prepare(`
        CREATE INDEX IF NOT EXISTS contributions_status_created_idx
        ON contributions (status, created_at DESC)
      `),
      DB.prepare(`
        CREATE INDEX IF NOT EXISTS contributions_owner_created_idx
        ON contributions (owner_id, created_at DESC)
      `),
      DB.prepare(`
        CREATE INDEX IF NOT EXISTS learning_progress_learner_idx
        ON learning_progress (learner_id, updated_at DESC)
      `),
    ]);
  })();

  return initialization;
}
