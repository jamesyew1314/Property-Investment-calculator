"use strict";
// library-api.js — PropBase 房产资料库 API（挂在 /api/library 下）
// 权限：沿用后台管理员会话（fc_admin）。viewer 只读；admin/owner 可写。
// 约定：金额 NUMERIC → 出参统一转 float；日期统一 'YYYY-MM-DD' 文本。

const express = require("express");
const core = require("./library-core");
const tax = require("./library-taxonomy");

const PROPERTY_SELECT = `
  SELECT p.id, p.code, p.project_id, p.project_name, p.area_code, p.property_type, p.tenure, p.address,
         p.block, p.unit_no, p.floor, p.built_up::float8 AS built_up, p.land_area::float8 AS land_area,
         p.bedrooms, p.bathrooms, p.carparks, p.facing, p.furnishing, p.condition, p.intent,
         p.asking_price::float8 AS asking_price, p.rent_price::float8 AS rent_price,
         p.maintenance_fee::float8 AS maintenance_fee, p.status, p.owner_id, p.agent, p.exclusive,
         p.listed_on::text AS listed_on, p.title_type, p.tags, p.remarks, p.is_demo, p.created_by,
         p.created_at, p.updated_at,
         pr.name AS project_title, o.name AS owner_name, o.phone AS owner_phone
  FROM lib_properties p
  LEFT JOIN lib_projects pr ON pr.id = p.project_id
  LEFT JOIN lib_owners o ON o.id = p.owner_id`;

const NUM_FIELDS = new Set(["asking_price", "rent_price", "maintenance_fee", "built_up", "land_area",
  "commission_amount", "price", "budget_min", "budget_max", "commission_rate"]);

function numify(row) {
  if (!row) return row;
  for (const k of Object.keys(row)) {
    if (NUM_FIELDS.has(k) && row[k] != null) row[k] = Number(row[k]);
  }
  return row;
}

function pickCols(allowed, values) {
  const out = {};
  for (const k of Object.keys(values)) if (allowed.indexOf(k) >= 0) out[k] = values[k];
  return out;
}

const ALLOWED = {
  lib_projects: ["name", "name_zh", "developer", "area_code", "address", "tenure", "property_type",
    "total_units", "blocks", "completion_year", "facilities", "lat", "lng", "remarks", "archived"],
  lib_owners: ["name", "phone", "phone2", "email", "id_last4", "address", "source", "remarks"],
  lib_clients: ["name", "phone", "email", "intent", "budget_min", "budget_max", "area_codes",
    "property_types", "bedrooms_min", "timeline", "source", "status", "agent", "remarks"],
  lib_properties: ["code", "project_id", "project_name", "area_code", "property_type", "tenure", "address",
    "block", "unit_no", "floor", "built_up", "land_area", "bedrooms", "bathrooms", "carparks", "facing",
    "furnishing", "condition", "intent", "asking_price", "rent_price", "maintenance_fee", "status",
    "owner_id", "agent", "exclusive", "listed_on", "title_type", "tags", "remarks", "is_demo", "created_by"],
  lib_viewings: ["property_id", "client_id", "agent", "scheduled_on", "scheduled_time", "status", "feedback"],
  lib_deals: ["property_id", "client_id", "kind", "price", "deal_on", "commission_rate",
    "commission_amount", "agent", "status", "remarks"],
  lib_agents: ["name", "phone", "email", "ren_no", "team", "active"]
};

module.exports = function createLibraryApi({ pool, requireAdmin, requireWrite }) {
  const r = express.Router();
  r.use(function (req, res, next) { res.setHeader("Cache-Control", "no-store"); next(); });
  r.use(requireAdmin);

  // ---------- 基础工具 ----------
  async function audit(req, action, entity, entityId, detail) {
    try {
      await pool.query(
        "INSERT INTO lib_audit(actor,action,entity,entity_id,detail) VALUES($1,$2,$3,$4,$5)",
        [req.admin ? req.admin.email : "system", action, entity, entityId || null, detail ? JSON.stringify(detail) : null]
      );
    } catch (e) { /* 审计失败不影响主流程 */ }
  }

  function invalid(res, fields) {
    return res.status(400).json({ ok: false, error: "invalid_input", fields });
  }

  async function insertRow(table, values) {
    const cols = Object.keys(pickCols(ALLOWED[table], values));
    if (!cols.length) throw new Error("empty insert");
    const args = cols.map((c) => values[c]);
    const sql = `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map((_, i) => "$" + (i + 1)).join(",")}) RETURNING *`;
    const out = await pool.query(sql, args);
    return numify(out.rows[0]);
  }

  async function updateRow(table, id, values) {
    const cols = Object.keys(pickCols(ALLOWED[table], values));
    if (!cols.length) return null;
    const args = cols.map((c) => values[c]);
    const sets = cols.map((c, i) => `${c}=$${i + 1}`);
    const sql = `UPDATE ${table} SET ${sets.join(",")}, updated_at=now() WHERE id=$${cols.length + 1} RETURNING *`;
    const out = await pool.query(sql, args.concat([id]));
    return numify(out.rows[0] || null);
  }

  function pager(q) { return core.paging(q); }

  function pageOut(res, rows, total, pg) {
    res.json({ ok: true, rows: rows.map(numify), total, page: pg.page, pageSize: pg.pageSize });
  }

  function queryBuilder() {
    const w = [], args = [];
    return {
      add(clause, vals) {
        let i = 0;
        w.push(clause.replace(/\?/g, function () {
          args.push(vals[i++]);
          return "$" + args.length;
        }));
      },
      where() { return w.length ? " WHERE " + w.join(" AND ") : ""; },
      args
    };
  }

  function csvList(v) {
    return String(v || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 40);
  }

  // ---------- 字典 ----------
  r.get("/meta", function (req, res) {
    res.json({
      ok: true,
      taxonomy: tax.LISTS,
      today: new Date().toISOString().slice(0, 10),
      role: req.admin.role,
      email: req.admin.email
    });
  });

  // ---------- 概览 ----------
  r.get("/overview", async function (req, res, next) {
    try {
      const stats = await pool.query(`
        SELECT
          (SELECT count(*) FROM lib_properties WHERE status='available' AND intent='sale')::int AS sale_available,
          (SELECT count(*) FROM lib_properties WHERE status='available' AND intent='rent')::int AS rent_available,
          (SELECT count(*) FROM lib_properties WHERE status='reserved')::int AS reserved,
          (SELECT count(*) FROM lib_properties WHERE status='sold' AND updated_at >= date_trunc('month', now()))::int AS sold_month,
          (SELECT count(*) FROM lib_properties WHERE created_at >= date_trunc('month', now()))::int AS new_month,
          (SELECT count(*) FROM lib_properties)::int AS properties,
          (SELECT count(*) FROM lib_projects WHERE archived=false)::int AS projects,
          (SELECT count(*) FROM lib_owners)::int AS owners,
          (SELECT count(*) FROM lib_clients WHERE status NOT IN ('won','lost'))::int AS active_clients,
          (SELECT count(*) FROM lib_viewings WHERE status='scheduled' AND scheduled_on >= current_date)::int AS upcoming_viewings,
          (SELECT coalesce(sum(asking_price),0)::float8 FROM lib_properties WHERE status='available' AND intent='sale') AS sale_value,
          (SELECT coalesce(sum(commission_amount),0)::float8 FROM lib_deals WHERE status='completed'
              AND deal_on >= date_trunc('month', current_date)::date) AS commission_month,
          (SELECT count(*) FROM lib_deals WHERE status='completed'
              AND deal_on >= date_trunc('month', current_date)::date)::int AS deals_month
      `);
      const areas = await pool.query(`
        SELECT area_code, count(*)::int AS n
        FROM lib_properties WHERE status='available' AND area_code IS NOT NULL
        GROUP BY area_code ORDER BY n DESC, area_code LIMIT 8`);
      const recent = await pool.query(`${PROPERTY_SELECT} ORDER BY p.updated_at DESC LIMIT 8`);
      const viewings = await pool.query(`
        SELECT v.id, v.scheduled_on::text AS scheduled_on, v.scheduled_time, v.status, v.agent,
               p.id AS property_id, p.code, coalesce(pr.name, p.project_name) AS property_title, p.unit_no, c.name AS client_name
        FROM lib_viewings v
        LEFT JOIN lib_properties p ON p.id = v.property_id
        LEFT JOIN lib_projects pr ON pr.id = p.project_id
        LEFT JOIN lib_clients c ON c.id = v.client_id
        WHERE v.status='scheduled' AND v.scheduled_on >= current_date
        ORDER BY v.scheduled_on, v.scheduled_time NULLS LAST LIMIT 6`);
      res.json({
        ok: true,
        stats: numify(stats.rows[0]),
        areas: areas.rows,
        recent: recent.rows.map(numify),
        viewings: viewings.rows.map(numify)
      });
    } catch (e) { next(e); }
  });

  // ---------- 房源 ----------
  const PROP_SORT = { updated_at: "p.updated_at", created_at: "p.created_at", asking_price: "p.asking_price",
    built_up: "p.built_up", code: "p.code", status: "p.status", listed_on: "p.listed_on" };

  r.get("/properties", async function (req, res, next) {
    try {
      const pg = pager(req.query);
      const b = queryBuilder();
      const like = core.likeOf(req.query.q);
      if (like) {
        b.add("(p.code ILIKE ? OR p.project_name ILIKE ? OR pr.name ILIKE ? OR p.unit_no ILIKE ? OR p.address ILIKE ? OR p.agent ILIKE ? OR p.remarks ILIKE ?)",
          [like, like, like, like, like, like, like]);
      }
      const status = csvList(req.query.status).filter((s) => tax.isValid("listing_statuses", s));
      if (status.length) b.add("p.status = ANY(?)", [status]);
      if (req.query.intent) b.add("p.intent = ?", [req.query.intent]);
      const areas = csvList(req.query.area);
      if (areas.length) b.add("p.area_code = ANY(?)", [areas]);
      if (req.query.type) b.add("p.property_type = ?", [req.query.type]);
      if (req.query.agent) b.add("p.agent = ?", [req.query.agent]);
      if (req.query.project_id) b.add("p.project_id = ?", [Number(req.query.project_id)]);
      if (req.query.owner_id) b.add("p.owner_id = ?", [Number(req.query.owner_id)]);
      if (req.query.beds) b.add("p.bedrooms >= ?", [Number(req.query.beds)]);
      if (req.query.minPrice) b.add("coalesce(p.asking_price, p.rent_price) >= ?", [Number(req.query.minPrice)]);
      if (req.query.maxPrice) b.add("coalesce(p.asking_price, p.rent_price) <= ?", [Number(req.query.maxPrice)]);
      if (req.query.demo === "1") b.add("p.is_demo = true", []);
      const where = b.where();
      const order = core.sortOf(req.query, PROP_SORT, "p.updated_at DESC");
      const total = await pool.query(
        "SELECT count(*)::int AS n FROM lib_properties p LEFT JOIN lib_projects pr ON pr.id=p.project_id" + where, b.args);
      const rows = await pool.query(
        `${PROPERTY_SELECT}${where} ORDER BY ${order}, p.id DESC LIMIT $${b.args.length + 1} OFFSET $${b.args.length + 2}`,
        b.args.concat([pg.pageSize, pg.offset]));
      pageOut(res, rows.rows, total.rows[0].n, pg);
    } catch (e) { next(e); }
  });

  async function getProperty(id) {
    const out = await pool.query(`${PROPERTY_SELECT} WHERE p.id = $1`, [id]);
    return out.rows[0] || null;
  }

  async function fillFromProject(values) {
    if (!values.project_id) return values;
    const pr = await pool.query("SELECT * FROM lib_projects WHERE id=$1", [values.project_id]);
    const p = pr.rows[0];
    if (!p) return values;
    const out = { ...values };
    if (!out.area_code) out.area_code = p.area_code;
    if (!out.property_type) out.property_type = p.property_type;
    if (!out.tenure) out.tenure = p.tenure;
    if (!out.address) out.address = p.address;
    if (!out.project_name) out.project_name = p.name;
    return out;
  }

  r.post("/properties", requireWrite, async function (req, res, next) {
    try {
      const n = core.normalizeProperty(req.body || {}, { partial: false });
      if (Object.keys(n.errors).length) return invalid(res, n.errors);
      const v = await fillFromProject(n.values);
      v.intent = v.intent || "sale";
      v.status = v.status || "available";
      v.created_by = req.admin.email;
      if (v.unit_no) {
        const dup = await pool.query(
          "SELECT id FROM lib_properties WHERE coalesce(project_id,0)=coalesce($1,0) AND lower(coalesce(block,''))=lower(coalesce($2,'')) AND lower(unit_no)=lower($3) LIMIT 1",
          [v.project_id || null, v.block || null, v.unit_no]);
        if (dup.rows[0]) return res.status(409).json({ ok: false, error: "duplicate_unit", id: dup.rows[0].id });
      }
      const row = await insertRow("lib_properties", v);
      await audit(req, "create", "property", row.id, { code: row.code, price: row.asking_price });
      res.status(201).json({ ok: true, row: await getProperty(row.id) });
    } catch (e) {
      if (e && e.code === "23505") return res.status(409).json({ ok: false, error: "duplicate_unit" });
      next(e);
    }
  });

  r.get("/properties/:id", async function (req, res, next) {
    try {
      const row = await getProperty(req.params.id);
      if (!row) return res.status(404).json({ ok: false, error: "not_found" });
      const owner = row.owner_id ? (await pool.query("SELECT * FROM lib_owners WHERE id=$1", [row.owner_id])).rows[0] : null;
      const project = row.project_id ? (await pool.query("SELECT * FROM lib_projects WHERE id=$1", [row.project_id])).rows[0] : null;
      const prices = await pool.query(
        "SELECT id, field, old_price::float8 AS old_price, new_price::float8 AS new_price, note, actor, created_at " +
        "FROM lib_price_events WHERE property_id=$1 ORDER BY created_at DESC LIMIT 20", [req.params.id]);
      const viewings = await pool.query(
        "SELECT v.*, v.scheduled_on::text AS scheduled_on, c.name AS client_name, c.phone AS client_phone " +
        "FROM lib_viewings v LEFT JOIN lib_clients c ON c.id=v.client_id WHERE v.property_id=$1 " +
        "ORDER BY v.scheduled_on DESC NULLS LAST, v.id DESC LIMIT 20", [req.params.id]);
      const deals = await pool.query(
        "SELECT d.*, d.deal_on::text AS deal_on, d.price::float8 AS price, d.commission_amount::float8 AS commission_amount, " +
        "d.commission_rate::float8 AS commission_rate, c.name AS client_name FROM lib_deals d " +
        "LEFT JOIN lib_clients c ON c.id=d.client_id WHERE d.property_id=$1 ORDER BY d.deal_on DESC NULLS LAST", [req.params.id]);
      res.json({ ok: true, row, owner: numify(owner), project: numify(project),
        prices: prices.rows.map(numify), viewings: viewings.rows.map(numify), deals: deals.rows.map(numify) });
    } catch (e) { next(e); }
  });

  r.patch("/properties/:id", requireWrite, async function (req, res, next) {
    try {
      const before = await pool.query("SELECT * FROM lib_properties WHERE id=$1", [req.params.id]);
      if (!before.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
      const n = core.normalizeProperty(req.body || {}, { partial: true });
      if (Object.keys(n.errors).length) return invalid(res, n.errors);
      let v = n.values;
      if (v.project_id) v = await fillFromProject({ ...v, area_code: v.area_code || undefined });
      if (v.unit_no) {
        const dup = await pool.query(
          "SELECT id FROM lib_properties WHERE id <> $1 AND coalesce(project_id,0)=coalesce($2,0) " +
          "AND lower(coalesce(block,''))=lower(coalesce($3,'')) AND lower(unit_no)=lower($4) LIMIT 1",
          [req.params.id, v.project_id || before.rows[0].project_id, v.block !== undefined ? v.block : before.rows[0].block, v.unit_no]);
        if (dup.rows[0]) return res.status(409).json({ ok: false, error: "duplicate_unit", id: dup.rows[0].id });
      }
      const row = await updateRow("lib_properties", req.params.id, v);
      const old = before.rows[0];
      for (const field of ["asking_price", "rent_price"]) {
        if (v[field] !== undefined && Number(v[field] || 0) !== Number(old[field] || 0)) {
          await pool.query(
            "INSERT INTO lib_price_events(property_id,field,old_price,new_price,note,actor) VALUES($1,$2,$3,$4,$5,$6)",
            [req.params.id, field, old[field], v[field], null, req.admin.email]);
        }
      }
      await audit(req, "update", "property", Number(req.params.id), { fields: Object.keys(v) });
      res.json({ ok: true, row: await getProperty(req.params.id) });
    } catch (e) {
      if (e && e.code === "23505") return res.status(409).json({ ok: false, error: "duplicate_unit" });
      next(e);
    }
  });

  r.delete("/properties/:id", requireWrite, async function (req, res, next) {
    try {
      const row = await pool.query("SELECT * FROM lib_properties WHERE id=$1", [req.params.id]);
      if (!row.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
      await pool.query("DELETE FROM lib_properties WHERE id=$1", [req.params.id]);
      await audit(req, "delete", "property", Number(req.params.id), { code: row.rows[0].code, snapshot: row.rows[0] });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.post("/properties/bulk", requireWrite, async function (req, res, next) {
    try {
      const ids = (Array.isArray((req.body || {}).ids) ? req.body.ids : []).map(Number).filter((n) => n > 0).slice(0, 500);
      const action = String((req.body || {}).action || "");
      const value = (req.body || {}).value;
      if (!ids.length) return invalid(res, { ids: "required" });
      let done = 0;
      if (action === "status" && tax.isValid("listing_statuses", value)) {
        done = (await pool.query("UPDATE lib_properties SET status=$1, updated_at=now() WHERE id = ANY($2)", [value, ids])).rowCount;
      } else if (action === "agent") {
        done = (await pool.query("UPDATE lib_properties SET agent=$1, updated_at=now() WHERE id = ANY($2)", [value || null, ids])).rowCount;
      } else if (action === "delete") {
        done = (await pool.query("DELETE FROM lib_properties WHERE id = ANY($1)", [ids])).rowCount;
      } else {
        return invalid(res, { action: "invalid_choice" });
      }
      await audit(req, "bulk", "property", null, { action, value, ids, done });
      res.json({ ok: true, done });
    } catch (e) { next(e); }
  });

  // ---------- 楼盘 ----------
  r.get("/projects", async function (req, res, next) {
    try {
      const pg = pager(req.query);
      const b = queryBuilder();
      const like = core.likeOf(req.query.q);
      if (like) b.add("(pr.name ILIKE ? OR pr.name_zh ILIKE ? OR pr.developer ILIKE ? OR pr.address ILIKE ?)",
        [like, like, like, like]);
      if (req.query.area) b.add("pr.area_code = ?", [req.query.area]);
      if (req.query.type) b.add("pr.property_type = ?", [req.query.type]);
      if (req.query.archived !== "1") b.add("pr.archived = false", []);
      const where = b.where();
      const total = await pool.query("SELECT count(*)::int AS n FROM lib_projects pr" + where, b.args);
      const rows = await pool.query(`
        SELECT pr.*, pr.lat::float8 AS lat, pr.lng::float8 AS lng,
          (SELECT count(*) FROM lib_properties p WHERE p.project_id=pr.id)::int AS units,
          (SELECT count(*) FROM lib_properties p WHERE p.project_id=pr.id AND p.status='available')::int AS available,
          (SELECT round(avg(p.asking_price))::float8 FROM lib_properties p WHERE p.project_id=pr.id AND p.intent='sale' AND p.asking_price>0) AS avg_price
        FROM lib_projects pr${where} ORDER BY pr.updated_at DESC LIMIT $${b.args.length + 1} OFFSET $${b.args.length + 2}`,
        b.args.concat([pg.pageSize, pg.offset]));
      pageOut(res, rows.rows, total.rows[0].n, pg);
    } catch (e) { next(e); }
  });

  r.post("/projects", requireWrite, async function (req, res, next) {
    try {
      const n = core.normalizeProject(req.body || {}, { partial: false });
      if (Object.keys(n.errors).length) return invalid(res, n.errors);
      const row = await insertRow("lib_projects", n.values);
      await audit(req, "create", "project", row.id, { name: row.name });
      res.status(201).json({ ok: true, row });
    } catch (e) {
      if (e && e.code === "23505") return res.status(409).json({ ok: false, error: "duplicate_project" });
      next(e);
    }
  });

  r.patch("/projects/:id", requireWrite, async function (req, res, next) {
    try {
      const n = core.normalizeProject(req.body || {}, { partial: true });
      if (Object.keys(n.errors).length) return invalid(res, n.errors);
      const row = await updateRow("lib_projects", req.params.id, n.values);
      if (!row) return res.status(404).json({ ok: false, error: "not_found" });
      await audit(req, "update", "project", Number(req.params.id), { fields: Object.keys(n.values) });
      res.json({ ok: true, row });
    } catch (e) {
      if (e && e.code === "23505") return res.status(409).json({ ok: false, error: "duplicate_project" });
      next(e);
    }
  });

  r.delete("/projects/:id", requireWrite, async function (req, res, next) {
    try {
      const used = await pool.query("SELECT count(*)::int AS n FROM lib_properties WHERE project_id=$1", [req.params.id]);
      if (used.rows[0].n > 0 && req.query.force !== "1") {
        return res.status(409).json({ ok: false, error: "project_in_use", count: used.rows[0].n });
      }
      const row = await pool.query("DELETE FROM lib_projects WHERE id=$1 RETURNING name", [req.params.id]);
      if (!row.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
      await audit(req, "delete", "project", Number(req.params.id), { name: row.rows[0].name });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.get("/projects/:id", async function (req, res, next) {
    try {
      const out = await pool.query("SELECT *, lat::float8 AS lat, lng::float8 AS lng FROM lib_projects WHERE id=$1", [req.params.id]);
      if (!out.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
      res.json({ ok: true, row: numify(out.rows[0]) });
    } catch (e) { next(e); }
  });

  // ---------- 业主 ----------
  r.get("/owners", async function (req, res, next) {
    try {
      const pg = pager(req.query);
      const b = queryBuilder();
      const like = core.likeOf(req.query.q);
      if (like) b.add("(o.name ILIKE ? OR o.phone ILIKE ? OR o.phone2 ILIKE ? OR o.email ILIKE ?)", [like, like, like, like]);
      if (req.query.source) b.add("o.source = ?", [req.query.source]);
      const where = b.where();
      const total = await pool.query("SELECT count(*)::int AS n FROM lib_owners o" + where, b.args);
      const rows = await pool.query(`
        SELECT o.*, (SELECT count(*) FROM lib_properties p WHERE p.owner_id=o.id)::int AS properties
        FROM lib_owners o${where} ORDER BY o.updated_at DESC LIMIT $${b.args.length + 1} OFFSET $${b.args.length + 2}`,
        b.args.concat([pg.pageSize, pg.offset]));
      pageOut(res, rows.rows, total.rows[0].n, pg);
    } catch (e) { next(e); }
  });

  r.get("/owners/:id", async function (req, res, next) {
    try {
      const out = await pool.query("SELECT * FROM lib_owners WHERE id=$1", [req.params.id]);
      if (!out.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
      res.json({ ok: true, row: numify(out.rows[0]) });
    } catch (e) { next(e); }
  });

  r.post("/owners", requireWrite, async function (req, res, next) {
    try {
      const n = core.normalizeOwner(req.body || {}, { partial: false });
      if (Object.keys(n.errors).length) return invalid(res, n.errors);
      const row = await insertRow("lib_owners", n.values);
      await audit(req, "create", "owner", row.id, { name: row.name });
      res.status(201).json({ ok: true, row });
    } catch (e) { next(e); }
  });

  r.patch("/owners/:id", requireWrite, async function (req, res, next) {
    try {
      const n = core.normalizeOwner(req.body || {}, { partial: true });
      if (Object.keys(n.errors).length) return invalid(res, n.errors);
      const row = await updateRow("lib_owners", req.params.id, n.values);
      if (!row) return res.status(404).json({ ok: false, error: "not_found" });
      await audit(req, "update", "owner", Number(req.params.id), { fields: Object.keys(n.values) });
      res.json({ ok: true, row });
    } catch (e) { next(e); }
  });

  r.delete("/owners/:id", requireWrite, async function (req, res, next) {
    try {
      const used = await pool.query("SELECT count(*)::int AS n FROM lib_properties WHERE owner_id=$1", [req.params.id]);
      if (used.rows[0].n > 0 && req.query.force !== "1") {
        return res.status(409).json({ ok: false, error: "owner_in_use", count: used.rows[0].n });
      }
      if (used.rows[0].n > 0) await pool.query("UPDATE lib_properties SET owner_id=NULL WHERE owner_id=$1", [req.params.id]);
      const row = await pool.query("DELETE FROM lib_owners WHERE id=$1 RETURNING name", [req.params.id]);
      if (!row.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
      await audit(req, "delete", "owner", Number(req.params.id), { name: row.rows[0].name });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ---------- 客户 ----------
  r.get("/clients", async function (req, res, next) {
    try {
      const pg = pager(req.query);
      const b = queryBuilder();
      const like = core.likeOf(req.query.q);
      if (like) b.add("(c.name ILIKE ? OR c.phone ILIKE ? OR c.email ILIKE ? OR c.remarks ILIKE ?)", [like, like, like, like]);
      if (req.query.status) b.add("c.status = ?", [req.query.status]);
      if (req.query.intent) b.add("c.intent = ?", [req.query.intent]);
      if (req.query.agent) b.add("c.agent = ?", [req.query.agent]);
      const where = b.where();
      const total = await pool.query("SELECT count(*)::int AS n FROM lib_clients c" + where, b.args);
      const rows = await pool.query(`
        SELECT c.*, c.budget_min::float8 AS budget_min, c.budget_max::float8 AS budget_max,
          (SELECT count(*) FROM lib_viewings v WHERE v.client_id=c.id)::int AS viewings,
          (SELECT count(*) FROM lib_deals d WHERE d.client_id=c.id AND d.status='completed')::int AS deals
        FROM lib_clients c${where} ORDER BY c.updated_at DESC LIMIT $${b.args.length + 1} OFFSET $${b.args.length + 2}`,
        b.args.concat([pg.pageSize, pg.offset]));
      pageOut(res, rows.rows, total.rows[0].n, pg);
    } catch (e) { next(e); }
  });

  r.get("/clients/:id", async function (req, res, next) {
    try {
      const out = await pool.query("SELECT * FROM lib_clients WHERE id=$1", [req.params.id]);
      if (!out.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
      res.json({ ok: true, row: numify(out.rows[0]) });
    } catch (e) { next(e); }
  });

  r.post("/clients", requireWrite, async function (req, res, next) {
    try {
      const n = core.normalizeClient(req.body || {}, { partial: false });
      if (Object.keys(n.errors).length) return invalid(res, n.errors);
      n.values.status = n.values.status || "new";
      const row = await insertRow("lib_clients", n.values);
      await audit(req, "create", "client", row.id, { name: row.name });
      res.status(201).json({ ok: true, row });
    } catch (e) { next(e); }
  });

  r.patch("/clients/:id", requireWrite, async function (req, res, next) {
    try {
      const n = core.normalizeClient(req.body || {}, { partial: true });
      if (Object.keys(n.errors).length) return invalid(res, n.errors);
      const row = await updateRow("lib_clients", req.params.id, n.values);
      if (!row) return res.status(404).json({ ok: false, error: "not_found" });
      await audit(req, "update", "client", Number(req.params.id), { fields: Object.keys(n.values) });
      res.json({ ok: true, row });
    } catch (e) { next(e); }
  });

  r.delete("/clients/:id", requireWrite, async function (req, res, next) {
    try {
      await pool.query("DELETE FROM lib_clients WHERE id=$1", [req.params.id]);
      await audit(req, "delete", "client", Number(req.params.id), {});
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ---------- 带看 ----------
  r.get("/viewings", async function (req, res, next) {
    try {
      const pg = pager(req.query);
      const b = queryBuilder();
      if (req.query.status) b.add("v.status = ?", [req.query.status]);
      if (req.query.agent) b.add("v.agent = ?", [req.query.agent]);
      if (req.query.property_id) b.add("v.property_id = ?", [Number(req.query.property_id)]);
      if (req.query.client_id) b.add("v.client_id = ?", [Number(req.query.client_id)]);
      if (req.query.from) b.add("v.scheduled_on >= ?::date", [req.query.from]);
      if (req.query.to) b.add("v.scheduled_on <= ?::date", [req.query.to]);
      if (req.query.scope === "today") b.add("v.scheduled_on = current_date", []);
      if (req.query.scope === "upcoming") b.add("v.scheduled_on >= current_date AND v.status='scheduled'", []);
      const where = b.where();
      const total = await pool.query(`
        SELECT count(*)::int AS n FROM lib_viewings v
        LEFT JOIN lib_properties p ON p.id=v.property_id LEFT JOIN lib_projects pr ON pr.id=p.project_id
        LEFT JOIN lib_clients c ON c.id=v.client_id${where}`, b.args);
      const rows = await pool.query(`
        SELECT v.*, v.scheduled_on::text AS scheduled_on, p.code, p.unit_no,
               coalesce(pr.name, p.project_name) AS property_title, c.name AS client_name, c.phone AS client_phone
        FROM lib_viewings v
        LEFT JOIN lib_properties p ON p.id=v.property_id
        LEFT JOIN lib_projects pr ON pr.id=p.project_id
        LEFT JOIN lib_clients c ON c.id=v.client_id
        ${where} ORDER BY v.scheduled_on DESC NULLS LAST, v.id DESC LIMIT $${b.args.length + 1} OFFSET $${b.args.length + 2}`,
        b.args.concat([pg.pageSize, pg.offset]));
      pageOut(res, rows.rows, total.rows[0].n, pg);
    } catch (e) { next(e); }
  });

  r.get("/viewings/:id", async function (req, res, next) {
    try {
      const out = await pool.query(
        "SELECT v.*, v.scheduled_on::text AS scheduled_on, p.code, p.unit_no, coalesce(pr.name, p.project_name) AS property_title, " +
        "c.name AS client_name FROM lib_viewings v LEFT JOIN lib_properties p ON p.id=v.property_id " +
        "LEFT JOIN lib_projects pr ON pr.id=p.project_id LEFT JOIN lib_clients c ON c.id=v.client_id WHERE v.id=$1", [req.params.id]);
      if (!out.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
      res.json({ ok: true, row: numify(out.rows[0]) });
    } catch (e) { next(e); }
  });

  r.post("/viewings", requireWrite, async function (req, res, next) {
    try {
      const n = core.normalizeViewing(req.body || {}, { partial: false });
      if (Object.keys(n.errors).length) return invalid(res, n.errors);
      n.values.status = n.values.status || "scheduled";
      if (!n.values.scheduled_on) n.values.scheduled_on = new Date().toISOString().slice(0, 10);
      const row = await insertRow("lib_viewings", n.values);
      await audit(req, "create", "viewing", row.id, { property_id: row.property_id });
      res.status(201).json({ ok: true, row });
    } catch (e) { next(e); }
  });

  r.patch("/viewings/:id", requireWrite, async function (req, res, next) {
    try {
      const n = core.normalizeViewing(req.body || {}, { partial: true });
      if (Object.keys(n.errors).length) return invalid(res, n.errors);
      const row = await updateRow("lib_viewings", req.params.id, n.values);
      if (!row) return res.status(404).json({ ok: false, error: "not_found" });
      await audit(req, "update", "viewing", Number(req.params.id), { fields: Object.keys(n.values) });
      res.json({ ok: true, row });
    } catch (e) { next(e); }
  });

  r.delete("/viewings/:id", requireWrite, async function (req, res, next) {
    try {
      await pool.query("DELETE FROM lib_viewings WHERE id=$1", [req.params.id]);
      await audit(req, "delete", "viewing", Number(req.params.id), {});
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ---------- 成交 ----------
  r.get("/deals", async function (req, res, next) {
    try {
      const pg = pager(req.query);
      const b = queryBuilder();
      if (req.query.status) b.add("d.status = ?", [req.query.status]);
      if (req.query.kind) b.add("d.kind = ?", [req.query.kind]);
      if (req.query.agent) b.add("d.agent = ?", [req.query.agent]);
      if (req.query.from) b.add("d.deal_on >= ?::date", [req.query.from]);
      if (req.query.to) b.add("d.deal_on <= ?::date", [req.query.to]);
      const where = b.where();
      const total = await pool.query("SELECT count(*)::int AS n FROM lib_deals d" + where, b.args);
      const rows = await pool.query(`
        SELECT d.*, d.deal_on::text AS deal_on, d.price::float8 AS price,
               d.commission_amount::float8 AS commission_amount, d.commission_rate::float8 AS commission_rate,
               p.code, p.unit_no, coalesce(pr.name, p.project_name) AS property_title, c.name AS client_name
        FROM lib_deals d
        LEFT JOIN lib_properties p ON p.id=d.property_id
        LEFT JOIN lib_projects pr ON pr.id=p.project_id
        LEFT JOIN lib_clients c ON c.id=d.client_id
        ${where} ORDER BY d.deal_on DESC NULLS LAST, d.id DESC LIMIT $${b.args.length + 1} OFFSET $${b.args.length + 2}`,
        b.args.concat([pg.pageSize, pg.offset]));
      pageOut(res, rows.rows, total.rows[0].n, pg);
    } catch (e) { next(e); }
  });

  r.get("/deals/:id", async function (req, res, next) {
    try {
      const out = await pool.query(
        "SELECT d.*, d.deal_on::text AS deal_on, d.price::float8 AS price, d.commission_amount::float8 AS commission_amount, " +
        "d.commission_rate::float8 AS commission_rate, p.code, p.unit_no, coalesce(pr.name, p.project_name) AS property_title, " +
        "c.name AS client_name FROM lib_deals d LEFT JOIN lib_properties p ON p.id=d.property_id " +
        "LEFT JOIN lib_projects pr ON pr.id=p.project_id LEFT JOIN lib_clients c ON c.id=d.client_id WHERE d.id=$1", [req.params.id]);
      if (!out.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
      res.json({ ok: true, row: numify(out.rows[0]) });
    } catch (e) { next(e); }
  });

  r.post("/deals", requireWrite, async function (req, res, next) {
    try {
      const n = core.normalizeDeal(req.body || {}, { partial: false });
      if (Object.keys(n.errors).length) return invalid(res, n.errors);
      n.values.kind = n.values.kind || "sale";
      n.values.status = n.values.status || "completed";
      if (!n.values.deal_on) n.values.deal_on = new Date().toISOString().slice(0, 10);
      const row = await insertRow("lib_deals", n.values);
      if (row.property_id && row.status === "completed") {
        const st = row.kind === "rent" ? "rented" : "sold";
        await pool.query("UPDATE lib_properties SET status=$1, updated_at=now() WHERE id=$2", [st, row.property_id]);
      }
      await audit(req, "create", "deal", row.id, { price: row.price, commission: row.commission_amount });
      res.status(201).json({ ok: true, row });
    } catch (e) { next(e); }
  });

  r.patch("/deals/:id", requireWrite, async function (req, res, next) {
    try {
      const n = core.normalizeDeal(req.body || {}, { partial: true });
      if (Object.keys(n.errors).length) return invalid(res, n.errors);
      const row = await updateRow("lib_deals", req.params.id, n.values);
      if (!row) return res.status(404).json({ ok: false, error: "not_found" });
      await audit(req, "update", "deal", Number(req.params.id), { fields: Object.keys(n.values) });
      res.json({ ok: true, row });
    } catch (e) { next(e); }
  });

  r.delete("/deals/:id", requireWrite, async function (req, res, next) {
    try {
      await pool.query("DELETE FROM lib_deals WHERE id=$1", [req.params.id]);
      await audit(req, "delete", "deal", Number(req.params.id), {});
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ---------- 中介名册 ----------
  r.get("/agents", async function (req, res, next) {
    try {
      const out = await pool.query("SELECT * FROM lib_agents ORDER BY active DESC, name");
      res.json({ ok: true, rows: out.rows });
    } catch (e) { next(e); }
  });

  r.post("/agents", requireWrite, async function (req, res, next) {
    try {
      const v = {
        name: core.str((req.body || {}).name, 80),
        phone: core.str((req.body || {}).phone, 40),
        email: core.str((req.body || {}).email, 120),
        ren_no: core.str((req.body || {}).ren_no, 40),
        team: core.str((req.body || {}).team, 60),
        active: core.boolOf((req.body || {}).active, true)
      };
      if (!v.name) return invalid(res, { name: "required" });
      const row = await insertRow("lib_agents", v);
      await audit(req, "create", "agent", row.id, { name: row.name });
      res.status(201).json({ ok: true, row });
    } catch (e) {
      if (e && e.code === "23505") return res.status(409).json({ ok: false, error: "duplicate_agent" });
      next(e);
    }
  });

  r.patch("/agents/:id", requireWrite, async function (req, res, next) {
    try {
      const body = req.body || {};
      const v = {};
      for (const k of ["name", "phone", "email", "ren_no", "team"]) {
        if (body[k] !== undefined) v[k] = core.str(body[k], 120);
      }
      if (body.active !== undefined) v.active = core.boolOf(body.active, true);
      const row = await updateRow("lib_agents", req.params.id, v);
      if (!row) return res.status(404).json({ ok: false, error: "not_found" });
      res.json({ ok: true, row });
    } catch (e) { next(e); }
  });

  // ---------- 审计 ----------
  r.get("/audit", async function (req, res, next) {
    try {
      const pg = pager(req.query);
      const b = queryBuilder();
      if (req.query.entity) b.add("entity = ?", [req.query.entity]);
      if (req.query.action) b.add("action = ?", [req.query.action]);
      if (req.query.actor) b.add("actor = ?", [req.query.actor]);
      const where = b.where();
      const total = await pool.query("SELECT count(*)::int AS n FROM lib_audit" + where, b.args);
      const rows = await pool.query(
        `SELECT * FROM lib_audit${where} ORDER BY created_at DESC LIMIT $${b.args.length + 1} OFFSET $${b.args.length + 2}`,
        b.args.concat([pg.pageSize, pg.offset]));
      pageOut(res, rows.rows, total.rows[0].n, pg);
    } catch (e) { next(e); }
  });

  // ---------- 导出 ----------
  function exportRows(entity, rows) {
    return rows.map(function (row) {
      const out = {};
      for (const col of core.CSV_COLUMNS[entity]) out[col] = row[col] == null ? "" : row[col];
      return out;
    });
  }

  r.get("/export/:entity", async function (req, res, next) {
    try {
      const entity = String(req.params.entity);
      const lang = req.query.lang === "en" ? "en" : "zh";
      let rows = [];
      if (entity === "properties") {
        const out = await pool.query(`${PROPERTY_SELECT} ORDER BY p.id`);
        rows = out.rows.map((r) => ({
          ...numify(r),
          project: r.project_title || r.project_name || "",
          owner_name: r.owner_name || ""
        }));
      } else if (entity === "projects") {
        rows = (await pool.query("SELECT * FROM lib_projects ORDER BY id")).rows.map(numify);
      } else if (entity === "owners") {
        rows = (await pool.query("SELECT * FROM lib_owners ORDER BY id")).rows;
      } else if (entity === "clients") {
        rows = (await pool.query("SELECT * FROM lib_clients ORDER BY id")).rows.map(numify)
          .map((r) => ({ ...r, area_codes: (r.area_codes || []).join("|"), property_types: (r.property_types || []).join("|") }));
      } else if (entity === "deals") {
        rows = (await pool.query(`
          SELECT d.*, d.deal_on::text AS deal_on, d.price::float8 AS price,
                 d.commission_amount::float8 AS commission_amount, d.commission_rate::float8 AS commission_rate,
                 p.code AS property_code, c.name AS client_name
          FROM lib_deals d LEFT JOIN lib_properties p ON p.id=d.property_id
          LEFT JOIN lib_clients c ON c.id=d.client_id ORDER BY d.id`)).rows;
      } else if (entity === "viewings") {
        rows = (await pool.query(`
          SELECT v.*, v.scheduled_on::text AS scheduled_on, p.code AS property_code, c.name AS client_name
          FROM lib_viewings v LEFT JOIN lib_properties p ON p.id=v.property_id
          LEFT JOIN lib_clients c ON c.id=v.client_id ORDER BY v.id`)).rows;
      } else {
        return res.status(404).json({ ok: false, error: "not_found" });
      }
      const cols = core.CSV_COLUMNS[entity].slice();
      const labels = [];
      if (entity === "properties" || entity === "projects") {
        labels.push(["area_code_label", "areas"], ["property_type_label", "property_types"], ["tenure_label", "tenures"]);
      }
      if (entity === "properties") {
        labels.push(["status_label", "listing_statuses"], ["intent_label", "listing_intents"]);
      }
      if (entity === "clients") {
        labels.push(["status_label", "client_statuses"], ["intent_label", "client_intents"]);
      }
      for (const [col, list] of labels) {
        cols.push(col);
        for (const row of rows) row[col] = tax.labelOf(list, row[col.replace("_label", "")], lang);
      }
      const csv = core.toCsv(cols, exportRows(entity, rows));
      await audit(req, "export", entity, null, { rows: rows.length });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="propbase-${entity}-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csv);
    } catch (e) { next(e); }
  });

  r.get("/export/:entity/template", function (req, res) {
    const entity = String(req.params.entity);
    const cols = core.CSV_COLUMNS[entity];
    if (!cols) return res.status(404).json({ ok: false, error: "not_found" });
    const example = {
      properties: { project: "Taman Sutera Utama", area_code: "sutera_utama", property_type: "terrace",
        tenure: "freehold", block: "A", unit_no: "12-03", built_up: "1200", bedrooms: "4", bathrooms: "3",
        intent: "sale", asking_price: "780000", status: "available", agent: "Andy", listed_on: "2026-10-01" },
      projects: { name: "Sutera Utama Phase 3", area_code: "sutera_utama", property_type: "terrace",
        tenure: "freehold", total_units: "240", completion_year: "2018" },
      owners: { name: "Tan Ah Kow", phone: "012-000 0000", source: "referral" },
      clients: { name: "Lee Mei", phone: "012-000 0000", intent: "buy", budget_min: "600000",
        budget_max: "800000", area_codes: "sutera_utama|skudai", status: "new" },
      deals: { property_code: "KT-0001", kind: "sale", price: "780000", commission_rate: "3", deal_on: "2026-10-20" },
      viewings: { property_code: "KT-0001", agent: "Andy", scheduled_on: "2026-10-28", scheduled_time: "15:00" }
    }[entity] || {};
    const csv = core.toCsv(cols, [example]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="template-${entity}.csv"`);
    res.send(csv);
  });

  // ---------- 导入 ----------
  r.post("/import", requireWrite, async function (req, res, next) {
    try {
      const body = req.body || {};
      const entity = String(body.entity || "properties");
      const mode = body.mode === "commit" ? "commit" : "preview";
      const csv = String(body.csv || "");
      const cols = core.CSV_COLUMNS[entity];
      if (!cols) return invalid(res, { entity: "invalid_choice" });
      const parsed = core.parseCsv(csv);
      if (!parsed.rows.length) return invalid(res, { csv: "empty" });
      if (parsed.rows.length > 2000) return invalid(res, { csv: "too_many_rows" });

      const results = [];
      let okCount = 0;
      for (let i = 0; i < parsed.rows.length; i++) {
        const raw = parsed.rows[i];
        const row = { ...raw };
        let n, extra = "";
        if (entity === "properties") {
          // 项目名 → project_id
          if (row.project && !row.project_id) {
            const found = await pool.query("SELECT id FROM lib_projects WHERE lower(name)=lower($1) OR lower(name_zh)=lower($1) LIMIT 1", [row.project]);
            if (found.rows[0]) row.project_id = found.rows[0].id;
            else row.project_name = row.project;
          }
          if (row.owner_name) {
            const found = await pool.query(
              "SELECT id FROM lib_owners WHERE ($2 <> '' AND phone=$2) OR lower(name)=lower($1) ORDER BY (phone=$2) DESC NULLS LAST LIMIT 1",
              [row.owner_name, core.str(row.owner_phone, 40) || ""]);
            if (found.rows[0]) row.owner_id = found.rows[0].id;
            else extra = "owner_new";
          }
          n = core.normalizeProperty(row, { partial: false });
          n.values.intent = n.values.intent || "sale";
          n.values.status = n.values.status || "available";
        } else if (entity === "projects") {
          n = core.normalizeProject(row, { partial: false });
        } else if (entity === "owners") {
          n = core.normalizeOwner(row, { partial: false });
        } else if (entity === "clients") {
          row.area_codes = String(row.area_codes || "").split(/[|,]/).filter(Boolean);
          row.property_types = String(row.property_types || "").split(/[|,]/).filter(Boolean);
          n = core.normalizeClient(row, { partial: false });
          n.values.status = n.values.status || "new";
        } else if (entity === "deals") {
          if (row.property_code) {
            const found = await pool.query("SELECT id FROM lib_properties WHERE code=$1", [row.property_code]);
            if (found.rows[0]) row.property_id = found.rows[0].id;
            else n = { errors: { property_code: "not_found" }, values: {} };
          }
          if (row.client_name) {
            const found = await pool.query("SELECT id FROM lib_clients WHERE lower(name)=lower($1) LIMIT 1", [row.client_name]);
            if (found.rows[0]) row.client_id = found.rows[0].id;
          }
          if (!n) n = core.normalizeDeal(row, { partial: false });
        } else if (entity === "viewings") {
          if (row.property_code) {
            const found = await pool.query("SELECT id FROM lib_properties WHERE code=$1", [row.property_code]);
            if (found.rows[0]) row.property_id = found.rows[0].id;
            else n = { errors: { property_code: "not_found" }, values: {} };
          }
          if (row.client_name) {
            const found = await pool.query("SELECT id FROM lib_clients WHERE lower(name)=lower($1) LIMIT 1", [row.client_name]);
            if (found.rows[0]) row.client_id = found.rows[0].id;
          }
          if (!n) n = core.normalizeViewing(row, { partial: false });
        }

        const errors = n.errors || {};
        if (Object.keys(errors).length) {
          results.push({ line: i + 2, status: "error", errors, data: raw });
          continue;
        }
        okCount++;
        if (mode === "commit") {
          try {
            if (entity === "properties" && row.owner_name && !row.owner_id) {
              const owner = await insertRow("lib_owners", {
                name: core.str(row.owner_name, 100), phone: core.str(row.owner_phone, 40), source: "other"
              });
              n.values.owner_id = owner.id;
            }
            n.values.created_by = req.admin.email;
            await insertRow("lib_" + entity, n.values);
            results.push({ line: i + 2, status: "ok", data: raw });
          } catch (err) {
            const code = err && err.code === "23505"
              ? (entity === "properties" ? "duplicate_unit" : "duplicate_row")
              : "insert_failed";
            results.push({ line: i + 2, status: "error", errors: { _: code }, data: raw });
          }
        } else {
          results.push({ line: i + 2, status: "ok", data: raw });
        }
      }
      if (mode === "commit") {
        await audit(req, "import", entity, null, { rows: parsed.rows.length, ok: okCount });
      }
      res.json({
        ok: true, mode, entity, total: parsed.rows.length, valid: okCount,
        invalid: parsed.rows.length - okCount,
        headers: parsed.headers, unknownHeaders: parsed.headers.filter((h) => cols.indexOf(h) < 0),
        rows: results.slice(0, 200)
      });
    } catch (e) { next(e); }
  });

  // ---------- 演示数据 ----------
  r.post("/demo", requireWrite, async function (req, res, next) {
    try {
      const exist = await pool.query("SELECT count(*)::int AS n FROM lib_properties WHERE is_demo=true");
      if (exist.rows[0].n > 0) return res.json({ ok: true, skipped: true, count: exist.rows[0].n });
      const today = new Date().toISOString().slice(0, 10);
      const projects = [
        { name: "Sutera Utama Residence", name_zh: "五福城公寓", developer: "S P Setia", area_code: "sutera_utama",
          tenure: "freehold", property_type: "condo", total_units: 480, blocks: 2, completion_year: 2017,
          facilities: "泳池 / 健身房 / 保安 / 儿童游乐场" },
        { name: "Austin Heights Phase 2", name_zh: "奥斯汀高原二期", developer: "Austin Heights Sdn Bhd", area_code: "austin_heights",
          tenure: "freehold", property_type: "terrace", total_units: 320, completion_year: 2015, facilities: "围篱社区 / 24 小时保安" },
        { name: "Bukit Indah Avenue", name_zh: "武吉英达", developer: "SP Setia", area_code: "bukit_indah",
          tenure: "freehold", property_type: "terrace", total_units: 260, completion_year: 2012, facilities: "公园 / 近 AEON" },
        { name: "Danga Bay Seaview", name_zh: "金海湾海景公寓", developer: "Danga Bay Sdn Bhd", area_code: "danga_bay",
          tenure: "freehold", property_type: "condo", total_units: 900, blocks: 3, completion_year: 2016, facilities: "海景 / 泳池 / 健身房" },
        { name: "Setia Tropika Business Park", name_zh: "Setia Tropika 商铺", developer: "SP Setia", area_code: "setia_tropika",
          tenure: "freehold", property_type: "shoplot", total_units: 120, completion_year: 2014, facilities: "商圈 / 停车位" }
      ];
      const ids = {};
      for (const p of projects) {
        const row = await insertRow("lib_projects", p);
        ids[p.name] = row.id;
      }
      const owners = [
        { name: "Tan Ah Kow", phone: "012-000 0001", source: "referral" },
        { name: "Lim Siew Mei", phone: "012-000 0002", source: "existing" },
        { name: "Ng Wei Jie", phone: "012-000 0003", source: "walk_in" }
      ];
      const ownerIds = [];
      for (const o of owners) ownerIds.push((await insertRow("lib_owners", o)).id);
      const props = [
        { project_id: ids["Sutera Utama Residence"], area_code: "sutera_utama", property_type: "condo", tenure: "freehold",
          block: "A", unit_no: "08-03", floor: 8, built_up: 1150, bedrooms: 3, bathrooms: 2, carparks: 2, furnishing: "partial",
          condition: "good", intent: "sale", asking_price: 720000, owner_id: ownerIds[0], agent: "Andy", listed_on: today,
          tags: ["near_mall", "gated"] },
        { project_id: ids["Sutera Utama Residence"], area_code: "sutera_utama", property_type: "condo", tenure: "freehold",
          block: "B", unit_no: "12-01", floor: 12, built_up: 1480, bedrooms: 4, bathrooms: 3, carparks: 2, furnishing: "full",
          condition: "renovated", intent: "sale", asking_price: 980000, owner_id: ownerIds[1], agent: "Andy", listed_on: today,
          tags: ["high_floor", "renovated"] },
        { project_id: ids["Austin Heights Phase 2"], area_code: "austin_heights", property_type: "terrace", tenure: "freehold",
          unit_no: "32", built_up: 2200, land_area: 1600, bedrooms: 4, bathrooms: 3, carparks: 2, furnishing: "unfurnished",
          condition: "good", intent: "sale", asking_price: 880000, owner_id: ownerIds[2], agent: "Andy", listed_on: today,
          tags: ["gated", "security"] },
        { project_id: ids["Bukit Indah Avenue"], area_code: "bukit_indah", property_type: "terrace", tenure: "freehold",
          unit_no: "18", built_up: 1800, land_area: 1400, bedrooms: 4, bathrooms: 3, carparks: 2, furnishing: "partial",
          condition: "good", intent: "sale", asking_price: 760000, owner_id: ownerIds[0], agent: "Teik", listed_on: today },
        { project_id: ids["Danga Bay Seaview"], area_code: "danga_bay", property_type: "condo", tenure: "freehold",
          block: "C", unit_no: "21-05", floor: 21, built_up: 1050, bedrooms: 3, bathrooms: 2, carparks: 2, furnishing: "full",
          condition: "new", intent: "rent", rent_price: 3200, owner_id: ownerIds[1], agent: "Andy", listed_on: today,
          tags: ["sea_view", "high_floor"] },
        { project_id: ids["Danga Bay Seaview"], area_code: "danga_bay", property_type: "condo", tenure: "freehold",
          block: "C", unit_no: "18-02", floor: 18, built_up: 980, bedrooms: 3, bathrooms: 2, carparks: 1, furnishing: "partial",
          condition: "good", intent: "rent", rent_price: 2800, owner_id: ownerIds[2], agent: "Teik", listed_on: today },
        { project_id: ids["Setia Tropika Business Park"], area_code: "setia_tropika", property_type: "shoplot", tenure: "freehold",
          unit_no: "12", built_up: 2400, land_area: 1800, bedrooms: 0, bathrooms: 2, carparks: 4, furnishing: "unfurnished",
          condition: "good", intent: "sale", asking_price: 1350000, owner_id: ownerIds[1], agent: "Andy", listed_on: today },
        { project_id: ids["Austin Heights Phase 2"], area_code: "austin_heights", property_type: "terrace", tenure: "freehold",
          unit_no: "45", built_up: 2400, land_area: 1800, bedrooms: 5, bathrooms: 4, carparks: 2, furnishing: "unfurnished",
          condition: "renovated", intent: "sale", asking_price: 1050000, owner_id: ownerIds[0], agent: "Teik", listed_on: today,
          status: "sold" },
        { project_id: ids["Bukit Indah Avenue"], area_code: "bukit_indah", property_type: "terrace", tenure: "freehold",
          unit_no: "22", built_up: 1900, land_area: 1500, bedrooms: 4, bathrooms: 3, carparks: 2, furnishing: "partial",
          condition: "good", intent: "sale", asking_price: 820000, owner_id: ownerIds[2], agent: "Andy", listed_on: today,
          status: "reserved", tags: ["near_school", "gated"] }
      ];
      for (const p of props) {
        await insertRow("lib_properties", { ...p, is_demo: true, created_by: req.admin.email });
      }
      const clients = [
        { name: "陈先生", phone: "012-000 0101", intent: "buy", budget_min: 600000, budget_max: 800000,
          area_codes: ["sutera_utama", "skudai"], property_types: ["condo"], bedrooms_min: 3, timeline: "3m",
          source: "referral", status: "active", agent: "Andy" },
        { name: "Ms. Wong", phone: "012-000 0102", intent: "buy", budget_min: 800000, budget_max: 1100000,
          area_codes: ["austin_heights"], property_types: ["terrace"], bedrooms_min: 4, timeline: "now",
          source: "social", status: "viewing", agent: "Andy" },
        { name: "Mr. Raj", phone: "012-000 0103", intent: "rent", budget_min: 2500, budget_max: 3500,
          area_codes: ["danga_bay", "jb_city"], property_types: ["condo"], bedrooms_min: 3, timeline: "now",
          source: "portal", status: "new", agent: "Teik" }
      ];
      const clientIds = [];
      for (const c of clients) clientIds.push((await insertRow("lib_clients", c)).id);
      const allProps = (await pool.query("SELECT id, code, status FROM lib_properties WHERE is_demo=true ORDER BY id")).rows;
      await insertRow("lib_viewings", { property_id: allProps[0].id, client_id: clientIds[0], agent: "Andy",
        scheduled_on: today, scheduled_time: "15:00", status: "scheduled" });
      await insertRow("lib_viewings", { property_id: allProps[2].id, client_id: clientIds[1], agent: "Andy",
        scheduled_on: today, scheduled_time: "11:00", status: "done", feedback: "喜欢，等家人再看一次" });
      await insertRow("lib_deals", { property_id: allProps[7].id, client_id: clientIds[1], kind: "sale",
        price: 1020000, deal_on: today, commission_rate: 3, commission_amount: 30600, agent: "Teik", status: "completed" });
      await audit(req, "demo", "property", null, { properties: props.length });
      res.json({ ok: true, projects: projects.length, properties: props.length, owners: owners.length, clients: clients.length });
    } catch (e) { next(e); }
  });

  r.delete("/demo", requireWrite, async function (req, res, next) {
    try {
      const out = await pool.query("DELETE FROM lib_properties WHERE is_demo=true RETURNING id");
      await pool.query("DELETE FROM lib_clients WHERE phone LIKE '012-000 01%'");
      await pool.query("DELETE FROM lib_owners WHERE phone LIKE '012-000 00%'");
      await pool.query("DELETE FROM lib_projects WHERE name IN ('Sutera Utama Residence','Austin Heights Phase 2','Bukit Indah Avenue','Danga Bay Seaview','Setia Tropika Business Park')");
      await audit(req, "demo", "property", null, { removed: out.rowCount });
      res.json({ ok: true, removed: out.rowCount });
    } catch (e) { next(e); }
  });

  return r;
};
