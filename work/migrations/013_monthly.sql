-- v0.63: 月度邮件（可退订）
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_opt_out boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_sent_at timestamptz;
CREATE INDEX IF NOT EXISTS users_monthly_idx ON users(monthly_sent_at);
