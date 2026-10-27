-- 017_library.sql — 房产资料库（PropBase）v1
-- 9 张表：楼盘 / 房源 / 业主 / 客户 / 带看 / 成交 / 改价 / 审计 + 中介名册
-- 约定：金额 NUMERIC(18,2)，日期 DATE，时间戳 timestamptz；不删除历史（软归档）。

BEGIN;

-- ---------- 中介名册（内部人员，不用于登录） ----------
CREATE TABLE IF NOT EXISTS lib_agents (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  phone       text,
  email       text,
  ren_no      text,
  team        text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lib_agents_name_uniq ON lib_agents (lower(name));

-- ---------- 楼盘 / 项目 ----------
CREATE TABLE IF NOT EXISTS lib_projects (
  id              serial PRIMARY KEY,
  name            text NOT NULL,
  name_zh         text,
  developer       text,
  area_code       text,
  address         text,
  tenure          text,                    -- freehold | leasehold
  property_type   text,                    -- terrace | condo | shoplot ...
  total_units     integer,
  blocks          integer,
  completion_year integer,
  facilities      text,
  lat             numeric(9,6),
  lng             numeric(9,6),
  remarks         text,
  archived        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lib_projects_name_area_uniq
  ON lib_projects (lower(name), coalesce(area_code, ''));
CREATE INDEX IF NOT EXISTS lib_projects_area_idx ON lib_projects (area_code);

-- ---------- 业主 ----------
CREATE TABLE IF NOT EXISTS lib_owners (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  phone       text,
  phone2      text,
  email       text,
  id_last4    text,
  address     text,
  source      text,                        -- referral | walk_in | portal | social | signage | existing | other
  remarks     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lib_owners_phone_idx ON lib_owners (phone);
CREATE INDEX IF NOT EXISTS lib_owners_name_idx ON lib_owners (lower(name));

-- ---------- 客户（买家 / 租客） ----------
CREATE TABLE IF NOT EXISTS lib_clients (
  id              serial PRIMARY KEY,
  name            text NOT NULL,
  phone           text,
  email           text,
  intent          text,                    -- buy | rent
  budget_min      numeric(18,2),
  budget_max      numeric(18,2),
  area_codes      text[],
  property_types  text[],
  bedrooms_min    integer,
  timeline        text,                    -- now | 3m | 6m | 1y | exploring
  source          text,
  status          text NOT NULL DEFAULT 'new',  -- new | active | viewing | offer | won | lost
  agent           text,
  remarks         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lib_clients_status_idx ON lib_clients (status);
CREATE INDEX IF NOT EXISTS lib_clients_phone_idx ON lib_clients (phone);
CREATE INDEX IF NOT EXISTS lib_clients_agent_idx ON lib_clients (agent);

-- ---------- 房源 ----------
CREATE TABLE IF NOT EXISTS lib_properties (
  id              serial PRIMARY KEY,
  code            text NOT NULL,           -- KT-0001
  project_id      integer REFERENCES lib_projects(id) ON DELETE SET NULL,
  project_name    text,                    -- 无楼盘时的自由文本（如 Taman 排屋）
  area_code       text,
  property_type   text,
  tenure          text,
  address         text,
  block           text,
  unit_no         text,
  floor           integer,
  built_up        numeric(10,2),           -- sqft
  land_area       numeric(10,2),           -- sqft
  bedrooms        integer,
  bathrooms       integer,
  carparks        integer,
  facing          text,
  furnishing      text,                    -- unfurnished | partial | full
  condition       text,                    -- new | renovated | good | fair | needs_work
  intent          text NOT NULL DEFAULT 'sale',   -- sale | rent
  asking_price    numeric(18,2),
  rent_price      numeric(18,2),
  maintenance_fee numeric(10,2),
  status          text NOT NULL DEFAULT 'available', -- available | reserved | sold | rented | off_market
  owner_id        integer REFERENCES lib_owners(id) ON DELETE SET NULL,
  agent           text,
  exclusive       boolean NOT NULL DEFAULT false,
  listed_on       date,
  title_type      text,                    -- individual | strata | master
  tags            text[],
  remarks         text,
  is_demo         boolean NOT NULL DEFAULT false,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS lib_property_code_seq;
ALTER TABLE lib_properties ALTER COLUMN code
  SET DEFAULT ('KT-' || lpad(nextval('lib_property_code_seq')::text, 4, '0'));
CREATE UNIQUE INDEX IF NOT EXISTS lib_properties_code_uniq ON lib_properties (code);
CREATE INDEX IF NOT EXISTS lib_properties_status_idx ON lib_properties (status, intent);
CREATE INDEX IF NOT EXISTS lib_properties_area_idx ON lib_properties (area_code);
CREATE INDEX IF NOT EXISTS lib_properties_project_idx ON lib_properties (project_id);
CREATE INDEX IF NOT EXISTS lib_properties_owner_idx ON lib_properties (owner_id);
CREATE INDEX IF NOT EXISTS lib_properties_agent_idx ON lib_properties (agent);
CREATE INDEX IF NOT EXISTS lib_properties_updated_idx ON lib_properties (updated_at DESC);
CREATE INDEX IF NOT EXISTS lib_properties_price_idx ON lib_properties (asking_price);
-- 同一楼盘 + 座 + 单位号只允许一条（杜绝重复录入）
CREATE UNIQUE INDEX IF NOT EXISTS lib_properties_unit_uniq
  ON lib_properties (coalesce(project_id, 0), lower(coalesce(block, '')), lower(coalesce(unit_no, '')))
  WHERE unit_no IS NOT NULL AND unit_no <> '';

-- ---------- 带看 ----------
CREATE TABLE IF NOT EXISTS lib_viewings (
  id              serial PRIMARY KEY,
  property_id     integer REFERENCES lib_properties(id) ON DELETE CASCADE,
  client_id       integer REFERENCES lib_clients(id) ON DELETE SET NULL,
  agent           text,
  scheduled_on    date,
  scheduled_time  text,                    -- HH:MM
  status          text NOT NULL DEFAULT 'scheduled', -- scheduled | done | no_show | cancelled
  feedback        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lib_viewings_date_idx ON lib_viewings (scheduled_on DESC);
CREATE INDEX IF NOT EXISTS lib_viewings_prop_idx ON lib_viewings (property_id);
CREATE INDEX IF NOT EXISTS lib_viewings_client_idx ON lib_viewings (client_id);

-- ---------- 成交 ----------
CREATE TABLE IF NOT EXISTS lib_deals (
  id                serial PRIMARY KEY,
  property_id       integer REFERENCES lib_properties(id) ON DELETE SET NULL,
  client_id         integer REFERENCES lib_clients(id) ON DELETE SET NULL,
  kind              text NOT NULL DEFAULT 'sale',  -- sale | rent
  price             numeric(18,2),
  deal_on           date,
  commission_rate   numeric(6,3),          -- 百分比，如 3 = 3%
  commission_amount numeric(18,2),
  agent             text,
  status            text NOT NULL DEFAULT 'completed', -- pending | completed | cancelled
  remarks           text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lib_deals_date_idx ON lib_deals (deal_on DESC);
CREATE INDEX IF NOT EXISTS lib_deals_prop_idx ON lib_deals (property_id);

-- ---------- 改价历史 ----------
CREATE TABLE IF NOT EXISTS lib_price_events (
  id          bigserial PRIMARY KEY,
  property_id integer NOT NULL REFERENCES lib_properties(id) ON DELETE CASCADE,
  field       text NOT NULL DEFAULT 'asking_price',   -- asking_price | rent_price
  old_price   numeric(18,2),
  new_price   numeric(18,2),
  note        text,
  actor       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lib_price_events_prop_idx ON lib_price_events (property_id, created_at DESC);

-- ---------- 审计 ----------
CREATE TABLE IF NOT EXISTS lib_audit (
  id          bigserial PRIMARY KEY,
  actor       text,
  action      text NOT NULL,               -- create | update | delete | import | bulk | demo
  entity      text NOT NULL,               -- property | project | owner | client | viewing | deal
  entity_id   integer,
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lib_audit_time_idx ON lib_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS lib_audit_entity_idx ON lib_audit (entity, entity_id);

-- ---------- 权限 ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  lib_agents, lib_projects, lib_owners, lib_clients, lib_properties,
  lib_viewings, lib_deals, lib_price_events, lib_audit
  TO fangchan_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fangchan_app;

COMMIT;
