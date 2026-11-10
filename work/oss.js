"use strict";
/* Aliyun OSS direct upload (Signature V1), no SDK dependency.
   Env:
   OSS_REGION, OSS_BUCKET, OSS_ENDPOINT (internal), OSS_PUBLIC_BASE,
   OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET
*/
const https = require("https");
const crypto = require("crypto");

function cfg() {
  return {
    bucket: process.env.OSS_BUCKET || "",
    endpoint: process.env.OSS_ENDPOINT || "",
    publicBase: (process.env.OSS_PUBLIC_BASE || "").replace(/\/+$/, ""),
    id: process.env.OSS_ACCESS_KEY_ID || "",
    secret: process.env.OSS_ACCESS_KEY_SECRET || ""
  };
}
function enabled() {
  const c = cfg();
  return !!(c.bucket && c.endpoint && c.publicBase && c.id && c.secret);
}
function endpointHost() {
  try { return new URL(cfg().endpoint).host; } catch (e) { return ""; }
}
function encodeKey(key) {
  return String(key).replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
}
function sign(method, key, contentType, date, acl) {
  const c = cfg();
  const headers = acl ? "x-oss-object-acl:public-read\n" : "";
  const resource = "/" + c.bucket + "/" + key;
  const text = [method, "", contentType, date, headers + resource].join("\n");
  return crypto.createHmac("sha1", c.secret).update(text).digest("base64");
}
function request(method, key, body, contentType, acl) {
  return new Promise(function (resolve, reject) {
    const c = cfg();
    const host = c.bucket + "." + endpointHost();
    const date = new Date().toUTCString();
    const auth = sign(method, key, contentType || "", date, acl);
    const headers = {
      "Date": date,
      "Content-Type": contentType || "",
      "Authorization": "OSS " + c.id + ":" + auth
    };
    if (body) headers["Content-Length"] = body.length;
    if (acl) headers["x-oss-object-acl"] = "public-read";
    const req = https.request({
      method: method, hostname: host, path: "/" + encodeKey(key),
      headers: headers, timeout: 30000
    }, function (res) {
      let out = "";
      res.on("data", function (d) { out += d; });
      res.on("end", function () {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve({ status: res.statusCode });
        reject(new Error("oss_" + res.statusCode + " " + out.slice(0, 180)));
      });
    });
    req.on("timeout", function () { req.destroy(new Error("oss_timeout")); });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
async function putImage(key, buffer, contentType) {
  if (!enabled()) throw new Error("oss_disabled");
  await request("PUT", key, buffer, contentType || "application/octet-stream", true);
  return cfg().publicBase + "/" + encodeKey(key);
}
async function remove(key) {
  if (!enabled()) return;
  try { await request("DELETE", key, null, "", false); } catch (e) { console.error("oss delete failed", key, e.message); }
}
function isOssUrl(url) {
  const c = cfg();
  return !!(c.publicBase && typeof url === "string" && url.indexOf(c.publicBase + "/") === 0);
}
function keyFromUrl(url) {
  const c = cfg();
  if (!isOssUrl(url)) return "";
  return decodeURIComponent(url.slice(c.publicBase.length + 1).split("?")[0]);
}
async function removeVariants(url) {
  const key = keyFromUrl(url);
  if (!key) return;
  const keys = [key];
  if (/\.jpg$/i.test(key)) {
    const base = key.replace(/\.jpg$/i, "");
    keys.push(base + "_t.jpg", key.replace(/\.jpg$/i, ".webp"), base + "_t.webp");
  }
  for (const k of keys) await remove(k);
}
module.exports = { enabled, putImage, remove, removeVariants, isOssUrl, keyFromUrl };
