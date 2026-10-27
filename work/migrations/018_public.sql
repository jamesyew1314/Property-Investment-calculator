-- 018_public.sql — PropNet 官网（M0）
-- 房源公开范围、中介资料、官网加入申请

BEGIN;

-- ---------- 房源：是否公开到官网 ----------
ALTER TABLE lib_properties
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'pool',   -- pool | public
  ADD COLUMN IF NOT EXISTS tenant_id integer,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS views integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cover_url text;

CREATE INDEX IF NOT EXISTS lib_properties_public_idx
  ON lib_properties (visibility, status, published_at DESC NULLS LAST);

-- ---------- 中介：个人站与套餐 ----------
ALTER TABLE lib_agents
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS public boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS areas text[];

CREATE UNIQUE INDEX IF NOT EXISTS lib_agents_slug_uniq
  ON lib_agents (lower(slug)) WHERE slug IS NOT NULL;

-- ---------- 官网「加入我们」申请 ----------
CREATE TABLE IF NOT EXISTS agent_leads (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL,
  phone       text NOT NULL,
  email       text,
  ren_no      text,
  team        text,
  message     text,
  source      text NOT NULL DEFAULT 'homepage',
  status      text NOT NULL DEFAULT 'new',       -- new | contacted | joined | dropped
  ip_hash     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_leads_time_idx ON agent_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS agent_leads_status_idx ON agent_leads (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON agent_leads TO fangchan_app;
GRANT USAGE, SELECT ON SEQUENCE agent_leads_id_seq TO fangchan_app;

COMMIT;
