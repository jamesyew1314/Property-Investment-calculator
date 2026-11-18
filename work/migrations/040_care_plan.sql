BEGIN;
-- 040_care_plan.sql — 第 2 个月起方案字段（care199 / care299 / growth499）
ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS care_plan text NOT NULL DEFAULT 'care299';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_orders_care_plan_chk') THEN
    ALTER TABLE site_orders ADD CONSTRAINT site_orders_care_plan_chk
      CHECK (care_plan IN ('care199','care299','growth499'));
  END IF;
END $$;
COMMIT;
