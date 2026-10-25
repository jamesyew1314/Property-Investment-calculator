-- v0.69: 退款申请
CREATE TABLE IF NOT EXISTS refund_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_id   uuid REFERENCES payments(id) ON DELETE SET NULL,
  reason       text NOT NULL,
  status       text NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  admin_note   text,
  decided_by   uuid,
  decided_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refund_status_idx ON refund_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS refund_user_idx ON refund_requests(user_id, created_at DESC);
GRANT ALL ON refund_requests TO fangchan_app;
