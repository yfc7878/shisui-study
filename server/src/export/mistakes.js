/**
 * 错题集 Word 导出构建器。
 *
 * 纯函数：只接收已映射的错题数组和 options，不查数据库。
 * 路由负责按 id 取数；这样测试可以直接用假数据生成真实 .docx。
 */

import {
  BorderStyle, Document, PageBreak, Packer, Paragraph, ShadingType, Table,
  TableCell, TableRow, WidthType,
} from 'docx';
import {
  COLORS, difficultyLabel, difficultyStars, formatChineseDate, formatIsoDate,
  normalizeMistakeOptions, pageLayout,
} from './options.js';
import {
  bodyFont, blankAnswerArea, coverChildren, documentSection, documentStyles, emptyParagraph,
  groupHeading, headingFont, imageChildren, makeTextRun, metaLine,
  overviewDateLine, overviewHeader, separator, statTable, distributionTable,
} from './layout.js';
import { markdownToDocx } from './markdown.js';
import { latexToPlain } from './latex.js';

const SUBJECT_ORDER = ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理', '其他'];

function createdAtValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function subjectRank(subject) {
  const index = SUBJECT_ORDER.indexOf(subject);
  return index < 0 ? SUBJECT_ORDER.length : index;
}

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'zh-Hans-CN');
}

function sortItems(items, sortBy) {
  const copy = [...items];
  copy.sort((a, b) => {
    if (sortBy === 'difficulty') {
      const diff = (Number(a.difficulty) || 3) - (Number(b.difficulty) || 3);
      if (diff) return diff;
      return createdAtValue(a.createdAt) - createdAtValue(b.createdAt);
    }
    if (sortBy === 'subject') {
      const rank = subjectRank(a.subject) - subjectRank(b.subject);
      if (rank) return rank;
      const subject = compareText(a.subject, b.subject);
      if (subject) return subject;
      return createdAtValue(a.createdAt) - createdAtValue(b.createdAt);
    }
    const created = createdAtValue(a.createdAt) - createdAtValue(b.createdAt);
    if (created) return created;
    return compareText(a.title, b.title);
  });
  return copy;
}

function groupItems(items, groupBy) {
  if (groupBy === 'none') {
    return [{ key: 'all', title: '', items }];
  }

  const buckets = new Map();
  for (const item of items) {
    let key;
    let title;
    if (groupBy === 'subject') {
      key = item.subject || '未标注科目';
      title = key;
    } else if (groupBy === 'source') {
      key = item.source || '未标注来源';
      title = key;
    } else {
      const difficulty = Math.max(1, Math.min(5, Number(item.difficulty) || 3));
      key = String(difficulty);
      title = `难度 ${difficulty} · ${difficultyLabel(difficulty)}`;
    }
    if (!buckets.has(key)) buckets.set(key, { key, title, items: [] });
    buckets.get(key).items.push(item);
  }

  let groups = [...buckets.values()];
  if (groupBy === 'subject') {
    groups.sort((a, b) => {
      if (a.key === '未标注科目') return 1;
      if (b.key === '未标注科目') return -1;
      const rank = subjectRank(a.key) - subjectRank(b.key);
      return rank || compareText(a.key, b.key);
    });
  } else if (groupBy === 'source') {
    groups.sort((a, b) => {
      if (a.key === '未标注来源') return 1;
      if (b.key === '未标注来源') return -1;
      return compareText(a.key, b.key);
    });
  } else {
    groups.sort((a, b) => Number(a.key) - Number(b.key));
  }
  return groups;
}

function countBy(items, selector) {
  const counts = new Map();
  for (const item of items) {
    const key = selector(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function looksLikeDuplicateTitle(title, questionText) {
  const titleText = latexToPlain(title).replace(/[\s#*_`>]/g, '');
  const question = latexToPlain(questionText).replace(/[\s#*_`>]/g, '');
  if (!titleText || !question) return false;
  if (titleText.length < 4) return false;
  return question.startsWith(titleText)
    || titleText.startsWith(question.slice(0, Math.min(24, question.length)));
}

function collectImages(item, includeFigures) {
  const seen = new Set();
  const result = [];
  const add = (entry, prefix) => {
    if (!entry?.url || seen.has(entry.url)) return;
    seen.add(entry.url);
    result.push({
      ...entry,
      caption: entry.caption || entry.name || `${prefix}${result.length + 1}`,
    });
  };
  for (const image of Array.isArray(item.images) ? item.images : []) add(image, '图 ');
  if (includeFigures) {
    for (const figure of Array.isArray(item.figures) ? item.figures : []) {
      add(figure, '图 ');
    }
  }
  return result;
}

function answerLabel(common, text) {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 140, after: 80, line: 240, lineRule: 'auto' },
    children: [
      makeTextRun(common, text, {
        size: 9,
        color: COLORS.accent,
        bold: true,
        font: headingFont(common),
      }),
    ],
  });
}

function answerContent(common, text, layout, options = {}) {
  if (!text) return [];
  return markdownToDocx(text, {
    font: bodyFont(common),
    size: common.fontSize,
    headingSize: common.headingSize,
    lineSpacing: common.lineSpacing,
    color: options.color || COLORS.body,
    accent: COLORS.accent,
    muted: COLORS.muted,
    tableWidthTwips: layout.availableWidthTwips - 560,
    compact: true,
  });
}

function answerBlock(item, common, options, layout, { showTitle = false, index = 1 } = {}) {
  const children = [];
  const answer = options.includeAnswer ? String(item.answerText || '').trim() : '';
  const analysis = options.includeAnalysis ? String(item.analysisText || '').trim() : '';
  if (!answer && !analysis) return children;

  if (showTitle) {
    const title = item.title && !looksLikeDuplicateTitle(item.title, item.questionText)
      ? item.title
      : item.subject || '题目';
    children.push(new Paragraph({
      keepNext: true,
      spacing: { before: 260, after: 100, line: 260, lineRule: 'auto' },
      children: [
        makeTextRun(common, String(index).padStart(2, '0'), {
          size: 9,
          color: COLORS.accent,
          bold: true,
          font: headingFont(common),
        }),
        makeTextRun(common, `   ${title}`, {
          size: common.fontSize + 1,
          color: COLORS.ink,
          bold: true,
        }),
      ],
    }));
  }

  const cellChildren = [];
  if (answer) {
    cellChildren.push(answerLabel(common, '参考答案'));
    cellChildren.push(...answerContent(common, answer, layout));
  }
  if (analysis) {
    cellChildren.push(answerLabel(common, '解析'));
    cellChildren.push(...answerContent(common, analysis, layout, { color: COLORS.body }));
  }

  // 标题与答案框之间不要插入空段落：否则标题的 keepNext 只作用于空段落，
  // 表格会单独落到下一页，形成“参考答案 04 …”孤行。
  if (!showTitle) children.push(emptyParagraph(80));
  children.push(new Table({
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
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: COLORS.answerBg, color: 'auto' },
            margins: { top: 180, bottom: 180, left: 260, right: 260 },
            children: cellChildren.length
              ? cellChildren
              : [new Paragraph({ children: [new TextRun({ text: '', size: 2 })] })],
          }),
        ],
      }),
    ],
  }));
  children.push(emptyParagraph(80));
  return children;
}

function buildQuestionHeader(item, common, options, number, showTitle) {
  if (!options.numbered && !showTitle) return null;
  const runs = [];
  if (options.numbered) {
    runs.push(makeTextRun(common, String(number).padStart(2, '0'), {
      size: common.fontSize + 3,
      color: COLORS.accent,
      bold: true,
      font: headingFont(common),
    }));
  }
  if (showTitle) {
    if (runs.length) runs.push(makeTextRun(common, '   ', { size: 10 }));
    runs.push(makeTextRun(common, item.title, {
      size: common.fontSize + 2.5,
      color: COLORS.ink,
      bold: true,
    }));
  }
  return new Paragraph({
    keepNext: true,
    spacing: { before: 200, after: 100, line: 280, lineRule: 'auto' },
    children: runs,
  });
}

function questionMeta(item, common, options) {
  if (!options.includeMeta && !options.includeSource && !options.includeErrorReason
    && !options.includeChapter && !options.includeTags) return [];
  const primary = [];
  if (options.includeMeta) {
    if (item.subject && options.groupBy !== 'subject') primary.push(`科目：${item.subject}`);
    if (item.difficulty) {
      primary.push(`难度 ${difficultyStars(item.difficulty)} ${difficultyLabel(item.difficulty)}`);
    }
    if (item.createdAt) primary.push(`创建 ${formatIsoDate(item.createdAt)}`);
  }
  const secondary = [];
  if (options.includeSource && item.source) secondary.push(`来源：${item.source}`);
  if (options.includeChapter && item.chapter) secondary.push(`章节：${item.chapter}`);
  if (options.includeErrorReason && item.errorReason) secondary.push(`错因：${item.errorReason}`);
  if (options.includeTags && Array.isArray(item.tags) && item.tags.length) {
    secondary.push(`标签：${item.tags.join(' / ')}`);
  }
  return [metaLine(common, primary), metaLine(common, secondary)].filter(Boolean);
}

function knowledgeLine(item, common, options) {
  if (!options.includeKnowledgePoints) return null;
  const points = Array.isArray(item.knowledgePoints)
    ? item.knowledgePoints.filter(Boolean)
    : [];
  if (!points.length) return null;
  return new Paragraph({
    spacing: { before: 20, after: 100, line: 240, lineRule: 'auto' },
    children: [
      makeTextRun(common, '知识点  ', {
        size: 8.5,
        color: COLORS.accent,
        bold: true,
      }),
      makeTextRun(common, points.join('  ·  '), {
        size: 8.5,
        color: COLORS.muted,
      }),
    ],
  });
}

function itemContent(item, common, options, layout, context, number) {
  const children = [];
  const questionText = String(item.questionText || '').trim();
  const showTitle = Boolean(item.title) && !looksLikeDuplicateTitle(item.title, questionText);
  const header = buildQuestionHeader(item, common, options, number, showTitle);
  if (header) children.push(header);
  children.push(...questionMeta(item, common, options));

  if (questionText) {
    children.push(...markdownToDocx(questionText, {
      font: bodyFont(common),
      size: common.fontSize,
      headingSize: common.headingSize,
      lineSpacing: common.lineSpacing,
      color: COLORS.body,
      accent: COLORS.accent,
      muted: COLORS.muted,
      tableWidthTwips: layout.availableWidthTwips,
    }));
  } else if (!Array.isArray(item.images) || !item.images.length) {
    children.push(new Paragraph({
      spacing: { before: 0, after: 100 },
      children: [makeTextRun(common, '（暂无题目正文）', {
        size: common.fontSize,
        color: COLORS.faint,
        italics: true,
      })],
    }));
  }

  const images = collectImages(item, options.includeFigures);
  if (images.length) {
    // 图片是异步读取的，这里返回一个 Promise 占位，由调用方 await。
    children.push({ async: true, value: imageChildren(images, common, {
      uploadDir: context.uploadDir,
      maxWidthPx: layout.availableWidthPx,
      maxHeightPx: 620,
    }) });
  }

  const knowledge = knowledgeLine(item, common, options);
  if (knowledge) children.push(knowledge);

  if (options.includeBlankSpace) {
    children.push(emptyParagraph(80));
    children.push(blankAnswerArea(common, options.blankSpace));
    children.push(emptyParagraph(100));
  }

  return children;
}

async function resolveAsyncChildren(children) {
  const out = [];
  for (const child of children) {
    if (child && typeof child === 'object' && child.async === true) {
      const resolved = await child.value;
      if (Array.isArray(resolved)) out.push(...resolved);
      else if (resolved) out.push(resolved);
    } else {
      out.push(child);
    }
  }
  return out;
}

function coverStats(items) {
  const subjectCount = new Set(items.map((item) => item.subject || '未标注科目')).size;
  return `共 ${items.length} 题  ·  ${subjectCount} 个科目`;
}

function overviewChildren(items, common, options, context) {
  const subjectCounts = countBy(items, (item) => item.subject || '未标注科目');
  const subjectRows = [...subjectCounts.entries()]
    .sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]))
    .map(([subject, count]) => [subject, count, `${Math.round((count / items.length) * 100)}%`]);
  const imageCount = items.reduce((total, item) => total + (Array.isArray(item.images) ? item.images.length : 0), 0);
  const children = [
    ...overviewHeader(common, 'OVERVIEW / 错题集', '错题总览'),
    statTable(common, [
      { value: String(items.length), label: '题目总数' },
      { value: String(subjectCounts.size), label: '覆盖科目' },
      { value: String(imageCount), label: '题目图片' },
    ]),
    new Paragraph({
      spacing: { before: 260, after: 80 },
      children: [
        makeTextRun(common, '科目分布', {
          size: common.fontSize + 1,
          color: COLORS.ink,
          bold: true,
        }),
      ],
    }),
    distributionTable(common, subjectRows, { label: '科目', count: '数量', ratio: '占比' }),
  ];

  const difficultyCounts = countBy(items, (item) => Math.max(1, Math.min(5, Number(item.difficulty) || 3)));
  const difficultyRows = [1, 2, 3, 4, 5]
    .filter((level) => difficultyCounts.has(level))
    .map((level) => [
      `难度 ${level} · ${difficultyLabel(level)}`,
      difficultyCounts.get(level),
      `${Math.round((difficultyCounts.get(level) / items.length) * 100)}%`,
    ]);
  if (difficultyRows.length) {
    children.push(new Paragraph({
      spacing: { before: 240, after: 80 },
      children: [
        makeTextRun(common, '难度分布', {
          size: common.fontSize + 1,
          color: COLORS.ink,
          bold: true,
        }),
      ],
    }));
    children.push(distributionTable(common, difficultyRows, {
      label: '难度',
      count: '数量',
      ratio: '占比',
    }));
  }

  if (options.showDate) children.push(overviewDateLine(common, context.date));
  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

/**
 * @param {Array} rawItems 已映射的错题对象
 * @param {object} rawOptions
 * @param {{uploadDir?: string, date?: Date}} context
 * @returns {Promise<Buffer>}
 */
export async function buildMistakesDocx(rawItems, rawOptions = {}, context = {}) {
  const options = normalizeMistakeOptions(rawOptions);
  const items = (Array.isArray(rawItems) ? rawItems : [])
    .filter((item) => item && item.id && item.status !== 'trashed');
  if (!items.length) throw new Error('EMPTY_EXPORT');
  const date = context.date instanceof Date ? context.date : new Date();
  const layout = pageLayout(options);
  const sorted = sortItems(items, options.sortBy);

  const children = [];
  if (options.includeCover) {
    children.push(...coverChildren(options, {
      eyebrow: '拾穗 STUDY  /  错题重练',
      title: options.title,
      subtitle: options.subtitle,
      statsLine: coverStats(sorted),
      date,
    }));
  }
  if (options.includeOverview) {
    children.push(...overviewChildren(sorted, options, options, { date }));
  }

  const groups = groupItems(sorted, options.groupBy);
  let number = 0;
  const referenceItems = [];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    if (options.groupBy !== 'none') {
      children.push(groupHeading(options, groupIndex + 1, group.title, `${group.items.length} 题`));
    }
    for (const item of group.items) {
      number += 1;
      const content = await resolveAsyncChildren(itemContent(item, options, options, layout, context, number));
      children.push(...content);
      if (options.answerPlacement === 'after') {
        children.push(...answerBlock(item, options, options, layout));
      } else if (
        (options.includeAnswer && String(item.answerText || '').trim())
        || (options.includeAnalysis && String(item.analysisText || '').trim())
      ) {
        referenceItems.push({ item, number });
      }
      if (number !== sorted.length || options.answerPlacement === 'after') {
        children.push(separator(options, { before: 100, after: 120 }));
      }
    }
  }

  if (options.answerPlacement === 'end' && referenceItems.length) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(...overviewHeader(options, 'REFERENCE / 参考答案', '参考答案'));
    for (const { item, number: itemNumber } of referenceItems) {
      children.push(...answerBlock(item, options, options, layout, {
        showTitle: true,
        index: itemNumber,
      }));
    }
  }

  if (!children.length) throw new Error('EMPTY_EXPORT');

  const doc = new Document({
    title: options.title,
    subject: options.subtitle || '拾穗 Study 错题集',
    creator: '拾穗 Study',
    description: `拾穗 Study 错题导出 · ${formatChineseDate(date)}`,
    styles: documentStyles(options),
    sections: [documentSection(children, options, date)],
  });
  return Packer.toBuffer(doc);
}

export default buildMistakesDocx;
