-- v0.78: 轻量事件埋点（转化漏斗）
CREATE TABLE IF NOT EXISTS events (
  id         bigserial PRIMARY KEY,
  name       text NOT NULL,
  path       text,
  meta       text,
  ip_hash    text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_name_time_idx ON events(name, created_at DESC);
CREATE INDEX IF NOT EXISTS events_time_idx ON events(created_at DESC);
GRANT ALL ON events TO fangchan_app;
GRANT USAGE, SELECT ON SEQUENCE events_id_seq TO fangchan_app;
