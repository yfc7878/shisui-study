import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(import.meta.dirname, '../..');
const TEST_DATA = path.join(ROOT, 'server', 'data', `test-api-${process.pid}`);
const PORT = 18000 + (process.pid % 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'test-api-password';

let child;
let cookie = '';
let serverLog = '';

function api(pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  return fetch(`${BASE}${pathname}`, { ...options, headers });
}

async function json(pathname, options = {}) {
  const response = await api(pathname, options);
  const data = await response.json().catch(() => null);
  return { response, data };
}

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`测试服务器未启动：\n${serverLog}`);
}

before(async () => {
  fs.rmSync(TEST_DATA, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA, { recursive: true });
  child = spawn(process.execPath, ['server/src/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATA_DIR: TEST_DATA,
      ADMIN_PASSWORD: PASSWORD,
      JWT_SECRET: 'test-api-secret',
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
  child.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });
  await waitForServer();
});

after(async () => {
  if (child) {
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fs.rmSync(TEST_DATA, { recursive: true, force: true });
});

describe('认证', () => {
  it('未登录时拒绝访问数据接口', async () => {
    const { response } = await json('/api/dashboard');
    assert.equal(response.status, 401);
  });

  it('错误密码被拒绝', async () => {
    const { response } = await json('/api/auth/login', {
      method: 'POST',
      body: { password: 'wrong-password' },
    });
    assert.equal(response.status, 401);
  });

  it('正确密码可登录并拿到 HttpOnly Cookie', async () => {
    const { response, data } = await json('/api/auth/login', {
      method: 'POST',
      body: { password: PASSWORD, remember: true },
    });
    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    const setCookie = response.headers.getSetCookie().join('; ');
    assert.match(setCookie, /shisui_session=/);
    assert.match(setCookie, /HttpOnly/i);
    cookie = setCookie.split(';')[0];
  });

  it('登录后可读取当前账号', async () => {
    const { response, data } = await json('/api/auth/me');
    assert.equal(response.status, 200);
    assert.equal(data.user.name, '同学');
  });

  it('错误当前密码不能修改密码', async () => {
    const { response } = await json('/api/auth/password', {
      method: 'POST',
      body: { currentPassword: 'wrong', newPassword: 'new-test-password' },
    });
    assert.equal(response.status, 400);
  });

  it('修改密码后旧密码失效、新密码可用', async () => {
    const changed = await json('/api/auth/password', {
      method: 'POST',
      body: { currentPassword: PASSWORD, newPassword: 'new-test-password' },
    });
    assert.equal(changed.response.status, 200);
    const oldLogin = await json('/api/auth/login', {
      method: 'POST',
      body: { password: PASSWORD },
    });
    assert.equal(oldLogin.response.status, 401);
    const newLogin = await json('/api/auth/login', {
      method: 'POST',
      body: { password: 'new-test-password' },
    });
    assert.equal(newLogin.response.status, 200);
  });
});

describe('图片与错题', () => {
  let upload;
  let mistakeId;

  it('上传图片并返回尺寸', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lz8c9wAAAABJRU5ErkJggg==',
      'base64',
    );
    const form = new FormData();
    form.append('files', new Blob([png], { type: 'image/png' }), 'question.png');
    const response = await api('/api/uploads', { method: 'POST', body: form });
    const data = await response.json();
    assert.equal(response.status, 201);
    assert.equal(data.files.length, 1);
    assert.equal(data.files[0].width, 1);
    upload = data.files[0];
    const imageResponse = await api(upload.url);
    assert.equal(imageResponse.status, 200);
  });

  it('可创建待审阅错题', async () => {
    const { response, data } = await json('/api/mistakes', {
      method: 'POST',
      body: {
        subject: '数学',
        source: '测试卷',
        questionText: '已知 $f(x)=x^2$，求 $f(2)$。',
        answerText: '$4$',
        analysisText: '代入 $x=2$。',
        difficulty: 2,
        images: [upload],
        tags: ['函数'],
        knowledgePoints: ['二次函数'],
      },
    });
    assert.equal(response.status, 201);
    assert.equal(data.item.status, 'pending');
    assert.equal(data.item.subject, '数学');
    mistakeId = data.item.id;
  });

  it('待审阅列表能聚合错题', async () => {
    const { data } = await json('/api/review?type=all');
    assert.ok(data.counts.mistake >= 1);
    assert.ok(data.items.some((item) => item.type === 'mistake' && item.id === mistakeId));
  });

  it('通过审阅后进入已收录', async () => {
    const { response } = await json(`/api/mistakes/${mistakeId}/`, {
      method: 'PATCH',
      body: { status: 'active', errorReason: '计算失误' },
    });
    assert.equal(response.status, 200);
    const { data } = await json('/api/mistakes?status=active');
    assert.ok(data.items.some((item) => item.id === mistakeId));
  });

  it('导出错题为合法 docx', async () => {
    const response = await api('/api/export/mistakes', {
      method: 'POST',
      body: { ids: [mistakeId], options: { title: '测试错题', includeAnswer: true } },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /wordprocessingml/);
    const buffer = Buffer.from(await response.arrayBuffer());
    assert.ok(buffer.length > 5000);
    assert.equal(buffer.subarray(0, 2).toString(), 'PK');
  });

  it('移入回收站后可恢复', async () => {
    await json('/api/mistakes/bulk', { method: 'POST', body: { ids: [mistakeId], action: 'trash' } });
    let trash = await json('/api/trash');
    assert.ok(trash.data.items.some((item) => item.id === mistakeId));
    await json('/api/trash/bulk', {
      method: 'POST',
      body: { items: [{ type: 'mistake', id: mistakeId }], action: 'restore' },
    });
    trash = await json('/api/trash');
    assert.equal(trash.data.items.some((item) => item.id === mistakeId), false);
  });

  it('可保存自动清理设置并永久清理过期内容与图片', async () => {
    const current = await json('/api/trash');
    assert.equal(current.response.status, 200);
    assert.ok(current.data.settings);

    const saved = await json('/api/trash/settings', {
      method: 'PUT',
      body: { autoPurge: true, retentionDays: 7 },
    });
    assert.equal(saved.response.status, 200);
    assert.equal(saved.data.settings.autoPurge, true);
    assert.equal(saved.data.settings.retentionDays, 7);

    await json('/api/mistakes/bulk', { method: 'POST', body: { ids: [mistakeId], action: 'trash' } });
    const database = new DatabaseSync(path.join(TEST_DATA, 'study.db'));
    database.prepare('UPDATE mistakes SET deleted_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), mistakeId);
    database.close();

    const purge = await json('/api/trash/purge-expired', { method: 'POST', body: {} });
    assert.equal(purge.response.status, 200);
    assert.ok(purge.data.affected >= 1);
    const trash = await json('/api/trash');
    assert.equal(trash.data.items.some((item) => item.id === mistakeId), false);

    const imageResponse = await api(upload.url);
    assert.equal(imageResponse.status, 404);
    assert.equal(fs.existsSync(path.join(TEST_DATA, 'uploads', upload.filename)), false);
  });
});

describe('English 与数据', () => {
  it('可手动添加佳句并按主题筛选', async () => {
    const created = await json('/api/sentences', {
      method: 'POST',
      body: {
        theme: '环境描写',
        content: 'The sky was a watercolor of fading light.',
        translation: '天空是一幅褪色的水彩画。',
        usage: '比喻句，适合环境描写。',
        status: 'active',
      },
    });
    assert.equal(created.response.status, 201);
    const { data } = await json('/api/sentences?status=active&theme=' + encodeURIComponent('环境描写'));
    assert.ok(data.items.some((item) => item.id === created.data.item.id));
    const exportResponse = await api('/api/export/english', {
      method: 'POST',
      body: { ids: [created.data.item.id], options: { title: '测试佳句' } },
    });
    assert.equal(exportResponse.status, 200);
    const buffer = Buffer.from(await exportResponse.arrayBuffer());
    assert.equal(buffer.subarray(0, 2).toString(), 'PK');
    assert.ok(buffer.length > 5000);
  });

  it('可创建并编辑词汇解析', async () => {
    const created = await json('/api/vocab', {
      method: 'POST',
      body: {
        term: 'available',
        theme: '高频词',
        data: { coreTranslation: '可获得的', examples: [{ en: 'It is available.', zh: '它可用。' }] },
      },
    });
    assert.equal(created.response.status, 201);
    const patched = await json(`/api/vocab/${created.data.item.id}`, {
      method: 'PATCH',
      body: { theme: '熟词生义', status: 'active' },
    });
    assert.equal(patched.data.item.theme, '熟词生义');
    assert.equal(patched.data.item.status, 'active');
  });

  it('仪表盘与备份可用', async () => {
    const { data } = await json('/api/dashboard');
    assert.ok(data.totals.sentences >= 1);
    assert.equal(data.weekly.length, 7);
    const backup = await api('/api/backup');
    assert.equal(backup.status, 200);
    const body = await backup.json();
    assert.equal(body.format, 'shisui-study-backup');
  });

  it('专注记录可写入并进入汇总', async () => {
    const write = await json('/api/focus/sessions', {
      method: 'POST',
      body: { durationSec: 1500, mode: 'focus', label: '测试专注', completed: true },
    });
    assert.equal(write.response.status, 201);
    const { data } = await json('/api/focus/summary');
    assert.ok(data.totalMinutes >= 25);
  });
});
