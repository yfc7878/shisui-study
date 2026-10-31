import express from 'express';
import { db, getCounts, mapMistake, mapSentence, mapVocab } from '../db.js';
import {
  emptyTrash, getTrashSettings, permanentlyDeleteItems, purgeExpiredTrash, saveTrashSettings,
} from '../trash-service.js';
import { HttpError, asyncRoute, cleanText, newId, nowIso, truncate } from '../utils.js';

export const reviewRouter = express.Router();
export const trashRouter = express.Router();

export function pendingReviewItems() {
  const mistakes = db.prepare("SELECT * FROM mistakes WHERE status='pending' ORDER BY created_at DESC LIMIT 200").all()
    .map((row) => {
      const item = mapMistake(row);
      return {
        type: 'mistake',
        id: item.id,
        title: truncate(item.questionText || item.title || '图片错题', 92),
        subtitle: [item.subject, item.source, `难度 ${item.difficulty}/5`].filter(Boolean).join(' · '),
        createdAt: item.createdAt,
        hasImages: item.images.length > 0,
        item,
      };
    });
  const sentences = db.prepare("SELECT * FROM sentences WHERE status='pending' ORDER BY created_at DESC LIMIT 200").all()
    .map((row) => {
      const item = mapSentence(row);
      return {
        type: 'sentence',
        id: item.id,
        title: truncate(item.content || '英文佳句', 110),
        subtitle: [item.theme, item.summary].filter(Boolean).join(' · ') || item.translation.slice(0, 60),
        createdAt: item.createdAt,
        item,
      };
    });
  const vocab = db.prepare("SELECT * FROM vocab_entries WHERE status='pending' ORDER BY created_at DESC LIMIT 200").all()
    .map((row) => {
      const item = mapVocab(row);
      return {
        type: 'vocab',
        id: item.id,
        title: item.term,
        subtitle: [item.entryType === 'phrase' ? '词组' : '单词', item.theme, item.data?.coreTranslation]
          .filter(Boolean).join(' · '),
        createdAt: item.createdAt,
        item,
      };
    });
  return [...mistakes, ...sentences, ...vocab].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

reviewRouter.get('/counts', asyncRoute(async (req, res) => {
  const counts = getCounts();
  const byType = {
    mistake: counts.mistakes.pending,
    sentence: counts.sentences.pending,
    vocab: counts.vocab.pending,
  };
  res.json({
    counts: {
      mistake: byType.mistake,
      sentence: byType.sentence,
      vocab: byType.vocab,
      all: byType.mistake + byType.sentence + byType.vocab,
    },
  });
}));

reviewRouter.get('/', asyncRoute(async (req, res) => {
  const type = req.query.type || 'all';
  const all = pendingReviewItems();
  const items = type === 'all' ? all : all.filter((entry) => entry.type === type);
  const counts = {
    all: all.length,
    mistake: all.filter((entry) => entry.type === 'mistake').length,
    sentence: all.filter((entry) => entry.type === 'sentence').length,
    vocab: all.filter((entry) => entry.type === 'vocab').length,
  };
  res.json({ items, counts });
}));

const TABLE = { mistake: 'mistakes', sentence: 'sentences', vocab: 'vocab_entries' };

reviewRouter.post('/bulk', asyncRoute(async (req, res) => {
  const { items, action } = req.body || {};
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, '没有选择待审阅内容', 'NO_SELECTION');
  if (!['approve', 'trash', 'delete'].includes(action)) throw new HttpError(400, '未知操作', 'BAD_ACTION');
  let affected = 0;
  for (const entry of items.slice(0, 500)) {
    const table = TABLE[entry?.type];
    if (!table || !entry.id) continue;
    if (action === 'delete') {
      const changed = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(String(entry.id)).changes;
      affected += changed;
    } else if (action === 'trash') {
      const at = nowIso();
      const changed = db.prepare(`UPDATE ${table} SET status='trashed', status_before_delete='pending', deleted_at=?, updated_at=? WHERE id = ? AND status='pending'`).run(at, at, String(entry.id)).changes;
      affected += changed;
    } else {
      const at = nowIso();
      const changed = db.prepare(`UPDATE ${table} SET status='active', reviewed_at=?, updated_at=? WHERE id = ? AND status='pending'`).run(at, at, String(entry.id)).changes;
      affected += changed;
    }
  }
  res.json({ ok: true, affected });
}));

trashRouter.get('/', asyncRoute(async (req, res) => {
  const mistakes = db.prepare("SELECT * FROM mistakes WHERE status='trashed' ORDER BY deleted_at DESC LIMIT 300").all()
    .map((row) => ({ type: 'mistake', id: row.id, deletedAt: row.deleted_at, item: mapMistake(row) }));
  const sentences = db.prepare("SELECT * FROM sentences WHERE status='trashed' ORDER BY deleted_at DESC LIMIT 300").all()
    .map((row) => ({ type: 'sentence', id: row.id, deletedAt: row.deleted_at, item: mapSentence(row) }));
  const vocab = db.prepare("SELECT * FROM vocab_entries WHERE status='trashed' ORDER BY deleted_at DESC LIMIT 300").all()
    .map((row) => ({ type: 'vocab', id: row.id, deletedAt: row.deleted_at, item: mapVocab(row) }));
  const items = [...mistakes, ...sentences, ...vocab].sort((a, b) => {
    const timeA = new Date(a.deletedAt).getTime();
    const timeB = new Date(b.deletedAt).getTime();
    return (Number.isFinite(timeB) ? timeB : 0) - (Number.isFinite(timeA) ? timeA : 0);
  });
  res.json({
    items,
    counts: { mistake: mistakes.length, sentence: sentences.length, vocab: vocab.length, all: items.length },
    totals: getCounts(),
    settings: getTrashSettings(),
  });
}));

trashRouter.put('/settings', asyncRoute(async (req, res) => {
  const body = req.body || {};
  if (body.retentionDays !== undefined && !Number.isFinite(Number(body.retentionDays))) {
    throw new HttpError(400, '保留天数不合法', 'BAD_RETENTION');
  }
  const settings = saveTrashSettings({
    autoPurge: body.autoPurge,
    retentionDays: body.retentionDays,
  });
  // 开启自动清理时立刻执行一次，避免用户以为开启了却要等 6 小时。
  if (settings.autoPurge) {
    purgeExpiredTrash();
  }
  res.json({ ok: true, settings: getTrashSettings() });
}));

trashRouter.post('/purge-expired', asyncRoute(async (req, res) => {
  const result = purgeExpiredTrash({ force: true });
  const settings = getTrashSettings();
  res.json({
    ok: true,
    affected: result.affected || 0,
    uploadsRemoved: result.uploadsRemoved || 0,
    details: result.details || {},
    settings,
  });
}));

trashRouter.post('/bulk', asyncRoute(async (req, res) => {
  const { items, action } = req.body || {};
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, '没有选择内容', 'NO_SELECTION');
  if (!['restore', 'delete'].includes(action)) throw new HttpError(400, '未知操作', 'BAD_ACTION');
  if (action === 'delete') {
    const result = permanentlyDeleteItems(items);
    return res.json({ ok: true, affected: result.affected, uploadsRemoved: result.uploadsRemoved });
  }
  let affected = 0;
  for (const entry of items.slice(0, 500)) {
    const table = TABLE[entry?.type];
    if (!table || !entry.id) continue;
    const at = nowIso();
    affected += db.prepare(`UPDATE ${table} SET status = COALESCE(status_before_delete,'pending'), deleted_at = NULL, updated_at = ? WHERE id = ? AND status='trashed'`).run(at, String(entry.id)).changes;
  }
  return res.json({ ok: true, affected });
}));

trashRouter.post('/empty', asyncRoute(async (req, res) => {
  const result = emptyTrash();
  res.json({ ok: true, affected: result.affected, uploadsRemoved: result.uploadsRemoved });
}));

export const miscRouter = express.Router();

const DAY_MS = 24 * 60 * 60 * 1000;
const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

function shanghaiKey(date = new Date()) {
  return new Date(date.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

function dayStartUtc(key) {
  return new Date(`${key}T00:00:00+08:00`);
}

function dateKeys(days) {
  const now = new Date();
  const keys = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    keys.push(shanghaiKey(new Date(now.getTime() - i * DAY_MS)));
  }
  return keys;
}

function countSince(sql, from, to, ...params) {
  return db.prepare(sql).get(from, to, ...params).n;
}

miscRouter.get('/meta', (req, res) => {
  res.json({
    version: req.app.locals.version,
    subjects: ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理', '其他'],
    errorReasons: [
      '概念不清', '计算失误', '审题不清', '思路错误', '公式记错', '单位/符号错误',
      '粗心抄错', '方法不熟', '时间不足', '完全不会', '其他',
    ],
    sources: ['日常作业', '周测', '月考', '期中', '期末', '模拟卷', '练习册', '其他'],
    sentenceThemes: ['人物描写', '环境描写', '观点表达', '过渡衔接', '因果论证', '对比转折', '情感态度', '高级替换', '其他'],
    vocabThemes: ['高频词', '熟词生义', '完形填空', '阅读理解', '写作升级', '易混词', '其他'],
    subjectColors: {
      语文: '#C96F5A', 数学: '#3F7C6A', 英语: '#4A6FA5', 物理: '#7C6BA8',
      化学: '#B07C3E', 生物: '#4E8C62', 政治: '#A65A6E', 历史: '#8B6B4A', 地理: '#4A7F8C', 其他: '#78847C',
    },
    difficultyLabels: ['', '很基础', '较基础', '中等', '较难', '压轴'],
  });
});

miscRouter.get('/dashboard', asyncRoute(async (req, res) => {
  const counts = getCounts();
  const pendingTotal = counts.mistakes.pending + counts.sentences.pending + counts.vocab.pending;
  const days = dateKeys(7);
  const weekly = days.map((key) => {
    const from = dayStartUtc(key).toISOString();
    const to = dayStartUtc(shanghaiKey(new Date(dayStartUtc(key).getTime() + DAY_MS))).toISOString();
    const mistakes = countSince("SELECT COUNT(*) n FROM mistakes WHERE status <> 'trashed' AND created_at >= ? AND created_at < ?", from, to);
    const sentences = countSince("SELECT COUNT(*) n FROM sentences WHERE status <> 'trashed' AND created_at >= ? AND created_at < ?", from, to);
    const vocab = countSince("SELECT COUNT(*) n FROM vocab_entries WHERE status <> 'trashed' AND created_at >= ? AND created_at < ?", from, to);
    const focusSec = db.prepare("SELECT COALESCE(SUM(duration_sec),0) n FROM focus_sessions WHERE created_at >= ? AND created_at < ? AND mode='focus'").get(from, to).n;
    return {
      date: key,
      label: `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`,
      mistakes, sentences, vocab,
      total: mistakes + sentences + vocab,
      focusMinutes: Math.round(focusSec / 60),
    };
  });

  const activeMistakes = db.prepare("SELECT subject, COUNT(*) count FROM mistakes WHERE status='active' GROUP BY subject").all();
  const themes = db.prepare("SELECT theme, COUNT(*) count FROM sentences WHERE status='active' AND theme <> '' GROUP BY theme ORDER BY count DESC LIMIT 8").all();
  const vocabThemes = db.prepare("SELECT theme, COUNT(*) count FROM vocab_entries WHERE status='active' AND theme <> '' GROUP BY theme ORDER BY count DESC LIMIT 8").all();

  const recent = [
    ...db.prepare("SELECT id, status, subject, source, question_text, created_at FROM mistakes WHERE status <> 'trashed' ORDER BY created_at DESC LIMIT 6").all()
      .map((row) => ({ type: 'mistake', id: row.id, title: truncate(row.question_text || '图片错题', 80), subtitle: [row.subject, row.source].filter(Boolean).join(' · '), status: row.status, createdAt: row.created_at })),
    ...db.prepare("SELECT id, status, content, theme, created_at FROM sentences WHERE status <> 'trashed' ORDER BY created_at DESC LIMIT 6").all()
      .map((row) => ({ type: 'sentence', id: row.id, title: truncate(row.content, 95), subtitle: row.theme, status: row.status, createdAt: row.created_at })),
    ...db.prepare("SELECT id, status, term, theme, created_at FROM vocab_entries WHERE status <> 'trashed' ORDER BY created_at DESC LIMIT 4").all()
      .map((row) => ({ type: 'vocab', id: row.id, title: row.term, subtitle: row.theme, status: row.status, createdAt: row.created_at })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);

  const todayKey = shanghaiKey();
  const todayFrom = dayStartUtc(todayKey).toISOString();
  const weekFrom = dayStartUtc(days[0]).toISOString();
  const focusTodaySec = db.prepare("SELECT COALESCE(SUM(duration_sec),0) n FROM focus_sessions WHERE created_at >= ? AND mode='focus'").get(todayFrom).n;
  const focusWeekSec = db.prepare("SELECT COALESCE(SUM(duration_sec),0) n FROM focus_sessions WHERE created_at >= ? AND mode='focus'").get(weekFrom).n;

  const activityDays = new Set();
  for (const row of db.prepare(`
    SELECT day FROM (
      SELECT date(created_at, '+8 hours') day FROM mistakes WHERE status <> 'trashed'
      UNION ALL SELECT date(created_at, '+8 hours') FROM sentences WHERE status <> 'trashed'
      UNION ALL SELECT date(created_at, '+8 hours') FROM vocab_entries WHERE status <> 'trashed'
      UNION ALL SELECT date(created_at, '+8 hours') FROM focus_sessions WHERE mode='focus' AND completed=1
    ) GROUP BY day ORDER BY day DESC LIMIT 400
  `).all()) activityDays.add(row.day);
  let streak = 0;
  for (let i = 0; i < 400; i += 1) {
    const key = shanghaiKey(new Date(Date.now() - i * DAY_MS));
    if (activityDays.has(key)) streak += 1;
    else if (i === 0) continue;
    else break;
  }

  res.json({
    counts,
    pendingTotal,
    weekly,
    totals: {
      mistakes: counts.mistakes.active,
      sentences: counts.sentences.active,
      vocab: counts.vocab.active,
      activeAll: counts.mistakes.active + counts.sentences.active + counts.vocab.active,
    },
    subjects: activeMistakes,
    themes,
    vocabThemes,
    recent,
    focus: {
      todayMinutes: Math.round(focusTodaySec / 60),
      weekMinutes: Math.round(focusWeekSec / 60),
      totalSessions: db.prepare("SELECT COUNT(*) n FROM focus_sessions WHERE mode='focus' AND completed=1").get().n,
    },
    streak,
    today: todayKey,
  });
}));

miscRouter.post('/focus/sessions', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const id = newId();
  const duration = Math.min(24 * 3600, Math.max(1, Number(body.durationSec) || 0));
  const mode = body.mode === 'break' ? 'break' : 'focus';
  const startedAt = cleanText(body.startedAt, 40) || new Date(Date.now() - duration * 1000).toISOString();
  const endedAt = cleanText(body.endedAt, 40) || new Date().toISOString();
  db.prepare(`
    INSERT INTO focus_sessions (id, mode, duration_sec, label, completed, started_at, ended_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, mode, duration, cleanText(body.label, 80) || '专注', body.completed ? 1 : 0, startedAt, endedAt, new Date().toISOString());
  res.status(201).json({ ok: true, id });
}));

miscRouter.get('/focus/summary', asyncRoute(async (req, res) => {
  const days = dateKeys(14);
  const daily = days.map((key) => {
    const from = dayStartUtc(key).toISOString();
    const to = dayStartUtc(shanghaiKey(new Date(dayStartUtc(key).getTime() + DAY_MS))).toISOString();
    const row = db.prepare("SELECT COALESCE(SUM(duration_sec),0) seconds, COUNT(*) sessions FROM focus_sessions WHERE mode='focus' AND completed=1 AND created_at >= ? AND created_at < ?").get(from, to);
    return { date: key, minutes: Math.round(row.seconds / 60), sessions: row.sessions };
  });
  const total = db.prepare("SELECT COALESCE(SUM(duration_sec),0) seconds, COUNT(*) sessions FROM focus_sessions WHERE mode='focus' AND completed=1").get();
  res.json({ daily, totalMinutes: Math.round(total.seconds / 60), totalSessions: total.sessions });
}));

miscRouter.get('/backup', asyncRoute(async (req, res) => {
  const backup = {
    format: 'shisui-study-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    mistakes: db.prepare('SELECT * FROM mistakes').all(),
    sentences: db.prepare('SELECT * FROM sentences').all(),
    vocab: db.prepare('SELECT * FROM vocab_entries').all(),
    focus: db.prepare('SELECT * FROM focus_sessions').all(),
    uploads: db.prepare('SELECT * FROM uploads').all(),
    note: '此备份包含全部文字数据；图片文件位于服务器 data/uploads 目录，请与整个 data 目录一起备份。',
  };
  const name = `shisui-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(JSON.stringify(backup, null, 2));
}));
