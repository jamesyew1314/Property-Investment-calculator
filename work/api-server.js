"use strict";
const express = require("express");
const crypto = require("node:crypto");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const FREE_QUOTA = 3;
const SESSION_DAYS = 30;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "200kb" }));

// ---------- helpers ----------
function sha256(s) { return crypto.createHash("sha256").update(s).digest("hex"); }
function scryptHash(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(pw, salt, 64).toString("hex");
}
function scryptVerify(pw, stored) {
  const parts = String(stored || "").split(":");
  if (parts.length !== 2) return false;
  const calc = crypto.scryptSync(pw, parts[0], 64);
  const known = Buffer.from(parts[1], "hex");
  return calc.length === known.length && crypto.timingSafeEqual(calc, known);
}
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach(function (p) {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function publicUser(u) {
  return { id: u.id, email: u.email, displayName: u.display_name || null, plan: u.plan, planExpiresAt: u.plan_expires_at };
}
function quotaFor(u) {
  const paid = u.plan === "pro" && (!u.plan_expires_at || new Date(u.plan_expires_at) > new Date());
  return paid ? null : FREE_QUOTA;
}
function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", "fc_sid=" + token + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=" + (SESSION_DAYS * 86400));
}
function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "fc_sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
}
async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2, now() + ($3 || ' days')::interval)",
    [sha256(token), userId, SESSION_DAYS]
  );
  return token;
}

// ---------- middleware ----------
const hits = new Map();
function rateLimit(max, windowMs) {
  return function (req, res, next) {
    const key = (req.ip || "") + ":" + req.path;
    const now = Date.now();
    let rec = hits.get(key);
    if (!rec || now > rec.reset) { rec = { n: 0, reset: now + windowMs }; hits.set(key, rec); }
    rec.n++;
    if (rec.n > max) return res.status(429).json({ ok: false, error: "rate_limited" });
    next();
  };
}
app.use("/api", function (req, res, next) {
  if (["POST", "PUT", "PATCH", "DELETE"].indexOf(req.method) >= 0) {
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) return res.status(403).json({ ok: false, error: "bad_origin" });
      } catch (e) {
        return res.status(403).json({ ok: false, error: "bad_origin" });
      }
    }
  }
  next();
});
const requireAuth = async function (req, res, next) {
  try {
    const token = parseCookies(req).fc_sid;
    if (!token) return res.status(401).json({ ok: false, error: "auth_required" });
    const r = await pool.query(
      "SELECT u.id,u.email,u.display_name,u.plan,u.plan_expires_at " +
      "FROM sessions s JOIN users u ON u.id = s.user_id " +
      "WHERE s.token_hash = $1 AND s.expires_at > now()", [sha256(token)]);
    if (!r.rows[0]) return res.status(401).json({ ok: false, error: "auth_required" });
    req.user = r.rows[0];
    next();
  } catch (e) { next(e); }
};

// ---------- health ----------
app.get("/api/health", async function (req, res) {
  try {
    const r = await pool.query("SELECT now() AS now");
    res.json({ ok: true, db: true, time: r.rows[0].now, version: process.env.APP_VERSION || "0.36.0" });
  } catch (e) {
    res.status(503).json({ ok: false, db: false, error: "db_unavailable" });
  }
});

// ---------- auth ----------
app.post("/api/auth/register", rateLimit(5, 60000), async function (req, res, next) {
  try {
    const email = String((req.body || {}).email || "").trim().toLowerCase();
    const password = String((req.body || {}).password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ ok: false, error: "bad_email" });
    if (password.length < 8) return res.status(400).json({ ok: false, error: "weak_password" });
    const ex = await pool.query("SELECT 1 FROM users WHERE email=$1", [email]);
    if (ex.rowCount) return res.status(409).json({ ok: false, error: "email_exists" });
    const r = await pool.query(
      "INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id,email,display_name,plan,plan_expires_at",
      [email, scryptHash(password)]);
    const token = await createSession(r.rows[0].id);
    setSessionCookie(res, token);
    res.status(201).json({ ok: true, user: publicUser(r.rows[0]) });
  } catch (e) { next(e); }
});

app.post("/api/auth/login", rateLimit(5, 60000), async function (req, res, next) {
  try {
    const email = String((req.body || {}).email || "").trim().toLowerCase();
    const password = String((req.body || {}).password || "");
    const r = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    const u = r.rows[0];
    if (!u || !scryptVerify(password, u.password_hash)) return res.status(401).json({ ok: false, error: "bad_credentials" });
    const token = await createSession(u.id);
    setSessionCookie(res, token);
    res.json({ ok: true, user: publicUser(u) });
  } catch (e) { next(e); }
});

app.post("/api/auth/logout", async function (req, res, next) {
  try {
    const token = parseCookies(req).fc_sid;
    if (token) await pool.query("DELETE FROM sessions WHERE token_hash=$1", [sha256(token)]);
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get("/api/me", requireAuth, async function (req, res, next) {
  try {
    const c = await pool.query("SELECT count(*)::int AS n FROM plans WHERE user_id=$1", [req.user.id]);
    res.json({ ok: true, user: publicUser(req.user), plans: c.rows[0].n, quota: quotaFor(req.user) });
  } catch (e) { next(e); }
});

// ---------- plans ----------
app.get("/api/plans", requireAuth, async function (req, res, next) {
  try {
    const r = await pool.query(
      "SELECT id,name,payload,created_at,updated_at FROM plans WHERE user_id=$1 ORDER BY updated_at DESC",
      [req.user.id]);
    res.json({ ok: true, plans: r.rows });
  } catch (e) { next(e); }
});

app.post("/api/plans", requireAuth, async function (req, res, next) {
  try {
    const name = String((req.body || {}).name || "").trim().slice(0, 80) || "Untitled";
    const payload = (req.body || {}).payload;
    if (!payload || typeof payload !== "object" || !payload.d) return res.status(400).json({ ok: false, error: "bad_payload" });
    const c = await pool.query("SELECT count(*)::int AS n FROM plans WHERE user_id=$1", [req.user.id]);
    const q = quotaFor(req.user);
    if (q !== null && c.rows[0].n >= q) return res.status(402).json({ ok: false, error: "quota_exceeded", quota: q });
    const r = await pool.query(
      "INSERT INTO plans(user_id,name,payload) VALUES($1,$2,$3) RETURNING id,name,payload,created_at,updated_at",
      [req.user.id, name, payload]);
    res.status(201).json({ ok: true, plan: r.rows[0] });
  } catch (e) { next(e); }
});

app.put("/api/plans/:id", requireAuth, async function (req, res, next) {
  try {
    const name = String((req.body || {}).name || "").trim().slice(0, 80);
    const payload = (req.body || {}).payload;
    if (payload && (typeof payload !== "object" || !payload.d)) return res.status(400).json({ ok: false, error: "bad_payload" });
    const r = await pool.query(
      "UPDATE plans SET name=COALESCE(NULLIF($1,''),name), payload=COALESCE($2,payload), updated_at=now() " +
      "WHERE id=$3 AND user_id=$4 RETURNING id,name,payload,created_at,updated_at",
      [name, payload || null, req.params.id, req.user.id]);
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, plan: r.rows[0] });
  } catch (e) { next(e); }
});

app.delete("/api/plans/:id", requireAuth, async function (req, res, next) {
  try {
    const r = await pool.query("DELETE FROM plans WHERE id=$1 AND user_id=$2 RETURNING id", [req.params.id, req.user.id]);
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post("/api/plans/import", requireAuth, async function (req, res, next) {
  try {
    const list = Array.isArray((req.body || {}).plans) ? (req.body || {}).plans : [];
    const q = quotaFor(req.user);
    const c = await pool.query("SELECT count(*)::int AS n FROM plans WHERE user_id=$1", [req.user.id]);
    let count = c.rows[0].n, imported = 0, skipped = 0;
    for (const p of list) {
      const name = String((p && p.name) || "").trim().slice(0, 80) || "Untitled";
      const payload = p && p.payload;
      if (!payload || typeof payload !== "object" || !payload.d) { skipped++; continue; }
      if (q !== null && count >= q) { skipped++; continue; }
      await pool.query("INSERT INTO plans(user_id,name,payload) VALUES($1,$2,$3)", [req.user.id, name, payload]);
      count++; imported++;
    }
    res.json({ ok: true, imported: imported, skipped: skipped });
  } catch (e) { next(e); }
});

// ---------- fallbacks ----------
app.use("/api", function (req, res) { res.status(404).json({ ok: false, error: "not_found" }); });
app.use(function (err, req, res, next) {
  console.error(err && err.message);
  res.status(500).json({ ok: false, error: "server_error" });
});

app.listen(PORT, "127.0.0.1", function () { console.log("api listening on " + PORT); });
