BEGIN;
-- 039_care_plans.sql — 月费改为 199/299/499 三档，默认主方案 RM299
ALTER TABLE site_orders ALTER COLUMN monthly_price SET DEFAULT 299;
COMMIT;
