BEGIN;
-- 036_site_orders.sql — 建站接单系统（独立模块；不改动 AgentSite / agent 工作台 / 资料库既有表）
-- 金额统一 NUMERIC(18,2)；订单与 token 流水是业务记录，时间用 timestamptz。
-- 价格口径（2026-11-17 确认）：setup_price = 首月总价 RM2,500（含建站 + 首月服务），
--   monthly_price = 第 2 个月起的月费 RM1,500。首月不是 2500 + 1500 叠加。

CREATE TABLE IF NOT EXISTS site_orders (
  id                bigserial PRIMARY KEY,
  order_no          text NOT NULL UNIQUE,
  name              text NOT NULL,
  phone             text NOT NULL,
  email             text,
  company           text,
  ren_no            text,
  area              text,
  domain            text,
  notes             text,
  package_code      text NOT NULL DEFAULT 'dedicated',
  monthly_price     numeric(18,2) NOT NULL DEFAULT 1500,
  setup_price       numeric(18,2) NOT NULL DEFAULT 2500,
  status            text NOT NULL DEFAULT 'new',
  contract_accepted boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_orders_status_chk CHECK (status IN
    ('new','contacted','paid','building','review','live','paused','cancelled')),
  CONSTRAINT site_orders_package_chk CHECK (package_code IN ('dedicated')),
  CONSTRAINT site_orders_price_chk CHECK (monthly_price >= 0 AND setup_price >= 0),
  CONSTRAINT site_orders_contact_chk CHECK (length(btrim(name)) > 0 AND length(btrim(phone)) > 0)
);

CREATE INDEX IF NOT EXISTS site_orders_status_idx ON site_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS site_orders_created_idx ON site_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS site_orders_phone_idx ON site_orders(phone);

-- 订单事件流：created / status / note 等，后台时间线用
CREATE TABLE IF NOT EXISTS site_order_events (
  id         bigserial PRIMARY KEY,
  order_id   bigint NOT NULL REFERENCES site_orders(id) ON DELETE CASCADE,
  type       text NOT NULL,
  note       text,
  actor      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_order_events_order_idx ON site_order_events(order_id, created_at DESC);

-- 建站 token 流水：topup 充值 / usage 消耗 / adjust 人工调整（可正可负）
-- 正负号约定：topup 与 usage 存正数，usage 在余额里做减法；adjust 直接存带符号金额。
CREATE TABLE IF NOT EXISTS token_ledger (
  id         bigserial PRIMARY KEY,
  order_id   bigint NOT NULL REFERENCES site_orders(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  amount     numeric(18,2) NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT token_ledger_kind_chk CHECK (kind IN ('topup','usage','adjust')),
  CONSTRAINT token_ledger_amount_chk CHECK (amount <> 0),
  CONSTRAINT token_ledger_sign_chk CHECK (kind = 'adjust' OR amount > 0)
);

CREATE INDEX IF NOT EXISTS token_ledger_order_idx ON token_ledger(order_id, created_at DESC);

GRANT ALL ON site_orders TO fangchan_app;
GRANT ALL ON site_order_events TO fangchan_app;
GRANT ALL ON token_ledger TO fangchan_app;
GRANT USAGE, SELECT ON SEQUENCE site_orders_id_seq TO fangchan_app;
GRANT USAGE, SELECT ON SEQUENCE site_order_events_id_seq TO fangchan_app;
GRANT USAGE, SELECT ON SEQUENCE token_ledger_id_seq TO fangchan_app;

COMMIT;
