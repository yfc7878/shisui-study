import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { getSessionSecret, isDefaultPassword } from './store.js';

export const COOKIE_NAME = 'shisui_session';

export function signSession() {
  return jwt.sign({ sub: 'owner', scope: 'study' }, getSessionSecret(), {
    expiresIn: `${config.sessionDays}d`,
    issuer: 'shisui-study',
  });
}

export function setSessionCookie(req, res, token, remember = true) {
  const opts = {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(req.secure),
    path: '/',
  };
  if (remember) opts.maxAge = config.sessionDays * 24 * 60 * 60 * 1000;
  res.cookie(COOKIE_NAME, token, opts);
}

export function clearSessionCookie(req, res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(req.secure),
    path: '/',
  });
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: '请先登录', code: 'UNAUTHORIZED' });
  try {
    const payload = jwt.verify(token, getSessionSecret(), { issuer: 'shisui-study' });
    if (payload.sub !== 'owner') throw new Error('bad subject');
    req.user = { name: '同学', scope: 'owner' };
    return next();
  } catch {
    clearSessionCookie(req, res);
    return res.status(401).json({ error: '登录已过期，请重新登录', code: 'SESSION_EXPIRED' });
  }
}

export function authStatus() {
  return {
    user: { name: '同学', scope: 'owner' },
    defaultPassword: isDefaultPassword(),
    version: config.version,
  };
}

// 同源保护：防止跨站表单/脚本携带 Cookie 发起写操作。
export function sameOriginGuard(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    const originHost = new URL(origin).host;
    const requestHost = req.get('host');
    if (originHost === requestHost) return next();
    if (config.appOrigin && origin === config.appOrigin) return next();
    const forwardedHost = req.get('x-forwarded-host');
    if (forwardedHost && originHost === forwardedHost) return next();
  } catch {
    /* fallthrough */
  }
  return res.status(403).json({ error: '请求来源不被允许', code: 'BAD_ORIGIN' });
}
