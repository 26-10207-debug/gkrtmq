import { env } from "cloudflare:workers";

export type RuntimeEnv = {
  DB: D1Database;
  UPLOADS: R2Bucket;
  OPENAI_API_KEY?: string;
  AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?: string;
  AZURE_DOCUMENT_INTELLIGENCE_KEY?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
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
        CREATE TABLE IF NOT EXISTS auth_user (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          email_verified INTEGER NOT NULL DEFAULT 0,
          image TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS auth_session (
          id TEXT PRIMARY KEY,
          expires_at INTEGER NOT NULL,
          token TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          ip_address TEXT,
          user_agent TEXT,
          user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS auth_account (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
          access_token TEXT,
          refresh_token TEXT,
          id_token TEXT,
          access_token_expires_at INTEGER,
          refresh_token_expires_at INTEGER,
          scope TEXT,
          password TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS auth_verification (
          id TEXT PRIMARY KEY,
          identifier TEXT NOT NULL,
          value TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER,
          updated_at INTEGER
        )
      `),
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
          publish_mode TEXT NOT NULL DEFAULT 'instant',
          credits_awarded INTEGER NOT NULL DEFAULT 0,
          reviewed_at TEXT,
          mechanical_options TEXT NOT NULL DEFAULT '{}',
          mechanical_status TEXT NOT NULL DEFAULT 'none',
          extracted_text TEXT,
          questions_json TEXT,
          recall_json TEXT,
          text_only INTEGER NOT NULL DEFAULT 0,
          mechanical_error TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          display_name TEXT NOT NULL,
          credit_balance INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS credit_ledger (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          amount INTEGER NOT NULL,
          reason TEXT NOT NULL,
          contribution_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    if (!columns.has("publish_mode")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN publish_mode TEXT NOT NULL DEFAULT 'instant'"));
    if (!columns.has("credits_awarded")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN credits_awarded INTEGER NOT NULL DEFAULT 0"));
    if (!columns.has("reviewed_at")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN reviewed_at TEXT"));
    if (!columns.has("mechanical_options")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN mechanical_options TEXT NOT NULL DEFAULT '{}'"));
    if (!columns.has("mechanical_status")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN mechanical_status TEXT NOT NULL DEFAULT 'none'"));
    if (!columns.has("extracted_text")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN extracted_text TEXT"));
    if (!columns.has("questions_json")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN questions_json TEXT"));
    if (!columns.has("recall_json")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN recall_json TEXT"));
    if (!columns.has("text_only")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN text_only INTEGER NOT NULL DEFAULT 0"));
    if (!columns.has("mechanical_error")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN mechanical_error TEXT"));
    if (additions.length) await DB.batch(additions);

    const userColumnResult = await DB.prepare("PRAGMA table_info(users)").all();
    const userColumns = new Set(
      userColumnResult.results.map((row) => String((row as { name?: unknown }).name ?? "")),
    );
    if (!userColumns.has("credit_balance")) {
      await DB.prepare("ALTER TABLE users ADD COLUMN credit_balance INTEGER NOT NULL DEFAULT 0").run();
    }

    await DB.batch([
      DB.prepare("CREATE INDEX IF NOT EXISTS auth_session_user_idx ON auth_session (user_id)"),
      DB.prepare("CREATE INDEX IF NOT EXISTS auth_account_user_idx ON auth_account (user_id)"),
      DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS auth_account_provider_unique_idx ON auth_account (provider_id, account_id)"),
      DB.prepare("CREATE INDEX IF NOT EXISTS auth_verification_identifier_idx ON auth_verification (identifier)"),
      DB.prepare(`
        CREATE INDEX IF NOT EXISTS contributions_status_created_idx
        ON contributions (status, created_at DESC)
      `),
      DB.prepare(`
        CREATE INDEX IF NOT EXISTS contributions_owner_created_idx
        ON contributions (owner_id, created_at DESC)
      `),
      DB.prepare(`
        CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_contribution_unique_idx
        ON credit_ledger (contribution_id)
        WHERE contribution_id IS NOT NULL
      `),
      DB.prepare(`
        CREATE INDEX IF NOT EXISTS credit_ledger_user_created_idx
        ON credit_ledger (user_id, created_at DESC)
      `),
      DB.prepare(`
        CREATE INDEX IF NOT EXISTS learning_progress_learner_idx
        ON learning_progress (learner_id, updated_at DESC)
      `),
    ]);
  })();

  return initialization;
}
