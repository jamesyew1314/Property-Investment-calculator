BEGIN;
-- 041_payments.sql — 在线支付字段（Billplz Phase A）
ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS gateway text;
ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS gateway_ref text;
ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS bill_url text;
ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS mandate_id text;
COMMIT;
