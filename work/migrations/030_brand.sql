BEGIN;

-- 中介品牌数据
ALTER TABLE lib_agents ADD COLUMN IF NOT EXISTS years_exp integer;
ALTER TABLE lib_agents ADD COLUMN IF NOT EXISTS deals_count integer;
ALTER TABLE lib_agents ADD COLUMN IF NOT EXISTS deals_value numeric(18,2);
ALTER TABLE lib_agents ADD COLUMN IF NOT EXISTS google_id text;
ALTER TABLE lib_agents ADD COLUMN IF NOT EXISTS avatar_url text;

-- 房源公开描述（AI/手写，不涉及业主）
ALTER TABLE lib_properties ADD COLUMN IF NOT EXISTS description text;

-- 业主委托线索
CREATE TABLE IF NOT EXISTS mandate_leads (
  id bigserial PRIMARY KEY,
  agent_id integer NOT NULL REFERENCES lib_agents(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  area_code text,
  property_type text,
  asking_price numeric(18,2),
  notes text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mandate_agent_idx ON mandate_leads(agent_id, created_at DESC);

-- 客户评价（先审后展示）
CREATE TABLE IF NOT EXISTS agent_reviews (
  id bigserial PRIMARY KEY,
  agent_id integer NOT NULL REFERENCES lib_agents(id) ON DELETE CASCADE,
  author text NOT NULL,
  rating integer NOT NULL DEFAULT 5,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS review_agent_idx ON agent_reviews(agent_id, status, created_at DESC);

-- 邮箱一键登录
CREATE TABLE IF NOT EXISTS agent_magic_links (
  id bigserial PRIMARY KEY,
  agent_id integer NOT NULL REFERENCES lib_agents(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS magic_agent_idx ON agent_magic_links(agent_id, created_at DESC);

GRANT ALL ON mandate_leads TO fangchan_app;
GRANT ALL ON agent_reviews TO fangchan_app;
GRANT ALL ON agent_magic_links TO fangchan_app;
GRANT USAGE, SELECT ON SEQUENCE mandate_leads_id_seq TO fangchan_app;
GRANT USAGE, SELECT ON SEQUENCE agent_reviews_id_seq TO fangchan_app;
GRANT USAGE, SELECT ON SEQUENCE agent_magic_links_id_seq TO fangchan_app;

-- WhatsApp 群组配置（分享用）
CREATE TABLE IF NOT EXISTS agent_wa_groups (
  id bigserial PRIMARY KEY,
  agent_id integer NOT NULL REFERENCES lib_agents(id) ON DELETE CASCADE,
  label text NOT NULL,
  invite_link text NOT NULL,
  invite_code text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id, invite_code)
);
GRANT ALL ON agent_wa_groups TO fangchan_app;
GRANT USAGE, SELECT ON SEQUENCE agent_wa_groups_id_seq TO fangchan_app;

COMMIT;
