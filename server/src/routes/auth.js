import express from 'express';
import rateLimit from 'express-rate-limit';
import { authStatus, clearSessionCookie, requireAuth, setSessionCookie, signSession } from '../auth.js';
import { changePassword, verifyPassword } from '../store.js';
import { asyncRoute } from '../utils.js';

export const authRouter = express.Router();

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: '尝试次数过多，请 10 分钟后再试', code: 'RATE_LIMITED' },
});

authRouter.post('/login', loginLimiter, asyncRoute(async (req, res) => {
  const { password, remember = true } = req.body || {};
  if (!password || !verifyPassword(password)) {
    return res.status(401).json({ error: '密码不正确', code: 'BAD_PASSWORD' });
  }
  const token = signSession();
  setSessionCookie(req, res, token, remember !== false);
  return res.json({ ok: true, ...authStatus() });
}));

authRouter.post('/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json(authStatus());
});

authRouter.post('/password', requireAuth, asyncRoute(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  changePassword(currentPassword, newPassword);
  res.json({ ok: true });
}));
