import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const TEST_DATA = path.join(ROOT, 'server', 'data', `test-first-run-${process.pid}`);
const PORT = 19500 + (process.pid % 300);
const BASE = `http://127.0.0.1:${PORT}`;

let child;
let log = '';
let password = '';

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
      ADMIN_PASSWORD: '',
      JWT_SECRET: 'first-run-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => { log += chunk.toString(); });
  child.stderr.on('data', (chunk) => { log += chunk.toString(); });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) break;
    } catch { /* not ready */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const match = log.match(/生成访问密码[^\n]*\n[^\n]*║\s+([A-Za-z0-9]{16})/);
  assert.ok(match, `启动日志里应该包含一次性生成的密码：\n${log}`);
  password = match[1];
});

after(async () => {
  if (child) {
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  fs.rmSync(TEST_DATA, { recursive: true, force: true });
});

describe('首次启动安全', () => {
  it('未设置 ADMIN_PASSWORD 时生成随机密码并允许登录', async () => {
    assert.equal(password.length, 16);
    assert.notEqual(password, 'wrong-password');
    const response = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    assert.equal(response.status, 200);
  });

  it('错误旧默认密码不能登录', async () => {
    const response = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-password' }),
    });
    assert.equal(response.status, 401);
  });
});
