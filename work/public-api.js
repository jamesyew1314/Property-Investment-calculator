"use strict";
// public-api.js — PropNet 官网公开接口（无需登录，只暴露公开字段）
// 只读取 visibility='public' 且仍在售/在租的房源；业主、备注、完整地址不出网。

const express = require("express");
const crypto = require("node:crypto");
const core = require("./library-core");
const tax = require("./library-taxonomy");

const PUBLIC_SELECT = `
  SELECT p.code, p.project_id, p.project_name, p.area_code, p.state, p.property_type, p.tenure, p.photos, p.cover_url,
         p.block, p.unit_no, p.floor, p.built_up::float8 AS built_up, p.land_area::float8 AS land_area,
         p.bedrooms, p.bathrooms, p.carparks, p.facing, p.furnishing, p.condition, p.intent,
         p.asking_price::float8 AS asking_price, p.rent_price::float8 AS rent_price,
         p.maintenance_fee::float8 AS maintenance_fee, p.status, p.listed_on::text AS listed_on,
         p.title_type, p.tags, p.views, p.published_at, p.updated_at, p.cover_url,
         pr.name AS project_title, pr.name_zh AS project_title_zh,
         p.agent AS agent_raw, a.name AS agent_name, a.slug AS agent_slug, a.ren_no AS agent_ren
  FROM lib_properties p
  LEFT JOIN lib_projects pr ON pr.id = p.project_id
  LEFT JOIN lib_agents a ON lower(a.name) = lower(p.agent)
  WHERE p.visibility = 'public' AND p.status IN ('available', 'reserved')`;

module.exports = function createPublicApi({ pool, rateLimit, notify, ipSalt, freeMode, plans }) {
  const r = express.Router();
  r.use(function (req, res, next) {
    res.setHeader("Cache-Control", "public, max-age=30");
    next();
  });

  function numify(row) {
    if (!row) return row;
    for (const k of ["built_up", "land_area", "asking_price", "rent_price", "maintenance_fee"]) {
      if (row[k] != null) row[k] = Number(row[k]);
    }
    return row;
  }

  function ipHash(req) {
    return crypto.createHash("sha256").update((req.ip || "") + (ipSalt || "fc")).digest("hex").slice(0, 24);
  }

  // ---------- 站点配置 / 统计 ----------
  r.get("/config", async function (req, res, next) {
    try {
      const counts = await pool.query(`
        SELECT
          (SELECT count(*) FROM lib_properties WHERE visibility='public' AND status IN ('available','reserved'))::int AS listings,
          (SELECT count(*) FROM lib_agents WHERE public=true AND active=true)::int AS agents,
          (SELECT count(DISTINCT area_code) FROM lib_properties WHERE visibility='public' AND status IN ('available','reserved'))::int AS areas,
          (SELECT count(DISTINCT state) FROM lib_properties WHERE visibility='public' AND status IN ('available','reserved'))::int AS states`);
      const areaRows = await pool.query(`
        SELECT area_code, count(*)::int AS n
        FROM lib_properties WHERE visibility='public' AND status IN ('available','reserved') AND area_code IS NOT NULL
        GROUP BY area_code`);
      const nOf = {};
      areaRows.rows.forEach(function (x) { nOf[x.area_code] = x.n; });
      const stateRows = await pool.query(`
        SELECT state, count(*)::int AS n
        FROM lib_properties WHERE visibility='public' AND status IN ('available','reserved') AND state IS NOT NULL
        GROUP BY state`);
      const sOf = {};
      stateRows.rows.forEach(function (x) { sOf[x.state] = x.n; });
      const states = tax.STATES.map(function (s) {
        return { key: s.key, zh: s.zh, en: s.en, n: sOf[s.key] || 0 };
      });
      const areas = tax.AREAS.map(function (a) {
        return { key: a.key, zh: a.zh, en: a.en, state: a.state, n: nOf[a.key] || 0 };
      });
      res.json({
        ok: true,
        platformFree: !!freeMode,
        plans: plans || null,
        counts: counts.rows[0],
        states: states,
        areas: areas,
        taxonomy: {
          states: tax.STATES,
          property_types: tax.PROPERTY_TYPES,
          tenures: tax.TENURES,
          furnishings: tax.FURNISHINGS,
          conditions: tax.CONDITIONS,
          listing_statuses: tax.LISTING_STATUSES
        }
      });
    } catch (e) { next(e); }
  });

  // ---------- 房源列表 ----------
  r.get("/properties", async function (req, res, next) {
    try {
      const page = Math.max(1, Math.min(500, Number(req.query.page) || 1));
      const pageSize = Math.max(1, Math.min(24, Number(req.query.pageSize) || 12));
      const where = [], args = [];
      const add = (clause, vals) => {
        let i = 0;
        where.push(clause.replace(/\?/g, function () { args.push(vals[i++]); return "$" + args.length; }));
      };
      const q = core.likeOf(req.query.q);
      if (q) add("(p.project_name ILIKE ? OR pr.name ILIKE ? OR pr.name_zh ILIKE ? OR p.unit_no ILIKE ?)", [q, q, q, q]);
      if (req.query.state) add("p.state = ?", [String(req.query.state).slice(0, 40)]);
      if (req.query.area) add("p.area_code = ?", [String(req.query.area).slice(0, 40)]);
      if (req.query.type && tax.isValid("property_types", req.query.type)) add("p.property_type = ?", [req.query.type]);
      if (req.query.intent && tax.isValid("listing_intents", req.query.intent)) add("p.intent = ?", [req.query.intent]);
      if (req.query.agent) add("lower(p.agent) = lower(?)", [String(req.query.agent).slice(0, 80)]);
      if (req.query.beds) add("p.bedrooms >= ?", [Math.max(0, Math.min(20, Number(req.query.beds) || 0))]);
      const min = Number(req.query.min), max = Number(req.query.max);
      if (min > 0) add("(CASE WHEN p.intent='rent' THEN p.rent_price ELSE p.asking_price END) >= ?", [min]);
      if (max > 0) add("(CASE WHEN p.intent='rent' THEN p.rent_price ELSE p.asking_price END) <= ?", [max]);
      const w = where.length ? " AND " + where.join(" AND ") : "";
      const total = await pool.query(
        "SELECT count(*)::int AS n FROM lib_properties p LEFT JOIN lib_projects pr ON pr.id=p.project_id WHERE p.visibility='public' AND p.status IN ('available','reserved')" + w,
        args);
      const rows = await pool.query(
        `${PUBLIC_SELECT}${w} ORDER BY p.published_at DESC NULLS LAST, p.updated_at DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
        args.concat([pageSize, (page - 1) * pageSize]));
      res.json({ ok: true, rows: rows.rows.map(numify), total: total.rows[0].n, page, pageSize });
    } catch (e) { next(e); }
  });

  // ---------- 房源详情 ----------
  r.get("/properties/:code", async function (req, res, next) {
    try {
      const code = String(req.params.code || "").slice(0, 20).toUpperCase();
      const out = await pool.query(`${PUBLIC_SELECT} AND p.code = $1`, [code]);
      const row = out.rows[0];
      if (!row) return res.status(404).json({ ok: false, error: "not_found" });
      pool.query("UPDATE lib_properties SET views = views + 1 WHERE code = $1", [code]).catch(function () {});
      const agent = row.agent_name ? (await pool.query(
        "SELECT name, slug, phone, email, ren_no, bio, photo_url, areas, verified_at FROM lib_agents WHERE lower(name)=lower($1) LIMIT 1",
        [row.agent_name])).rows[0] : null;
      res.json({ ok: true, row: numify(row), agent: agent || null });
    } catch (e) { next(e); }
  });

  // ---------- 中介目录 ----------
  r.get("/agents", async function (req, res, next) {
    try {
      const out = await pool.query(`
        SELECT a.id, a.name, a.slug, a.ren_no, a.phone, a.email, a.bio, a.photo_url, a.areas, a.verified_at,
               (SELECT count(*) FROM lib_properties p
                 WHERE p.visibility='public' AND p.status IN ('available','reserved')
                   AND lower(p.agent)=lower(a.name))::int AS listings
        FROM lib_agents a
        WHERE a.public = true AND a.active = true
        ORDER BY listings DESC, a.name ASC LIMIT 100`);
      res.json({ ok: true, rows: out.rows });
    } catch (e) { next(e); }
  });

  // ---------- 加入申请 ----------
  r.post("/leads", rateLimit ? rateLimit(5, 600000) : function (req, res, next) { next(); }, async function (req, res, next) {
    try {
      const b = req.body || {};
      const name = core.str(b.name, 60);
      const phone = core.str(b.phone, 40);
      const email = core.str(b.email, 120);
      const ren = core.str(b.ren_no, 40);
      const team = core.str(b.team, 80);
      const message = core.str(b.message, 500);
      const fields = {};
      if (!name || name.length < 2) fields.name = "required";
      const digits = String(phone || "").replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 15) fields.phone = "invalid_number";
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fields.email = "invalid";
      if (Object.keys(fields).length) return res.status(400).json({ ok: false, error: "invalid_input", fields });
      const out = await pool.query(
        "INSERT INTO agent_leads(name,phone,email,ren_no,team,message,source,ip_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
        [name, phone, email, ren, team, message, "homepage", ipHash(req)]);
      if (typeof notify === "function") {
        notify({ id: out.rows[0].id, name, phone, email, ren, team, message }).catch(function () {});
      }
      res.status(201).json({ ok: true, id: out.rows[0].id });
    } catch (e) { next(e); }
  });

  return r;
};
