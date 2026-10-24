-- v0.62: 用户端两步验证 + PDPA 数据导出
ALTER TABLE users ADD COLUMN IF NOT EXISTS twofa_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS login_codes (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash     text NOT NULL,
  challenge_hash text NOT NULL,
  attempts      integer NOT NULL DEFAULT 0,
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_codes_challenge_idx ON login_codes(challenge_hash);
CREATE INDEX IF NOT EXISTS login_codes_user_idx ON login_codes(user_id);
