-- 021_clients_tenant.sql — 客户按中介隔离
BEGIN;
ALTER TABLE lib_clients ADD COLUMN IF NOT EXISTS tenant_id integer;
CREATE INDEX IF NOT EXISTS lib_clients_tenant_idx ON lib_clients (tenant_id, status);
COMMIT;
