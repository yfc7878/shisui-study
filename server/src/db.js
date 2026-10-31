import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { parseJson, toJson, nowIso, newId } from './utils.js';

export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');
db.exec('PRAGMA busy_timeout = 5000;');
db.exec('PRAGMA foreign_keys = ON;');

function tableExists(name) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function columnsOf(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
}

function ensureColumn(table, name, definition) {
  if (!tableExists(table)) return;
  if (!columnsOf(table).includes(name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_name TEXT DEFAULT '',
      mime TEXT DEFAULT 'image/jpeg',
      size INTEGER DEFAULT 0,
      width INTEGER DEFAULT 0,
      height INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mistakes (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      subject TEXT DEFAULT '',
      source TEXT DEFAULT '',
      chapter TEXT DEFAULT '',
      error_reason TEXT DEFAULT '',
      difficulty INTEGER DEFAULT 3,
      question_text TEXT DEFAULT '',
      answer_text TEXT DEFAULT '',
      analysis_text TEXT DEFAULT '',
      knowledge_points TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      images TEXT DEFAULT '[]',
      figures TEXT DEFAULT '[]',
      figure_hints TEXT DEFAULT '[]',
      reasoning TEXT DEFAULT '',
      think INTEGER DEFAULT 0,
      note TEXT DEFAULT '',
      ai_meta TEXT DEFAULT '{}',
      status_before_delete TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      reviewed_at TEXT,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sentences (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      theme TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      content TEXT DEFAULT '',
      translation TEXT DEFAULT '',
      usage_text TEXT DEFAULT '',
      example TEXT DEFAULT '',
      example_translation TEXT DEFAULT '',
      source TEXT DEFAULT '',
      source_type TEXT DEFAULT 'manual',
      tags TEXT DEFAULT '[]',
      note TEXT DEFAULT '',
      reasoning TEXT DEFAULT '',
      think INTEGER DEFAULT 0,
      ai_meta TEXT DEFAULT '{}',
      status_before_delete TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      reviewed_at TEXT,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS vocab_entries (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      term TEXT DEFAULT '',
      entry_type TEXT DEFAULT 'word',
      theme TEXT DEFAULT '',
      data TEXT DEFAULT '{}',
      reasoning TEXT DEFAULT '',
      think INTEGER DEFAULT 0,
      ai_meta TEXT DEFAULT '{}',
      status_before_delete TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      reviewed_at TEXT,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS focus_sessions (
      id TEXT PRIMARY KEY,
      mode TEXT DEFAULT 'focus',
      duration_sec INTEGER DEFAULT 0,
      label TEXT DEFAULT '',
      completed INTEGER DEFAULT 0,
      started_at TEXT,
      ended_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_notes (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_mistakes_status ON mistakes(status);
    CREATE INDEX IF NOT EXISTS idx_mistakes_created ON mistakes(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mistakes_subject ON mistakes(subject);
    CREATE INDEX IF NOT EXISTS idx_sentences_status ON sentences(status);
    CREATE INDEX IF NOT EXISTS idx_sentences_theme ON sentences(theme);
    CREATE INDEX IF NOT EXISTS idx_sentences_created ON sentences(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_vocab_status ON vocab_entries(status);
    CREATE INDEX IF NOT EXISTS idx_vocab_created ON vocab_entries(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_focus_created ON focus_sessions(created_at DESC);
  `);

  ensureColumn('mistakes', 'figure_hints', "TEXT DEFAULT '[]'");
  ensureColumn('mistakes', 'status_before_delete', "TEXT DEFAULT 'pending'");
  ensureColumn('sentences', 'status_before_delete', "TEXT DEFAULT 'pending'");
  ensureColumn('vocab_entries', 'status_before_delete', "TEXT DEFAULT 'pending'");
  ensureColumn('mistakes', 'title', "TEXT DEFAULT ''");
  ensureColumn('sentences', 'title', "TEXT DEFAULT ''");
}

migrate();

export function getUpload(id) {
  return db.prepare('SELECT * FROM uploads WHERE id = ?').get(id) || null;
}

export function mapUpload(row) {
  if (!row) return null;
  return {
    id: row.id,
    url: `/uploads/${row.filename}`,
    filename: row.filename,
    name: row.original_name || '',
    mime: row.mime || 'image/jpeg',
    size: row.size || 0,
    width: row.width || 0,
    height: row.height || 0,
    createdAt: row.created_at,
  };
}

export function mapMistake(row, { full = true } = {}) {
  if (!row) return null;
  const base = {
    id: row.id,
    status: row.status,
    subject: row.subject || '',
    source: row.source || '',
    chapter: row.chapter || '',
    errorReason: row.error_reason || '',
    difficulty: row.difficulty || 3,
    title: row.title || '',
    questionText: row.question_text || '',
    knowledgePoints: parseJson(row.knowledge_points, []),
    tags: parseJson(row.tags, []),
    images: parseJson(row.images, []),
    figures: parseJson(row.figures, []),
    figureHints: parseJson(row.figure_hints, []),
    think: Boolean(row.think),
    note: row.note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at || null,
    deletedAt: row.deleted_at || null,
  };
  if (!full) {
    return {
      ...base,
      answerText: undefined,
      analysisText: undefined,
      reasoning: undefined,
      aiMeta: undefined,
    };
  }
  return {
    ...base,
    answerText: row.answer_text || '',
    analysisText: row.analysis_text || '',
    reasoning: row.reasoning || '',
    aiMeta: parseJson(row.ai_meta, {}),
  };
}

export function mapSentence(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    theme: row.theme || '',
    title: row.title || '',
    summary: row.summary || '',
    content: row.content || '',
    translation: row.translation || '',
    usage: row.usage_text || '',
    example: row.example || '',
    exampleTranslation: row.example_translation || '',
    source: row.source || '',
    sourceType: row.source_type || 'manual',
    tags: parseJson(row.tags, []),
    note: row.note || '',
    reasoning: row.reasoning || '',
    think: Boolean(row.think),
    aiMeta: parseJson(row.ai_meta, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at || null,
    deletedAt: row.deleted_at || null,
  };
}

export function mapVocab(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    term: row.term || '',
    entryType: row.entry_type || 'word',
    theme: row.theme || '',
    data: parseJson(row.data, {}),
    reasoning: row.reasoning || '',
    think: Boolean(row.think),
    aiMeta: parseJson(row.ai_meta, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at || null,
    deletedAt: row.deleted_at || null,
  };
}

export function createMistake(input = {}, status = 'pending') {
  const id = newId();
  const at = nowIso();
  db.prepare(`
    INSERT INTO mistakes (
      id, status, subject, source, chapter, error_reason, difficulty, title,
      question_text, answer_text, analysis_text, knowledge_points, tags, images,
      figures, figure_hints, reasoning, think, note, ai_meta, status_before_delete,
      created_at, updated_at, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    status,
    input.subject || '',
    input.source || '',
    input.chapter || '',
    input.errorReason || '',
    Number(input.difficulty) || 3,
    input.title || '',
    input.questionText || '',
    input.answerText || '',
    input.analysisText || '',
    toJson(input.knowledgePoints),
    toJson(input.tags),
    toJson(input.images),
    toJson(input.figures),
    toJson(input.figureHints),
    input.reasoning || '',
    input.think ? 1 : 0,
    input.note || '',
    toJson(input.aiMeta, {}),
    status === 'trashed' ? 'pending' : status,
    at,
    at,
    status === 'active' ? at : null,
  );
  return getMistakeRow(id);
}

export function getMistakeRow(id) {
  return db.prepare('SELECT * FROM mistakes WHERE id = ?').get(id) || null;
}

export function updateMistakeFields(id, fields) {
  const map = {
    status: 'status',
    subject: 'subject',
    source: 'source',
    chapter: 'chapter',
    errorReason: 'error_reason',
    difficulty: 'difficulty',
    title: 'title',
    questionText: 'question_text',
    answerText: 'answer_text',
    analysisText: 'analysis_text',
    knowledgePoints: 'knowledge_points',
    tags: 'tags',
    images: 'images',
    figures: 'figures',
    figureHints: 'figure_hints',
    reasoning: 'reasoning',
    think: 'think',
    note: 'note',
    aiMeta: 'ai_meta',
    reviewedAt: 'reviewed_at',
    deletedAt: 'deleted_at',
    statusBeforeDelete: 'status_before_delete',
  };
  const entries = Object.entries(fields).filter(([key]) => map[key] !== undefined);
  if (!entries.length) return getMistakeRow(id);
  const jsonFields = new Set([
    'knowledgePoints', 'tags', 'images', 'figures', 'figureHints', 'aiMeta',
  ]);
  const sets = [];
  const params = [];
  for (const [key, value] of entries) {
    sets.push(`${map[key]} = ?`);
    if (jsonFields.has(key)) params.push(toJson(value, key === 'aiMeta' ? {} : []));
    else if (key === 'think') params.push(value ? 1 : 0);
    else if (key === 'difficulty') params.push(Number(value) || 3);
    else params.push(value === undefined ? null : value);
  }
  sets.push('updated_at = ?');
  params.push(nowIso(), id);
  db.prepare(`UPDATE mistakes SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return getMistakeRow(id);
}

export function createSentence(input = {}, status = 'pending') {
  const id = newId();
  const at = nowIso();
  db.prepare(`
    INSERT INTO sentences (
      id, status, theme, title, summary, content, translation, usage_text, example,
      example_translation, source, source_type, tags, note, reasoning, think, ai_meta,
      status_before_delete, created_at, updated_at, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    status,
    input.theme || '',
    input.title || '',
    input.summary || '',
    input.content || '',
    input.translation || '',
    input.usage || '',
    input.example || '',
    input.exampleTranslation || '',
    input.source || '',
    input.sourceType || 'manual',
    toJson(input.tags),
    input.note || '',
    input.reasoning || '',
    input.think ? 1 : 0,
    toJson(input.aiMeta, {}),
    status === 'trashed' ? 'pending' : status,
    at,
    at,
    status === 'active' ? at : null,
  );
  return getSentenceRow(id);
}

export function getSentenceRow(id) {
  return db.prepare('SELECT * FROM sentences WHERE id = ?').get(id) || null;
}

export function updateSentenceFields(id, fields) {
  const map = {
    status: 'status',
    theme: 'theme',
    title: 'title',
    summary: 'summary',
    content: 'content',
    translation: 'translation',
    usage: 'usage_text',
    example: 'example',
    exampleTranslation: 'example_translation',
    source: 'source',
    sourceType: 'source_type',
    tags: 'tags',
    note: 'note',
    reasoning: 'reasoning',
    think: 'think',
    aiMeta: 'ai_meta',
    reviewedAt: 'reviewed_at',
    deletedAt: 'deleted_at',
    statusBeforeDelete: 'status_before_delete',
  };
  const entries = Object.entries(fields).filter(([key]) => map[key] !== undefined);
  if (!entries.length) return getSentenceRow(id);
  const sets = [];
  const params = [];
  for (const [key, value] of entries) {
    sets.push(`${map[key]} = ?`);
    if (key === 'tags') params.push(toJson(value));
    else if (key === 'aiMeta') params.push(toJson(value, {}));
    else if (key === 'think') params.push(value ? 1 : 0);
    else params.push(value === undefined ? null : value);
  }
  sets.push('updated_at = ?');
  params.push(nowIso(), id);
  db.prepare(`UPDATE sentences SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return getSentenceRow(id);
}

export function createVocab(input = {}, status = 'pending') {
  const id = newId();
  const at = nowIso();
  db.prepare(`
    INSERT INTO vocab_entries (
      id, status, term, entry_type, theme, data, reasoning, think, ai_meta,
      status_before_delete, created_at, updated_at, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    status,
    input.term || '',
    input.entryType || 'word',
    input.theme || '',
    toJson(input.data, {}),
    input.reasoning || '',
    input.think ? 1 : 0,
    toJson(input.aiMeta, {}),
    status === 'trashed' ? 'pending' : status,
    at,
    at,
    status === 'active' ? at : null,
  );
  return getVocabRow(id);
}

export function getVocabRow(id) {
  return db.prepare('SELECT * FROM vocab_entries WHERE id = ?').get(id) || null;
}

export function updateVocabFields(id, fields) {
  const map = {
    status: 'status',
    term: 'term',
    entryType: 'entry_type',
    theme: 'theme',
    data: 'data',
    reasoning: 'reasoning',
    think: 'think',
    aiMeta: 'ai_meta',
    reviewedAt: 'reviewed_at',
    deletedAt: 'deleted_at',
    statusBeforeDelete: 'status_before_delete',
  };
  const entries = Object.entries(fields).filter(([key]) => map[key] !== undefined);
  if (!entries.length) return getVocabRow(id);
  const sets = [];
  const params = [];
  for (const [key, value] of entries) {
    sets.push(`${map[key]} = ?`);
    if (key === 'data') params.push(toJson(value, {}));
    else if (key === 'aiMeta') params.push(toJson(value, {}));
    else if (key === 'think') params.push(value ? 1 : 0);
    else params.push(value === undefined ? null : value);
  }
  sets.push('updated_at = ?');
  params.push(nowIso(), id);
  db.prepare(`UPDATE vocab_entries SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return getVocabRow(id);
}

export function setTrash(table, id, status) {
  const row = db.prepare(`SELECT status, status_before_delete FROM ${table} WHERE id = ?`).get(id);
  if (!row) return false;
  if (status === 'trashed') {
    const before = row.status === 'trashed' ? row.status_before_delete : row.status;
    db.prepare(`UPDATE ${table} SET status = 'trashed', status_before_delete = ?, deleted_at = ?, updated_at = ? WHERE id = ?`)
      .run(before || 'pending', nowIso(), nowIso(), id);
  } else {
    const target = status || row.status_before_delete || 'pending';
    db.prepare(`UPDATE ${table} SET status = ?, deleted_at = NULL, updated_at = ? WHERE id = ?`)
      .run(target, nowIso(), id);
  }
  return true;
}

export function approve(table, id) {
  const at = nowIso();
  const result = db.prepare(`UPDATE ${table} SET status = 'active', reviewed_at = ?, updated_at = ?, deleted_at = NULL WHERE id = ?`)
    .run(at, at, id);
  return result.changes > 0;
}

export function getCounts() {
  const one = (sql, ...params) => db.prepare(sql).get(...params)?.n || 0;
  return {
    mistakes: {
      active: one("SELECT COUNT(*) n FROM mistakes WHERE status='active'"),
      pending: one("SELECT COUNT(*) n FROM mistakes WHERE status='pending'"),
      trashed: one("SELECT COUNT(*) n FROM mistakes WHERE status='trashed'"),
    },
    sentences: {
      active: one("SELECT COUNT(*) n FROM sentences WHERE status='active'"),
      pending: one("SELECT COUNT(*) n FROM sentences WHERE status='pending'"),
      trashed: one("SELECT COUNT(*) n FROM sentences WHERE status='trashed'"),
    },
    vocab: {
      active: one("SELECT COUNT(*) n FROM vocab_entries WHERE status='active'"),
      pending: one("SELECT COUNT(*) n FROM vocab_entries WHERE status='pending'"),
      trashed: one("SELECT COUNT(*) n FROM vocab_entries WHERE status='trashed'"),
    },
  };
}

export default db;
