"use strict";
// digest.js — 每日摘要：新询盘 + 客户新匹配（每人每天最多一封）
const matcher = require("./match");

function fmt(n, rent) {
  const v = Number(n);
  if (!isFinite(v) || !v) return "—";
  return "RM " + v.toLocaleString("en-MY", { maximumFractionDigits: 0 }) + (rent ? " /月" : "");
}

module.exports = async function runDigest({ pool, sendMail, days, force }) {
  const since = Math.max(1, Number(days) || 1);
  const agents = await pool.query("SELECT id,name,email FROM lib_agents WHERE status='active' AND email IS NOT NULL AND email <> ''");
  let sent = 0, skipped = 0, failed = 0;
  for (const a of agents.rows) {
    try {
      if (!force) {
        const seen = await pool.query("SELECT 1 FROM digest_log WHERE agent_id=$1 AND day=current_date", [a.id]);
        if (seen.rows[0]) { skipped++; continue; }
      }
      const clients = await pool.query(
        "SELECT * FROM lib_clients WHERE tenant_id=$1 AND status NOT IN ('won','lost') ORDER BY updated_at DESC LIMIT 40", [a.id]);
      const listings = await pool.query(`
        SELECT p.code, p.project_name, p.area_code, p.state, p.property_type, p.intent,
               p.asking_price::float8 AS asking_price, p.rent_price::float8 AS rent_price,
               p.bedrooms, p.bathrooms, p.built_up::float8 AS built_up, p.tenant_id, p.updated_at,
               pr.name AS project_title, pr.name_zh AS project_title_zh, ag.name AS owner_name
        FROM lib_properties p
        LEFT JOIN lib_projects pr ON pr.id=p.project_id
        LEFT JOIN lib_agents ag ON ag.id=p.tenant_id
        WHERE p.visibility IN ('pool','public') AND p.status IN ('available','reserved')
          AND p.tenant_id IS DISTINCT FROM $1
        ORDER BY p.updated_at DESC LIMIT 800`, [a.id]);
      const matches = matcher.matchClients(clients.rows, listings.rows, 3)
        .filter(function (x) { return x.matches.length; });
      const inq = await pool.query(`
        SELECT p.code, pr.name AS project_title, i.client_name, i.client_phone, i.created_at
        FROM pool_inquiries i
        JOIN lib_properties p ON p.id=i.property_id
        LEFT JOIN lib_projects pr ON pr.id=p.project_id
        WHERE i.to_agent_id=$1 AND i.status='new' AND i.created_at > now() - ($2 || ' days')::interval
        ORDER BY i.created_at DESC LIMIT 10`, [a.id, since]);
      if (!matches.length && !inq.rows.length) { skipped++; continue; }

      const lines = ["你好 " + a.name + "，", ""];
      lines.push("今天有 " + inq.rows.length + " 条新询盘，" + matches.length + " 位客户有新的匹配房源。", "");
      if (inq.rows.length) {
        lines.push("【新询盘】");
        inq.rows.forEach(function (i) {
          lines.push("· " + i.code + " " + (i.project_title || "") + " — " + (i.client_name || "客户") + " " + (i.client_phone || ""));
        });
        lines.push("");
      }
      if (matches.length) {
        lines.push("【客户匹配】");
        matches.forEach(function (row) {
          const c = row.client;
          lines.push("· " + (c.name || "客户") + "（" + (c.intent === "rent" ? "租" : "买") + " " +
            (c.budget_min ? fmt(c.budget_min) : "—") + " – " + (c.budget_max ? fmt(c.budget_max) : "—") + "）");
          row.matches.forEach(function (m) {
            lines.push("    - " + m.code + " " + (m.project_title_zh || m.project_title || m.project_name || "") +
              " · " + fmt(m.intent === "rent" ? m.rent_price : m.asking_price, m.intent === "rent"));
          });
        });
        lines.push("");
      }
      lines.push("打开工作台：https://kwongthye.com/agent/#/matches", "", "— PropNet · KWONG THYE");
      const r = await sendMail(a.email, "PropNet 每日摘要 · 新询盘与匹配", lines.join("\n"));
      await pool.query("INSERT INTO digest_log(agent_id) VALUES($1) ON CONFLICT DO NOTHING", [a.id]);
      sent++;
      void r;
    } catch (e) {
      failed++;
      console.error("digest failed for", a.email, e.message);
    }
  }
  return { agents: agents.rowCount, sent, skipped, failed };
};
