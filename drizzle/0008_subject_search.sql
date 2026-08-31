ALTER TABLE contributions ADD COLUMN subject text NOT NULL DEFAULT '분류 없음';
ALTER TABLE contributions ADD COLUMN tags_json text NOT NULL DEFAULT '[]';
ALTER TABLE reference_library ADD COLUMN subject text NOT NULL DEFAULT '분류 없음';

CREATE TABLE IF NOT EXISTS search_synonyms (
  canonical text NOT NULL,
  alias text NOT NULL,
  subject text,
  PRIMARY KEY (canonical, alias)
);
CREATE INDEX IF NOT EXISTS search_synonyms_alias_idx ON search_synonyms (alias);
CREATE TABLE IF NOT EXISTS search_index_state (
  key text PRIMARY KEY,
  value text NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS search_documents USING fts5(
  source_id UNINDEXED,
  source_type UNINDEXED,
  subject,
  title,
  tags,
  body,
  tokenize='trigram'
);
