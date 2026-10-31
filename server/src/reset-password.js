import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import bcrypt from 'bcryptjs';
import { getAppState, saveAppState } from './store.js';
import { config } from './config.js';

const fromArgs = process.argv.slice(2).join(' ').trim();
let password = fromArgs || process.env.NEW_PASSWORD || '';

if (!password) {
  const rl = readline.createInterface({ input, output });
  password = (await rl.question('请输入新的访问密码（至少 6 位）：')).trim();
  const second = (await rl.question('再次输入确认：')).trim();
  rl.close();
  if (password !== second) {
    console.error('两次输入的密码不一致，未修改。');
    process.exit(1);
  }
}

if (password.length < 6) {
  console.error('密码至少需要 6 个字符，未修改。');
  process.exit(1);
}

const state = getAppState();
state.passwordHash = bcrypt.hashSync(password, 12);
state.passwordIsDefault = false;
state.passwordChangedAt = new Date().toISOString();
saveAppState(state);
console.log(`已重置访问密码。数据文件：${config.appFile}`);
console.log('如果服务正在运行，无需重启；新登录会使用新密码。');
