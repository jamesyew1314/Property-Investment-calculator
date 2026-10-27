-- 019_national.sql — 全马地区体系：给楼盘/房源加 state
BEGIN;

ALTER TABLE lib_properties ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE lib_projects   ADD COLUMN IF NOT EXISTS state text;

UPDATE lib_properties SET state = 'johor' WHERE state IS NULL;
UPDATE lib_projects   SET state = 'johor' WHERE state IS NULL;

CREATE INDEX IF NOT EXISTS lib_properties_state_idx ON lib_properties (state, status);
CREATE INDEX IF NOT EXISTS lib_projects_state_idx   ON lib_projects (state);

COMMIT;
