ALTER TABLE contribution_drafts ADD COLUMN ai_conversation_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE contribution_drafts ADD COLUMN source_digest TEXT NOT NULL DEFAULT '';
ALTER TABLE contribution_drafts ADD COLUMN ai_review_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contribution_drafts ADD COLUMN ai_applied_count INTEGER NOT NULL DEFAULT 0;
CREATE TABLE api_usage_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, draft_id TEXT, kind TEXT NOT NULL, model TEXT, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, pages INTEGER NOT NULL DEFAULT 0, estimated_usd_micros INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX api_usage_user_created_idx ON api_usage_ledger (user_id, created_at DESC);
CREATE INDEX api_usage_draft_created_idx ON api_usage_ledger (draft_id, created_at DESC);
