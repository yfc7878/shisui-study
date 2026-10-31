import express from 'express';
import {
  approve, createSentence, db, getCounts, getSentenceRow, mapSentence, setTrash, updateSentenceFields,
} from '../db.js';
import {
  HttpError, asyncRoute, cleanStringArray, cleanText, nowIso, sqlLimit, sqlOffset,
} from '../utils.js';

export const sentencesRouter = express.Router();

function normalizeStatus(value) {
  if (!value || value === 'all') return null;
  const map = { trash: 'trashed' };
  return map[value] || value;
}

sentencesRouter.get('/', asyncRoute(async (req, res) => {
  const where = [];
  const params = [];
  const status = normalizeStatus(req.query.status);
  if (status === 'all') {
    where.push("status <> 'trashed'");
  } else if (status && ['active', 'pending', 'trashed'].includes(status)) {
    where.push('status = ?');
    params.push(status);
  }
  const theme = cleanText(req.query.theme, 60);
  if (theme) { where.push('theme = ?'); params.push(theme); }
  const q = cleanText(req.query.q, 100);
  if (q) {
    where.push('(content LIKE ? OR translation LIKE ? OR usage_text LIKE ? OR tags LIKE ? OR summary LIKE ?)');
    params.push(...Array(5).fill(`%${q}%`));
  }
  const tag = cleanText(req.query.tag, 40);
  if (tag) { where.push('tags LIKE ?'); params.push(`%${tag}%`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = req.query.sort === 'oldest' ? 'created_at ASC' : 'created_at DESC';
  const limit = sqlLimit(req.query.limit, 40);
  const offset = sqlOffset(req.query.page, limit);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM sentences ${whereSql}`).get(...params).n;
  const rows = db.prepare(`SELECT * FROM sentences ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  const counts = getCounts().sentences;
  const themes = db.prepare(`
    SELECT theme, COUNT(*) AS count FROM sentences
    WHERE status = 'active' AND theme <> '' GROUP BY theme ORDER BY count DESC, theme ASC
  `).all();
  res.json({
    items: rows.map(mapSentence),
    total,
    page: Math.floor(offset / limit) + 1,
    limit,
    counts,
    themes,
  });
}));

sentencesRouter.get('/themes', asyncRoute(async (req, res) => {
  const themes = db.prepare(`
    SELECT theme, COUNT(*) AS count,
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active
    FROM sentences WHERE theme <> '' AND status <> 'trashed'
    GROUP BY theme ORDER BY count DESC, theme ASC
  `).all();
  res.json({ themes });
}));

sentencesRouter.get('/:id', asyncRoute(async (req, res) => {
  const row = getSentenceRow(req.params.id);
  if (!row) throw new HttpError(404, '佳句不存在', 'NOT_FOUND');
  res.json({ item: mapSentence(row) });
}));

sentencesRouter.post('/', asyncRoute(async (req, res) => {
  const body = req.body || {};
  if (!cleanText(body.content, 2000)) throw new HttpError(400, '英文句子不能为空', 'EMPTY_SENTENCE');
  const status = body.status === 'active' ? 'active' : 'pending';
  const row = createSentence({
    theme: cleanText(body.theme, 60),
    title: cleanText(body.title, 80),
    summary: cleanText(body.summary, 500),
    content: cleanText(body.content, 2000),
    translation: cleanText(body.translation, 2000),
    usage: cleanText(body.usage, 4000),
    example: cleanText(body.example, 2000),
    exampleTranslation: cleanText(body.exampleTranslation, 2000),
    source: cleanText(body.source, 500),
    sourceType: cleanText(body.sourceType, 30) || 'manual',
    tags: cleanStringArray(body.tags),
    note: cleanText(body.note, 2000),
    reasoning: cleanText(body.reasoning, 30000),
    think: Boolean(body.think),
    aiMeta: body.aiMeta && typeof body.aiMeta === 'object' ? body.aiMeta : {},
  }, status);
  res.status(201).json({ item: mapSentence(row) });
}));

const PATCH_MAP = {
  theme: 'theme', title: 'title', summary: 'summary', content: 'content',
  translation: 'translation', usage: 'usage', example: 'example',
  exampleTranslation: 'exampleTranslation', source: 'source', sourceType: 'sourceType',
  tags: 'tags', note: 'note', reasoning: 'reasoning', think: 'think', aiMeta: 'aiMeta', status: 'status',
};

sentencesRouter.patch('/:id', asyncRoute(async (req, res) => {
  const row = getSentenceRow(req.params.id);
  if (!row) throw new HttpError(404, '佳句不存在', 'NOT_FOUND');
  const body = req.body || {};
  const fields = {};
  for (const [inputKey, field] of Object.entries(PATCH_MAP)) {
    if (body[inputKey] === undefined) continue;
    if (['tags'].includes(inputKey)) fields[field] = cleanStringArray(body[inputKey]);
    else if (inputKey === 'think') fields[field] = Boolean(body[inputKey]);
    else if (inputKey === 'aiMeta') fields[field] = body[inputKey] && typeof body[inputKey] === 'object' ? body[inputKey] : {};
    else if (inputKey === 'reasoning') fields[field] = cleanText(body[inputKey], 30000);
    else if (inputKey === 'status') {
      const next = normalizeStatus(body[inputKey]);
      if (!['pending', 'active', 'trashed'].includes(next)) continue;
      if (next === 'trashed' && row.status !== 'trashed') { setTrash('sentences', row.id, 'trashed'); continue; }
      fields[field] = next;
      if (next === 'active') fields.reviewedAt = nowIso();
      if (next !== 'trashed') fields.deletedAt = null;
    } else {
      fields[field] = cleanText(body[inputKey], ['content', 'translation', 'example', 'exampleTranslation'].includes(inputKey) ? 4000 : 8000);
    }
  }
  const updated = updateSentenceFields(row.id, fields);
  res.json({ item: mapSentence(updated) });
}));

sentencesRouter.delete('/:id', asyncRoute(async (req, res) => {
  const row = getSentenceRow(req.params.id);
  if (!row) throw new HttpError(404, '佳句不存在', 'NOT_FOUND');
  db.prepare('DELETE FROM sentences WHERE id = ?').run(row.id);
  res.json({ ok: true });
}));

const BULK_ACTIONS = new Set(['approve', 'trash', 'restore', 'delete', 'pending']);

sentencesRouter.post('/bulk', asyncRoute(async (req, res) => {
  const { ids, action } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, '请选择要操作的佳句', 'NO_SELECTION');
  if (!BULK_ACTIONS.has(action)) throw new HttpError(400, '未知的批量操作', 'BAD_ACTION');
  let affected = 0;
  for (const id of ids.slice(0, 500)) {
    const row = getSentenceRow(String(id));
    if (!row) continue;
    if (action === 'approve') { approve('sentences', row.id); affected += 1; }
    else if (action === 'trash' && row.status !== 'trashed') { setTrash('sentences', row.id, 'trashed'); affected += 1; }
    else if (action === 'restore' && row.status === 'trashed') { setTrash('sentences', row.id, null); affected += 1; }
    else if (action === 'pending') { updateSentenceFields(row.id, { status: 'pending', reviewedAt: null }); affected += 1; }
    else if (action === 'delete') { db.prepare('DELETE FROM sentences WHERE id = ?').run(row.id); affected += 1; }
  }
  res.json({ ok: true, affected });
}));
