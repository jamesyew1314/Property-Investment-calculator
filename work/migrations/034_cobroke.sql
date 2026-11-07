BEGIN;
ALTER TABLE lib_agents ADD COLUMN IF NOT EXISTS cobroke_note text;
COMMIT;
