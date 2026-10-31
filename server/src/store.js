import fs from 'node:fs';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from './config.js';

let generatedInitialPassword = null;

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function readFileJson() {
  try {
    return JSON.parse(fs.readFileSync(config.appFile, 'utf8'));
  } catch {
    return {};
  }
}

export function getAppState() {
  const data = readFileJson();
  let changed = false;
  if (!data.jwtSecret) {
    data.jwtSecret = config.jwtSecretEnv || crypto.randomBytes(48).toString('hex');
    changed = true;
  }
  if (!data.passwordHash) {
    const generated = !config.adminPassword;
    const initial = config.adminPassword || generatePassword();
    data.passwordHash = bcrypt.hashSync(initial, 12);
    data.passwordIsDefault = false;
    data.passwordGeneratedOnFirstRun = generated;
    data.createdAt = new Date().toISOString();
    if (generated) generatedInitialPassword = initial;
    changed = true;
  }
  if (changed) saveAppState(data);
  return data;
}

export function saveAppState(next) {
  const tmp = `${config.appFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmp, config.appFile);
  try {
    fs.chmodSync(config.appFile, 0o600);
  } catch {
    /* Windows 上忽略 */
  }
}

export function verifyPassword(password) {
  const state = getAppState();
  return bcrypt.compareSync(String(password || ''), state.passwordHash);
}

export function changePassword(currentPassword, newPassword) {
  if (!verifyPassword(currentPassword)) {
    const err = new Error('当前密码不正确');
    err.status = 400;
    err.code = 'WRONG_PASSWORD';
    throw err;
  }
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    const err = new Error('新密码至少需要 6 个字符');
    err.status = 400;
    err.code = 'WEAK_PASSWORD';
    throw err;
  }
  const state = getAppState();
  state.passwordHash = bcrypt.hashSync(newPassword, 12);
  state.passwordIsDefault = false;
  state.passwordChangedAt = new Date().toISOString();
  saveAppState(state);
}

export function getSessionSecret() {
  return getAppState().jwtSecret;
}

export function isDefaultPassword() {
  return Boolean(getAppState().passwordIsDefault);
}

/** 首次启动随机生成的密码只返回一次，由启动日志提示用户记录。 */
export function takeGeneratedPassword() {
  const password = generatedInitialPassword;
  generatedInitialPassword = null;
  return password;
}
