import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, code = 'ERROR', details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export const newId = () => crypto.randomUUID();

export const nowIso = () => new Date().toISOString();

export function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function toJson(value, fallback = []) {
  return JSON.stringify(value === undefined ? fallback : value);
}

export function cleanText(value, max = 100000) {
  if (typeof value !== 'string') return '';
  return value.replace(/\u0000/g, '').trim().slice(0, max);
}

export function cleanStringArray(value, maxItems = 40, maxLen = 120) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const text = cleanText(String(item ?? ''), maxLen);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function clampInt(value, min, max, fallback) {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export function sqlLimit(value, fallback = 50) {
  return clampInt(value, 1, 200, fallback);
}

export function sqlOffset(page, limit) {
  const p = clampInt(page, 1, 100000, 1);
  return (p - 1) * limit;
}

export function likeQuery(value) {
  return `%${String(value || '').replace(/[%_]/g, (m) => `\\${m}`)}%`;
}

export function escapeLike(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function pickNonEmpty(obj, keys) {
  const out = {};
  for (const key of keys) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

export function safeFileName(name, fallback = 'download') {
  const base = String(name || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return base || fallback;
}

export function truncate(text, max = 160) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function toBool(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}
