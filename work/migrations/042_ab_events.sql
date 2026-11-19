BEGIN;
-- 042_ab_events.sql — 主页标题 A/B 测试事件（匿名，无 PII）
CREATE TABLE IF NOT EXISTS order_ab_events (
  id bigserial PRIMARY KEY,
  event text NOT NULL,
  variant text NOT NULL,
  path text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_ab_events_event_chk CHECK (event IN ('view','whatsapp_click','plans_click','form_submit')),
  CONSTRAINT order_ab_events_variant_chk CHECK (variant IN ('A','B'))
);
CREATE INDEX IF NOT EXISTS order_ab_events_variant_idx ON order_ab_events (variant, created_at DESC);
GRANT ALL ON order_ab_events TO fangchan_app;
GRANT USAGE, SELECT ON SEQUENCE order_ab_events_id_seq TO fangchan_app;
COMMIT;
