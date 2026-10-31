/**
 * Word 导出模块入口。
 *
 * buildMistakesDocx(items, options, context?) -> Promise<Buffer>
 * buildEnglishDocx(items, options, context?)   -> Promise<Buffer>
 * context: { uploadDir?, date? }
 */

import { formatIsoDate } from './options.js';

export { buildMistakesDocx } from './mistakes.js';
export { buildEnglishDocx } from './english.js';
export { latexToPlain } from './latex.js';
export { normalizeMistakeOptions, normalizeEnglishOptions } from './options.js';

export const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const EXPORT_NAMES = Object.freeze({
  mistakes: {
    ascii: (date) => `shisui-mistakes-${date}.docx`,
    chinese: (date) => `拾穗-错题集-${date}.docx`,
  },
  english: {
    ascii: (date) => `shisui-english-${date}.docx`,
    chinese: (date) => `拾穗-英语佳句-${date}.docx`,
  },
});

export function exportFileNames(kind, date = new Date()) {
  const config = EXPORT_NAMES[kind];
  if (!config) throw new Error(`未知导出类型：${kind}`);
  const dateText = typeof date === 'string' ? date : formatIsoDate(date);
  return {
    ascii: config.ascii(dateText),
    chinese: config.chinese(dateText),
    date: dateText,
  };
}

/** RFC 5987 Content-Disposition：ASCII 兜底 + UTF-8 中文文件名。 */
export function exportContentDisposition(kind, date = new Date()) {
  const names = exportFileNames(kind, date);
  return `attachment; filename="${names.ascii}"; filename*=UTF-8''${encodeURIComponent(names.chinese)}`;
}
