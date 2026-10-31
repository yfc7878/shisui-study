import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { getUpload, mapUpload } from './db.js';
import {
  PROMPT_VERSION, handwritingPrompt, mistakeExtractionPrompt, mistakeRegeneratePrompt, sentencesPrompt,
  sentenceRegeneratePrompt, vocabPrompt, vocabRegeneratePrompt,
} from './prompts.js';
import { HttpError, cleanText } from './utils.js';

const TIMEOUT_MS = 240_000;

export function publicAiInfo() {
  return {
    serverKeyConfigured: Boolean(config.deepseekApiKey),
    defaultBaseUrl: config.deepseekBaseUrl,
    defaultModel: config.deepseekModel,
    promptVersion: PROMPT_VERSION,
    visionModel: 'deepseek-flash',
  };
}

export function resolveAiConfig(ai = {}) {
  const apiKey = cleanText(ai.apiKey || config.deepseekApiKey, 300);
  if (!apiKey) {
    throw new HttpError(
      400,
      '还没有配置 DeepSeek API Key。请点击右上角「设置 → AI 与提示词」填写，Key 只会保存在当前浏览器。',
      'NO_API_KEY',
    );
  }
  let baseUrl = cleanText(ai.baseUrl || config.deepseekBaseUrl, 500).replace(/\/+$/, '');
  try {
    const url = new URL(baseUrl);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('protocol');
    baseUrl = baseUrl.replace(/\/+$/, '');
  } catch {
    throw new HttpError(400, 'API Base URL 格式不正确，应类似 https://api.deepseek.com', 'BAD_BASE_URL');
  }
  const model = cleanText(ai.model || config.deepseekModel, 100) || 'deepseek-flash';
  const visionModel = cleanText(ai.visionModel || model || 'deepseek-flash', 100);
  return { apiKey, baseUrl, model, visionModel };
}

function endpoint(baseUrl) {
  if (baseUrl.endsWith('/chat/completions')) return baseUrl;
  return `${baseUrl}/chat/completions`;
}

function friendlyApiError(status, payload) {
  const detail = payload?.error?.message || payload?.message || '';
  const map = {
    400: 'AI 请求参数有误',
    401: 'DeepSeek API Key 无效，请到设置中检查',
    402: 'DeepSeek 账户余额不足',
    403: '该 API Key 没有权限',
    404: 'API 地址或模型名称不正确',
    422: '请求内容无法被模型接受',
    429: '请求太频繁或达到并发限制，请稍后再试',
    500: 'DeepSeek 服务暂时异常，请稍后重试',
    502: 'DeepSeek 网关异常，请稍后重试',
    503: 'DeepSeek 服务繁忙，请稍后重试',
  };
  const responseStatus = status >= 500
    ? 502
    : status === 401
      ? 401
      : status === 402
        ? 402
        : status === 429
          ? 429
          : 400;
  return new HttpError(
    responseStatus,
    `${map[status] || `AI 请求失败（${status}）`}${detail ? `：${String(detail).slice(0, 300)}` : ''}`,
    'AI_ERROR',
  );
}

async function once(payload, apiKey) {
  let response;
  try {
    response = await fetch(endpoint(payload.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'ShisuiStudy/1.0',
      },
      body: JSON.stringify(payload.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new HttpError(504, 'AI 响应超时（4 分钟）。题目图片过多或思考模式较慢，请减少图片或关闭思考模式后重试。', 'AI_TIMEOUT');
    }
    throw new HttpError(502, `无法连接 AI 服务：${error.message}`, 'AI_NETWORK');
  }
  let data = null;
  const rawText = await response.text();
  try { data = JSON.parse(rawText); } catch { data = null; }
  if (!response.ok) {
    if (response.status === 401) {
      const err = friendlyApiError(response.status, data);
      throw err;
    }
    throw friendlyApiError(response.status, data || { message: rawText.slice(0, 300) });
  }
  if (!data) throw new HttpError(502, 'AI 返回了无法解析的数据', 'AI_BAD_RESPONSE');
  return data;
}

export async function callChat({
  ai, messages, think = false, json = true, maxTokens = 8192, temperature = 0.35,
}) {
  const resolved = ai.apiKey && ai.baseUrl ? ai : resolveAiConfig(ai);
  const body = {
    model: resolved.model || 'deepseek-flash',
    messages,
    stream: false,
    max_tokens: maxTokens,
    thinking: think ? { type: 'enabled' } : { type: 'disabled' },
  };
  if (think) body.reasoning_effort = 'high';
  else if (temperature !== null && temperature !== undefined) body.temperature = temperature;
  if (json) body.response_format = { type: 'json_object' };

  const payload = { baseUrl: resolved.baseUrl, body };
  // 对 429/5xx 做一次短重试，避免偶发波动打断一次完整提取。
  let data;
  const started = Date.now();
  try {
    data = await once(payload, resolved.apiKey);
  } catch (error) {
    const retryable = error.code === 'AI_ERROR' && [429, 502].includes(error.status);
    if (!retryable || Date.now() - started > 60_000) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1400));
    data = await once(payload, resolved.apiKey);
  }
  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  if (!content || !String(content).trim()) {
    throw new HttpError(502, 'AI 没有返回有效内容，请重试一次', 'AI_EMPTY');
  }
  return {
    content: String(content),
    reasoning: cleanText(choice?.message?.reasoning_content || '', 60000),
    usage: data.usage || null,
    model: data.model || body.model,
  };
}

export function parseJsonObject(text) {
  let raw = String(text || '').trim().replace(/^\uFEFF/, '');
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) raw = raw.slice(first, last + 1);
  try {
    return JSON.parse(raw);
  } catch (error) {
    const err = new HttpError(502, 'AI 返回的 JSON 格式不完整，请点击「重来」再试一次', 'AI_JSON');
    err.cause = error;
    throw err;
  }
}

async function chatJson(args) {
  const result = await callChat(args);
  try {
    return { ...result, data: parseJsonObject(result.content) };
  } catch (error) {
    if (error.code !== 'AI_JSON') throw error;
    // 一次修复机会：把原回答交给模型修成严格 JSON。
    const repair = await callChat({
      ...args,
      json: true,
      think: false,
      maxTokens: Math.min(args.maxTokens || 8192, 8192),
      temperature: 0,
      messages: [
        { role: 'system', content: '你是 JSON 修复器。只输出一个严格合法的 JSON 对象，不改变原内容含义，不添加解释或代码围栏。' },
        { role: 'user', content: `请把下面的内容修复为合法 JSON：\n<content>\n${String(result.content).slice(0, 80000)}\n</content>` },
      ],
    });
    return { ...result, data: parseJsonObject(repair.content) };
  }
}

function bboxOf(value) {
  if (!Array.isArray(value) || value.length < 4) return null;
  let numbers = value.slice(0, 4).map(Number);
  if (numbers.some((n) => !Number.isFinite(n))) return null;
  if (numbers.some((n) => n > 1.5)) numbers = numbers.map((n) => n / 100);
  let [x, y, w, h] = numbers.map((n) => Math.min(1, Math.max(0, n)));
  if (w <= 0.01 || h <= 0.01) return null;
  if (x + w > 1) w = 1 - x;
  if (y + h > 1) h = 1 - y;
  if (w <= 0.01 || h <= 0.01) return null;
  return [Number(x.toFixed(4)), Number(y.toFixed(4)), Number(w.toFixed(4)), Number(h.toFixed(4))];
}

function stringArray(value, max = 12) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => cleanText(String(v ?? ''), 80)).filter(Boolean))].slice(0, max);
}

function normalizeFunctionGraphs(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const entry of value) {
    let expression = cleanText(entry?.expression || entry?.expr || '', 160)
      .replace(/[×✕]/g, '*')
      .replace(/÷/g, '/')
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .replace(/[−–]/g, '-')
      .replace(/^\s*(?:y|f\s*\(\s*x\s*\))\s*=\s*/i, '');
    if (!expression || !/[xX]/.test(expression)) continue;
    if (!/^[0-9a-zA-Z_+\-*/^().,\s]+$/.test(expression)) continue;
    const xMinRaw = Number(entry?.xMin ?? entry?.x_min);
    const xMaxRaw = Number(entry?.xMax ?? entry?.x_max);
    let xMin = Number.isFinite(xMinRaw) ? xMinRaw : -10;
    let xMax = Number.isFinite(xMaxRaw) ? xMaxRaw : 10;
    xMin = Math.max(-100, Math.min(100, xMin));
    xMax = Math.max(-100, Math.min(100, xMax));
    if (xMax - xMin < 0.5) { xMin = -10; xMax = 10; }
    if (xMax - xMin > 100) { xMax = xMin + 100; }
    out.push({
      expression,
      label: cleanText(entry?.label || '', 60) || `y = ${expression}`,
      xMin: Number(xMin.toFixed(2)),
      xMax: Number(xMax.toFixed(2)),
    });
    if (out.length >= 3) break;
  }
  return out;
}

function normalizeFigureList(value, imageCount) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const fig of value) {
    const imageIndex = Math.min(
      Math.max(0, Number.parseInt(fig?.imageIndex ?? fig?.image_index ?? 0, 10) || 0),
      Math.max(0, imageCount - 1),
    );
    const bbox = bboxOf(fig?.bbox || fig?.box);
    if (!bbox) continue;
    out.push({ imageIndex, bbox, caption: cleanText(fig?.caption || '', 80) || '题目配图' });
    if (out.length >= 8) break;
  }
  return out;
}

function normalizeMistakeQuestion(q, fallback = {}) {
  const questionText = cleanText(q?.question_text ?? q?.questionText ?? '', 30000);
  const answerText = cleanText(q?.answer_text ?? q?.answerText ?? '', 30000);
  const analysisText = cleanText(q?.analysis_text ?? q?.analysisText ?? '', 30000);
  if (!questionText && !answerText) return null;
  const difficulty = Number.parseInt(q?.difficulty, 10);
  return {
    subject: cleanText(q?.subject || fallback.subject || '', 20) || '其他',
    questionText,
    answerText,
    analysisText,
    knowledgePoints: stringArray(q?.knowledge_points ?? q?.knowledgePoints),
    tags: stringArray(q?.tags),
    difficulty: Number.isFinite(difficulty) ? Math.min(5, Math.max(1, difficulty)) : 3,
    figures: normalizeFigureList(q?.figures, fallback.imageCount || 1),
    functionGraphs: normalizeFunctionGraphs(q?.function_graphs ?? q?.functionGraphs),
    confidence: Number(q?.confidence) || null,
    title: cleanText(questionText.split('\n').find(Boolean) || '图片错题', 48),
  };
}

export async function extractMistakes({ ai, imageIds, think, subjectHint, extraInstructions }) {
  const images = loadImages(imageIds);
  if (!images.length) throw new HttpError(400, '请至少上传一张题目图片', 'NO_IMAGES');
  const prompt = mistakeExtractionPrompt({
    subjectHint,
    imageCount: images.length,
    extraInstructions: cleanText(extraInstructions, 4000),
  });
  const result = await chatJson({
    ai: { ...ai, model: ai.visionModel || ai.model },
    think,
    maxTokens: 12000,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: buildVisionContent(images, '请识别这些图片并按要求输出 JSON。') },
    ],
  });
  const rawQuestions = Array.isArray(result.data?.questions) ? result.data.questions : [result.data];
  const questions = rawQuestions
    .map((q) => normalizeMistakeQuestion(q, {
      subject: result.data?.subject,
      imageCount: images.length,
    }))
    .filter(Boolean)
    .slice(0, 12);
  if (!questions.length) throw new HttpError(502, 'AI 没有识别出题目，请检查图片是否清晰，或换一种裁剪方式', 'AI_NO_QUESTION');
  const paperSource = cleanText(result.data?.paper_source, 120);
  const baseMeta = {
    model: result.model,
    usage: result.usage,
    generatedAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    paperSource,
  };
  return {
    images: images.map((img) => img.upload),
    questions: questions.map((q) => ({
      ...q,
      source: paperSource,
      reasoning: result.reasoning,
      aiMeta: { ...baseMeta, confidence: q.confidence, functionGraphs: q.functionGraphs },
    })),
    result: { model: result.model, usage: result.usage, reasoning: result.reasoning },
  };
}

export async function regenerateMistake({ ai, item, imageIds, think, extraInstructions }) {
  const ids = imageIds?.length ? imageIds : (item.images || []).map((img) => img.id).filter(Boolean);
  const images = loadImages(ids);
  const prompt = mistakeRegeneratePrompt({
    subjectHint: item.subject,
    extraInstructions: `${extraInstructions || ''}\n\n之前整理出的题目文字如下（可能不完整）：\n<question>\n${cleanText(item.questionText, 12000)}\n</question>`.trim(),
  });
  const result = await chatJson({
    ai: { ...ai, model: ai.visionModel || ai.model },
    think,
    maxTokens: 10000,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: images.length ? buildVisionContent(images, '请重新审题并输出 JSON。') : prompt },
    ],
  });
  const q = normalizeMistakeQuestion(result.data?.questions?.[0] || result.data, {
    subject: item.subject,
    imageCount: Math.max(1, images.length),
  });
  if (!q) throw new HttpError(502, 'AI 没有返回有效题目，请重试', 'AI_NO_QUESTION');
  return {
    ...q,
    reasoning: result.reasoning,
    aiMeta: {
      model: result.model,
      usage: result.usage,
      generatedAt: new Date().toISOString(),
      promptVersion: PROMPT_VERSION,
      regenerated: true,
      functionGraphs: q.functionGraphs,
    },
  };
}

export async function detectHandwriting({ ai, imageData, think = false }) {
  if (typeof imageData !== 'string' || !/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(imageData)) {
    throw new HttpError(400, '图片数据格式不正确', 'BAD_IMAGE_DATA');
  }
  if (imageData.length > 24 * 1024 * 1024) {
    throw new HttpError(413, '图片太大，请先压缩后再识别笔迹', 'IMAGE_TOO_LARGE');
  }
  const result = await chatJson({
    ai,
    think: Boolean(think),
    maxTokens: 5000,
    messages: [
      { role: 'system', content: handwritingPrompt() },
      {
        role: 'user',
        content: [
          { type: 'text', text: '请识别这张题目图片中的手写笔迹区域并输出 JSON。' },
          { type: 'image_url', image_url: { url: imageData, detail: 'original' } },
        ],
      },
    ],
  });
  const raw = Array.isArray(result.data?.regions) ? result.data.regions : [];
  const regions = [];
  for (const item of raw) {
    const bbox = bboxOf(item?.bbox || item?.box);
    if (!bbox) continue;
    regions.push({
      bbox,
      label: cleanText(item?.label, 40) || '手写笔迹',
      confidence: Number.isFinite(Number(item?.confidence)) ? Number(item.confidence) : null,
    });
    if (regions.length >= 80) break;
  }
  return {
    regions,
    model: result.model,
    usage: result.usage,
    promptVersion: PROMPT_VERSION,
    reasoning: result.reasoning,
  };
}

export async function generateSentences({
  ai, mode, topic, text, imageIds, count, think, extraInstructions,
}) {
  const images = mode === 'images' ? loadImages(imageIds) : [];
  if (mode === 'images' && !images.length) throw new HttpError(400, '图片模式需要至少一张图片', 'NO_IMAGES');
  if (mode === 'topic' && !cleanText(topic, 200)) throw new HttpError(400, '请填写佳句主题', 'NO_TOPIC');
  if (mode === 'text' && !cleanText(text, 100)) throw new HttpError(400, '请粘贴一些英文文本', 'NO_TEXT');
  const safeCount = Math.min(10, Math.max(1, Number(count) || 6));
  const prompt = sentencesPrompt({
    mode,
    topic: cleanText(topic, 200),
    text: cleanText(text, 12000),
    count: safeCount,
    imageCount: images.length,
    extraInstructions: cleanText(extraInstructions, 4000),
  });
  const userContent = images.length
    ? buildVisionContent(images, '请从这些图片中提取佳句并按要求输出 JSON。')
    : '请按要求输出 JSON。';
  const result = await chatJson({
    ai: { ...ai, model: images.length ? (ai.visionModel || ai.model) : ai.model },
    think,
    maxTokens: 9000,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: userContent },
    ],
  });
  const root = result.data || {};
  const raw = Array.isArray(root.sentences) ? root.sentences : [];
  const theme = cleanText(root.theme, 60) || cleanText(topic, 60) || '未分类';
  const source = mode === 'text'
    ? cleanText(text, 300)
    : mode === 'images'
      ? '图片提取'
      : `AI 生成 · ${theme}`;
  const sentences = raw.map((s) => ({
    theme,
    title: cleanText(s.title, 30),
    content: cleanText(s.content, 2000),
    translation: cleanText(s.translation, 2000),
    usage: cleanText(s.usage, 4000),
    example: cleanText(s.example, 2000),
    exampleTranslation: cleanText(s.example_translation ?? s.exampleTranslation, 2000),
    summary: cleanText(s.summary, 500),
    tags: stringArray(s.tags),
    source,
    sourceType: mode === 'topic' ? 'ai-topic' : mode,
    think: Boolean(think),
    reasoning: result.reasoning,
    aiMeta: {
      model: result.model,
      usage: result.usage,
      generatedAt: new Date().toISOString(),
      promptVersion: PROMPT_VERSION,
      themeReason: cleanText(root.theme_reason, 300),
    },
  })).filter((s) => s.content).slice(0, safeCount);
  if (!sentences.length) throw new HttpError(502, 'AI 没有生成有效佳句，请调整主题或文本后重试', 'AI_NO_SENTENCE');
  return { sentences, theme, result };
}

export async function regenerateSentence({ ai, item, think, extraInstructions }) {
  const prompt = sentenceRegeneratePrompt({ extraInstructions: cleanText(extraInstructions, 4000) });
  const result = await chatJson({
    ai,
    think,
    maxTokens: 4000,
    messages: [
      { role: 'system', content: prompt },
      {
        role: 'user',
        content: `原句：${item.content}\n原翻译：${item.translation}\n原用法：${item.usage}\n建议主题：${item.theme}`,
      },
    ],
  });
  const d = result.data || {};
  return {
    theme: cleanText(d.theme, 60) || item.theme,
    title: cleanText(d.title, 30) || item.title,
    content: cleanText(d.content, 2000) || item.content,
    translation: cleanText(d.translation, 2000) || item.translation,
    usage: cleanText(d.usage, 4000) || item.usage,
    example: cleanText(d.example, 2000),
    exampleTranslation: cleanText(d.example_translation ?? d.exampleTranslation, 2000),
    summary: cleanText(d.summary, 500),
    tags: stringArray(d.tags),
    reasoning: result.reasoning,
    aiMeta: {
      model: result.model,
      usage: result.usage,
      generatedAt: new Date().toISOString(),
      promptVersion: PROMPT_VERSION,
      regenerated: true,
    },
  };
}

export async function analyzeVocab({ ai, term, theme, think, extraInstructions }) {
  const safeTerm = cleanText(term, 120);
  if (!safeTerm) throw new HttpError(400, '请输入单词或词组', 'NO_TERM');
  const result = await chatJson({
    ai,
    think,
    maxTokens: 9000,
    messages: [
      { role: 'system', content: vocabPrompt({ term: safeTerm, theme, extraInstructions: cleanText(extraInstructions, 4000) }) },
      { role: 'user', content: `请解析：${safeTerm}` },
    ],
  });
  const data = normalizeVocabData(result.data, safeTerm);
  return {
    term: data.term || safeTerm,
    entryType: data.entryType,
    theme: data.theme,
    data,
    reasoning: result.reasoning,
    aiMeta: {
      model: result.model,
      usage: result.usage,
      generatedAt: new Date().toISOString(),
      promptVersion: PROMPT_VERSION,
    },
  };
}

export async function regenerateVocab({ ai, item, think, extraInstructions }) {
  const result = await chatJson({
    ai,
    think,
    maxTokens: 9000,
    messages: [
      {
        role: 'system',
        content: vocabRegeneratePrompt({
          term: item.term,
          theme: item.theme,
          extraInstructions: cleanText(extraInstructions, 4000),
        }),
      },
      { role: 'user', content: `请重新解析：${item.term}` },
    ],
  });
  const data = normalizeVocabData(result.data, item.term);
  return {
    term: data.term || item.term,
    entryType: data.entryType,
    theme: data.theme || item.theme,
    data,
    reasoning: result.reasoning,
    aiMeta: {
      model: result.model,
      usage: result.usage,
      generatedAt: new Date().toISOString(),
      promptVersion: PROMPT_VERSION,
      regenerated: true,
    },
  };
}

function normalizeVocabData(input, fallbackTerm) {
  const d = input || {};
  const array = (value) => (Array.isArray(value) ? value : []);
  const objArray = (value, mapper) => array(value).map(mapper).filter((x) => x && Object.values(x).some(Boolean));
  const entryType = d.entry_type || d.entryType || (String(d.term || fallbackTerm).trim().includes(' ') ? 'phrase' : 'word');
  return {
    term: cleanText(d.term, 120) || fallbackTerm,
    entryType: entryType === 'phrase' ? 'phrase' : 'word',
    phonetic: cleanText(d.phonetic, 120),
    partOfSpeech: stringArray(d.part_of_speech ?? d.partOfSpeech),
    coreTranslation: cleanText(d.core_translation ?? d.coreTranslation, 500),
    theme: cleanText(d.theme, 60) || '高频词',
    definitions: objArray(d.definitions, (item) => ({
      pos: cleanText(item?.pos, 30),
      zh: cleanText(item?.zh, 500),
      en: cleanText(item?.en, 800),
    })),
    usage: cleanText(d.usage, 4000),
    extensions: objArray(d.extensions, (item) => ({
      label: cleanText(item?.label, 40),
      content: cleanText(item?.content, 2000),
    })),
    collocations: objArray(d.collocations, (item) => ({
      phrase: cleanText(item?.phrase, 200),
      zh: cleanText(item?.zh, 300),
    })),
    synonyms: objArray(d.synonyms, (item) => ({
      word: cleanText(item?.word, 100),
      zh: cleanText(item?.zh, 200),
    })),
    antonyms: objArray(d.antonyms, (item) => ({
      word: cleanText(item?.word, 100),
      zh: cleanText(item?.zh, 200),
    })),
    confusions: cleanText(d.confusions, 2000),
    examples: objArray(d.examples, (item) => ({
      en: cleanText(item?.en, 1000),
      zh: cleanText(item?.zh, 1000),
    })),
    memoryTip: cleanText(d.memory_tip ?? d.memoryTip, 1000),
    examTips: cleanText(d.exam_tips ?? d.examTips, 2000),
    related: objArray(d.related, (item) => ({
      word: cleanText(item?.word, 100),
      relation: cleanText(item?.relation, 60),
    })),
  };
}

function buildVisionContent(images, instruction) {
  const blocks = [{ type: 'text', text: instruction }];
  images.forEach((image, index) => {
    blocks.push({ type: 'text', text: `第 ${index + 1} 张图片（imageIndex = ${index}）：` });
    blocks.push({ type: 'image_url', image_url: { url: image.dataUrl, detail: 'original' } });
  });
  return blocks;
}

export function loadImages(imageIds) {
  if (!Array.isArray(imageIds) || !imageIds.length) return [];
  if (imageIds.length > 12) throw new HttpError(400, '一次最多使用 12 张图片', 'TOO_MANY_IMAGES');
  const images = [];
  let total = 0;
  for (const id of imageIds) {
    const row = getUpload(String(id));
    if (!row) throw new HttpError(400, '有图片已失效，请重新上传', 'IMAGE_NOT_FOUND');
    const filePath = path.join(config.uploadDir, row.filename);
    let buffer;
    try {
      buffer = fs.readFileSync(filePath);
    } catch {
      throw new HttpError(400, '图片文件丢失，请重新上传', 'IMAGE_MISSING');
    }
    total += buffer.length;
    if (total > 45 * 1024 * 1024) {
      throw new HttpError(413, '图片总大小超过 45MB，请减少图片或先压缩/裁剪', 'IMAGES_TOO_LARGE');
    }
    const mime = row.mime || 'image/jpeg';
    images.push({
      upload: mapUpload(row),
      dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
    });
  }
  return images;
}

export async function testConnection(ai) {
  const resolved = resolveAiConfig(ai);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${resolved.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${resolved.apiKey}`, 'User-Agent': 'ShisuiStudy/1.0' },
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* ignore */ }
    if (!response.ok) throw friendlyApiError(response.status, data || { message: text.slice(0, 200) });
    const models = Array.isArray(data?.data) ? data.data.map((m) => m.id).filter(Boolean) : [];
    return { ok: true, models, baseUrl: resolved.baseUrl };
  } catch (error) {
    if (error.name === 'AbortError') throw new HttpError(504, '连接测试超时，请检查网络或 Base URL', 'AI_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
