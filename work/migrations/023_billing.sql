BEGIN;
CREATE TABLE IF NOT EXISTS agent_subscriptions (
  id          bigserial PRIMARY KEY,
  agent_id    integer NOT NULL REFERENCES lib_agents(id) ON DELETE CASCADE,
  plan        text NOT NULL DEFAULT 'pro',
  status      text NOT NULL DEFAULT 'active',
  started_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  source      text NOT NULL DEFAULT 'manual',
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_sub_agent_idx ON agent_subscriptions (agent_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS agent_codes (
  code        text PRIMARY KEY,
  plan        text NOT NULL DEFAULT 'pro',
  months      integer NOT NULL DEFAULT 1,
  note        text,
  created_by  text,
  used_by     integer REFERENCES lib_agents(id) ON DELETE SET NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON agent_subscriptions, agent_codes TO fangchan_app;
GRANT USAGE, SELECT ON SEQUENCE agent_subscriptions_id_seq TO fangchan_app;
COMMIT;
