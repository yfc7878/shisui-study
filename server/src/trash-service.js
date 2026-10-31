import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { db, getUpload } from './db.js';
import { nowIso, parseJson, toJson } from './utils.js';

const TABLES = {
  mistake: 'mistakes',
  sentence: 'sentences',
  vocab: 'vocab_entries',
};

const TABLE_LABELS = {
  mistakes: '错题',
  sentences: '佳句',
  vocab_entries: '词汇',
};

const DEFAULTS = Object.freeze({
  autoPurge: false,
  retentionDays: 30,
  lastPurgeAt: null,
});

export const RETENTION_OPTIONS = [3, 7, 14, 30, 60, 90, 180, 365];

const SETTINGS_KEY = 'trash_settings';

export function getTrashSettings() {
  const row = db.prepare('SELECT value FROM app_notes WHERE key = ?').get(SETTINGS_KEY);
  const parsed = parseJson(row?.value, {});
  const retentionDays = Number(parsed?.retentionDays);
  return {
    autoPurge: Boolean(parsed?.autoPurge),
    retentionDays: RETENTION_OPTIONS.includes(retentionDays) ? retentionDays : DEFAULTS.retentionDays,
    lastPurgeAt: typeof parsed?.lastPurgeAt === 'string' ? parsed.lastPurgeAt : null,
  };
}

export function saveTrashSettings(input = {}) {
  const current = getTrashSettings();
  const next = {
    autoPurge: input.autoPurge === undefined ? current.autoPurge : Boolean(input.autoPurge),
    retentionDays: input.retentionDays === undefined
      ? current.retentionDays
      : (RETENTION_OPTIONS.includes(Number(input.retentionDays)) ? Number(input.retentionDays) : current.retentionDays),
    lastPurgeAt: current.lastPurgeAt,
  };
  db.prepare(`
    INSERT INTO app_notes (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(SETTINGS_KEY, toJson(next, {}), nowIso());
  return next;
}

function touchLastPurge(at = nowIso()) {
  const current = getTrashSettings();
  const next = { ...current, lastPurgeAt: at };
  db.prepare(`
    INSERT INTO app_notes (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(SETTINGS_KEY, toJson(next, {}), at);
  return next;
}

function imageIdsFromRows(table, rows) {
  const ids = new Set();
  if (table !== 'mistakes') return ids;
  for (const row of rows) {
    for (const key of ['images', 'figures']) {
      const list = parseJson(row[key], []);
      if (!Array.isArray(list)) continue;
      for (const image of list) {
        if (image?.id) ids.add(String(image.id));
      }
    }
  }
  return ids;
}

function collectReferencedUploadIds() {
  const ids = new Set();
  const rows = db.prepare('SELECT images, figures FROM mistakes').all();
  for (const row of rows) {
    for (const key of ['images', 'figures']) {
      const list = parseJson(row[key], []);
      if (!Array.isArray(list)) continue;
      for (const image of list) {
        if (image?.id) ids.add(String(image.id));
      }
    }
  }
  return ids;
}

/**
 * 永久删除后清理不再被任何题目引用的图片文件。
 * 同一张 upload 可能被多道题共用，所以按“剩余引用”判断，不能直接全删。
 */
export function cleanupOrphanUploads(candidates) {
  if (!candidates || candidates.size === 0) return 0;
  const referenced = collectReferencedUploadIds();
  let removed = 0;
  for (const id of candidates) {
    if (referenced.has(id)) continue;
    const row = getUpload(id);
    if (!row) continue;
    try {
      fs.unlinkSync(path.join(config.uploadDir, row.filename));
    } catch {
      /* 文件可能已不存在；数据库记录仍然清理 */
    }
    db.prepare('DELETE FROM uploads WHERE id = ?').run(id);
    removed += 1;
  }
  return removed;
}

function deleteTrashRows(table, rows) {
  const candidates = imageIdsFromRows(table, rows);
  if (!rows.length) return { affected: 0, uploadsRemoved: 0 };
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => '?').join(', ');
  db.prepare(`DELETE FROM ${table} WHERE status = 'trashed' AND id IN (${placeholders})`).run(...ids);
  const uploadsRemoved = cleanupOrphanUploads(candidates);
  return { affected: ids.length, uploadsRemoved };
}

export function emptyTrash() {
  let affected = 0;
  let uploadsRemoved = 0;
  for (const [type, table] of Object.entries(TABLES)) {
    const select = table === 'mistakes'
      ? 'SELECT id, images, figures FROM mistakes WHERE status = \'trashed\''
      : `SELECT id FROM ${table} WHERE status = 'trashed'`;
    const rows = db.prepare(select).all();
    const result = deleteTrashRows(table, rows);
    affected += result.affected;
    uploadsRemoved += result.uploadsRemoved;
    void type;
  }
  touchLastPurge();
  return { affected, uploadsRemoved };
}

export function permanentlyDeleteItems(items = []) {
  const groups = new Map();
  for (const item of items) {
    const table = TABLES[item?.type];
    if (!table || !item.id) continue;
    if (!groups.has(table)) groups.set(table, []);
    groups.get(table).push(String(item.id));
  }
  let affected = 0;
  let uploadsRemoved = 0;
  for (const [table, ids] of groups) {
    const placeholders = ids.map(() => '?').join(', ');
    const rows = db.prepare(
      `SELECT id, ${table === 'mistakes' ? 'images, figures' : "'' AS images, '' AS figures"} FROM ${table} WHERE status = 'trashed' AND id IN (${placeholders})`,
    ).all(...ids);
    const result = deleteTrashRows(table, rows);
    affected += result.affected;
    uploadsRemoved += result.uploadsRemoved;
  }
  if (affected) touchLastPurge();
  return { affected, uploadsRemoved };
}

/**
 * 清理超过保留期的回收站内容。autoPurge 关闭时不会自动执行；
 * 手动“立即清理”传 force=true，只删除已经过期的内容，不会删除未过期内容。
 */
export function purgeExpiredTrash({ force = false, now = new Date() } = {}) {
  const settings = getTrashSettings();
  if (!force && !settings.autoPurge) {
    return { skipped: true, affected: 0, uploadsRemoved: 0, settings };
  }
  const days = settings.retentionDays;
  if (!days || days <= 0) {
    return { skipped: true, affected: 0, uploadsRemoved: 0, settings };
  }
  const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  let affected = 0;
  let uploadsRemoved = 0;
  const details = {};
  for (const [type, table] of Object.entries(TABLES)) {
    const rows = table === 'mistakes'
      ? db.prepare("SELECT id, images, figures FROM mistakes WHERE status = 'trashed' AND deleted_at IS NOT NULL AND datetime(deleted_at) <= datetime(?)").all(threshold)
      : db.prepare(`SELECT id FROM ${table} WHERE status = 'trashed' AND deleted_at IS NOT NULL AND datetime(deleted_at) <= datetime(?)`).all(threshold);
    const result = deleteTrashRows(table, rows);
    details[type] = result.affected;
    affected += result.affected;
    uploadsRemoved += result.uploadsRemoved;
  }
  const next = touchLastPurge();
  return {
    skipped: false,
    affected,
    uploadsRemoved,
    details,
    threshold,
    settings: next,
  };
}

let janitorTimer = null;

export function startTrashJanitor() {
  if (janitorTimer) return janitorTimer;
  const tick = () => {
    try {
      const settings = getTrashSettings();
      if (settings.autoPurge) {
        const result = purgeExpiredTrash();
        if (result.affected > 0) {
          console.log(`[trash] 自动清理 ${result.affected} 项过期回收站内容`);
        }
      }
    } catch (error) {
      console.error('[trash] 自动清理失败', error);
    }
  };
  const first = setTimeout(tick, 15_000);
  first.unref?.();
  janitorTimer = setInterval(tick, 6 * 60 * 60 * 1000);
  janitorTimer.unref?.();
  return janitorTimer;
}

export function trashTableLabel(table) {
  return TABLE_LABELS[table] || table;
}

export { TABLES, TABLE_LABELS, DEFAULTS };
