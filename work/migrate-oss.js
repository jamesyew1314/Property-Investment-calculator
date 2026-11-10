"use strict";
/* 把本机 /uploads/props 图片迁到 OSS，并更新 DB URL。
   默认 dry-run；执行：node migrate-oss.js --apply
   先备份数据库，迁移保留本地文件 7 天。 */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const oss = require("./oss");

const APPLY = process.argv.includes("--apply");
const DIR = process.env.UPLOAD_DIR || "/srv/fangchan/uploads/props";
const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.PG_URL });
const localRe = /^\/uploads\/props\/([A-Za-z0-9._-]+)$/;

function variants(file) {
  const out = [[file, /\.webp$/i.test(file) ? "image/webp" : "image/jpeg"]];
  if (/\.jpg$/i.test(file)) {
    const b = file.replace(/\.jpg$/i, "");
    out.push([b + "_t.jpg", "image/jpeg"], [b + ".webp", "image/webp"], [b + "_t.webp", "image/webp"]);
  }
  return out;
}
async function uploadLocal(url) {
  const m = localRe.exec(url);
  if (!m) return url;
  const file = m[1];
  let mainUrl = url;
  for (const v of variants(file)) {
    const fp = path.join(DIR, v[0]);
    if (!fs.existsSync(fp)) continue;
    if (!APPLY) { console.log("would upload", fp); continue; }
    const u = await oss.putImage("props/" + v[0], fs.readFileSync(fp), v[1]);
    if (v[0] === file) mainUrl = u;
  }
  return mainUrl;
}
(async () => {
  if (!oss.enabled()) { console.error("OSS env missing"); process.exit(1); }
  if (!APPLY) console.log("DRY RUN — add --apply to write");
  const agents = await pool.query("SELECT id, photo_url FROM lib_agents WHERE photo_url LIKE '/uploads/%'");
  for (const a of agents.rows) {
    const u = await uploadLocal(a.photo_url);
    if (APPLY && u !== a.photo_url) await pool.query("UPDATE lib_agents SET photo_url=$1 WHERE id=$2", [u, a.id]);
    console.log("agent", a.id, APPLY ? "updated" : "dry");
  }
  const props = await pool.query("SELECT id, photos, cover_url FROM lib_properties WHERE cover_url LIKE '/uploads/%' OR array_to_string(photos, ',') LIKE '%/uploads/%'");
  for (const p of props.rows) {
    let changed = false;
    const photos = [];
    for (const u of (p.photos || [])) {
      const n = await uploadLocal(u);
      if (n !== u) changed = true;
      photos.push(n);
    }
    let cover = p.cover_url;
    if (cover) { const n = await uploadLocal(cover); if (n !== cover) { cover = n; changed = true; } }
    if (APPLY && changed) await pool.query("UPDATE lib_properties SET photos=$1, cover_url=$2, updated_at=now() WHERE id=$3", [photos, cover, p.id]);
    console.log("property", p.id, changed ? (APPLY ? "updated" : "would update") : "skip");
  }
  await pool.end();
  console.log("done", APPLY ? "applied" : "dry-run");
})().catch(function (e) { console.error(e); process.exit(1); });
