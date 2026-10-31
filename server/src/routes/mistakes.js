import express from 'express';
import {
  approve, createMistake, db, getCounts, getMistakeRow, mapMistake,
  setTrash, updateMistakeFields,
} from '../db.js';
import {
  HttpError, asyncRoute, cleanStringArray, cleanText, clampInt, nowIso, sqlLimit, sqlOffset,
} from '../utils.js';

export const mistakesRouter = express.Router();

const LIST_FIELDS = `
  id, status, subject, source, chapter, error_reason, difficulty, title,
  question_text, knowledge_points, tags, images, figures, figure_hints,
  think, note, created_at, updated_at, reviewed_at, deleted_at
`;

function normalizeStatus(value) {
  if (!value || value === 'all') return null;
  const map = { trash: 'trashed', deleted: 'trashed' };
  return map[value] || value;
}

function listQuery(req) {
  const where = [];
  const params = [];
  const status = normalizeStatus(req.query.status);
  if (status === 'all') {
    where.push("status <> 'trashed'");
  } else if (status && ['active', 'pending', 'trashed'].includes(status)) {
    where.push('status = ?');
    params.push(status);
  }
  const subject = cleanText(req.query.subject, 40);
  if (subject) {
    where.push('subject = ?');
    params.push(subject);
  }
  const difficulty = Number.parseInt(req.query.difficulty, 10);
  if (difficulty >= 1 && difficulty <= 5) {
    where.push('difficulty = ?');
    params.push(difficulty);
  }
  const tag = cleanText(req.query.tag, 40);
  if (tag) {
    where.push('tags LIKE ?');
    params.push(`%${tag}%`);
  }
  const q = cleanText(req.query.q, 100);
  if (q) {
    where.push('(question_text LIKE ? OR source LIKE ? OR tags LIKE ? OR knowledge_points LIKE ? OR error_reason LIKE ?)');
    params.push(...Array(5).fill(`%${q}%`));
  }
  const from = cleanText(req.query.from, 30);
  const to = cleanText(req.query.to, 30);
  if (from) { where.push('created_at >= ?'); params.push(from); }
  if (to) { where.push('created_at <= ?'); params.push(to); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortMap = {
    newest: 'created_at DESC',
    oldest: 'created_at ASC',
    updated: 'updated_at DESC',
    difficulty: 'difficulty DESC, created_at DESC',
    'difficulty-asc': 'difficulty ASC, created_at DESC',
    subject: 'subject ASC, created_at DESC',
  };
  const order = sortMap[req.query.sort] || sortMap.newest;
  const limit = sqlLimit(req.query.limit, 40);
  const offset = sqlOffset(req.query.page, limit);
  return { whereSql, params, order, limit, offset };
}

mistakesRouter.get('/', asyncRoute(async (req, res) => {
  const { whereSql, params, order, limit, offset } = listQuery(req);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM mistakes ${whereSql}`).get(...params).n;
  const rows = db.prepare(`SELECT ${LIST_FIELDS} FROM mistakes ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  const counts = getCounts().mistakes;
  const subjects = db.prepare(`
    SELECT subject, COUNT(*) AS count FROM mistakes
    WHERE status = 'active' AND subject <> '' GROUP BY subject ORDER BY count DESC
  `).all();
  res.json({
    items: rows.map((row) => mapMistake(row, { full: false })),
    total,
    page: Math.floor(offset / limit) + 1,
    limit,
    counts,
    subjects,
  });
}));

mistakesRouter.get('/:id', asyncRoute(async (req, res) => {
  const row = getMistakeRow(req.params.id);
  if (!row) throw new HttpError(404, '错题不存在', 'NOT_FOUND');
  res.json({ item: mapMistake(row) });
}));

mistakesRouter.post('/', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const questionText = cleanText(body.questionText, 30000);
  const images = Array.isArray(body.images) ? body.images.slice(0, 20) : [];
  if (!questionText && !images.length) {
    throw new HttpError(400, '题目内容和图片不能同时为空', 'EMPTY_QUESTION');
  }
  const status = body.status === 'active' ? 'active' : 'pending';
  const row = createMistake({
    subject: cleanText(body.subject, 20),
    source: cleanText(body.source, 120),
    chapter: cleanText(body.chapter, 120),
    errorReason: cleanText(body.errorReason, 120),
    difficulty: clampInt(body.difficulty, 1, 5, 3),
    title: cleanText(body.title, 80) || questionText.split('\n').find(Boolean)?.slice(0, 48) || '图片错题',
    questionText,
    answerText: cleanText(body.answerText, 30000),
    analysisText: cleanText(body.analysisText, 30000),
    knowledgePoints: cleanStringArray(body.knowledgePoints),
    tags: cleanStringArray(body.tags),
    images,
    figures: Array.isArray(body.figures) ? body.figures.slice(0, 20) : [],
    figureHints: Array.isArray(body.figureHints) ? body.figureHints.slice(0, 20) : [],
    reasoning: cleanText(body.reasoning, 60000),
    think: Boolean(body.think),
    note: cleanText(body.note, 2000),
    aiMeta: body.aiMeta && typeof body.aiMeta === 'object' ? body.aiMeta : {},
  }, status);
  res.status(201).json({ item: mapMistake(row) });
}));

const PATCH_MAP = {
  subject: 'subject',
  source: 'source',
  chapter: 'chapter',
  errorReason: 'errorReason',
  difficulty: 'difficulty',
  title: 'title',
  questionText: 'questionText',
  answerText: 'answerText',
  analysisText: 'analysisText',
  knowledgePoints: 'knowledgePoints',
  tags: 'tags',
  images: 'images',
  figures: 'figures',
  figureHints: 'figureHints',
  reasoning: 'reasoning',
  think: 'think',
  note: 'note',
  aiMeta: 'aiMeta',
  status: 'status',
};

mistakesRouter.patch('/:id', asyncRoute(async (req, res) => {
  const row = getMistakeRow(req.params.id);
  if (!row) throw new HttpError(404, '错题不存在', 'NOT_FOUND');
  const body = req.body || {};
  const fields = {};
  for (const [inputKey, field] of Object.entries(PATCH_MAP)) {
    if (body[inputKey] === undefined) continue;
    if (['subject', 'source', 'chapter', 'errorReason', 'title', 'note'].includes(inputKey)) {
      fields[field] = cleanText(body[inputKey], inputKey === 'source' ? 120 : 2000);
    } else if (['questionText', 'answerText', 'analysisText'].includes(inputKey)) {
      fields[field] = cleanText(body[inputKey], 40000);
    } else if (['knowledgePoints', 'tags'].includes(inputKey)) {
      fields[field] = cleanStringArray(body[inputKey]);
    } else if (['images', 'figures', 'figureHints'].includes(inputKey)) {
      fields[field] = Array.isArray(body[inputKey]) ? body[inputKey].slice(0, 30) : [];
    } else if (inputKey === 'difficulty') {
      fields[field] = clampInt(body[inputKey], 1, 5, 3);
    } else if (inputKey === 'think') {
      fields[field] = Boolean(body[inputKey]);
    } else if (inputKey === 'aiMeta') {
      fields[field] = body[inputKey] && typeof body[inputKey] === 'object' ? body[inputKey] : {};
    } else if (inputKey === 'reasoning') {
      fields[field] = cleanText(body[inputKey], 60000);
    } else if (inputKey === 'status') {
      const next = normalizeStatus(body[inputKey]);
      if (!['pending', 'active', 'trashed'].includes(next)) continue;
      if (next === 'trashed' && row.status !== 'trashed') {
        setTrash('mistakes', row.id, 'trashed');
        continue;
      }
      fields[field] = next;
      if (next === 'active') fields.reviewedAt = nowIso();
      if (next !== 'trashed') fields.deletedAt = null;
    }
  }
  const updated = updateMistakeFields(row.id, fields);
  res.json({ item: mapMistake(updated) });
}));

mistakesRouter.delete('/:id', asyncRoute(async (req, res) => {
  const row = getMistakeRow(req.params.id);
  if (!row) throw new HttpError(404, '错题不存在', 'NOT_FOUND');
  db.prepare('DELETE FROM mistakes WHERE id = ?').run(row.id);
  res.json({ ok: true });
}));

const BULK_ACTIONS = new Set(['approve', 'trash', 'restore', 'delete', 'pending']);

mistakesRouter.post('/bulk', asyncRoute(async (req, res) => {
  const { ids, action } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, '请选择要操作的错题', 'NO_SELECTION');
  if (!BULK_ACTIONS.has(action)) throw new HttpError(400, '未知的批量操作', 'BAD_ACTION');
  let affected = 0;
  for (const id of ids.slice(0, 500)) {
    const row = getMistakeRow(String(id));
    if (!row) continue;
    if (action === 'approve') {
      approve('mistakes', row.id);
      affected += 1;
    } else if (action === 'trash') {
      if (row.status !== 'trashed') { setTrash('mistakes', row.id, 'trashed'); affected += 1; }
    } else if (action === 'restore') {
      if (row.status === 'trashed') { setTrash('mistakes', row.id, null); affected += 1; }
    } else if (action === 'pending') {
      updateMistakeFields(row.id, { status: 'pending', reviewedAt: null });
      affected += 1;
    } else if (action === 'delete') {
      db.prepare('DELETE FROM mistakes WHERE id = ?').run(row.id);
      affected += 1;
    }
  }
  res.json({ ok: true, affected });
}));
