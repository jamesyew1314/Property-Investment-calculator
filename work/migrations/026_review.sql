BEGIN;
ALTER TABLE lib_agents ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending';
ALTER TABLE lib_agents ADD COLUMN IF NOT EXISTS review_note text;
UPDATE lib_agents SET review_status='approved' WHERE verified_at IS NOT NULL;
COMMIT;
