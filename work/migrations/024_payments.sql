BEGIN;
CREATE TABLE IF NOT EXISTS agent_payments (
  id           bigserial PRIMARY KEY,
  agent_id     integer NOT NULL REFERENCES lib_agents(id) ON DELETE CASCADE,
  plan         text NOT NULL DEFAULT 'pro',
  months       integer NOT NULL DEFAULT 1,
  amount       numeric(10,2) NOT NULL,
  provider     text NOT NULL DEFAULT 'billplz',
  provider_ref text UNIQUE,
  status       text NOT NULL DEFAULT 'pending',
  bill_url     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  paid_at      timestamptz
);
CREATE INDEX IF NOT EXISTS agent_payments_agent_idx ON agent_payments (agent_id, status);
GRANT SELECT, INSERT, UPDATE ON agent_payments TO fangchan_app;
GRANT USAGE, SELECT ON SEQUENCE agent_payments_id_seq TO fangchan_app;
COMMIT;
