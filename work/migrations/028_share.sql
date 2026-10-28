BEGIN;
ALTER TABLE lib_properties ADD COLUMN IF NOT EXISTS share_count integer NOT NULL DEFAULT 0;
ALTER TABLE lib_properties ADD COLUMN IF NOT EXISTS last_shared_at timestamptz;
COMMIT;
