import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { authStatus, requireAuth, sameOriginGuard } from './auth.js';
import { getAppState, isDefaultPassword, takeGeneratedPassword } from './store.js';
import { authRouter } from './routes/auth.js';
import { uploadRouter } from './routes/uploads.js';
import { mistakesRouter } from './routes/mistakes.js';
import { sentencesRouter } from './routes/sentences.js';
import { vocabRouter } from './routes/vocab.js';
import { aiRouter } from './routes/ai.js';
import { exportRouter } from './routes/export.js';
import { miscRouter, reviewRouter, trashRouter } from './routes/review.js';
import { startTrashJanitor } from './trash-service.js';
import { HttpError } from './utils.js';

const app = express();
app.locals.version = config.version;
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-origin' },
}));
app.use(compression());

// 轻量 Cookie 解析（避免额外依赖）
app.use((req, res, next) => {
  req.cookies = {};
  const header = req.headers.cookie;
  if (header) {
    for (const part of header.split(';')) {
      const index = part.indexOf('=');
      if (index < 0) continue;
      const key = part.slice(0, index).trim();
      if (!key) continue;
      try {
        req.cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        req.cookies[key] = part.slice(index + 1).trim();
      }
    }
  }
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(sameOriginGuard);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: '拾穗 Study', version: config.version, time: new Date().toISOString() });
});

app.use('/api/auth', authRouter);

// 受保护的图片文件
app.use('/uploads', requireAuth, express.static(config.uploadDir, {
  maxAge: '365d',
  immutable: true,
  fallthrough: false,
  index: false,
}));

// 其余 API 均需要登录
app.use('/api', requireAuth);
app.use('/api/uploads', uploadRouter);
app.use('/api/mistakes', mistakesRouter);
app.use('/api/sentences', sentencesRouter);
app.use('/api/vocab', vocabRouter);
app.use('/api/ai', aiRouter);
app.use('/api/export', exportRouter);
app.use('/api/review', reviewRouter);
app.use('/api/trash', trashRouter);
app.use('/api', miscRouter);

app.use('/api', (req, res) => {
  res.status(404).json({ error: '接口不存在', code: 'NOT_FOUND' });
});

// 生产环境托管前端构建产物
if (fs.existsSync(config.publicDir)) {
  app.use(express.static(config.publicDir, {
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(config.publicDir, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({ error: '页面不存在', code: 'NOT_FOUND' });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err);
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: '请求内容太大', code: 'PAYLOAD_TOO_LARGE' });
  }
  if (err.code === 'ENOENT' && req.path.startsWith('/uploads')) {
    return res.status(404).json({ error: '图片不存在', code: 'NOT_FOUND' });
  }
  res.status(status).json({
    error: status >= 500 ? '服务器开小差了，请稍后重试' : (err.message || '请求失败'),
    code: err.code || 'ERROR',
    ...(err.details && !config.isProd ? { details: err.details } : {}),
  });
});

const state = getAppState();
const generatedPassword = takeGeneratedPassword();
if (generatedPassword) {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  首次启动，已生成访问密码（只显示这一次）        ║');
  console.log(`║  ${generatedPassword.padEnd(46)}║`);
  console.log('║  请立即记录，并到「设置 → 账号」中修改。         ║');
  console.log('╚══════════════════════════════════════════════════╝');
} else if (state.passwordIsDefault) {
  console.log('');
  console.log('⚠️  当前仍在使用初始密码。请登录后到「设置」中修改密码。');
}

const server = app.listen(config.port, config.host, () => {
  console.log('');
  console.log('  拾穗 Study · 高中学习工作台');
  console.log(`  ➜ 本机访问:   http://localhost:${config.port}`);
  console.log(`  ➜ 数据目录:   ${config.dataDir}`);
  console.log(`  ➜ 运行模式:   ${config.isProd ? 'production' : 'development'}`);
  if (isDefaultPassword()) console.log('  ➜ 初始密码:   见 README 或首次启动日志（请尽快修改）');
  console.log('');
  startTrashJanitor();
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default app;
