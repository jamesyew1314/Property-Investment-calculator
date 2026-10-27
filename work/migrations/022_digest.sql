BEGIN;
CREATE TABLE IF NOT EXISTS digest_log (
  agent_id integer NOT NULL REFERENCES lib_agents(id) ON DELETE CASCADE,
  day      date NOT NULL DEFAULT current_date,
  sent_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, day)
);
GRANT SELECT, INSERT ON digest_log TO fangchan_app;
COMMIT;
