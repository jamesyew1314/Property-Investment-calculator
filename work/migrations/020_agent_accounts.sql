-- 020_agent_accounts.sql — PropNet M1：中介账号、会话、验证、带看询盘
BEGIN;

ALTER TABLE lib_agents
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS lib_agents_email_uniq
  ON lib_agents (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_sessions (
  id          bigserial PRIMARY KEY,
  token_hash  text NOT NULL UNIQUE,
  agent_id    integer NOT NULL REFERENCES lib_agents(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_sessions_agent_idx ON agent_sessions (agent_id);

CREATE TABLE IF NOT EXISTS agent_tokens (
  id          bigserial PRIMARY KEY,
  agent_id    integer NOT NULL REFERENCES lib_agents(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'verify',   -- verify | reset
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pool_inquiries (
  id           bigserial PRIMARY KEY,
  property_id  integer NOT NULL REFERENCES lib_properties(id) ON DELETE CASCADE,
  from_agent_id integer NOT NULL REFERENCES lib_agents(id) ON DELETE CASCADE,
  to_agent_id  integer REFERENCES lib_agents(id) ON DELETE SET NULL,
  client_name  text,
  client_phone text,
  message      text,
  status       text NOT NULL DEFAULT 'new',     -- new | accepted | declined | done
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pool_inq_to_idx ON pool_inquiries (to_agent_id, status);
CREATE INDEX IF NOT EXISTS pool_inq_from_idx ON pool_inquiries (from_agent_id);

CREATE INDEX IF NOT EXISTS lib_properties_tenant_idx ON lib_properties (tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON agent_sessions, agent_tokens, pool_inquiries TO fangchan_app;
GRANT USAGE, SELECT ON SEQUENCE agent_sessions_id_seq, agent_tokens_id_seq, pool_inquiries_id_seq TO fangchan_app;

COMMIT;
