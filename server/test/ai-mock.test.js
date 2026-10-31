import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const TEST_DATA = path.join(ROOT, 'server', 'data', `test-ai-${process.pid}`);
const APP_PORT = 19100 + (process.pid % 500);
const MOCK_PORT = 19600 + (process.pid % 500);
const BASE = `http://127.0.0.1:${APP_PORT}`;
const PASSWORD = 'test-ai-password';

let appProcess;
let mockServer;
let cookie = '';
let appLog = '';
const captured = [];

function aiResponseFor(system) {
  if (system.includes('错题集')) {
    return {
      paper_source: '模拟月考试卷',
      subject: '数学',
      questions: [{
        question_text: '已知函数 $f(x)=x^2-2x+3$，求其最小值。',
        answer_text: '$2$',
        analysis_text: '配方得 $f(x)=(x-1)^2+2$，故最小值为 $2$。',
        knowledge_points: ['二次函数'],
        tags: ['模拟'],
        difficulty: 2,
        figures: [{ imageIndex: 0, bbox: [0.1, 0.2, 0.4, 0.3], caption: '函数图像' }],
        function_graphs: [{ expression: 'x^2-2*x+3', label: 'f(x)=x²-2x+3', xMin: -2, xMax: 4 }],
        confidence: 0.95,
      }],
    };
  }
  if (system.includes('佳句')) {
    return {
      theme: '环境描写',
      theme_reason: '描写自然场景',
      sentences: [{
        title: '雨后',
        content: 'The rain had washed the world clean.',
        translation: '雨水把世界洗得干干净净。',
        usage: '过去完成时，适合场景铺垫。',
        example: 'The wind had cleared the sky.',
        example_translation: '风把天空吹得清澈。',
        summary: '适合雨后场景开头。',
        tags: ['环境', '过去完成时'],
      }],
    };
  }
  if (system.includes('词汇老师')) {
    return {
      term: 'sustain',
      entry_type: 'word',
      phonetic: '/səˈsteɪn/',
      part_of_speech: ['v.'],
      core_translation: '维持',
      theme: '写作升级',
      definitions: [{ pos: 'v.', zh: '维持', en: 'to keep something going' }],
      usage: '及物动词。',
      extensions: [{ label: '词形变化', content: 'sustainable adj.' }],
      collocations: [{ phrase: 'sustain growth', zh: '维持增长' }],
      synonyms: [{ word: 'maintain', zh: '维持' }],
      antonyms: [{ word: 'weaken', zh: '削弱' }],
      confusions: '与 maintain 的语感差异。',
      examples: [{ en: 'It is hard to sustain.', zh: '很难维持。' }],
      memory_tip: 'sus + tain',
      exam_tips: '写作常用。',
      related: [{ word: 'sustainable', relation: '派生' }],
    };
  }
  return { ok: true };
}

function mockChatResponse(system) {
  const content = JSON.stringify(aiResponseFor(system));
  return {
    id: 'chatcmpl-mock',
    object: 'chat.completion',
    model: 'deepseek-flash',
    choices: [{
      index: 0,
      message: { role: 'assistant', content, reasoning_content: '模拟思考过程' },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
  };
}

async function json(pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const response = await fetch(`${BASE}${pathname}`, { ...options, headers });
  const data = await response.json().catch(() => null);
  return { response, data };
}

async function waitFor(url) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* not ready */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('服务未启动');
}

before(async () => {
  fs.rmSync(TEST_DATA, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA, { recursive: true });

  mockServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        captured.push(payload);
        const system = String(payload.messages?.[0]?.content || '');
        const response = mockChatResponse(system);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
      }
    });
  });
  await new Promise((resolve) => mockServer.listen(MOCK_PORT, '127.0.0.1', resolve));

  appProcess = spawn(process.execPath, ['server/src/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      HOST: '127.0.0.1',
      DATA_DIR: TEST_DATA,
      ADMIN_PASSWORD: PASSWORD,
      JWT_SECRET: 'test-ai-secret',
      DEEPSEEK_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  appProcess.stdout.on('data', (chunk) => { appLog += chunk.toString(); });
  appProcess.stderr.on('data', (chunk) => { appLog += chunk.toString(); });
  await waitFor(`${BASE}/api/health`);

  const login = await json('/api/auth/login', {
    method: 'POST',
    body: { password: PASSWORD, remember: true },
  });
  assert.equal(login.response.status, 200);
  cookie = login.response.headers.getSetCookie().join('; ').split(';')[0];
});

after(async () => {
  if (appProcess) {
    appProcess.kill();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (mockServer) await new Promise((resolve) => mockServer.close(resolve));
  fs.rmSync(TEST_DATA, { recursive: true, force: true });
});

describe('AI 调用链路（本地 mock）', () => {
  it('没有 API Key 时给出明确错误', async () => {
    const { response, data } = await json('/api/ai/extract-mistake', {
      method: 'POST',
      body: { imageIds: [], think: false },
    });
    assert.equal(response.status, 400);
    assert.equal(data.code, 'NO_API_KEY');
  });

  it('视觉错题提取：发送图片、思考参数并写入待审阅', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lz8c9wAAAABJRU5ErkJggg==',
      'base64',
    );
    const form = new FormData();
    form.append('files', new Blob([png], { type: 'image/png' }), 'mock.png');
    const uploadResponse = await fetch(`${BASE}/api/uploads`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form,
    });
    const uploaded = await uploadResponse.json();
    const imageId = uploaded.files[0].id;

    const { response, data } = await json('/api/ai/extract-mistake', {
      method: 'POST',
      body: {
        imageIds: [imageId],
        think: true,
        ai: { apiKey: 'test-key', baseUrl: `http://127.0.0.1:${MOCK_PORT}`, model: 'deepseek-flash', visionModel: 'deepseek-flash' },
      },
    });
    assert.equal(response.status, 201, JSON.stringify(data));
    assert.equal(data.items.length, 1);
    assert.equal(data.items[0].status, 'pending');
    assert.equal(data.items[0].subject, '数学');
    assert.equal(data.items[0].figureHints.length, 1);
    assert.equal(data.items[0].images.length, 1);
    assert.equal(data.items[0].aiMeta.functionGraphs.length, 1);
    assert.equal(data.items[0].aiMeta.functionGraphs[0].expression, 'x^2-2*x+3');
    const call = captured.at(-1);
    assert.equal(call.thinking.type, 'enabled');
    assert.equal(call.model, 'deepseek-flash');
    const userContent = call.messages[1].content;
    assert.ok(Array.isArray(userContent));
    assert.ok(userContent.some((block) => block.type === 'image_url' && block.image_url.url.startsWith('data:image/png;base64,')));
  });

  it('佳句生成：返回多条并进入待审阅', async () => {
    const { response, data } = await json('/api/ai/sentences', {
      method: 'POST',
      body: {
        mode: 'topic',
        topic: '环境描写',
        count: 3,
        think: false,
        ai: { apiKey: 'test-key', baseUrl: `http://127.0.0.1:${MOCK_PORT}`, model: 'deepseek-flash' },
      },
    });
    assert.equal(response.status, 201, JSON.stringify(data));
    assert.equal(data.items.length, 1);
    assert.equal(data.items[0].theme, '环境描写');
    assert.equal(data.items[0].status, 'pending');
    assert.equal(captured.at(-1).thinking.type, 'disabled');
  });

  it('词汇解析：结构化字段入库为待审阅', async () => {
    const { response, data } = await json('/api/ai/vocab', {
      method: 'POST',
      body: {
        term: 'sustain',
        theme: '写作升级',
        think: false,
        ai: { apiKey: 'test-key', baseUrl: `http://127.0.0.1:${MOCK_PORT}`, model: 'deepseek-flash' },
      },
    });
    assert.equal(response.status, 201, JSON.stringify(data));
    assert.equal(data.item.entryType, 'word');
    assert.equal(data.item.data.coreTranslation, '维持');
    assert.equal(data.item.data.examples.length, 1);
    assert.equal(data.item.status, 'pending');
  });
});
