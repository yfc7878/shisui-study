import express from 'express';
import { db, mapMistake, mapSentence } from '../db.js';
import { HttpError, asyncRoute } from '../utils.js';
import { config } from '../config.js';
import {
  DOCX_CONTENT_TYPE,
  buildEnglishDocx,
  buildMistakesDocx,
  exportContentDisposition,
  exportFileNames,
} from '../export/index.js';

export const exportRouter = express.Router();

const MAX_EXPORT_ITEMS = 200;

function readIds(body) {
  if (!Array.isArray(body?.ids)) {
    throw new HttpError(400, '请提供要导出的 ids 数组', 'INVALID_IDS');
  }
  if (!body.ids.length) {
    throw new HttpError(400, '请至少选择一条内容后再导出', 'EMPTY_IDS');
  }
  if (body.ids.length > MAX_EXPORT_ITEMS) {
    throw new HttpError(400, `一次最多导出 ${MAX_EXPORT_ITEMS} 条内容`, 'TOO_MANY_IDS');
  }

  const ids = [];
  const seen = new Set();
  for (const value of body.ids) {
    if (typeof value !== 'string') {
      throw new HttpError(400, 'ids 必须是由字符串组成的数组', 'INVALID_IDS');
    }
    const id = value.trim();
    if (!id) {
      throw new HttpError(400, 'ids 中不能包含空值', 'INVALID_IDS');
    }
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (!ids.length) {
    throw new HttpError(400, '请至少选择一条内容后再导出', 'EMPTY_IDS');
  }
  return ids;
}

function readRows(table, ids) {
  const placeholders = ids.map(() => '?').join(', ');
  return db.prepare(
    `SELECT * FROM ${table} WHERE id IN (${placeholders}) AND status <> 'trashed'`,
  ).all(...ids);
}

function inRequestedOrder(ids, rows, mapper) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter(Boolean).map(mapper);
}

function sendDocx(res, buffer, kind, date) {
  const names = exportFileNames(kind, date);
  res.statusCode = 200;
  res.setHeader('Content-Type', DOCX_CONTENT_TYPE);
  res.setHeader('Content-Disposition', exportContentDisposition(kind, date));
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Export-Filename', encodeURIComponent(names.chinese));
  res.send(buffer);
}

function optionsFrom(body) {
  return body?.options && typeof body.options === 'object' && !Array.isArray(body.options)
    ? body.options
    : {};
}

exportRouter.post('/mistakes', asyncRoute(async (req, res) => {
  const ids = readIds(req.body || {});
  const rows = readRows('mistakes', ids);
  const items = inRequestedOrder(ids, rows, (row) => mapMistake(row));
  if (!items.length) {
    throw new HttpError(400, '所选错题不存在或已移入回收站', 'EMPTY_EXPORT');
  }

  const date = new Date();
  const buffer = await buildMistakesDocx(items, optionsFrom(req.body), {
    uploadDir: config.uploadDir,
    date,
  });
  sendDocx(res, buffer, 'mistakes', date);
}));

exportRouter.post('/english', asyncRoute(async (req, res) => {
  const ids = readIds(req.body || {});
  const rows = readRows('sentences', ids);
  const items = inRequestedOrder(ids, rows, (row) => mapSentence(row));
  if (!items.length) {
    throw new HttpError(400, '所选佳句不存在或已移入回收站', 'EMPTY_EXPORT');
  }

  const date = new Date();
  const buffer = await buildEnglishDocx(items, optionsFrom(req.body), { date });
  sendDocx(res, buffer, 'english', date);
}));

export default exportRouter;
