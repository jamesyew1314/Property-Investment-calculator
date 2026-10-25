-- v0.68: 条款同意留痕（PDPA / 消费者保护）
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_ip_hash text;

-- 老用户：视为在注册时已同意当版条款
UPDATE users SET terms_accepted_at = created_at, terms_version = '2026-10'
WHERE terms_accepted_at IS NULL;
