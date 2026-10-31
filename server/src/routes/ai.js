import express from 'express';
import {
  analyzeVocab, detectHandwriting, extractMistakes, generateSentences, publicAiInfo, regenerateMistake,
  regenerateSentence, regenerateVocab, resolveAiConfig, testConnection,
} from '../ai-service.js';
import { aiCleanStatus, inpaintWithLama } from '../ai-clean.js';
import {
  createMistake, createSentence, createVocab, getMistakeRow, getSentenceRow,
  getVocabRow, mapMistake, mapSentence, mapVocab, updateMistakeFields,
  updateSentenceFields, updateVocabFields,
} from '../db.js';
import { HttpError, asyncRoute, cleanText, truncate } from '../utils.js';

export const aiRouter = express.Router();

aiRouter.get('/info', (req, res) => res.json(publicAiInfo()));

aiRouter.get('/clean-status', (req, res) => res.json(aiCleanStatus()));

aiRouter.post('/inpaint', asyncRoute(async (req, res) => {
  const { imageData, maskData } = req.body || {};
  const result = await inpaintWithLama({ imageData, maskData });
  res.json(result);
}));

function thinkFlag(value) {
  return value === true || value === 'true' || value === 1;
}

aiRouter.post('/test', asyncRoute(async (req, res) => {
  const result = await testConnection(req.body?.ai || {});
  res.json(result);
}));

aiRouter.post('/detect-handwriting', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const ai = resolveAiConfig(body.ai || {});
  const result = await detectHandwriting({
    ai,
    imageData: body.imageData,
    think: thinkFlag(body.think),
  });
  res.json({
    regions: result.regions,
    meta: {
      model: result.model,
      usage: result.usage,
      promptVersion: result.promptVersion,
    },
  });
}));

aiRouter.post('/extract-mistake', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const ai = resolveAiConfig(body.ai || {});
  const think = thinkFlag(body.think);
  const extracted = await extractMistakes({
    ai,
    imageIds: body.imageIds,
    think,
    subjectHint: cleanText(body.subjectHint, 20),
    extraInstructions: body.extraInstructions,
  });
  const items = extracted.questions.map((question) => {
    const row = createMistake({
      ...question,
      images: extracted.images,
      figures: [],
      figureHints: question.figures || [],
      think,
      note: '',
      aiMeta: { ...question.aiMeta, questionCount: extracted.questions.length },
    }, 'pending');
    return mapMistake(row);
  });
  res.status(201).json({
    items,
    meta: {
      model: extracted.result.model,
      usage: extracted.result.usage,
      questionCount: items.length,
    },
  });
}));

aiRouter.post('/mistake/:id/regenerate', asyncRoute(async (req, res) => {
  const row = getMistakeRow(req.params.id);
  if (!row) throw new HttpError(404, '错题不存在', 'NOT_FOUND');
  const body = req.body || {};
  const ai = resolveAiConfig(body.ai || {});
  const think = thinkFlag(body.think);
  const result = await regenerateMistake({
    ai,
    item: mapMistake(row),
    think,
    extraInstructions: body.extraInstructions,
  });
  const updated = updateMistakeFields(row.id, {
    subject: result.subject,
    questionText: result.questionText || row.question_text,
    answerText: result.answerText,
    analysisText: result.analysisText,
    knowledgePoints: result.knowledgePoints,
    tags: result.tags,
    difficulty: result.difficulty,
    figureHints: result.figures?.length ? result.figures : [],
    reasoning: result.reasoning,
    think,
    aiMeta: result.aiMeta,
  });
  res.json({ item: mapMistake(updated) });
}));

aiRouter.post('/sentences', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const ai = resolveAiConfig(body.ai || {});
  const think = thinkFlag(body.think);
  const mode = ['topic', 'text', 'images'].includes(body.mode) ? body.mode : 'topic';
  const result = await generateSentences({
    ai,
    mode,
    topic: body.topic,
    text: body.text,
    imageIds: body.imageIds,
    count: body.count,
    think,
    extraInstructions: body.extraInstructions,
  });
  const items = result.sentences.map((sentence) => mapSentence(createSentence(sentence, 'pending')));
  res.status(201).json({
    items,
    theme: result.theme,
    meta: { model: result.result.model, usage: result.result.usage },
  });
}));

aiRouter.post('/sentences/:id/regenerate', asyncRoute(async (req, res) => {
  const row = getSentenceRow(req.params.id);
  if (!row) throw new HttpError(404, '佳句不存在', 'NOT_FOUND');
  const body = req.body || {};
  const ai = resolveAiConfig(body.ai || {});
  const think = thinkFlag(body.think);
  const result = await regenerateSentence({
    ai,
    item: mapSentence(row),
    think,
    extraInstructions: body.extraInstructions,
  });
  const updated = updateSentenceFields(row.id, {
    theme: result.theme,
    title: result.title,
    content: result.content,
    translation: result.translation,
    usage: result.usage,
    example: result.example,
    exampleTranslation: result.exampleTranslation,
    summary: result.summary,
    tags: result.tags,
    reasoning: result.reasoning,
    think,
    aiMeta: result.aiMeta,
  });
  res.json({ item: mapSentence(updated) });
}));

aiRouter.post('/vocab', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const term = cleanText(body.term, 120);
  if (!term) throw new HttpError(400, '请输入要解析的单词或词组', 'NO_TERM');
  const ai = resolveAiConfig(body.ai || {});
  const think = thinkFlag(body.think);
  const result = await analyzeVocab({
    ai,
    term,
    theme: cleanText(body.theme, 60),
    think,
    extraInstructions: body.extraInstructions,
  });
  const row = createVocab({
    term: result.term,
    entryType: result.entryType,
    theme: result.theme,
    data: result.data,
    reasoning: result.reasoning,
    think,
    aiMeta: result.aiMeta,
  }, 'pending');
  res.status(201).json({ item: mapVocab(row) });
}));

aiRouter.post('/vocab/:id/regenerate', asyncRoute(async (req, res) => {
  const row = getVocabRow(req.params.id);
  if (!row) throw new HttpError(404, '词条不存在', 'NOT_FOUND');
  const body = req.body || {};
  const ai = resolveAiConfig(body.ai || {});
  const think = thinkFlag(body.think);
  const result = await regenerateVocab({
    ai,
    item: mapVocab(row),
    think,
    extraInstructions: body.extraInstructions,
  });
  const updated = updateVocabFields(row.id, {
    term: result.term,
    entryType: result.entryType,
    theme: result.theme,
    data: result.data,
    reasoning: result.reasoning,
    think,
    aiMeta: result.aiMeta,
  });
  res.json({ item: mapVocab(updated) });
}));
