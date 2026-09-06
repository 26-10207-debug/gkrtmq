CREATE TABLE IF NOT EXISTS material_runtime_sessions (
  token_hash TEXT PRIMARY KEY, source_id TEXT NOT NULL, source_kind TEXT NOT NULL,
  attachment_index INTEGER NOT NULL, owner_id TEXT, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS runtime_session_expiry ON material_runtime_sessions(expires_at);
CREATE TABLE IF NOT EXISTS material_runtime_state (
  user_id TEXT NOT NULL, material_id TEXT NOT NULL, state_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id, material_id)
);
