"use strict";
// news.js — RoofX 每日房产新闻：抓取 RSS、翻译三语、入库、定时更新
const express = require("express");
const https = require("node:https");

const FEEDS = [
  "https://news.google.com/rss/search?q=Johor+property+OR+housing+OR+%22real+estate%22+(site:thestar.com.my+OR+site:theedgemalaysia.com+OR+site:malaymail.com+OR+site:nst.com.my+OR+site:bernama.com+OR+site:freemalaysiatoday.com)&hl=en-MY&gl=MY&ceid=MY:en",
  "https://news.google.com/rss/search?q=Iskandar+Johor+OR+%22Johor+Bahru%22+property+(site:thestar.com.my+OR+site:theedgemalaysia.com+OR+site:malaymail.com+OR+site:nst.com.my+OR+site:bernama.com)&hl=en-MY&gl=MY&ceid=MY:en",
  "https://news.google.com/rss/search?q=Malaysia+property+market+(site:thestar.com.my+OR+site:theedgemalaysia.com+OR+site:malaymail.com+OR+site:nst.com.my+OR+site:bernama.com)&hl=en-MY&gl=MY&ceid=MY:en"
];
// 只允许正规新闻媒体；排除房源平台与中介帖
const ALLOW_SOURCE = /the star|thestar|the edge|theedgemalaysia|malay mail|new straits|nst|bernama|free malaysia today|fmt|malaysian reserve|business times|reuters|bloomberg|channel news asia|cna|the sun|sinar harian|utusan|harian metro|nikkei|financial times/i;
const BLOCK_URL = /edgeprop|propertyguru|mudah\.my|iproperty|99\.co|ohmyhome|brickz|propsocial|roomster|estateagent|realestate\.com|agent/i;
const BLOCK_TITLE = /(for sale|for rent|@\s|service residence|new launch|show unit|open for viewing|book a viewing)/i;
const RELEVANT = /(propert|real estate|housing|condo|apartment|residence|landed|rental|tenant|developer|Iskandar|\bRTS\b|Johor Bahru|high-rise|industrial|warehous|\bmall\b)/i;
const CONTEXT = /(Johor|Iskandar|\bJB\b|Malaysia|Kuala Lumpur|Selangor|Penang|Singapore|\bRTS\b)/i;

function dayMYT() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function get(url, timeout) {
  return new Promise(function (resolve, reject) {
    const req = https.get(url, { headers: { "User-Agent": "RoofX-News/1.0" }, timeout: timeout || 12000 }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return get(res.headers.location, timeout).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      let d = ""; res.setEncoding("utf8");
      res.on("data", function (c) { if (d.length < 500000) d += c; });
      res.on("end", function () { resolve(d); });
    });
    req.on("timeout", function () { req.destroy(new Error("timeout")); });
    req.on("error", reject);
  });
}

function clean(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();
}

function parseRss(xml) {
  const out = [];
  const items = xml.match(/<item[\s\S]*?<\/item>/g) || [];
  for (const raw of items) {
    const t = (raw.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1];
    const l = (raw.match(/<link[^>]*>([\s\S]*?)<\/link>/) || [])[1];
    const p = (raw.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/) || [])[1];
    const d = (raw.match(/<description[^>]*>([\s\S]*?)<\/description>/) || [])[1];
    const src = (raw.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1];
    const title = clean(t), url = clean(l);
    if (!title || !url) continue;
    const published = p ? new Date(p) : new Date();
    const cleanTitle = title.replace(/\s+-\s+[^-]{2,40}$/, "").trim();
    out.push({ title: cleanTitle, url: url, summary: clean(d).slice(0, 260), source: clean(src) || "News", published_at: isNaN(published) ? new Date() : published });
  }
  return out;
}

async function fetchAll() {
  const seen = new Set(), all = [];
  for (const feed of FEEDS) {
    try {
      const xml = await get(feed);
      for (const it of parseRss(xml)) {
        if (!ALLOW_SOURCE.test(it.source) && !ALLOW_SOURCE.test(it.url)) continue;
        if (BLOCK_URL.test(it.url) || BLOCK_TITLE.test(it.title)) continue;
        if (!RELEVANT.test(it.title) || !CONTEXT.test(it.title)) continue;
        const key = it.title.toLowerCase().replace(/\s+/g, " ").trim();
        if (seen.has(key)) continue;
        seen.add(key); all.push(it);
      }
    } catch (e) { console.error("news feed failed", feed, e.message); }
  }
  all.sort(function (a, b) { return b.published_at - a.published_at; });
  return all.slice(0, 12);
}

function aiTranslate(items) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key || !items.length) return Promise.resolve(items);
  const payload = items.map(function (x) { return { title: x.title, summary: x.summary }; });
  const body = JSON.stringify({
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat", temperature: 0.2, response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You translate Malaysian property news into Simplified Chinese and Malay. Return JSON object {\"items\":[{\"title_zh\",\"summary_zh\",\"title_bm\",\"summary_bm\"}]} in the same order. Keep names, places, numbers accurate; concise." },
      { role: "user", content: JSON.stringify(payload) }
    ]
  });
  return new Promise(function (resolve) {
    const req = https.request({ hostname: "api.deepseek.com", path: "/chat/completions", method: "POST", timeout: 45000, headers: { "Content-Type": "application/json", Authorization: "Bearer " + key, "Content-Length": Buffer.byteLength(body) } }, function (res) {
      let d = ""; res.on("data", function (c) { d += c; });
      res.on("end", function () {
        try {
          const j = JSON.parse(d);
          const arr = JSON.parse(j.choices[0].message.content).items || [];
          items.forEach(function (it, i) { const a = arr[i] || {}; it.title_zh = clean(a.title_zh) || it.title; it.summary_zh = clean(a.summary_zh) || it.summary; it.title_bm = clean(a.title_bm) || it.title; it.summary_bm = clean(a.summary_bm) || it.summary; });
        } catch (e) { console.error("news translate failed", e.message); }
        resolve(items);
      });
    });
    req.on("timeout", function () { req.destroy(); resolve(items); });
    req.on("error", function () { resolve(items); });
    req.write(body); req.end();
  });
}

async function refresh(pool) {
  const items = await fetchAll();
  if (!items.length) return { ok: false, inserted: 0 };
  await aiTranslate(items);
  const day = dayMYT();
  await pool.query("DELETE FROM news_items WHERE day = $1", [day]).catch(function () {});
  let n = 0;
  for (const it of items) {
    try {
      await pool.query(
        `INSERT INTO news_items (url, source, title, summary, title_zh, summary_zh, title_bm, summary_bm, published_at, day)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (url) DO UPDATE SET source=EXCLUDED.source, title=EXCLUDED.title, summary=EXCLUDED.summary,
           title_zh=EXCLUDED.title_zh, summary_zh=EXCLUDED.summary_zh, title_bm=EXCLUDED.title_bm, summary_bm=EXCLUDED.summary_bm,
           published_at=EXCLUDED.published_at, day=EXCLUDED.day`,
        [it.url, it.source, it.title, it.summary, it.title_zh || it.title, it.summary_zh || it.summary, it.title_bm || it.title, it.summary_bm || it.summary, it.published_at, day]
      );
      n++;
    } catch (e) { console.error("news insert failed", e.message); }
  }
  await pool.query("DELETE FROM news_items WHERE source ~* 'edgeprop|propertyguru|mudah|iproperty|99\\.co|ohmyhome|brickz|propsocial' OR url ~* 'edgeprop|propertyguru|mudah|iproperty|99\\.co|ohmyhome|brickz|propsocial'").catch(function () {});
  await pool.query("DELETE FROM news_items WHERE day < CURRENT_DATE - INTERVAL '30 days'").catch(function () {});
  return { ok: true, inserted: n, day: day };
}

function pick(row, lang) {
  const zh = lang === "zh", bm = lang === "bm";
  return {
    url: row.url, source: row.source, published_at: row.published_at,
    title: zh ? (row.title_zh || row.title) : bm ? (row.title_bm || row.title) : row.title,
    summary: zh ? (row.summary_zh || row.summary) : bm ? (row.summary_bm || row.summary) : row.summary,
    day: row.day
  };
}

function createNewsApi({ pool }) {
  const r = express.Router();
  r.get("/", function (req, res) {
    const lang = ["zh", "en", "bm"].includes(req.query.lang) ? req.query.lang : "zh";
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const day = dayMYT();
    pool.query("SELECT * FROM news_items WHERE day = $1 ORDER BY published_at DESC LIMIT $2", [day, limit]).then(function (q) {
      if (q.rows.length) return { rows: q.rows, day: day, today: true };
      return pool.query("SELECT * FROM news_items ORDER BY day DESC, published_at DESC LIMIT $1", [limit]).then(function (q2) {
        return { rows: q2.rows, day: q2.rows[0] ? q2.rows[0].day : null, today: false };
      });
    }).then(function (out) {
      res.setHeader("Cache-Control", "public, max-age=120");
      res.json({ ok: true, day: out.day, today: out.today, items: out.rows.map(function (x) { return pick(x, lang); }) });
    }).catch(function (e) { res.status(500).json({ ok: false, error: e.message }); });
  });
  return r;
}

async function startScheduler(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS news_items (
    id bigserial PRIMARY KEY, url text UNIQUE NOT NULL, source text, title text, summary text,
    title_zh text, summary_zh text, title_bm text, summary_bm text,
    published_at timestamptz, day date NOT NULL, created_at timestamptz DEFAULT now())`).catch(function (e) { console.error("news table", e.message); });
  const run = function () { refresh(pool).then(function (r) { console.log("news refreshed", JSON.stringify(r)); }).catch(function (e) { console.error("news refresh", e.message); }); };
  run();
  const tick = function () {
    const now = new Date();
    const myt = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }));
    const next = new Date(myt); next.setHours(6, 30, 0, 0);
    if (next <= myt) next.setDate(next.getDate() + 1);
    setTimeout(function () { run(); tick(); }, Math.max(60000, next - myt));
  };
  tick();
}

module.exports = { createNewsApi, startScheduler, refresh };
