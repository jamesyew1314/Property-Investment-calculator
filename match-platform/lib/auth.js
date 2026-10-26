// auth.js — 账号与无状态会话（scrypt 密码哈希 + HMAC 签名 Cookie）

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {Store} from './store.js';
import {badRequest, conflict, tooMany, unauthorized} from './http-error.js';

const COOKIE = 'pm_session';
const SESSION_DAYS = 14;
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

function loadSecret(dataDir) {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(dataDir, '.session-secret');
  try {
    if (fs.existsSync(file)) {
      const s = fs.readFileSync(file, 'utf8').trim();
      if (s.length >= 32) return s;
    }
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(file, secret, {mode: 0o600});
    return secret;
  } catch {
    // 只读文件系统（例如打包环境）时退回进程内密钥；重启后旧会话失效。
    return crypto.randomBytes(32).toString('hex');
  }
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  let calc;
  try {
    calc = crypto.scryptSync(String(password), salt, 64).toString('hex');
  } catch {
    return false;
  }
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(calc, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function publicUser(user) {
  if (!user) return null;
  const {password_hash, session_version, ...rest} = user;
  return rest;
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

export class Auth {
  constructor(store, {secure = false} = {}) {
    this.store = store;
    this.secure = !!secure;
    this.secret = loadSecret(store.dataDir);
    this.attempts = new Map();
  }

  sign(payload) {
    return crypto.createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  issueToken(userId, version = 0) {
    const payload = Buffer.from(
      JSON.stringify({
        uid: Number(userId),
        v: Number(version) || 0,
        exp: Date.now() + SESSION_DAYS * 864e5
      })
    ).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  readToken(token) {
    if (!token) return null;
    const [payload, sig] = String(token).split('.');
    if (!payload || !sig) return null;
    const expected = this.sign(payload);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (!data.uid || !data.exp || data.exp < Date.now()) return null;
      return {uid: Number(data.uid), v: Number(data.v) || 0};
    } catch {
      return null;
    }
  }

  cookieHeader(userId, {clear = false, version = 0} = {}) {
    const bits = [
      `${COOKIE}=${clear ? '' : encodeURIComponent(this.issueToken(userId, version))}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${clear ? 0 : SESSION_DAYS * 86400}`
    ];
    if (this.secure) bits.push('Secure');
    return bits.join('; ');
  }

  cookieFor(userId, opts = {}) {
    const user = this.store.get('users', userId);
    return this.cookieHeader(userId, {...opts, version: user?.session_version || 0});
  }

  userFromRequest(req) {
    const token = parseCookies(req.headers?.cookie)[COOKIE];
    const payload = this.readToken(token);
    if (!payload) return null;
    const user = this.store.get('users', payload.uid);
    if (!user) return null;
    // 改密后 session_version 递增，旧 Cookie 立即失效（无状态会话也能撤销）
    if ((Number(user.session_version) || 0) !== payload.v) return null;
    return user;
  }

  rateKey(ip, email) {
    return `${ip || 'unknown'}|${String(email || '').toLowerCase()}`;
  }

  checkRate(ip, email) {
    const key = this.rateKey(ip, email);
    const now = Date.now();
    const hits = (this.attempts.get(key) || []).filter((t) => now - t < ATTEMPT_WINDOW_MS);
    this.attempts.set(key, hits);
    if (hits.length >= MAX_ATTEMPTS) throw tooMany('登录尝试过多，请 10 分钟后再试');
  }

  noteFailure(ip, email) {
    const key = this.rateKey(ip, email);
    const hits = (this.attempts.get(key) || []).filter((t) => Date.now() - t < ATTEMPT_WINDOW_MS);
    hits.push(Date.now());
    this.attempts.set(key, hits);
    if (this.attempts.size > 5000) this.attempts.clear();
  }

  clearFailures(ip, email) {
    this.attempts.delete(this.rateKey(ip, email));
  }

  register({name, email, password, phone, company, ren, role} = {}) {
    const cleanName = String(name || '').trim().slice(0, 80);
    const cleanEmail = String(email || '').trim().toLowerCase().slice(0, 160);
    const pw = String(password || '');
    const fields = {};
    if (cleanName.length < 2) fields.name = '请填写姓名（至少 2 个字）';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) fields.email = '邮箱格式不正确';
    if (pw.length < 8) fields.password = '密码至少 8 位';
    if (Object.keys(fields).length) throw badRequest('validation', '请检查注册资料', fields);
    if (this.store.find('users', (u) => u.email === cleanEmail)) {
      throw conflict('这个邮箱已注册', {email: '邮箱已注册'});
    }
    const isFirst = this.store.count('users') === 0;
    const user = this.store.insert('users', {
      name: cleanName,
      email: cleanEmail,
      phone: String(phone || '').trim().slice(0, 40) || null,
      company: String(company || '').trim().slice(0, 120) || null,
      ren: String(ren || '').trim().replace(/^ren\s*/i, '').slice(0, 30) || null,
      role: isFirst ? 'owner' : role === 'owner' ? 'owner' : 'agent',
      session_version: 0,
      password_hash: hashPassword(pw)
    });
    return publicUser(user);
  }

  login({email, password, ip} = {}) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    this.checkRate(ip, cleanEmail);
    const user = this.store.find('users', (u) => u.email === cleanEmail);
    const ok = user && verifyPassword(password, user.password_hash);
    if (!ok) {
      this.noteFailure(ip, cleanEmail);
      throw unauthorized('邮箱或密码不正确');
    }
    this.clearFailures(ip, cleanEmail);
    return publicUser(user);
  }

  updateProfile(userId, patch = {}) {
    const user = this.store.get('users', userId);
    if (!user) throw unauthorized();
    const next = {};
    if (patch.name != null) {
      const v = String(patch.name).trim().slice(0, 80);
      if (v.length < 2) throw badRequest('validation', '姓名太短', {name: '请填写姓名'});
      next.name = v;
    }
    if (patch.phone != null) next.phone = String(patch.phone).trim().slice(0, 40) || null;
    if (patch.company != null) next.company = String(patch.company).trim().slice(0, 120) || null;
    if (patch.ren != null) {
      next.ren = String(patch.ren).trim().replace(/^ren\s*/i, '').slice(0, 30) || null;
    }
    return publicUser(this.store.update('users', userId, next));
  }

  changePassword(userId, current, nextPassword) {
    const user = this.store.get('users', userId);
    if (!user) throw unauthorized();
    if (!verifyPassword(current, user.password_hash)) {
      throw badRequest('bad_password', '当前密码不正确', {current: '密码不正确'});
    }
    if (String(nextPassword || '').length < 8) {
      throw badRequest('validation', '新密码至少 8 位', {password: '新密码至少 8 位'});
    }
    this.store.update('users', userId, {
      password_hash: hashPassword(String(nextPassword)),
      session_version: (Number(user.session_version) || 0) + 1
    });
    return true;
  }
}

export {COOKIE as SESSION_COOKIE};
