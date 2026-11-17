BEGIN;
-- 038_token_usage.sql — 自动 token 计量（开发侧 meter 推送到内部 API）
-- 与 token_ledger 分开：ledger 是人工充值/调整，token_usage 是 DSH/Agent 实际用量。
CREATE TABLE IF NOT EXISTS token_usage (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES site_orders(id) ON DELETE CASCADE,
  session_id text NOT NULL UNIQUE,
  model text NOT NULL DEFAULT 'deepseek-flash',
  uncached_input_tokens bigint NOT NULL DEFAULT 0,
  cache_read_tokens bigint NOT NULL DEFAULT 0,
  cache_write_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  rate_period text NOT NULL DEFAULT 'off_peak',
  cost_usd numeric(18,6) NOT NULL DEFAULT 0,
  cost_myr numeric(18,2) NOT NULL DEFAULT 0,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT token_usage_tokens_chk CHECK (
    uncached_input_tokens >= 0 AND cache_read_tokens >= 0 AND
    cache_write_tokens >= 0 AND output_tokens >= 0
  ),
  CONSTRAINT token_usage_cost_chk CHECK (cost_usd >= 0 AND cost_myr >= 0),
  CONSTRAINT token_usage_period_chk CHECK (rate_period IN ('peak','off_peak'))
);
CREATE INDEX IF NOT EXISTS token_usage_order_observed_idx
  ON token_usage (order_id, observed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS token_usage_order_updated_idx
  ON token_usage (order_id, updated_at DESC);

GRANT ALL ON token_usage TO fangchan_app;
GRANT USAGE, SELECT ON SEQUENCE token_usage_id_seq TO fangchan_app;
COMMIT;
