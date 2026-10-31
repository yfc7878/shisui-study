/**
 * 英语佳句 Word 导出构建器。
 *
 * 同样保持纯函数：路由只负责取数，这里负责排序、分组、排版。
 */

import {
  BorderStyle, Document, Packer, PageBreak, Paragraph, ShadingType, Table, TableCell,
  TableRow, TextRun, WidthType,
} from 'docx';
import {
  COLORS, formatChineseDate, formatIsoDate, normalizeEnglishOptions,
} from './options.js';
import {
  bodyFont, coverChildren, documentSection, documentStyles, groupHeading, headingFont,
  makeTextRun, overviewDateLine, overviewHeader, separator,
  statTable, distributionTable,
} from './layout.js';
import { inlineToRuns } from './markdown.js';
import { latexToPlain } from './latex.js';

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'zh-Hans-CN');
}

function createdAtValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function dateGroupTitle(value) {
  const iso = formatIsoDate(value);
  if (iso === '1970-01-01' && !value) return '未标注日期';
  return `${iso.slice(0, 4)} 年 ${Number(iso.slice(5, 7))} 月 ${Number(iso.slice(8, 10))} 日`;
}

function applyItemOrder(items, itemOrder) {
  const rank = new Map();
  itemOrder.forEach((id, index) => {
    if (!rank.has(id)) rank.set(id, index);
  });
  return [...items].sort((a, b) => {
    const aRank = rank.has(a.id) ? rank.get(a.id) : Number.POSITIVE_INFINITY;
    const bRank = rank.has(b.id) ? rank.get(b.id) : Number.POSITIVE_INFINITY;
    if (aRank === bRank) return 0;
    return aRank - bRank;
  });
}

function groupSentences(items, options) {
  if (options.groupBy === 'none') {
    return [{ key: 'all', title: '', items }];
  }

  const buckets = new Map();
  if (options.groupBy === 'theme') {
    for (const item of items) {
      const key = item.theme || '未分类';
      if (!buckets.has(key)) buckets.set(key, { key, title: key, items: [] });
      buckets.get(key).items.push(item);
    }
    const ordered = [];
    for (const theme of options.themeOrder) {
      if (buckets.has(theme)) {
        ordered.push(buckets.get(theme));
        buckets.delete(theme);
      }
    }
    for (const bucket of buckets.values()) ordered.push(bucket);
    return ordered;
  }

  for (const item of items) {
    const iso = item.createdAt ? formatIsoDate(item.createdAt) : '未标注日期';
    if (!buckets.has(iso)) {
      buckets.set(iso, {
        key: iso,
        title: iso === '未标注日期' ? iso : dateGroupTitle(item.createdAt),
        items: [],
        sortValue: createdAtValue(item.createdAt),
      });
    }
    buckets.get(iso).items.push(item);
  }
  return [...buckets.values()].sort((a, b) => {
    if (a.key === '未标注日期') return 1;
    if (b.key === '未标注日期') return -1;
    return (b.sortValue || 0) - (a.sortValue || 0);
  });
}

function duplicateTitle(title, content) {
  const left = latexToPlain(title).replace(/[\s#*_`>“”"']/g, '');
  const right = latexToPlain(content).replace(/[\s#*_`>“”"']/g, '');
  if (!left || left.length < 5) return false;
  return right.startsWith(left);
}

function englishStyle(common, overrides = {}) {
  return {
    font: overrides.font || bodyFont(common),
    size: overrides.size ?? common.fontSize,
    color: overrides.color || COLORS.ink,
    bold: Boolean(overrides.bold),
    italics: Boolean(overrides.italics),
  };
}

function quoteRuns(item, common, options, size) {
  const content = String(item.content || '').trim();
  if (!content) {
    return [makeTextRun(common, '（暂无句子）', {
      size,
      color: COLORS.faint,
      italics: true,
    })];
  }
  const alreadyQuoted = /^[“"'].*[”"']$/s.test(content);
  const useQuotes = options.quoteMarks && !alreadyQuoted;
  const style = englishStyle(common, { size, color: COLORS.ink });
  const runs = [];
  if (useQuotes) {
    runs.push(makeTextRun(common, '“', { ...style, color: COLORS.gold }));
  }
  runs.push(...inlineToRuns(content, style));
  if (useQuotes) {
    runs.push(makeTextRun(common, '”', { ...style, color: COLORS.gold }));
  }
  return runs;
}

function labelledParagraph(common, label, value, options = {}) {
  const text = String(value || '').trim();
  if (!text) return null;
  return new Paragraph({
    spacing: {
      before: options.before ?? 70,
      after: options.after ?? 55,
      line: Math.round(common.lineSpacing * 250),
      lineRule: 'auto',
    },
    indent: options.indent,
    children: [
      makeTextRun(common, `${label}  `, {
        size: 8.5,
        color: COLORS.accent,
        bold: true,
      }),
      ...inlineToRuns(text, englishStyle(common, {
        size: options.size ?? common.fontSize - 0.5,
        color: options.color || COLORS.body,
        italics: options.italics,
      })),
    ],
  });
}

function itemHeader(item, common, options, number) {
  const showTitle = Boolean(item.title) && !duplicateTitle(item.title, item.content);
  if (!options.numbered && !showTitle) return null;
  const children = [];
  if (options.numbered) {
    children.push(makeTextRun(common, String(number).padStart(2, '0'), {
      size: common.fontSize + 1,
      color: COLORS.accent,
      bold: true,
      font: headingFont(common),
    }));
  }
  if (showTitle) {
    if (children.length) children.push(makeTextRun(common, '   ', { size: 9 }));
    children.push(makeTextRun(common, item.title, {
      size: common.fontSize + 1,
      color: COLORS.ink,
      bold: true,
    }));
  }
  return new Paragraph({
    keepNext: true,
    spacing: { before: 0, after: 90, line: 260, lineRule: 'auto' },
    children,
  });
}

function detailChildren(item, common, options) {
  const children = [];
  const add = (paragraph) => {
    if (paragraph) children.push(paragraph);
  };
  if (options.includeSummary) {
    add(labelledParagraph(common, '摘要', item.summary, { color: COLORS.muted }));
  }
  if (options.includeTranslation) {
    add(labelledParagraph(common, '翻译', item.translation, { color: COLORS.body }));
  }
  if (options.includeUsage) {
    add(labelledParagraph(common, '用法', item.usage, { color: COLORS.body }));
  }
  if (options.includeExample) {
    add(labelledParagraph(common, '例句', item.example, {
      color: COLORS.body,
      italics: true,
      before: 90,
    }));
  }
  if (options.includeExampleTranslation) {
    add(labelledParagraph(common, '例句翻译', item.exampleTranslation, {
      color: COLORS.muted,
      before: 25,
    }));
  }
  const meta = [];
  if (options.includeSource && item.source) meta.push(`来源：${item.source}`);
  if (options.includeTags && Array.isArray(item.tags) && item.tags.length) {
    meta.push(`标签：${item.tags.join(' / ')}`);
  }
  if (meta.length) {
    children.push(new Paragraph({
      spacing: { before: 95, after: 0, line: 230, lineRule: 'auto' },
      children: [
        makeTextRun(common, meta.join('    ·    '), {
          size: 8.5,
          color: COLORS.faint,
        }),
      ],
    }));
  }
  return children;
}

function quoteParagraph(item, common, options) {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 30, after: 110, line: Math.round(Math.max(1.35, common.lineSpacing) * 260), lineRule: 'auto' },
    children: quoteRuns(item, common, options, common.fontSize + 2.5),
  });
}

function cardChildren(item, common, options, number) {
  const children = [];
  const header = itemHeader(item, common, options, number);
  if (header) children.push(header);
  children.push(quoteParagraph(item, common, options));
  children.push(...detailChildren(item, common, options));

  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.lineSoft },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.lineSoft },
        left: { style: BorderStyle.SINGLE, size: 18, color: COLORS.accent },
        right: { style: BorderStyle.SINGLE, size: 4, color: COLORS.lineSoft },
        insideHorizontal: { style: BorderStyle.NONE, size: 2, color: COLORS.white },
        insideVertical: { style: BorderStyle.NONE, size: 2, color: COLORS.white },
      },
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              shading: { type: ShadingType.CLEAR, fill: COLORS.card, color: 'auto' },
              margins: { top: 220, bottom: 220, left: 260, right: 260 },
              children,
            }),
          ],
        }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 150, line: 240, lineRule: 'auto' },
      children: [new TextRun({ text: '', size: 2 })],
    }),
  ];
}

function listChildren(item, common, options, number) {
  const children = [];
  const header = itemHeader(item, common, options, number);
  if (header) children.push(header);
  children.push(quoteParagraph(item, common, options));
  children.push(...detailChildren(item, common, options));
  children.push(separator(common, { before: 110, after: 130 }));
  return children;
}

function themeIntro(common, group, groupBy) {
  const label = group.key === 'all' ? '' : group.title;
  if (!label) return null;
  const prefix = groupBy === 'date' ? '本日' : '本主题';
  const sentence = groupBy === 'date'
    ? `${prefix}共整理 ${group.items.length} 条佳句，适合按时间顺序回看。`
    : `${prefix}共收录 ${group.items.length} 条佳句，聚焦「${label}」的表达积累。`;
  return new Paragraph({
    keepNext: true,
    indent: { left: 220 },
    spacing: { before: 0, after: 150, line: 250, lineRule: 'auto' },
    border: {
      left: { style: BorderStyle.SINGLE, size: 8, color: COLORS.line, space: 10 },
    },
    children: [
      makeTextRun(common, sentence, {
        size: 9,
        color: COLORS.muted,
        italics: true,
      }),
    ],
  });
}

function coverStats(items) {
  const themes = new Set(items.map((item) => item.theme || '未分类')).size;
  return `共 ${items.length} 句  ·  ${themes} 个主题`;
}

function overviewChildren(items, common, options, context) {
  const themeCounts = new Map();
  for (const item of items) {
    const theme = item.theme || '未分类';
    themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1);
  }
  const themeRows = [...themeCounts.entries()]
    .sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]))
    .map(([theme, count]) => [theme, count, `${Math.round((count / items.length) * 100)}%`]);
  const sourceCount = new Set(items.map((item) => item.source).filter(Boolean)).size;
  const children = [
    ...overviewHeader(common, 'OVERVIEW / 英语佳句', '佳句总览'),
    statTable(common, [
      { value: String(items.length), label: '佳句总数' },
      { value: String(themeCounts.size), label: '主题数量' },
      { value: String(sourceCount), label: '来源数量' },
    ]),
    new Paragraph({
      spacing: { before: 260, after: 80 },
      children: [
        makeTextRun(common, '主题分布', {
          size: common.fontSize + 1,
          color: COLORS.ink,
          bold: true,
        }),
      ],
    }),
    distributionTable(common, themeRows, { label: '主题', count: '数量', ratio: '占比' }),
  ];
  if (options.showDate) children.push(overviewDateLine(common, context.date));
  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

/**
 * @param {Array} rawItems 已映射的英语佳句对象
 * @param {object} rawOptions
 * @param {{date?: Date}} context
 * @returns {Promise<Buffer>}
 */
export async function buildEnglishDocx(rawItems, rawOptions = {}, context = {}) {
  const options = normalizeEnglishOptions(rawOptions);
  const items = (Array.isArray(rawItems) ? rawItems : [])
    .filter((item) => item && item.id && item.status !== 'trashed');
  if (!items.length) throw new Error('EMPTY_EXPORT');
  const date = context.date instanceof Date ? context.date : new Date();
  const ordered = applyItemOrder(items, options.itemOrder);

  const children = [];
  if (options.includeCover) {
    children.push(...coverChildren(options, {
      eyebrow: '拾穗 STUDY  /  英语佳句',
      title: options.title,
      subtitle: options.subtitle,
      statsLine: coverStats(ordered),
      date,
    }));
  }
  if (options.includeOverview) {
    children.push(...overviewChildren(ordered, options, options, { date }));
  }

  const groups = groupSentences(ordered, options);
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    if (options.groupBy !== 'none') {
      children.push(groupHeading(
        options,
        groupIndex + 1,
        group.title,
        `${group.items.length} 句`,
      ));
      if (options.includeThemeIntro) {
        const intro = themeIntro(options, group, options.groupBy);
        if (intro) children.push(intro);
      }
    }
    let number = 0;
    for (const item of group.items) {
      number += 1;
      if (options.layout === 'list') {
        children.push(...listChildren(item, options, options, number));
      } else {
        children.push(...cardChildren(item, options, options, number));
      }
    }
  }

  if (!children.length) throw new Error('EMPTY_EXPORT');

  const doc = new Document({
    title: options.title,
    subject: options.subtitle || '拾穗 Study 英语佳句',
    creator: '拾穗 Study',
    description: `拾穗 Study 英语佳句导出 · ${formatChineseDate(date)}`,
    styles: documentStyles(options),
    sections: [documentSection(children, options, date)],
  });
  return Packer.toBuffer(doc);
}

export default buildEnglishDocx;
