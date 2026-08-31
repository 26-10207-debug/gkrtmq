CREATE TABLE public_folders (
  id text PRIMARY KEY, owner_id text NOT NULL, owner_display_name text NOT NULL,
  title text NOT NULL, description text NOT NULL DEFAULT '', subject text NOT NULL DEFAULT '분류 없음',
  tags_json text NOT NULL DEFAULT '[]', created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public_folder_items (
  folder_id text NOT NULL, contribution_id text NOT NULL, position integer NOT NULL DEFAULT 0,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (folder_id, contribution_id)
);
CREATE INDEX public_folders_owner_idx ON public_folders (owner_id, updated_at DESC);
CREATE INDEX public_folder_items_folder_idx ON public_folder_items (folder_id, position);
