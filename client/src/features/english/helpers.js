/* English 模块共用的小工具：状态、主题色、复制、纯文本导出等 */
import { stripMarkdown } from '../../lib/format.js';

export const SENTENCE_STATUS_OPTIONS = [
  { value: 'active', label: '已收录' },
  { value: 'pending', label: '待审阅' },
  { value: 'all', label: '全部' },
];

export const VOCAB_STATUS_OPTIONS = SENTENCE_STATUS_OPTIONS;

const THEME_TONES = ['green', 'coral', 'blue', 'violet', 'amber', 'neutral'];

/** 根据主题名稳定地分配一个 badge 色调，避免每次渲染变色 */
export function themeTone(theme = '') {
  let hash = 0;
  for (let index = 0; index < theme.length; index += 1) {
    hash = (hash * 31 + theme.charCodeAt(index)) >>> 0;
  }
  return THEME_TONES[hash % THEME_TONES.length];
}

export function excerpt(value, max = 120) {
  const clean = stripMarkdown(String(value || ''), max);
  return clean;
}

/** 通知外壳 / 侧边栏刷新待审阅数量 */
export function notifyReviewChanged() {
  try {
    window.dispatchEvent(new Event('shisui:review-changed'));
  } catch {
    /* 忽略：非浏览器环境 */
  }
}

/**
 * 复制文本。优先使用 Clipboard API，http / 局域网环境下回退到 execCommand。
 */
export async function copyText(text) {
  const value = String(text ?? '');
  if (!value.trim()) throw new Error('没有可复制的内容');
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      /* 继续尝试旧方案 */
    }
  }
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', 'readonly');
  area.style.position = 'fixed';
  area.style.top = '-2000px';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, value.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } finally {
    area.remove();
  }
  if (!ok) throw new Error('浏览器不允许自动复制，请手动选择文本');
  return true;
}

export function sentenceToText(item = {}) {
  const lines = [];
  if (item.title) lines.push(`【${item.title}】`);
  if (item.content) lines.push(item.content);
  if (item.translation) lines.push(item.translation);
  if (item.theme) lines.push(`主题：${item.theme}`);
  if (item.summary) lines.push(`概要：${item.summary}`);
  if (item.usage) lines.push(`用法：${item.usage}`);
  if (item.example) lines.push(`例句：${item.example}`);
  if (item.exampleTranslation) lines.push(item.exampleTranslation);
  if (item.tags?.length) lines.push(`标签：${item.tags.join('、')}`);
  if (item.source) lines.push(`来源：${item.source}`);
  return lines.join('\n');
}

export function vocabToText(item = {}) {
  const data = item.data || {};
  const term = item.term || data.term || '';
  const lines = [term];
  if (data.phonetic) lines.push(data.phonetic);
  if (data.partOfSpeech?.length) lines.push(data.partOfSpeech.join(' / '));
  if (data.coreTranslation) lines.push(data.coreTranslation);
  if (item.theme) lines.push(`主题：${item.theme}`);

  if (data.definitions?.length) {
    lines.push('', '释义');
    data.definitions.forEach((definition) => {
      const head = [definition.pos, definition.zh].filter(Boolean).join(' ');
      if (head) lines.push(`- ${head}`);
      if (definition.en) lines.push(`  ${definition.en}`);
    });
  }
  if (data.usage) lines.push('', '用法', data.usage);
  if (data.extensions?.length) {
    lines.push('', '延伸');
    data.extensions.forEach((extension) => {
      if (extension.label) lines.push(`${extension.label}：${extension.content || ''}`.trim());
      else if (extension.content) lines.push(extension.content);
    });
  }
  if (data.collocations?.length) {
    lines.push('', '搭配');
    data.collocations.forEach((row) => {
      lines.push(`- ${[row.phrase, row.zh].filter(Boolean).join(' · ')}`);
    });
  }
  if (data.synonyms?.length) {
    lines.push('', `同义词：${data.synonyms.map((row) => [row.word, row.zh].filter(Boolean).join(' ')).join('；')}`);
  }
  if (data.antonyms?.length) {
    lines.push(`反义词：${data.antonyms.map((row) => [row.word, row.zh].filter(Boolean).join(' ')).join('；')}`);
  }
  if (data.confusions) lines.push('', '易混', data.confusions);
  if (data.examples?.length) {
    lines.push('', '例句');
    data.examples.forEach((example) => {
      if (example.en) lines.push(example.en);
      if (example.zh) lines.push(example.zh);
    });
  }
  if (data.memoryTip) lines.push('', '记忆法', data.memoryTip);
  if (data.examTips) lines.push('', '考试提醒', data.examTips);
  if (data.related?.length) {
    lines.push('', `相关：${data.related.map((row) => [row.word, row.relation].filter(Boolean).join('（') + (row.relation ? '）' : '')).join('；')}`);
  }
  return lines.join('\n').trim();
}

/** 词条有内容的分支数量，用于列表上的小提示 */
export function vocabFilledCount(data = {}) {
  let count = 0;
  if (data.coreTranslation || data.definitions?.length) count += 1;
  if (data.usage) count += 1;
  if (data.extensions?.length) count += 1;
  if (data.collocations?.length) count += 1;
  if (data.synonyms?.length) count += 1;
  if (data.antonyms?.length) count += 1;
  if (data.confusions) count += 1;
  if (data.examples?.length) count += 1;
  if (data.memoryTip) count += 1;
  if (data.examTips) count += 1;
  if (data.related?.length) count += 1;
  return count;
}
