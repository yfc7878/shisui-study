/**
 * 导出选项归一化。
 *
 * 前端传来的 options 可能缺字段、类型不对或带了不在白名单里的值。
 * 所有 builder 都先经过这里，确保排版代码拿到的是一组稳定、可预期的值。
 */

export const FONT_MAP = Object.freeze({
  宋体: 'SimSun',
  仿宋: 'FangSong',
  楷体: 'KaiTi',
  微软雅黑: 'Microsoft YaHei',
  黑体: 'SimHei',
});

const FONT_ALIASES = Object.freeze({
  simsun: '宋体',
  fangsong: '仿宋',
  kaiti: '楷体',
  'microsoft yahei': '微软雅黑',
  'microsoft ya hei': '微软雅黑',
  msyh: '微软雅黑',
  simhei: '黑体',
  宋體: '宋体',
  仿宋体: '仿宋',
  楷体_gb2312: '楷体',
  雅黑: '微软雅黑',
});

export const COLORS = Object.freeze({
  ink: '24312D',
  body: '33423C',
  muted: '77837D',
  faint: '9AA59F',
  accent: '2F5D50',
  accentLight: 'E8F0EA',
  gold: 'A6814F',
  line: 'D7DED8',
  lineSoft: 'E7ECE8',
  paper: 'F7F8F4',
  card: 'FBFCF9',
  white: 'FFFFFF',
  answerBg: 'F4F8F2',
  codeBg: 'F1F4F1',
});

export const PAGE_SIZES = Object.freeze({
  A4: { width: 11906, height: 16838, label: 'A4' },
  B5: { width: 9979, height: 14173, label: 'B5' },
});

export const MARGINS = Object.freeze({
  normal: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720 },
  narrow: { top: 720, right: 720, bottom: 720, left: 720, header: 360, footer: 360 },
  wide: { top: 1800, right: 2160, bottom: 1800, left: 2160, header: 900, footer: 900 },
});

export const BLANK_SPACE_HEIGHT = Object.freeze({
  small: 76,
  medium: 118,
  large: 176,
});

export const MISTAKE_DEFAULTS = Object.freeze({
  title: '错题集',
  subtitle: '把每一道错题，变成下一次的得分点',
  includeCover: true,
  includeOverview: true,
  includeAnswer: true,
  includeAnalysis: true,
  includeMeta: true,
  includeFigures: true,
  includeKnowledgePoints: true,
  includeSource: true,
  includeErrorReason: true,
  answerPlacement: 'after',
  includeBlankSpace: false,
  blankSpace: 'medium',
  groupBy: 'subject',
  sortBy: 'created',
  fontFamily: '宋体',
  fontSize: 12,
  headingSize: 16,
  lineSpacing: 1.5,
  pageSize: 'A4',
  margin: 'normal',
  showPageNumbers: true,
  showDate: true,
  numbered: true,
  coverStyle: 'simple',
  includeTags: false,
  includeChapter: true,
  watermarkText: '',
});

export const ENGLISH_DEFAULTS = Object.freeze({
  title: '英语佳句',
  subtitle: '在好句子里，遇见更好的表达',
  includeCover: true,
  includeOverview: true,
  includeTranslation: true,
  includeUsage: true,
  includeExample: true,
  includeExampleTranslation: true,
  includeSummary: false,
  includeTags: false,
  includeSource: true,
  groupBy: 'theme',
  themeOrder: [],
  itemOrder: [],
  layout: 'cards',
  fontFamily: '宋体',
  fontSize: 12,
  headingSize: 16,
  lineSpacing: 1.5,
  pageSize: 'A4',
  margin: 'normal',
  showPageNumbers: true,
  showDate: true,
  numbered: true,
  coverStyle: 'simple',
  includeThemeIntro: false,
  quoteMarks: true,
  watermarkText: '',
});

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function rawObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function optionalText(value, max = 180) {
  if (typeof value !== 'string') return '';
  return value.replace(/\u0000/g, '').trim().slice(0, max);
}

function textOr(value, fallback, max = 180) {
  const text = optionalText(value, max);
  return text || fallback;
}

function bool(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === 0) return Boolean(value);
  if (typeof value === 'string') {
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
  }
  return fallback;
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function numberInRange(value, min, max, fallback, step = 0.5) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.min(max, Math.max(min, num));
  return Math.round(clamped / step) * step;
}

function uniqueStrings(value, maxItems = 200, maxLen = 200) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = item.replace(/\u0000/g, '').trim().slice(0, maxLen);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function normalizeFontFamily(value) {
  if (typeof value !== 'string') return '宋体';
  const trimmed = value.trim();
  if (FONT_MAP[trimmed]) return trimmed;
  const alias = FONT_ALIASES[trimmed.toLowerCase()];
  return alias || '宋体';
}

export function fontInfo(fontFamily) {
  const label = normalizeFontFamily(fontFamily);
  return {
    label,
    eastAsia: FONT_MAP[label],
    // 中文正文与英文混排时，西文用 Times New Roman 更接近纸质讲义。
    latin: 'Times New Roman',
    headingLatin: 'Georgia',
  };
}

export function normalizePageSize(value) {
  return oneOf(value, Object.keys(PAGE_SIZES), 'A4');
}

export function normalizeMargin(value) {
  return oneOf(value, Object.keys(MARGINS), 'normal');
}

export function pageLayout(common) {
  const size = PAGE_SIZES[common.pageSize] || PAGE_SIZES.A4;
  const margin = MARGINS[common.margin] || MARGINS.normal;
  const availableWidthTwips = Math.max(3000, size.width - margin.left - margin.right);
  return {
    ...size,
    margin,
    availableWidthTwips,
    // docx 的 ImageRun transformation 使用 96 DPI 的像素。
    availableWidthPx: Math.floor(availableWidthTwips / 15),
  };
}

export function formatIsoDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = safe.getFullYear();
  const month = String(safe.getMonth() + 1).padStart(2, '0');
  const day = String(safe.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatChineseDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return `${safe.getFullYear()} 年 ${safe.getMonth() + 1} 月 ${safe.getDate()} 日`;
}

export function dateKey(value) {
  return formatIsoDate(value);
}

function normalizeCommon(raw, defaults) {
  const source = rawObject(raw);
  const title = hasOwn(source, 'title')
    ? textOr(source.title, defaults.title, 80)
    : defaults.title;
  const subtitle = hasOwn(source, 'subtitle')
    ? optionalText(source.subtitle, 120)
    : defaults.subtitle;
  const fontFamily = normalizeFontFamily(source.fontFamily);

  return {
    title,
    subtitle,
    fontFamily,
    fontSize: numberInRange(source.fontSize, 8, 24, defaults.fontSize, 0.5),
    headingSize: numberInRange(source.headingSize, 10, 36, defaults.headingSize, 0.5),
    lineSpacing: numberInRange(source.lineSpacing, 1, 3, defaults.lineSpacing, 0.05),
    pageSize: normalizePageSize(source.pageSize),
    margin: normalizeMargin(source.margin),
    showPageNumbers: bool(source.showPageNumbers, defaults.showPageNumbers),
    showDate: bool(source.showDate, defaults.showDate),
    numbered: bool(source.numbered, defaults.numbered),
    coverStyle: oneOf(source.coverStyle, ['simple', 'classic'], defaults.coverStyle),
    includeCover: bool(source.includeCover, defaults.includeCover),
    includeOverview: bool(source.includeOverview, defaults.includeOverview),
    watermarkText: optionalText(source.watermarkText, 40),
    font: fontInfo(fontFamily),
  };
}

export function normalizeMistakeOptions(raw = {}) {
  const source = rawObject(raw);
  const common = normalizeCommon(source, MISTAKE_DEFAULTS);
  return {
    ...common,
    includeAnswer: bool(source.includeAnswer, MISTAKE_DEFAULTS.includeAnswer),
    includeAnalysis: bool(source.includeAnalysis, MISTAKE_DEFAULTS.includeAnalysis),
    includeMeta: bool(source.includeMeta, MISTAKE_DEFAULTS.includeMeta),
    includeFigures: bool(source.includeFigures, MISTAKE_DEFAULTS.includeFigures),
    includeKnowledgePoints: bool(source.includeKnowledgePoints, MISTAKE_DEFAULTS.includeKnowledgePoints),
    includeSource: bool(source.includeSource, MISTAKE_DEFAULTS.includeSource),
    includeErrorReason: bool(source.includeErrorReason, MISTAKE_DEFAULTS.includeErrorReason),
    includeTags: bool(source.includeTags, MISTAKE_DEFAULTS.includeTags),
    includeChapter: bool(source.includeChapter, MISTAKE_DEFAULTS.includeChapter),
    answerPlacement: oneOf(source.answerPlacement, ['after', 'end'], MISTAKE_DEFAULTS.answerPlacement),
    includeBlankSpace: bool(source.includeBlankSpace, MISTAKE_DEFAULTS.includeBlankSpace),
    blankSpace: oneOf(source.blankSpace, Object.keys(BLANK_SPACE_HEIGHT), MISTAKE_DEFAULTS.blankSpace),
    groupBy: oneOf(source.groupBy, ['subject', 'source', 'difficulty', 'none'], MISTAKE_DEFAULTS.groupBy),
    sortBy: oneOf(source.sortBy, ['created', 'difficulty', 'subject'], MISTAKE_DEFAULTS.sortBy),
  };
}

export function normalizeEnglishOptions(raw = {}) {
  const source = rawObject(raw);
  const common = normalizeCommon(source, ENGLISH_DEFAULTS);
  return {
    ...common,
    includeTranslation: bool(source.includeTranslation, ENGLISH_DEFAULTS.includeTranslation),
    includeUsage: bool(source.includeUsage, ENGLISH_DEFAULTS.includeUsage),
    includeExample: bool(source.includeExample, ENGLISH_DEFAULTS.includeExample),
    includeExampleTranslation: bool(
      source.includeExampleTranslation,
      ENGLISH_DEFAULTS.includeExampleTranslation,
    ),
    includeSummary: bool(source.includeSummary, ENGLISH_DEFAULTS.includeSummary),
    includeTags: bool(source.includeTags, ENGLISH_DEFAULTS.includeTags),
    includeSource: bool(source.includeSource, ENGLISH_DEFAULTS.includeSource),
    groupBy: oneOf(source.groupBy, ['theme', 'date', 'none'], ENGLISH_DEFAULTS.groupBy),
    themeOrder: uniqueStrings(source.themeOrder, 100, 60),
    itemOrder: uniqueStrings(source.itemOrder, 200, 100),
    layout: oneOf(source.layout, ['cards', 'list'], ENGLISH_DEFAULTS.layout),
    includeThemeIntro: bool(source.includeThemeIntro, ENGLISH_DEFAULTS.includeThemeIntro),
    quoteMarks: bool(source.quoteMarks, ENGLISH_DEFAULTS.quoteMarks),
  };
}

export function difficultyLabel(value) {
  const level = Math.max(1, Math.min(5, Number(value) || 3));
  return ['', '很基础', '较基础', '中等', '较难', '压轴'][level];
}

export function difficultyStars(value) {
  const level = Math.max(1, Math.min(5, Number(value) || 3));
  return `${'●'.repeat(level)}${'○'.repeat(5 - level)}`;
}
