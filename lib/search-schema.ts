// Schema-only. Production applies these through the appended Drizzle migration.
export const searchSchema = [
  `CREATE TABLE search_v2_guard (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1))`,
  `CREATE TABLE search_v2_documents (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, source_type TEXT NOT NULL, title TEXT NOT NULL, normalized_title TEXT NOT NULL, compact_title TEXT NOT NULL, title_initials TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '분류 없음', tags_json TEXT NOT NULL DEFAULT '[]', year TEXT, grade TEXT, school TEXT, exam TEXT, file_type TEXT NOT NULL DEFAULT '', source_host TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL DEFAULT '', source_name TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT '', view_count INTEGER NOT NULL DEFAULT 0, summary_json TEXT NOT NULL DEFAULT '{}', fingerprint TEXT NOT NULL, content_version INTEGER NOT NULL DEFAULT 1, index_status TEXT NOT NULL DEFAULT 'pending', index_message TEXT NOT NULL DEFAULT '', duplicate_key TEXT NOT NULL, thumbnail_key TEXT, preview_key TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX search_v2_type ON search_v2_documents(source_type, source_id)`,
  `CREATE INDEX search_v2_filters ON search_v2_documents(subject, year, school)`,
  `CREATE INDEX search_v2_title ON search_v2_documents(normalized_title)`,
  `CREATE INDEX search_v2_duplicates ON search_v2_documents(duplicate_key)`,
  `CREATE TABLE search_v2_chunks (id INTEGER PRIMARY KEY AUTOINCREMENT, document_id TEXT NOT NULL REFERENCES search_v2_documents(id) ON DELETE CASCADE, chunk_key TEXT NOT NULL, field TEXT NOT NULL DEFAULT 'body', content TEXT NOT NULL, normalized TEXT NOT NULL, compact TEXT NOT NULL, location_json TEXT NOT NULL DEFAULT '{}', ordinal INTEGER NOT NULL DEFAULT 0, UNIQUE(document_id,chunk_key))`,
  `CREATE INDEX search_v2_chunk_document ON search_v2_chunks(document_id,ordinal)`,
  `CREATE VIRTUAL TABLE search_v2_fts USING fts5(normalized, compact, tokenize='trigram')`,
  `CREATE VIRTUAL TABLE search_v2_short USING fts5(grams, tokenize='unicode61')`,
  `CREATE TABLE search_v2_jobs (id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES search_v2_documents(id) ON DELETE CASCADE, content_version INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0, progress_json TEXT NOT NULL DEFAULT '{}', error TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(document_id,content_version))`,
  `CREATE INDEX search_v2_job_pending ON search_v2_jobs(status,lease_until,updated_at)`,
  `CREATE TABLE search_v2_sources (id TEXT PRIMARY KEY, name TEXT NOT NULL, config_json TEXT NOT NULL, last_checked TEXT, last_error TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE search_v2_control (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE search_v2_views (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)`,
  `CREATE INDEX search_v2_view_expiry ON search_v2_views(expires_at)`,
];
export const visibleSearchDocument = `(d.source_type = 'builtin' OR (d.source_type = 'contribution' AND EXISTS (SELECT 1 FROM contributions c WHERE c.id=d.source_id AND c.status IN ('published','published_ai'))) OR (d.source_type = 'reference' AND EXISTS (SELECT 1 FROM reference_library r WHERE r.id=d.source_id)) OR (d.source_type = 'folder' AND EXISTS (SELECT 1 FROM public_folders f WHERE f.id=d.source_id AND f.visibility_state='published')))`;
