// store.js — 零依赖 JSON 文档存储（原子写入）
// 数据量级：一个中介/小团队（数百条房源与需求）足够；结构预留升级到 SQLite/Postgres。

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const APP_ROOT = ROOT;

const EMPTY = () => ({
  schema: 1,
  created_at: new Date().toISOString(),
  seq: {users: 0, listings: 0, requirements: 0, actions: 0, activities: 0},
  users: [],
  listings: [],
  requirements: [],
  actions: [],
  activities: []
});

const COLLECTIONS = ['users', 'listings', 'requirements', 'actions', 'activities'];

function nowIso() {
  return new Date().toISOString();
}

export class Store {
  constructor({dataDir} = {}) {
    this.dataDir = dataDir || process.env.DATA_DIR || path.join(ROOT, 'data');
    this.file = path.join(this.dataDir, 'db.json');
    this.data = EMPTY();
    fs.mkdirSync(this.dataDir, {recursive: true});
    this.load();
  }

  load() {
    if (!fs.existsSync(this.file)) {
      this.save();
      return;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!raw || typeof raw !== 'object' || !raw.seq) throw new Error('invalid shape');
      this.data = {...EMPTY(), ...raw};
      for (const key of COLLECTIONS) {
        if (!Array.isArray(this.data[key])) this.data[key] = [];
        if (typeof this.data.seq[key] !== 'number') {
          this.data.seq[key] = this.data[key].reduce((m, row) => Math.max(m, Number(row.id) || 0), 0);
        }
      }
    } catch (err) {
      // 损坏的文件保留现场，避免静默覆盖；然后从空库开始。
      const bad = `${this.file}.corrupt-${Date.now()}`;
      try {
        fs.copyFileSync(this.file, bad);
      } catch {
        /* ignore */
      }
      console.error(`[store] db.json 读取失败，已备份到 ${bad}:`, err.message);
      this.data = EMPTY();
      this.save();
    }
  }

  save() {
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  list(name) {
    return this.data[name] || [];
  }

  find(name, predicate) {
    return this.list(name).find(predicate) || null;
  }

  get(name, id) {
    const n = Number(id);
    return this.list(name).find((row) => Number(row.id) === n) || null;
  }

  insert(name, obj) {
    const id = ++this.data.seq[name];
    const ts = nowIso();
    const row = {...obj, id, created_at: ts, updated_at: ts};
    this.list(name).push(row);
    this.save();
    return row;
  }

  update(name, id, patch) {
    const row = this.get(name, id);
    if (!row) return null;
    Object.assign(row, patch, {updated_at: nowIso()});
    // 不允许客户端改主键/创建时间
    row.id = Number(id);
    this.save();
    return row;
  }

  remove(name, id) {
    const idx = this.list(name).findIndex((row) => Number(row.id) === Number(id));
    if (idx < 0) return false;
    this.data[name].splice(idx, 1);
    this.save();
    return true;
  }

  nextId(name) {
    return this.data.seq[name] + 1;
  }

  count(name, predicate) {
    return this.list(name).filter(predicate || (() => true)).length;
  }

  logActivity(userId, kind, {entity = null, entity_id = null, detail = null} = {}) {
    const row = {
      id: ++this.data.seq.activities,
      user_id: userId,
      kind,
      entity,
      entity_id,
      detail,
      created_at: nowIso()
    };
    this.data.activities.push(row);
    if (this.data.activities.length > 2000) {
      this.data.activities = this.data.activities.slice(-1500);
    }
    this.save();
    return row;
  }

  activitiesFor(userId, limit = 30) {
    return this.list('activities')
      .filter((a) => a.user_id === userId)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, limit);
  }
}

export function refFor(prefix, id) {
  return `${prefix}-${String(id).padStart(4, '0')}`;
}

export {nowIso};
