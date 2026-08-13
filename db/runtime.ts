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
  initialization = DB.batch([
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
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    DB.prepare(`
      CREATE INDEX IF NOT EXISTS contributions_status_created_idx
      ON contributions (status, created_at DESC)
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
    DB.prepare(`
      CREATE INDEX IF NOT EXISTS learning_progress_learner_idx
      ON learning_progress (learner_id, updated_at DESC)
    `),
  ]).then(() => undefined);

  return initialization;
}
