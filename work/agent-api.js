"use strict";
// agent-api.js — PropNet 中介工作台 API（/api/agent）
// 账号：邮箱 + 密码（scrypt），会话 cookie pn_sid；房源/客户按 tenant_id 隔离。
// 公开范围：visibility='pool'（仅中介可见）或 'public'（官网可见）。

const express = require("express");
const crypto = require("node:crypto");
const core = require("./library-core");
const agentCore = require("./agent-core");
const matcher = require("./match");
const billplz = require("./billplz");
let sharp = null; try { sharp = require("sharp"); } catch (e) { sharp = null; }
const fs = require("node:fs");
const pathMod = require("node:path");
const tax = require("./library-taxonomy");

const COOKIE = "pn_sid";
const SESSION_DAYS = 30;

const sha256 = agentCore.sha256;
const hashPw = agentCore.hashPw;
const verifyPw = agentCore.verifyPw;
const slugify = agentCore.slugify;

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach(function (p) {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

module.exports = function createAgentApi({ pool, sendMail, rateLimit, siteUrl }) {
  const r = express.Router();
  const limit = rateLimit || function (req, res, next) { next(); };
  const base = siteUrl || "https://kwongthye.com";
  const UPLOADS = process.env.UPLOAD_DIR || "/srv/fangchan/uploads/props";

  function sniffImage(buf) {
    if (!buf || buf.length < 12) return null;
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return "jpg";
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return "png";
    if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") return "webp";
    return null;
  }

  function publicAgent(a) {
    return {
      id: a.id, name: a.name, email: a.email, phone: a.phone, team: a.team, ren_no: a.ren_no,
      slug: a.slug, bio: a.bio, photo_url: a.photo_url, areas: a.areas,
      verified: !!a.verified_at, emailVerified: !!a.email_verified_at, lang: a.lang || "zh",
      review_status: a.review_status || "pending", review_note: a.review_note || null,
      status: a.status, plan: a.plan, created_at: a.created_at
    };
  }

  function setCookie(res, token) {
    res.setHeader("Set-Cookie", COOKIE + "=" + token + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=" + (SESSION_DAYS * 86400));
  }
  function clearCookie(res) {
    res.setHeader("Set-Cookie", COOKIE + "=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
  }

  async function createSession(agentId) {
    const token = crypto.randomBytes(32).toString("hex");
    await pool.query("INSERT INTO agent_sessions(token_hash,agent_id,expires_at) VALUES($1,$2, now() + ($3 || ' days')::interval)",
      [sha256(token), agentId, SESSION_DAYS]);
    return token;
  }

  async function currentAgent(req) {
    const token = parseCookies(req)[COOKIE];
    if (!token) return null;
    const out = await pool.query(
      "SELECT a.* FROM agent_sessions s JOIN lib_agents a ON a.id = s.agent_id " +
      "WHERE s.token_hash=$1 AND s.expires_at > now() AND a.status='active'", [sha256(token)]);
    return out.rows[0] || null;
  }

  async function requireAgent(req, res, next) {
    try {
      const a = await currentAgent(req);
      if (!a) return res.status(401).json({ ok: false, error: "auth_required" });
      req.agent = a;
      next();
    } catch (e) { next(e); }
  }

  async function audit(actor, action, entity, entityId, detail) {
    try {
      await pool.query("INSERT INTO lib_audit(actor,action,entity,entity_id,detail) VALUES($1,$2,$3,$4,$5)",
        [actor, action, entity, entityId || null, detail ? JSON.stringify(detail) : null]);
    } catch (e) { /* ignore */ }
  }

  async function issueToken(agentId, kind) {
    const token = crypto.randomBytes(24).toString("hex");
    await pool.query("INSERT INTO agent_tokens(agent_id,kind,token_hash,expires_at) VALUES($1,$2,$3, now() + interval '48 hours')",
      [agentId, kind || "verify", sha256(token)]);
    return token;
  }

  async function sendVerify(agent) {
    try {
      const token = await issueToken(agent.id, "verify");
      const link = base + "/agent/?verify=" + token;
      const lang = agent.lang === "en" ? "en" : (agent.lang === "bm" ? "bm" : "zh");
      const V = {
        zh: { sub: "验证你的 PropNet 邮箱", lines: ["你好 " + agent.name + "，", "", "请点击下面链接验证邮箱（48 小时内有效）：", link, "", "验证后你的房源会显示「已验证」标记。", "", "PropNet · KWONG THYE"] },
        en: { sub: "Verify your PropNet email", lines: ["Hi " + agent.name + ",", "", "Please verify your email within 48 hours:", link, "", "Verified listings show a verified badge.", "", "PropNet · KWONG THYE"] },
        bm: { sub: "Sahkan e-mel PropNet anda", lines: ["Hai " + agent.name + ",", "", "Sila sahkan e-mel anda dalam 48 jam:", link, "", "Senarai yang disahkan memaparkan lencana.", "", "PropNet · KWONG THYE"] }
      };
      await sendMail(agent.email, V[lang].sub, V[lang].lines.join("\n"));
    } catch (e) { console.error("verify mail failed", e.message); }
  }

  // ---------- 注册 / 登录 ----------
  r.post("/register", limit(8, 600000), async function (req, res, next) {
    try {
      const b = req.body || {};
      const name = core.str(b.name, 60);
      const email = core.str(b.email, 120);
      const phone = core.str(b.phone, 40);
      const team = core.str(b.team, 80);
      const ren = core.str(b.ren_no, 40);
      const pw = String(b.password || "");
      const fields = {};
      if (!name || name.length < 2) fields.name = "required";
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fields.email = "invalid_email";
      if (pw.length < 8) fields.password = "weak_password";
      if (Object.keys(fields).length) return res.status(400).json({ ok: false, error: "invalid_input", fields });

      const dup = await pool.query("SELECT id FROM lib_agents WHERE lower(email)=lower($1)", [email]);
      if (dup.rows[0]) return res.status(409).json({ ok: false, error: "email_exists" });

      let slug = slugify(name) || "agent";
      for (let i = 0; i < 5; i++) {
        const s = await pool.query("SELECT id FROM lib_agents WHERE lower(slug)=lower($1)", [slug]);
        if (!s.rows[0]) break;
        slug = slugify(name) + "-" + Math.floor(100 + Math.random() * 900);
      }
      const out = await pool.query(
        "INSERT INTO lib_agents(name,email,phone,team,ren_no,password_hash,slug,status,public,active,created_at) " +
        "VALUES($1,$2,$3,$4,$5,$6,$7,'active',true,true,now()) RETURNING *",
        [name, email, phone, team, ren, hashPw(pw), slug]);
      const agent = out.rows[0];
      const token = await createSession(agent.id);
      setCookie(res, token);
      sendVerify(agent);
      await audit(email, "agent.register", "agent", agent.id, { name: name });
      res.status(201).json({ ok: true, agent: publicAgent(agent) });
    } catch (e) { next(e); }
  });

  r.post("/login", limit(10, 600000), async function (req, res, next) {
    try {
      const email = core.str((req.body || {}).email, 120);
      const pw = String((req.body || {}).password || "");
      const out = await pool.query("SELECT * FROM lib_agents WHERE lower(email)=lower($1) AND status='active'", [email || ""]);
      const agent = out.rows[0];
      if (!agent || !agent.password_hash || !verifyPw(pw, agent.password_hash)) {
        return res.status(401).json({ ok: false, error: "bad_credentials" });
      }
      await pool.query("UPDATE lib_agents SET last_login_at=now() WHERE id=$1", [agent.id]);
      const token = await createSession(agent.id);
      setCookie(res, token);
      res.json({ ok: true, agent: publicAgent(agent) });
    } catch (e) { next(e); }
  });

  r.post("/logout", async function (req, res) {
    const token = parseCookies(req)[COOKIE];
    if (token) await pool.query("DELETE FROM agent_sessions WHERE token_hash=$1", [sha256(token)]);
    clearCookie(res);
    res.json({ ok: true });
  });

  r.get("/me", requireAgent, async function (req, res, next) {
    try {
      const stats = await pool.query(`
        SELECT
          (SELECT count(*) FROM lib_properties WHERE tenant_id=$1)::int AS listings,
          (SELECT count(*) FROM lib_properties WHERE tenant_id=$1 AND visibility='public')::int AS published,
          (SELECT count(*) FROM lib_clients WHERE tenant_id=$1)::int AS clients,
          (SELECT count(*) FROM pool_inquiries WHERE to_agent_id=$1 AND status='new')::int AS new_inquiries`,
        [req.agent.id]);
      res.json({ ok: true, agent: publicAgent(req.agent), stats: stats.rows[0], platformFree: true });
    } catch (e) { next(e); }
  });

  r.patch("/me", requireAgent, async function (req, res, next) {
    try {
      const b = req.body || {};
      const v = {};
      for (const k of ["name", "phone", "team", "ren_no"]) if (b[k] !== undefined) v[k] = core.str(b[k], 120);
      if (b.lang !== undefined && ["zh", "en", "bm"].indexOf(b.lang) >= 0) v.lang = b.lang;
      if (b.bio !== undefined) v.bio = core.str(b.bio, 1000);
      if (b.areas !== undefined) v.areas = core.listOfEnums("areas", b.areas, 12);
      if (b.slug !== undefined) {
        const s = String(b.slug).toLowerCase().trim();
        if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(s)) return res.status(400).json({ ok: false, error: "invalid_input", fields: { slug: "invalid" } });
        const dup = await pool.query("SELECT id FROM lib_agents WHERE lower(slug)=$1 AND id<>$2", [s, req.agent.id]);
        if (dup.rows[0]) return res.status(409).json({ ok: false, error: "slug_taken" });
        v.slug = s;
      }
      if (!Object.keys(v).length) return res.json({ ok: true, agent: publicAgent(req.agent) });
      const sets = Object.keys(v).map((k, i) => k + "=$" + (i + 1));
      const out = await pool.query("UPDATE lib_agents SET " + sets.join(",") + ", updated_at=now() WHERE id=$" + (Object.keys(v).length + 1) + " RETURNING *",
        Object.values(v).concat([req.agent.id]));
      res.json({ ok: true, agent: publicAgent(out.rows[0]) });
    } catch (e) { next(e); }
  });

  r.post("/verify-email", limit(20, 600000), async function (req, res, next) {
    try {
      const token = core.str((req.body || {}).token, 100);
      if (!token) return res.status(400).json({ ok: false, error: "invalid_input" });
      const out = await pool.query(
        "UPDATE agent_tokens SET used_at=now() WHERE token_hash=$1 AND kind='verify' AND used_at IS NULL AND expires_at>now() RETURNING agent_id",
        [sha256(token)]);
      if (!out.rows[0]) return res.status(400).json({ ok: false, error: "bad_token" });
      await pool.query("UPDATE lib_agents SET email_verified_at=now() WHERE id=$1", [out.rows[0].agent_id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.post("/resend-verify", requireAgent, limit(3, 600000), async function (req, res) {
    if (req.agent.email_verified_at) return res.json({ ok: true, already: true });
    await sendVerify(req.agent);
    res.json({ ok: true });
  });

  // ---------- 我的房源 ----------
  const OWN_SELECT = `
    SELECT p.*, p.asking_price::float8 AS asking_price, p.rent_price::float8 AS rent_price,
           p.built_up::float8 AS built_up, p.land_area::float8 AS land_area,
           p.listed_on::text AS listed_on, pr.name AS project_title, pr.name_zh AS project_title_zh,
           (SELECT count(*) FROM pool_inquiries i WHERE i.property_id=p.id)::int AS inquiries
    FROM lib_properties p LEFT JOIN lib_projects pr ON pr.id=p.project_id`;

  r.get("/listings", requireAgent, async function (req, res, next) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const size = Math.min(50, Number(req.query.pageSize) || 20);
      const where = ["p.tenant_id=$1"], args = [req.agent.id];
      if (req.query.q) {
        args.push("%" + String(req.query.q).replace(/[%_]/g, "\\$&") + "%");
        where.push("(p.code ILIKE $" + args.length + " OR p.project_name ILIKE $" + args.length + " OR pr.name ILIKE $" + args.length + ")");
      }
      if (req.query.status) { args.push(req.query.status); where.push("p.status=$" + args.length); }
      const w = " WHERE " + where.join(" AND ");
      const total = await pool.query("SELECT count(*)::int AS n FROM lib_properties p LEFT JOIN lib_projects pr ON pr.id=p.project_id" + w, args);
      const rows = await pool.query(OWN_SELECT + w + " ORDER BY p.updated_at DESC LIMIT $" + (args.length + 1) + " OFFSET $" + (args.length + 2),
        args.concat([size, (page - 1) * size]));
      res.json({ ok: true, rows: rows.rows, total: total.rows[0].n, page, pageSize: size });
    } catch (e) { next(e); }
  });

  r.post("/listings", requireAgent, async function (req, res, next) {
    try {
      const n = core.normalizeProperty(req.body || {}, { partial: false });
      if (Object.keys(n.errors).length) return res.status(400).json({ ok: false, error: "invalid_input", fields: n.errors });
      const v = n.values;
      v.tenant_id = req.agent.id;
      v.agent = req.agent.name;
      v.created_by = req.agent.email;
      v.intent = v.intent || "sale";
      v.status = v.status || "available";
      v.visibility = "pool";
      const cols = Object.keys(v);
      const out = await pool.query("INSERT INTO lib_properties(" + cols.join(",") + ") VALUES(" +
        cols.map((_, i) => "$" + (i + 1)).join(",") + ") RETURNING *", cols.map((c) => v[c]));
      await audit(req.agent.email, "agent.create", "property", out.rows[0].id, { code: out.rows[0].code });
      res.status(201).json({ ok: true, row: out.rows[0] });
    } catch (e) { next(e); }
  });

  async function ownListing(id, agentId) {
    const out = await pool.query("SELECT * FROM lib_properties WHERE id=$1 AND tenant_id=$2", [id, agentId]);
    return out.rows[0] || null;
  }

  r.get("/listings/:id", requireAgent, async function (req, res, next) {
    try {
      const row = await ownListing(req.params.id, req.agent.id);
      if (!row) return res.status(404).json({ ok: false, error: "not_found" });
      res.json({ ok: true, row });
    } catch (e) { next(e); }
  });

  r.patch("/listings/:id", requireAgent, async function (req, res, next) {
    try {
      const before = await ownListing(req.params.id, req.agent.id);
      if (!before) return res.status(404).json({ ok: false, error: "not_found" });
      const n = core.normalizeProperty(req.body || {}, { partial: true });
      if (Object.keys(n.errors).length) return res.status(400).json({ ok: false, error: "invalid_input", fields: n.errors });
      const v = n.values;
      delete v.tenant_id; delete v.visibility;
      if (!Object.keys(v).length) return res.json({ ok: true, row: before });
      const sets = Object.keys(v).map((k, i) => k + "=$" + (i + 1));
      const out = await pool.query("UPDATE lib_properties SET " + sets.join(",") + ", updated_at=now() WHERE id=$" +
        (Object.keys(v).length + 1) + " AND tenant_id=$" + (Object.keys(v).length + 2) + " RETURNING *",
        Object.values(v).concat([req.params.id, req.agent.id]));
      const old = before;
      for (const f of ["asking_price", "rent_price"]) {
        if (v[f] !== undefined && Number(v[f] || 0) !== Number(old[f] || 0)) {
          await pool.query("INSERT INTO lib_price_events(property_id,field,old_price,new_price,actor) VALUES($1,$2,$3,$4,$5)",
            [req.params.id, f, old[f], v[f], req.agent.email]);
        }
      }
      res.json({ ok: true, row: out.rows[0] });
    } catch (e) { next(e); }
  });

  r.delete("/listings/:id", requireAgent, async function (req, res, next) {
    try {
      const out = await pool.query("DELETE FROM lib_properties WHERE id=$1 AND tenant_id=$2 RETURNING code, photos", [req.params.id, req.agent.id]);
      if (!out.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
      (out.rows[0].photos || []).forEach(function (u) {
        if (!/^\/uploads\/props\/[A-Za-z0-9._-]+$/.test(u)) return;
        const f = pathMod.join(UPLOADS, pathMod.basename(u));
        [f, f.replace(/\.jpg$/i, "_t.jpg")].forEach(function (x) {
          try { if (x.indexOf(UPLOADS) === 0 && fs.existsSync(x)) fs.unlinkSync(x); } catch (e) { /* ignore */ }
        });
      });
      await audit(req.agent.email, "agent.delete", "property", Number(req.params.id), { code: out.rows[0].code });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.post("/listings/:id/publish", requireAgent, async function (req, res, next) {
    try {
      const pub = !!(req.body || {}).public;
      const before = await ownListing(req.params.id, req.agent.id);
      if (!before) return res.status(404).json({ ok: false, error: "not_found" });
      if (pub && (!before.asking_price && !before.rent_price)) {
        return res.status(400).json({ ok: false, error: "need_price" });
      }
      const out = await pool.query(
        "UPDATE lib_properties SET visibility=$1, published_at=$2, updated_at=now() WHERE id=$3 AND tenant_id=$4 RETURNING *",
        [pub ? "public" : "pool", pub ? new Date() : null, req.params.id, req.agent.id]);
      await audit(req.agent.email, pub ? "agent.publish" : "agent.unpublish", "property", Number(req.params.id), {});
      res.json({ ok: true, row: out.rows[0] });
    } catch (e) { next(e); }
  });



  r.post("/listings/:id/shared", requireAgent, async function (req, res, next) {
    try {
      const out = await pool.query(
        "UPDATE lib_properties SET share_count=share_count+1, last_shared_at=now() WHERE id=$1 AND tenant_id=$2 RETURNING share_count",
        [req.params.id, req.agent.id]);
      if (!out.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
      res.json({ ok: true, share_count: out.rows[0].share_count });
    } catch (e) { next(e); }
  });
  // ---------- 房源图片 ----------
  r.post("/listings/:id/photos", requireAgent, express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "8mb" }), async function (req, res, next) {
    try {
      const row = await ownListing(req.params.id, req.agent.id);
      if (!row) return res.status(404).json({ ok: false, error: "not_found" });
      const buf = req.body;
      const ext = sniffImage(buf);
      if (!ext) return res.status(415).json({ ok: false, error: "unsupported_image" });
      const photos = row.photos || [];
      if (photos.length >= 12) return res.status(400).json({ ok: false, error: "too_many_photos" });
      fs.mkdirSync(UPLOADS, { recursive: true });
      const baseName = row.id + "-" + Date.now().toString(36) + "-" + crypto.randomBytes(3).toString("hex");
      let name, url;
      if (sharp) {
        const main = await sharp(buf).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
        const thumb = await sharp(buf).rotate().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 76 }).toBuffer();
        name = baseName + ".jpg";
        fs.writeFileSync(pathMod.join(UPLOADS, name), main);
        fs.writeFileSync(pathMod.join(UPLOADS, baseName + "_t.jpg"), thumb);
        try {
          const webp = await sharp(buf).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
          const webpT = await sharp(buf).rotate().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).webp({ quality: 74 }).toBuffer();
          fs.writeFileSync(pathMod.join(UPLOADS, baseName + ".webp"), webp);
          fs.writeFileSync(pathMod.join(UPLOADS, baseName + "_t.webp"), webpT);
        } catch (e) { /* webp optional */ }
      } else {
        name = baseName + "." + ext;
        fs.writeFileSync(pathMod.join(UPLOADS, name), buf);
      }
      url = "/uploads/props/" + name;
      const next = photos.concat([url]);
      await pool.query("UPDATE lib_properties SET photos=$1, cover_url=COALESCE(cover_url,$2), updated_at=now() WHERE id=$3 AND tenant_id=$4",
        [next, url, row.id, req.agent.id]);
      res.status(201).json({ ok: true, url: url, photos: next });
    } catch (e) { next(e); }
  });

  r.delete("/listings/:id/photos", requireAgent, async function (req, res, next) {
    try {
      const row = await ownListing(req.params.id, req.agent.id);
      if (!row) return res.status(404).json({ ok: false, error: "not_found" });
      const url = core.str((req.body || {}).url, 200);
      const next = (row.photos || []).filter(function (x) { return x !== url; });
      await pool.query("UPDATE lib_properties SET photos=$1, cover_url=$2, updated_at=now() WHERE id=$3 AND tenant_id=$4",
        [next, next[0] || null, row.id, req.agent.id]);
      if (/^\/uploads\/props\/[A-Za-z0-9._-]+$/.test(url)) {
        const f = pathMod.join(UPLOADS, pathMod.basename(url));
        if (f.indexOf(UPLOADS) === 0 && fs.existsSync(f)) fs.unlinkSync(f);
        const t = f.replace(/\.jpg$/i, "_t.jpg");
        if (t !== f && t.indexOf(UPLOADS) === 0 && fs.existsSync(t)) fs.unlinkSync(t);
        const w = f.replace(/\.jpg$/i, ".webp"), wt = f.replace(/\.jpg$/i, "_t.webp");
        [w, wt].forEach(function (x) { try { if (x.indexOf(UPLOADS) === 0 && fs.existsSync(x)) fs.unlinkSync(x); } catch (e) {} });
      }
      res.json({ ok: true, photos: next });
    } catch (e) { next(e); }
  });

  // ---------- 我的客户（WTB） ----------
  r.get("/clients", requireAgent, async function (req, res, next) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const size = Math.min(50, Number(req.query.pageSize) || 20);
      const where = ["tenant_id=$1"], args = [req.agent.id];
      if (req.query.q) {
        args.push("%" + String(req.query.q).replace(/[%_]/g, "\\$&") + "%");
        where.push("(name ILIKE $" + args.length + " OR phone ILIKE $" + args.length + ")");
      }
      const w = " WHERE " + where.join(" AND ");
      const total = await pool.query("SELECT count(*)::int AS n FROM lib_clients" + w, args);
      const rows = await pool.query("SELECT *, budget_min::float8 AS budget_min, budget_max::float8 AS budget_max FROM lib_clients" +
        w + " ORDER BY updated_at DESC LIMIT $" + (args.length + 1) + " OFFSET $" + (args.length + 2),
        args.concat([size, (page - 1) * size]));
      res.json({ ok: true, rows: rows.rows, total: total.rows[0].n, page, pageSize: size });
    } catch (e) { next(e); }
  });

  r.post("/clients", requireAgent, async function (req, res, next) {
    try {
      const n = core.normalizeClient(req.body || {}, { partial: false });
      if (Object.keys(n.errors).length) return res.status(400).json({ ok: false, error: "invalid_input", fields: n.errors });
      n.values.tenant_id = req.agent.id;
      n.values.status = n.values.status || "new";
      const cols = Object.keys(n.values);
      const out = await pool.query("INSERT INTO lib_clients(" + cols.join(",") + ") VALUES(" +
        cols.map((_, i) => "$" + (i + 1)).join(",") + ") RETURNING *", cols.map((c) => n.values[c]));
      res.status(201).json({ ok: true, row: out.rows[0] });
    } catch (e) { next(e); }
  });

  r.patch("/clients/:id", requireAgent, async function (req, res, next) {
    try {
      const n = core.normalizeClient(req.body || {}, { partial: true });
      if (Object.keys(n.errors).length) return res.status(400).json({ ok: false, error: "invalid_input", fields: n.errors });
      const v = n.values; delete v.tenant_id;
      if (!Object.keys(v).length) return res.json({ ok: true });
      const sets = Object.keys(v).map((k, i) => k + "=$" + (i + 1));
      const out = await pool.query("UPDATE lib_clients SET " + sets.join(",") + ", updated_at=now() WHERE id=$" +
        (Object.keys(v).length + 1) + " AND tenant_id=$" + (Object.keys(v).length + 2) + " RETURNING *",
        Object.values(v).concat([req.params.id, req.agent.id]));
      if (!out.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
      res.json({ ok: true, row: out.rows[0] });
    } catch (e) { next(e); }
  });

  r.delete("/clients/:id", requireAgent, async function (req, res, next) {
    try {
      const out = await pool.query("DELETE FROM lib_clients WHERE id=$1 AND tenant_id=$2 RETURNING id", [req.params.id, req.agent.id]);
      if (!out.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ---------- 中心池 ----------
  r.get("/pool", requireAgent, async function (req, res, next) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const size = Math.min(48, Number(req.query.pageSize) || 20);
      const where = ["p.visibility IN ('pool','public')", "p.status IN ('available','reserved')"];
      const args = [];
      function add(clause, val) { args.push(val); where.push(clause.replace("?", "$" + args.length)); }
      if (req.query.q) {
        const like = "%" + String(req.query.q).replace(/[%_]/g, "\\$&") + "%";
        args.push(like, like, like);
        where.push("(p.code ILIKE $" + (args.length - 2) + " OR p.project_name ILIKE $" + (args.length - 1) + " OR pr.name ILIKE $" + args.length + ")");
      }
      if (req.query.state) add("p.state=?", req.query.state);
      if (req.query.area) add("p.area_code=?", req.query.area);
      if (req.query.type) add("p.property_type=?", req.query.type);
      if (req.query.intent) add("p.intent=?", req.query.intent);
      if (req.query.agent) add("lower(p.agent)=lower(?)", req.query.agent);
      const w = " WHERE " + where.join(" AND ");
      const total = await pool.query("SELECT count(*)::int AS n FROM lib_properties p LEFT JOIN lib_projects pr ON pr.id=p.project_id" + w, args);
      const rows = await pool.query(`
        SELECT p.id, p.code, p.project_name, p.area_code, p.state, p.property_type, p.intent,
               p.asking_price::float8 AS asking_price, p.rent_price::float8 AS rent_price,
               p.bedrooms, p.bathrooms, p.built_up::float8 AS built_up, p.status, p.visibility,
               p.tenant_id, p.agent, p.updated_at,
               pr.name AS project_title, pr.name_zh AS project_title_zh,
               a.name AS owner_name, a.phone AS owner_phone, a.ren_no AS owner_ren, a.verified_at AS owner_verified
        FROM lib_properties p
        LEFT JOIN lib_projects pr ON pr.id=p.project_id
        LEFT JOIN lib_agents a ON a.id=p.tenant_id` + w +
        " ORDER BY p.published_at DESC NULLS LAST, p.updated_at DESC LIMIT $" + (args.length + 1) + " OFFSET $" + (args.length + 2),
        args.concat([size, (page - 1) * size]));
      res.json({ ok: true, rows: rows.rows, total: total.rows[0].n, page, pageSize: size });
    } catch (e) { next(e); }
  });




  // ---------- 支付（Billplz；未配置时走线下转账 + 兑换码） ----------
  r.post("/checkout", requireAgent, limit(10, 600000), async function (req, res, next) {
    try {
      const plan = (req.body || {}).plan === "team" ? "team" : "pro";
      const months = Math.min(24, Math.max(1, Number((req.body || {}).months) || 1));
      const amount = billplz.amountFor(plan, months);
      const ins = await pool.query(
        "INSERT INTO agent_payments(agent_id,plan,months,amount) VALUES($1,$2,$3,$4) RETURNING id",
        [req.agent.id, plan, months, amount]);
      const id = ins.rows[0].id;
      const key = process.env.BILLPLZ_API_KEY, coll = process.env.BILLPLZ_COLLECTION_ID;
      if (!key || !coll) return res.json({ ok: true, manual: true, payment_id: id, plan, months, amount });
      try {
        const bill = await billplz.createBill({
          secretKey: key, collectionId: coll, sandbox: process.env.BILLPLZ_SANDBOX === "1",
          bill: {
            collection_id: coll, email: req.agent.email, name: req.agent.name, amount: Math.round(amount * 100),
            description: "PropNet " + plan + " " + months + " month(s)",
            callback_url: base + "/api/billing/billplz/callback",
            redirect_url: base + "/agent/?paid=1#/plan", reference_1: String(id)
          }
        });
        await pool.query("UPDATE agent_payments SET provider_ref=$1, bill_url=$2 WHERE id=$3", [bill.id, bill.url, id]);
        res.json({ ok: true, url: bill.url, payment_id: id });
      } catch (e) {
        res.status(502).json({ ok: false, error: "payment_unavailable", payment_id: id });
      }
    } catch (e) { next(e); }
  });
  // ---------- 套餐 / 兑换码（M3 收费基础） ----------
  r.get("/plan", requireAgent, async function (req, res, next) {
    try {
      const sub = await pool.query(
        "SELECT plan, started_at, expires_at, source FROM agent_subscriptions WHERE agent_id=$1 AND (expires_at IS NULL OR expires_at > now()) ORDER BY expires_at DESC NULLS FIRST LIMIT 1",
        [req.agent.id]);
      const cur = sub.rows[0] || { plan: "free", expires_at: null, source: "free" };
      res.json({ ok: true, plan: cur.plan, expires_at: cur.expires_at, source: cur.source,
        freeMode: true, prices: { pro: 89, team: 299, early: 59 } });
    } catch (e) { next(e); }
  });

  r.post("/redeem", requireAgent, limit(10, 600000), async function (req, res, next) {
    try {
      const code = core.str((req.body || {}).code, 40).toUpperCase();
      if (!code) return res.status(400).json({ ok: false, error: "invalid_input" });
      const out = await pool.query(
        "UPDATE agent_codes SET used_by=$1, used_at=now() WHERE upper(code)=$2 AND used_at IS NULL RETURNING plan, months, note",
        [req.agent.id, code]);
      const c = out.rows[0];
      if (!c) return res.status(400).json({ ok: false, error: "bad_code" });
      const base = await pool.query(
        "SELECT max(expires_at) AS e FROM agent_subscriptions WHERE agent_id=$1 AND expires_at > now()", [req.agent.id]);
      const from = (base.rows[0] && base.rows[0].e) ? new Date(base.rows[0].e) : new Date();
      const months = Math.max(1, Number(c.months) || 1);
      const until = new Date(from); until.setMonth(until.getMonth() + months);
      await pool.query(
        "INSERT INTO agent_subscriptions(agent_id,plan,status,started_at,expires_at,source,note) VALUES($1,$2,'active',now(),$3,'code',$4)",
        [req.agent.id, c.plan, until, code]);
      await pool.query("UPDATE lib_agents SET plan=$1, plan_expires_at=$2 WHERE id=$3", [c.plan, until, req.agent.id]);
      await audit(req.agent.email, "agent.redeem", "agent", req.agent.id, { plan: c.plan, months: months });
      res.json({ ok: true, plan: c.plan, expires_at: until });
    } catch (e) { next(e); }
  });
  // ---------- WTB 自动匹配 ----------
  r.get("/matches", requireAgent, async function (req, res, next) {
    try {
      const clients = await pool.query(
        "SELECT * FROM lib_clients WHERE tenant_id=$1 AND status NOT IN ('won','lost') ORDER BY updated_at DESC LIMIT 40",
        [req.agent.id]);
      if (!clients.rows.length) return res.json({ ok: true, clients: [], listings: 0 });
      const listings = await pool.query(`
        SELECT p.code, p.project_name, p.area_code, p.state, p.property_type, p.intent,
               p.asking_price::float8 AS asking_price, p.rent_price::float8 AS rent_price,
               p.bedrooms, p.bathrooms, p.built_up::float8 AS built_up, p.tenant_id, p.updated_at,
               pr.name AS project_title, pr.name_zh AS project_title_zh, a.name AS owner_name
        FROM lib_properties p
        LEFT JOIN lib_projects pr ON pr.id=p.project_id
        LEFT JOIN lib_agents a ON a.id=p.tenant_id
        WHERE p.visibility IN ('pool','public') AND p.status IN ('available','reserved')
          AND p.tenant_id IS DISTINCT FROM $1
        ORDER BY p.updated_at DESC LIMIT 800`, [req.agent.id]);

      const out = matcher.matchClients(clients.rows, listings.rows, 6);
      res.json({ ok: true, clients: out, listings: listings.rows.length });
    } catch (e) { next(e); }
  });
  // ---------- 带看询盘 ----------
  r.post("/inquiries", requireAgent, limit(20, 600000), async function (req, res, next) {
    try {
      const b = req.body || {};
      const code = core.str(b.property_code, 20);
      const name = core.str(b.client_name, 60);
      const phone = core.str(b.client_phone, 40);
      const message = core.str(b.message, 500);
      if (!name || !phone) return res.status(400).json({ ok: false, error: "invalid_input", fields: { client_name: name ? null : "required", client_phone: phone ? null : "required" } });
      const p = await pool.query(
        "SELECT id, tenant_id, agent, code FROM lib_properties WHERE code=$1 AND visibility IN ('pool','public') AND status IN ('available','reserved')", [code]);
      const prop = p.rows[0];
      if (!prop) return res.status(404).json({ ok: false, error: "not_found" });
      if (prop.tenant_id === req.agent.id) return res.status(400).json({ ok: false, error: "own_listing" });
      const out = await pool.query(
        "INSERT INTO pool_inquiries(property_id,from_agent_id,to_agent_id,client_name,client_phone,message) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [prop.id, req.agent.id, prop.tenant_id, name, phone, message]);
      if (prop.tenant_id) {
        const owner = await pool.query("SELECT email,name,lang FROM lib_agents WHERE id=$1", [prop.tenant_id]);
        if (owner.rows[0] && owner.rows[0].email) {
          const o = owner.rows[0], ol = o.lang === "en" ? "en" : (o.lang === "bm" ? "bm" : "zh");
          const N = {
            zh: { sub: "新的带看申请 · " + prop.code, lines: ["你好 " + o.name + "，", "", "有同行想带客看你的房源：" + prop.code, "", "客户：" + name + "（" + phone + "）", message ? "留言：" + message : "", "", "登录查看：https://kwongthye.com/agent/#/inquiries"] },
            en: { sub: "New viewing request · " + prop.code, lines: ["Hi " + o.name + ",", "", "A peer wants to bring a client to your listing: " + prop.code, "", "Client: " + name + " (" + phone + ")", message ? "Message: " + message : "", "", "Open: https://kwongthye.com/agent/#/inquiries"] },
            bm: { sub: "Permintaan tontonan baru · " + prop.code, lines: ["Hai " + o.name + ",", "", "Rakan ejen ingin bawa klien ke senarai anda: " + prop.code, "", "Klien: " + name + " (" + phone + ")", message ? "Mesej: " + message : "", "", "Buka: https://kwongthye.com/agent/#/inquiries"] }
          };
          sendMail(o.email, N[ol].sub, N[ol].lines.filter(Boolean).join("\n")).catch(function () {});
        }
      }
      await audit(req.agent.email, "agent.inquiry", "property", prop.id, { to: prop.tenant_id });
      res.status(201).json({ ok: true, row: out.rows[0] });
    } catch (e) { next(e); }
  });

  r.get("/inquiries", requireAgent, async function (req, res, next) {
    try {
      const box = req.query.box === "out" ? "out" : "in";
      const col = box === "out" ? "i.from_agent_id" : "i.to_agent_id";
      const rows = await pool.query(`
        SELECT i.*, i.created_at AS at, p.code, p.project_name, pr.name AS project_title,
               fa.name AS from_name, ta.name AS to_name
        FROM pool_inquiries i
        JOIN lib_properties p ON p.id=i.property_id
        LEFT JOIN lib_projects pr ON pr.id=p.project_id
        LEFT JOIN lib_agents fa ON fa.id=i.from_agent_id
        LEFT JOIN lib_agents ta ON ta.id=i.to_agent_id
        WHERE ` + col + `=$1 ORDER BY i.created_at DESC LIMIT 200`, [req.agent.id]);
      res.json({ ok: true, rows: rows.rows });
    } catch (e) { next(e); }
  });

  r.patch("/inquiries/:id", requireAgent, async function (req, res, next) {
    try {
      const status = String((req.body || {}).status || "");
      if (["accepted", "declined", "done"].indexOf(status) < 0) return res.status(400).json({ ok: false, error: "invalid_input" });
      const out = await pool.query("UPDATE pool_inquiries SET status=$1, updated_at=now() WHERE id=$2 AND to_agent_id=$3 RETURNING *",
        [status, req.params.id, req.agent.id]);
      if (!out.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
      res.json({ ok: true, row: out.rows[0] });
    } catch (e) { next(e); }
  });

  return r;
};
