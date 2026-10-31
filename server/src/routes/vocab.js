import express from 'express';
import {
  approve, createVocab, db, getCounts, getVocabRow, mapVocab, setTrash, updateVocabFields,
} from '../db.js';
import {
  HttpError, asyncRoute, cleanStringArray, cleanText, nowIso, sqlLimit, sqlOffset,
} from '../utils.js';

export const vocabRouter = express.Router();

function normalizeStatus(value) {
  if (!value || value === 'all') return null;
  return value === 'trash' ? 'trashed' : value;
}

vocabRouter.get('/', asyncRoute(async (req, res) => {
  const where = [];
  const params = [];
  const status = normalizeStatus(req.query.status);
  if (status === 'all') {
    where.push("status <> 'trashed'");
  } else if (status && ['active', 'pending', 'trashed'].includes(status)) {
    where.push('status = ?');
    params.push(status);
  }
  const q = cleanText(req.query.q, 100);
  if (q) {
    where.push('(term LIKE ? OR data LIKE ? OR theme LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const theme = cleanText(req.query.theme, 60);
  if (theme) { where.push('theme = ?'); params.push(theme); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = req.query.sort === 'az' ? 'term COLLATE NOCASE ASC' : 'created_at DESC';
  const limit = sqlLimit(req.query.limit, 50);
  const offset = sqlOffset(req.query.page, limit);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM vocab_entries ${whereSql}`).get(...params).n;
  const rows = db.prepare(`SELECT * FROM vocab_entries ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  const counts = getCounts().vocab;
  const themes = db.prepare(`
    SELECT theme, COUNT(*) AS count FROM vocab_entries
    WHERE status = 'active' AND theme <> '' GROUP BY theme ORDER BY count DESC
  `).all();
  res.json({
    items: rows.map(mapVocab),
    total,
    page: Math.floor(offset / limit) + 1,
    limit,
    counts,
    themes,
  });
}));

vocabRouter.get('/:id', asyncRoute(async (req, res) => {
  const row = getVocabRow(req.params.id);
  if (!row) throw new HttpError(404, '词条不存在', 'NOT_FOUND');
  res.json({ item: mapVocab(row) });
}));

vocabRouter.post('/', asyncRoute(async (req, res) => {
  const body = req.body || {};
  if (!cleanText(body.term, 120)) throw new HttpError(400, '单词或词组不能为空', 'EMPTY_TERM');
  const status = body.status === 'active' ? 'active' : 'pending';
  const row = createVocab({
    term: cleanText(body.term, 120),
    entryType: body.entryType === 'phrase' ? 'phrase' : 'word',
    theme: cleanText(body.theme, 60),
    data: body.data && typeof body.data === 'object' ? body.data : {},
    reasoning: cleanText(body.reasoning, 30000),
    think: Boolean(body.think),
    aiMeta: body.aiMeta && typeof body.aiMeta === 'object' ? body.aiMeta : {},
  }, status);
  res.status(201).json({ item: mapVocab(row) });
}));

vocabRouter.patch('/:id', asyncRoute(async (req, res) => {
  const row = getVocabRow(req.params.id);
  if (!row) throw new HttpError(404, '词条不存在', 'NOT_FOUND');
  const body = req.body || {};
  const fields = {};
  if (body.term !== undefined) fields.term = cleanText(body.term, 120);
  if (body.entryType !== undefined) fields.entryType = body.entryType === 'phrase' ? 'phrase' : 'word';
  if (body.theme !== undefined) fields.theme = cleanText(body.theme, 60);
  if (body.data !== undefined && body.data && typeof body.data === 'object') fields.data = body.data;
  if (body.reasoning !== undefined) fields.reasoning = cleanText(body.reasoning, 30000);
  if (body.think !== undefined) fields.think = Boolean(body.think);
  if (body.aiMeta !== undefined && body.aiMeta && typeof body.aiMeta === 'object') fields.aiMeta = body.aiMeta;
  if (body.status !== undefined) {
    const next = normalizeStatus(body.status);
    if (['pending', 'active', 'trashed'].includes(next)) {
      if (next === 'trashed' && row.status !== 'trashed') {
        setTrash('vocab_entries', row.id, 'trashed');
      } else {
        fields.status = next;
        if (next === 'active') fields.reviewedAt = nowIso();
        if (next !== 'trashed') fields.deletedAt = null;
      }
    }
  }
  const updated = updateVocabFields(row.id, fields);
  res.json({ item: mapVocab(updated) });
}));

vocabRouter.delete('/:id', asyncRoute(async (req, res) => {
  const row = getVocabRow(req.params.id);
  if (!row) throw new HttpError(404, '词条不存在', 'NOT_FOUND');
  db.prepare('DELETE FROM vocab_entries WHERE id = ?').run(row.id);
  res.json({ ok: true });
}));

const BULK_ACTIONS = new Set(['approve', 'trash', 'restore', 'delete', 'pending']);

vocabRouter.post('/bulk', asyncRoute(async (req, res) => {
  const { ids, action } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, '请选择要操作的词条', 'NO_SELECTION');
  if (!BULK_ACTIONS.has(action)) throw new HttpError(400, '未知的批量操作', 'BAD_ACTION');
  let affected = 0;
  for (const id of ids.slice(0, 500)) {
    const row = getVocabRow(String(id));
    if (!row) continue;
    if (action === 'approve') { approve('vocab_entries', row.id); affected += 1; }
    else if (action === 'trash' && row.status !== 'trashed') { setTrash('vocab_entries', row.id, 'trashed'); affected += 1; }
    else if (action === 'restore' && row.status === 'trashed') { setTrash('vocab_entries', row.id, null); affected += 1; }
    else if (action === 'pending') { updateVocabFields(row.id, { status: 'pending', reviewedAt: null }); affected += 1; }
    else if (action === 'delete') { db.prepare('DELETE FROM vocab_entries WHERE id = ?').run(row.id); affected += 1; }
  }
  res.json({ ok: true, affected });
}));
