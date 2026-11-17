BEGIN;
-- 037_client_portal.sql — 客户建站门户 Phase 1（客户账号 / magic link / 会话 / 进度 / 变更请求）
-- 依赖 036（site_orders / site_order_events / token_ledger）与既有角色 fangchan_app。
-- 幂等：整文件可重复执行（表/索引 IF NOT EXISTS，列 IF NOT EXISTS，约束用 DO 块探测 pg_constraint）。
-- 建表顺序：先 client_users（被 site_orders FK 引用），再 site_orders 加列/加约束，最后业务表。

-- ---------- 1) 客户账号 ----------
CREATE TABLE IF NOT EXISTS client_users (
  id bigserial PRIMARY KEY, email text NOT NULL, name text, phone text,
  created_at timestamptz NOT NULL DEFAULT now(), last_login_at timestamptz
);
-- 邮箱大小写不敏感唯一：入库前应用层已归一化，这里仍按 lower(email) 兜底。
CREATE UNIQUE INDEX IF NOT EXISTS client_users_email_lower_uidx ON client_users (lower(email));

-- ---------- 2) magic link（只存 sha256） ----------
CREATE TABLE IF NOT EXISTS client_magic_links (
  id bigserial PRIMARY KEY,
  client_user_id bigint NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
  used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_magic_links_user_created_idx
  ON client_magic_links (client_user_id, created_at DESC);

-- ---------- 3) 客户会话（只存 sha256） ----------
CREATE TABLE IF NOT EXISTS client_sessions (
  id bigserial PRIMARY KEY,
  client_user_id bigint NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_sessions_user_idx ON client_sessions (client_user_id);

-- ---------- 4) site_orders 扩展（全部 IF NOT EXISTS） ----------
-- 先加列（带默认值）再加 CHECK：存量行天然满足默认值，约束可正常 validate。
ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS client_user_id bigint;
ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'brief',
  ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0;
ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS brief_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS launched_at timestamptz;

-- FK：客户账号删除时只解绑订单，不删业务订单。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'site_orders_client_user_fk'
                   AND conrelid = 'site_orders'::regclass) THEN
    ALTER TABLE site_orders ADD CONSTRAINT site_orders_client_user_fk
      FOREIGN KEY (client_user_id) REFERENCES client_users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'site_orders_phase_chk'
                   AND conrelid = 'site_orders'::regclass) THEN
    ALTER TABLE site_orders ADD CONSTRAINT site_orders_phase_chk
      CHECK (phase IN ('brief','design','build','review','launch','live'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'site_orders_progress_chk'
                   AND conrelid = 'site_orders'::regclass) THEN
    ALTER TABLE site_orders ADD CONSTRAINT site_orders_progress_chk
      CHECK (progress BETWEEN 0 AND 100);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'site_orders_payment_status_chk'
                   AND conrelid = 'site_orders'::regclass) THEN
    ALTER TABLE site_orders ADD CONSTRAINT site_orders_payment_status_chk
      CHECK (payment_status IN ('unpaid','paid','refunded'));
  END IF;
END $$;

-- ---------- 5) 客户可见进度（order_updates） ----------
CREATE TABLE IF NOT EXISTS order_updates (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES site_orders(id) ON DELETE CASCADE,
  phase text, progress integer, note text,
  visible boolean NOT NULL DEFAULT true, actor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_updates_phase_chk
    CHECK (phase IS NULL OR phase IN ('brief','design','build','review','launch','live')),
  CONSTRAINT order_updates_progress_chk
    CHECK (progress IS NULL OR (progress BETWEEN 0 AND 100))
);
CREATE INDEX IF NOT EXISTS order_updates_order_created_idx
  ON order_updates (order_id, created_at DESC, id DESC);

-- ---------- 6) 客户变更请求（change_requests） ----------
CREATE TABLE IF NOT EXISTS change_requests (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES site_orders(id) ON DELETE CASCADE,
  title text NOT NULL, description text NOT NULL, page_url text,
  priority text NOT NULL DEFAULT 'normal', status text NOT NULL DEFAULT 'open',
  admin_note text, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT change_requests_priority_chk CHECK (priority IN ('low','normal','high')),
  CONSTRAINT change_requests_status_chk CHECK (status IN ('open','in_progress','done','cancelled'))
);
CREATE INDEX IF NOT EXISTS change_requests_order_created_idx
  ON change_requests (order_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS change_requests_status_idx ON change_requests (status);

-- ---------- 7) site_orders 新列索引 ----------
CREATE INDEX IF NOT EXISTS site_orders_client_user_idx ON site_orders (client_user_id);
CREATE INDEX IF NOT EXISTS site_orders_phase_idx ON site_orders (phase);
CREATE INDEX IF NOT EXISTS site_orders_payment_status_idx ON site_orders (payment_status);

-- ---------- 8) 授权（幂等：重复 GRANT 同权限是 no-op） ----------
GRANT ALL ON client_users, client_magic_links, client_sessions,
             order_updates, change_requests TO fangchan_app;
GRANT USAGE, SELECT ON SEQUENCE client_users_id_seq, client_magic_links_id_seq,
             client_sessions_id_seq, order_updates_id_seq, change_requests_id_seq TO fangchan_app;
-- site_orders 已有表级 GRANT，覆盖新列，不重复 GRANT；036 的序列也不重复 GRANT。

COMMIT;
