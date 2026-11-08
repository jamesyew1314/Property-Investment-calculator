"use strict";
// listing-code.js — 房源编号：AgentName-0001（如 Andy-0001 / JuneTan-0001）

function prefix(name) {
  const words = String(name || "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim().split(/\s+/).filter(Boolean);
  const s = words.map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join("");
  return (s || "Agent").slice(0, 20);
}

function pad(n) { return String(n).padStart(4, "0"); }

async function exists(pool, code) {
  const q = await pool.query("SELECT 1 FROM lib_properties WHERE lower(code)=lower($1) LIMIT 1", [code]);
  return !!q.rows[0];
}

async function nextCode(pool, agent) {
  const base = prefix(agent.name);
  const q = await pool.query("SELECT code FROM lib_properties WHERE tenant_id=$1 AND code ILIKE $2", [agent.id, base + "-%"]);
  let max = 0;
  q.rows.forEach(function (r) {
    const m = /-(\d+)$/.exec(r.code);
    if (m) max = Math.max(max, Number(m[1]));
  });
  let n = max + 1;
  let code = base + "-" + pad(n);
  while (await exists(pool, code)) { n++; code = base + "-" + pad(n); }
  return code;
}

async function backfill(pool) {
  const q = await pool.query(
    `SELECT p.id, p.tenant_id, p.code, p.created_at, a.name
       FROM lib_properties p JOIN lib_agents a ON a.id=p.tenant_id
      WHERE p.code IS NULL OR p.code LIKE 'KT-%'
      ORDER BY p.tenant_id, p.created_at NULLS LAST, p.id`);
  const rows = q.rows;
  let current = null, seq = 0, changed = 0;
  for (const r of rows) {
    if (r.tenant_id !== current) { current = r.tenant_id; seq = 0; }
    seq++;
    const base = prefix(r.name);
    let n = seq, code = base + "-" + pad(n);
    while (await exists(pool, code) && code !== r.code) { n++; code = base + "-" + pad(n); }
    if (code === r.code) continue;
    try {
      await pool.query("UPDATE lib_properties SET code=$1 WHERE id=$2", [code, r.id]);
      changed++;
    } catch (e) {
      // 极端冲突：加序号继续
      let k = n + 1;
      for (; k < n + 50; k++) {
        const alt = base + "-" + pad(k);
        if (!(await exists(pool, alt))) { await pool.query("UPDATE lib_properties SET code=$1 WHERE id=$2", [alt, r.id]); changed++; break; }
      }
    }
  }
  return { changed: changed, checked: rows.length };
}

module.exports = { prefix, nextCode, backfill };
