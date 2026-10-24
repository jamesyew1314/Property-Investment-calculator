"use strict";
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const envFile = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
envFile.split("\n").forEach(function (l) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
});
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function newCode() {
  return Array.from({ length: 3 }, function () {
    return Math.random().toString(36).slice(2, 6).toUpperCase();
  }).join("-");
}

(async function () {
  const cmd = process.argv[2];
  const args = process.argv.slice(3);
  if (cmd === "create-code") {
    const days = parseInt(args[0] || "365", 10);
    const count = parseInt(args[1] || "1", 10);
    const note = args[2] || null;
    for (let i = 0; i < count; i++) {
      const c = newCode();
      await pool.query("INSERT INTO redeem_codes(code,days,note) VALUES($1,$2,$3)", [c, days, note]);
      console.log(c);
    }
  } else if (cmd === "list-codes") {
    const r = await pool.query("SELECT code, days, note, (used_by IS NOT NULL) AS used, created_at FROM redeem_codes ORDER BY created_at DESC LIMIT 50");
    console.table(r.rows);
  } else if (cmd === "set-plan") {
    const email = args[0];
    const days = parseInt(args[1] || "365", 10);
    const r = await pool.query(
      "UPDATE users SET plan='pro', plan_expires_at = GREATEST(COALESCE(plan_expires_at, now()), now()) + ($1 || ' days')::interval, updated_at=now() WHERE email=$2 RETURNING email, plan, plan_expires_at",
      [days, email]);
    console.log(r.rows[0] || "user not found");
  } else if (cmd === "pageviews") {
    const days = parseInt(args[0] || "7", 10);
    const d = await pool.query("SELECT created_at::date AS day, count(*)::int AS views FROM pageviews WHERE created_at > now() - ($1 || ' days')::interval GROUP BY 1 ORDER BY 1 DESC", [days]);
    const t = await pool.query("SELECT path, count(*)::int AS views FROM pageviews WHERE created_at > now() - ($1 || ' days')::interval GROUP BY 1 ORDER BY 2 DESC LIMIT 10", [days]);
    console.table(d.rows);
    console.table(t.rows);
  } else if (cmd === "stats") {
    const u = await pool.query("SELECT count(*)::int AS users, count(*) FILTER (WHERE plan='pro')::int AS pro FROM users");
    const p = await pool.query("SELECT count(*)::int AS plans FROM plans");
    console.log({ users: u.rows[0].users, pro: u.rows[0].pro, plans: p.rows[0].plans });
  } else {
    console.log("usage: node admin.js create-code <days> [count] [note] | list-codes | set-plan <email> <days> | stats");
  }
  await pool.end();
})().catch(function (e) { console.error(e.message); process.exit(1); });
