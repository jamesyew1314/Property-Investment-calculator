"use strict";
// test-library.js — 资料库纯函数回归（不需要数据库）
// 运行：node work/test-library.js

const core = require("./library-core");
const tax = require("./library-taxonomy");

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("✗ " + label + (extra ? "  → " + JSON.stringify(extra) : "")); }
}
function eq(a, b, label) { ok(JSON.stringify(a) === JSON.stringify(b), label, { got: a, want: b }); }

// ---------- 数字 / 金额 ----------
eq(core.money("RM 1,200,000.50"), 1200000.5, "money 解析 RM 前缀与千分位");
eq(core.money("780000"), 780000, "money 纯数字");
eq(core.money("-5"), null, "money 拒绝负数");
eq(core.money("abc"), null, "money 拒绝文本");
eq(core.money("3,200"), 3200, "money 租金千分位");
eq(core.whole("12"), 12, "whole 整数");
eq(core.whole("12.5"), null, "whole 拒绝小数");
eq(core.decimal("1150.456"), 1150.46, "decimal 两位四舍五入");
eq(core.toNum("1 200"), 1200, "toNum 去空格");

// ---------- 日期 / 时间 ----------
eq(core.dateOf("2026-10-27"), "2026-10-27", "date ISO");
eq(core.dateOf("27/10/2026"), "2026-10-27", "date 日/月/年");
eq(core.dateOf("2026/1/5"), "2026-01-05", "date 补零");
eq(core.dateOf("hello"), null, "date 拒绝乱码");
eq(core.timeOf("9:05"), "09:05", "time 补零");
eq(core.timeOf("25:00"), null, "time 拒绝 25 点");

// ---------- 枚举 ----------
eq(core.enumOf("listing_statuses", "available"), "available", "enum 合法");
eq(core.enumOf("listing_statuses", "bogus"), null, "enum 非法");
eq(core.listOfEnums("areas", "sutera_utama, skudai ,bogus"), ["sutera_utama", "skudai"], "listOfEnums 过滤非法与去重");

// ---------- 楼盘 ----------
{
  const n = core.normalizeProject({ name: "  ", area_code: "skudai" }, { partial: false });
  eq(n.errors.name, "required", "楼盘必填名称");
}
{
  const n = core.normalizeProject({ name: "Sutera Utama Residence", area_code: "sutera_utama", total_units: "480" }, { partial: false });
  eq(n.errors, {}, "楼盘合法无错误");
  eq(n.values.total_units, 480, "楼盘单位数转数字");
}
{
  const n = core.normalizeProject({ area_code: "nowhere" }, { partial: true });
  eq(n.errors.area_code, "invalid_choice", "楼盘区域非法");
}

// ---------- 房源 ----------
{
  const n = core.normalizeProperty({
    project_name: "Taman Sutera", area_code: "sutera_utama", property_type: "terrace", tenure: "freehold",
    block: "A", unit_no: "12-03", built_up: "1,200", land_area: "1,400", bedrooms: "4", bathrooms: "3",
    intent: "sale", asking_price: "RM 780,000", status: "available", listed_on: "2026-10-01",
    tags: "gated,high_floor"
  }, { partial: false });
  eq(n.errors, {}, "房源合法无错误");
  eq(n.values.asking_price, 780000, "房源价格解析");
  eq(n.values.built_up, 1200, "房源面积解析");
  eq(n.values.tags, ["gated", "high_floor"], "房源标签数组");
  eq(n.values.listed_on, "2026-10-01", "房源日期归一");
}
{
  const n = core.normalizeProperty({ asking_price: "-1", bedrooms: "abc", status: "nope" }, { partial: true });
  eq(n.errors.asking_price, "invalid_number", "房源负价格报错");
  eq(n.errors.bedrooms, "invalid_number", "房源房数非数字报错");
  eq(n.errors.status, "invalid_choice", "房源状态非法报错");
}
{
  const n = core.normalizeProperty({ built_up: 1000, land_area: 30000 }, { partial: true });
  eq(n.errors.land_area, "range_order", "土地面积大于建筑面积 20 倍时拦截");
}

// ---------- 客户 ----------
{
  const n = core.normalizeClient({ name: "陈先生", intent: "buy", budget_min: 900000, budget_max: 800000,
    area_codes: ["sutera_utama", "bogus"], status: "active" }, { partial: false });
  eq(n.errors.budget_max, "range_order", "客户预算下限大于上限报错");
  eq(n.values.area_codes, ["sutera_utama"], "客户区域过滤非法值");
}

// ---------- 带看 / 成交 ----------
{
  const n = core.normalizeViewing({ property_id: 3, scheduled_on: "28-10-2026", scheduled_time: "3:30pm" }, { partial: false });
  eq(n.values.scheduled_on, "2026-10-28", "带看日期");
  eq(n.values.scheduled_time, null, "带看时间非法留空");
}
{
  const n = core.normalizeViewing({}, { partial: false });
  eq(n.errors.property_id, "required", "带看必须有房源");
}
{
  const n = core.normalizeDeal({ price: "1,020,000", commission_rate: "3" }, { partial: false });
  eq(n.values.commission_amount, 30600, "成交佣金自动计算");
}
eq(core.commission(780000, 3), 23400, "commission 3%");
eq(core.commission(3200, 50), 1600, "commission 半个月租金");

// ---------- 去重键 ----------
eq(core.dupeKey({ project_id: 5, block: "A", unit_no: "12-03" }), "5|a|12-03", "去重键归一");
eq(core.dupeKey({ project_id: 5, unit_no: "  " }), null, "无单位号不去重");

// ---------- CSV ----------
{
  const parsed = core.parseCsv('\uFEFFcode,project,asking_price\r\nKT-0001,"Sutera, Utama",780000\r\nKT-0002,"He said ""hi""",900000\r\n');
  eq(parsed.headers, ["code", "project", "asking_price"], "CSV 表头");
  eq(parsed.rows.length, 2, "CSV 行数");
  eq(parsed.rows[0].project, "Sutera, Utama", "CSV 引号内逗号");
  eq(parsed.rows[1].project, 'He said "hi"', "CSV 双引号转义");
}
{
  const csv = core.toCsv(["a", "b"], [{ a: "x,y", b: 'q"z' }]);
  ok(csv.startsWith("\uFEFF"), "CSV 带 BOM（Excel 中文不乱码）");
  ok(csv.indexOf('"x,y"') > 0, "CSV 逗号加引号");
  ok(csv.indexOf('"q""z"') > 0, "CSV 引号转义");
}
{
  const csv = core.toCsv(core.CSV_COLUMNS.properties, [{}]);
  ok(csv.split("\r\n")[0].indexOf("unit_no") > 0, "房源模板列完整");
}

// ---------- 分页 / 排序 ----------
eq(core.paging({ page: "0", pageSize: "999" }), { page: 1, pageSize: 200, offset: 0 }, "分页夹紧");
eq(core.paging({ page: "3", pageSize: "25" }).offset, 50, "分页偏移");
eq(core.sortOf({ sort: "asking_price", dir: "asc" }, { asking_price: "p.asking_price" }, "p.id DESC"), "p.asking_price ASC", "排序白名单");
eq(core.sortOf({ sort: "drop table", dir: "asc" }, { asking_price: "p.asking_price" }, "p.id DESC"), "p.id DESC", "排序拒绝注入");

// ---------- 字典 ----------
eq(tax.AREAS.length, 25, "区域 25 个");
eq(tax.labelOf("listing_statuses", "available", "zh"), "在售 / 在租", "状态中文标签");
eq(tax.labelOf("listing_statuses", "available", "en"), "Available", "状态英文标签");
ok(tax.keysOf("property_types").indexOf("condo") >= 0, "房型含 condo");
ok(tax.isValid("tenures", "freehold") && !tax.isValid("tenures", "x"), "产权校验");

// ---------- 敏感输入 ----------
eq(core.str("  abc\u0000def  "), "abcdef", "去除控制字符");
eq(core.str("x".repeat(600), 10), "xxxxxxxxxx", "限长");
eq(core.boolOf("yes"), true, "布尔 yes");
eq(core.boolOf("0", true), false, "布尔 0");

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
