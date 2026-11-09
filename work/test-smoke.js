"use strict";
// 线上烟雾测试：关键页面 + 多语 API + 登录入口
const BASE = process.env.SMOKE_BASE || "https://kwongthye.com";
const pages = ["/", "/pool/", "/news/", "/agents/", "/join/", "/about/", "/p/AndyLauProperty-0027", "/a/andy-lau-property", "/agent/"];
let fail = 0;

async function get(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "user-agent": "RoofX-smoke/1" } });
  return { status: r.status, text: await r.text() };
}
(async () => {
  for (const p of pages) {
    try {
      const r = await get(BASE + p);
      if (r.status !== 200 || !/<\/html>/i.test(r.text)) { console.error("✗ " + p + " status " + r.status); fail++; }
      else console.log("✓ " + p);
    } catch (e) { console.error("✗ " + p + " " + e.message); fail++; }
  }
  try {
    const r = await get(BASE + "/api/public/news?lang=bm&limit=1");
    const j = JSON.parse(r.text);
    const t = (j.items && j.items[0] && j.items[0].title) || "";
    if (!j.ok || !t || /[\u4e00-\u9fff]/.test(t)) { console.error("✗ news bm untranslated"); fail++; }
    else console.log("✓ news bm translated");
  } catch (e) { console.error("✗ news bm " + e.message); fail++; }
  try {
    const r = await get(BASE + "/");
    if (!r.text.includes("mobile-login") || !r.text.includes("lang3.js?v=")) { console.error("✗ homepage login/lang assets"); fail++; }
    else console.log("✓ homepage login/lang assets");
  } catch (e) { console.error("✗ homepage " + e.message); fail++; }
  console.log(fail ? "\nSMOKE FAIL " + fail : "\nSMOKE PASS");
  process.exit(fail ? 1 : 0);
})();
