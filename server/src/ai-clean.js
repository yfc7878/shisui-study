import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from './config.js';
import { HttpError } from './utils.js';

const configFile = path.join(config.dataDir, 'ai', 'config.json');
const scriptFile = path.join(config.rootDir, 'server', 'ai', 'inpaint_lama.py');

export function readAiCleanConfig() {
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync(configFile, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    fileConfig = {};
  }
  const python = process.env.AI_CLEAN_PYTHON || fileConfig.python || '';
  const pythonIsPath = Boolean(python) && (path.isAbsolute(python) || python.includes('/') || python.includes('\\'));
  const pythonExists = pythonIsPath ? fs.existsSync(python) : Boolean(python);
  return {
    python,
    maxSize: Number(fileConfig.maxSize || process.env.AI_CLEAN_MAX_SIZE || 2000),
    timeoutMs: Number(fileConfig.timeoutMs || 300000),
    configured: pythonExists && fs.existsSync(scriptFile),
  };
}

export function aiCleanStatus() {
  const cfg = readAiCleanConfig();
  return {
    available: cfg.configured,
    python: cfg.configured ? cfg.python : null,
    maxSize: cfg.maxSize,
    message: cfg.configured
      ? '本机 AI 修补已配置'
      : '本机 AI 修补未配置；请参考 server/ai/README.md 安装 IOPaint/LaMa',
  };
}

export function inpaintWithLama({ imageData, maskData }) {
  const cfg = readAiCleanConfig();
  if (!cfg.configured) {
    throw new HttpError(503, '本机 AI 修补未配置，请参考 server/ai/README.md 安装 LaMa', 'AI_CLEAN_UNAVAILABLE');
  }
  if (typeof imageData !== 'string' || !/^data:image\//.test(imageData)) {
    throw new HttpError(400, '图片数据格式不正确', 'BAD_IMAGE_DATA');
  }
  if (typeof maskData !== 'string' || !/^data:image\//.test(maskData)) {
    throw new HttpError(400, '蒙版数据格式不正确', 'BAD_MASK_DATA');
  }
  if (imageData.length > 24 * 1024 * 1024 || maskData.length > 8 * 1024 * 1024) {
    throw new HttpError(413, '图片或蒙版太大', 'IMAGE_TOO_LARGE');
  }

  return new Promise((resolve, reject) => {
    const child = spawn(cfg.python, [scriptFile], {
      cwd: config.rootDir,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
    });
    let stdout = '';
    let stderr = '';
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill();
      reject(new HttpError(504, 'AI 修补超时，请缩小图片或稍后重试', 'AI_CLEAN_TIMEOUT'));
    }, cfg.timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(new HttpError(503, `无法启动本机 AI 修补：${error.message}`, 'AI_CLEAN_SPAWN_FAILED'));
    });
    child.on('close', (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (code !== 0) {
        let message = stderr.trim().split('\n').filter(Boolean).slice(-1)[0] || 'AI 修补失败';
        try {
          const parsed = JSON.parse(stdout.trim().split('\n').filter(Boolean).slice(-1)[0]);
          if (parsed.error) message = parsed.error;
        } catch { /* ignore */ }
        reject(new HttpError(500, message, 'AI_CLEAN_FAILED'));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim().split('\n').filter(Boolean).slice(-1)[0]);
        if (!parsed.image) throw new Error('AI 修补没有返回图片');
        resolve({ image: parsed.image, ms: parsed.ms || null });
      } catch (error) {
        reject(new HttpError(500, `AI 修补返回格式不正确：${error.message}`, 'AI_CLEAN_BAD_RESPONSE'));
      }
    });

    child.stdin.end(JSON.stringify({ image: imageData, mask: maskData, maxSize: cfg.maxSize }));
  });
}
