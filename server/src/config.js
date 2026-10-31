import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(ROOT_DIR, '.env') });

const dataDir = path.resolve(ROOT_DIR, process.env.DATA_DIR || 'server/data');
const uploadDir = path.join(dataDir, 'uploads');
const tmpDir = path.join(dataDir, 'tmp');

for (const dir of [dataDir, uploadDir, tmpDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

export const config = {
  rootDir: ROOT_DIR,
  dataDir,
  uploadDir,
  tmpDir,
  dbFile: path.join(dataDir, 'study.db'),
  appFile: path.join(dataDir, 'app.json'),
  publicDir: path.join(ROOT_DIR, 'client', 'dist'),
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  jwtSecretEnv: process.env.JWT_SECRET || '',
  appOrigin: process.env.APP_ORIGIN || '',
  trustProxy: process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
  sessionDays: Number(process.env.SESSION_DAYS || 30),
  isProd: process.env.NODE_ENV === 'production',
  version: '1.0.0',
};

export const paths = { dataDir, uploadDir, tmpDir };
