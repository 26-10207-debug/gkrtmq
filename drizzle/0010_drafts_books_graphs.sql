ALTER TABLE public_folders ADD COLUMN folder_type text NOT NULL DEFAULT 'regular';
ALTER TABLE public_folders ADD COLUMN visibility_state text NOT NULL DEFAULT 'published';
ALTER TABLE public_folder_items ADD COLUMN page_start integer;
ALTER TABLE public_folder_items ADD COLUMN page_end integer;
CREATE TABLE contribution_drafts (
  id text PRIMARY KEY, owner_id text NOT NULL, source_contribution_id text,
  title text NOT NULL DEFAULT '', source_note text NOT NULL DEFAULT '', subject text NOT NULL DEFAULT '분류 없음',
  tags_json text NOT NULL DEFAULT '[]', custom_materials_json text NOT NULL DEFAULT '{}', mechanical_options text NOT NULL DEFAULT '{}',
  attachments_json text NOT NULL DEFAULT '[]', extracted_texts_json text NOT NULL DEFAULT '[]', folder_id text,
  regular_folder_ids_json text NOT NULL DEFAULT '[]',
  page_start integer, page_end integer, publish_mode text NOT NULL DEFAULT 'instant',
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX contribution_drafts_owner_updated_idx ON contribution_drafts (owner_id, updated_at DESC);
CREATE UNIQUE INDEX contribution_drafts_source_unique_idx ON contribution_drafts (source_contribution_id) WHERE source_contribution_id IS NOT NULL;
