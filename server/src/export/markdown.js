/**
 * 轻量 Markdown → docx 段落。
 *
 * AI 返回的题目/解析通常是 Markdown + LaTeX。这里只实现学习场景真正需要的
 * 子集：标题、段落、列表、引用、代码块、表格、粗体、斜体、行内代码、链接、
 * `<br>` 与换行。未知语法按普通文字处理，目标是 Word 里看不到成片的 `**`、
 * `##`、反引号之类的标记。
 */

import {
  AlignmentType, BorderStyle, Paragraph, ShadingType, Table, TableCell, TableRow,
  TextRun, WidthType,
} from 'docx';
import { COLORS } from './options.js';
import { latexToPlain } from './latex.js';

const halfPoints = (pt) => Math.max(2, Math.round(Number(pt) * 2));

function runFont(style, fallback) {
  return style?.font || fallback;
}

function baseRunOptions(style, extra = {}) {
  const size = extra.size ?? style.size ?? 12;
  const options = {
    font: extra.font || runFont(style),
    size: halfPoints(size),
    color: extra.color || style.color || COLORS.body,
  };
  if (extra.bold || style.bold) options.bold = true;
  if (extra.italics || style.italics) options.italics = true;
  if (extra.underline) options.underline = {};
  if (extra.strike) options.strike = true;
  if (extra.shading) {
    options.shading = { type: ShadingType.CLEAR, fill: extra.shading, color: 'auto' };
  }
  return options;
}

function pushTextRun(runs, text, style, extra = {}) {
  if (!text) return;
  runs.push(new TextRun({
    ...baseRunOptions(style, extra),
    text,
  }));
}

function pushLineBreaks(runs, text, style, extra = {}) {
  const lines = String(text).split('\n');
  lines.forEach((line, index) => {
    if (index > 0) {
      runs.push(new TextRun({ ...baseRunOptions(style, extra), break: 1, text: '' }));
    }
    if (line) pushTextRun(runs, line, style, extra);
  });
}

/**
 * 一段 Markdown 行内文本 → TextRun[]。
 * 会顺手把 LaTeX 转为 Unicode/纯文本。
 * @param {string} input
 * @param {object} style { font, size, color, bold, italics }
 * @returns {TextRun[]}
 */
export function inlineToRuns(input, style = {}) {
  const text = input === null || input === undefined ? '' : String(input);
  const runs = [];
  let buffer = '';
  let index = 0;

  const flush = () => {
    if (!buffer) return;
    const raw = buffer;
    buffer = '';
    // latexToPlain 会 trim 整段文本；但行内切分后的前后空格属于 Markdown 语义，
    // 必须保留，否则 **粗体** 两侧的空格会消失（The bookthatyou...）。
    if (!raw.trim()) {
      pushLineBreaks(runs, raw, style);
      return;
    }
    const leading = raw.match(/^\s+/)?.[0] || '';
    const trailing = raw.match(/\s+$/)?.[0] || '';
    const core = raw.slice(leading.length, raw.length - trailing.length);
    const converted = latexToPlain(core);
    pushLineBreaks(runs, `${leading}${converted}${trailing}`, style);
  };

  while (index < text.length) {
    const rest = text.slice(index);

    // 行内代码
    if (text[index] === '`') {
      const close = text.indexOf('`', index + 1);
      if (close > index) {
        flush();
        const code = text.slice(index + 1, close);
        runs.push(new TextRun({
          ...baseRunOptions(style, {
            font: {
              ascii: 'Consolas',
              hAnsi: 'Consolas',
              cs: 'Consolas',
              eastAsia: style.font?.eastAsia || '宋体',
            },
            size: Math.max(8, (style.size || 12) - 0.5),
            color: COLORS.ink,
            shading: COLORS.codeBg,
          }),
          text: code,
        }));
        index = close + 1;
        continue;
      }
    }

    // 图片：源文件无法直接嵌入 Markdown 里的外链，这里给出可读占位。
    if (rest.startsWith('![')) {
      const match = rest.match(/^!\[([^\]]*)\]\(([^)]*)\)/);
      if (match) {
        flush();
        const alt = match[1].trim();
        pushTextRun(runs, alt ? `（图片：${alt}）` : '（图片）', style, { italics: true });
        index += match[0].length;
        continue;
      }
    }

    // 链接：[文字](url) → 文字
    if (text[index] === '[') {
      const match = rest.match(/^\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
      if (match) {
        flush();
        const label = match[1].trim() || match[2];
        pushTextRun(runs, label, style, { underline: true, color: COLORS.accent });
        index += match[0].length;
        continue;
      }
    }

    // 粗体 **text** / __text__
    if (rest.startsWith('**') || rest.startsWith('__')) {
      const marker = rest.slice(0, 2);
      const close = text.indexOf(marker, index + 2);
      if (close > index + 2) {
        flush();
        const content = text.slice(index + 2, close);
        const nested = inlineToRuns(content, { ...style, bold: true });
        runs.push(...nested);
        index = close + 2;
        continue;
      }
    }

    // 删除线 ~~text~~：保留文字，去掉标记。
    if (rest.startsWith('~~')) {
      const close = text.indexOf('~~', index + 2);
      if (close > index + 2) {
        flush();
        pushTextRun(runs, text.slice(index + 2, close), style);
        index = close + 2;
        continue;
      }
    }

    // 斜体 *text* / _text_
    if (text[index] === '*' || text[index] === '_') {
      const marker = text[index];
      const previous = index > 0 ? text[index - 1] : '';
      const wordAdjacent = /[A-Za-z0-9]/.test(previous);
      if (!wordAdjacent) {
        const close = text.indexOf(marker, index + 1);
        if (close > index + 1) {
          flush();
          pushTextRun(runs, text.slice(index + 1, close), style, { italics: true });
          index = close + 1;
          continue;
        }
      }
    }

    // 换行标签 / HTML 外壳
    if (rest.startsWith('<br') || rest.startsWith('<BR')) {
      const match = rest.match(/^<br\s*\/?>/i);
      if (match) {
        flush();
        runs.push(new TextRun({ ...baseRunOptions(style), break: 1, text: '' }));
        index += match[0].length;
        continue;
      }
    }
    if (text[index] === '<') {
      const match = rest.match(/^<\/?[a-zA-Z][^>]*>/);
      if (match) {
        index += match[0].length;
        continue;
      }
    }

    buffer += text[index];
    index += 1;
  }

  flush();
  if (!runs.length) runs.push(new TextRun({ ...baseRunOptions(style), text: '' }));
  return runs;
}

function isTableDelimiter(line) {
  const value = line.trim();
  if (!value.includes('-') || !value.includes('|')) return false;
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(value);
}

function splitTableRow(line) {
  let value = line.trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|')) value = value.slice(0, -1);
  return value.split('|').map((cell) => cell.trim());
}

function leadingSpaces(line) {
  const match = line.match(/^(\s*)/);
  return match ? match[1].replace(/\t/g, '  ').length : 0;
}

/**
 * 把 Markdown 切成块。
 * @param {string} input
 */
export function parseMarkdownBlocks(input) {
  const text = String(input ?? '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    // 围栏代码块
    const fence = line.match(/^\s*```([^\s`]*)\s*$/);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      blocks.push({ type: 'hr' });
      index += 1;
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && isTableDelimiter(lines[index + 1])) {
      const header = splitTableRow(line);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'quote', text: quote.join('\n') });
      continue;
    }

    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (bullet) {
      blocks.push({
        type: 'bullet',
        depth: Math.min(4, Math.floor(leadingSpaces(bullet[1]) / 2)),
        text: bullet[2],
      });
      index += 1;
      continue;
    }

    const ordered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    if (ordered) {
      blocks.push({
        type: 'ordered',
        depth: Math.min(4, Math.floor(leadingSpaces(ordered[1]) / 2)),
        number: Number(ordered[2]),
        text: ordered[3],
      });
      index += 1;
      continue;
    }

    blocks.push({ type: 'paragraph', text: line.trim() });
    index += 1;
  }

  return blocks;
}

function spacing(lineSpacing, before = 0, after = 80) {
  return {
    before,
    after,
    line: Math.round(lineSpacing * 240),
    lineRule: 'auto',
  };
}

function tableFromBlock(block, options) {
  const columnCount = Math.min(8, Math.max(1, block.header.length, ...block.rows.map((row) => row.length)));
  const widthTwips = options.tableWidthTwips || 0;
  const columnWidth = widthTwips ? Math.floor(widthTwips / columnCount) : undefined;

  const makeCell = (value, isHeader) => new TableCell({
    width: columnWidth ? { size: columnWidth, type: WidthType.DXA } : undefined,
    shading: isHeader ? { type: ShadingType.CLEAR, fill: COLORS.accentLight, color: 'auto' } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
        children: inlineToRuns(value || '', {
          ...options,
          size: Math.max(8, (options.size || 12) - 1),
          bold: isHeader,
          color: isHeader ? COLORS.ink : options.color,
        }),
      }),
    ],
  });

  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: Array.from({ length: columnCount }, (_item, cellIndex) => makeCell(
      block.header[cellIndex] ?? '',
      true,
    )),
  });

  const rows = block.rows.map((row) => new TableRow({
    cantSplit: true,
    children: Array.from({ length: columnCount }, (_item, cellIndex) => makeCell(
      row[cellIndex] ?? '',
      false,
    )),
  }));

  return new Table({
    width: widthTwips
      ? { size: widthTwips, type: WidthType.DXA }
      : { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: columnWidth ? Array(columnCount).fill(columnWidth) : undefined,
    layout: 'fixed',
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line },
      left: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line },
      right: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: COLORS.lineSoft },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: COLORS.lineSoft },
    },
    rows: [headerRow, ...rows],
  });
}

/**
 * Markdown → (Paragraph | Table)[]。
 *
 * @param {string} input
 * @param {object} options
 * @param {object} options.font docx 字体对象 {ascii,hAnsi,eastAsia}
 * @param {number} options.size 正文字号（pt）
 * @param {number} options.headingSize 标题基准字号（pt）
 * @param {number} options.lineSpacing 行距倍数
 * @param {string} options.color 正文颜色
 * @param {string} options.accent 强调色
 * @param {number} options.tableWidthTwips 表格可用宽度
 */
export function markdownToDocx(input, options = {}) {
  const settings = {
    font: options.font,
    size: options.size || 12,
    headingSize: options.headingSize || 16,
    lineSpacing: options.lineSpacing || 1.5,
    color: options.color || COLORS.body,
    accent: options.accent || COLORS.accent,
    muted: options.muted || COLORS.muted,
    compact: Boolean(options.compact),
    tableWidthTwips: options.tableWidthTwips,
  };
  const blocks = parseMarkdownBlocks(input);
  const children = [];
  const after = settings.compact ? 40 : 80;

  for (const block of blocks) {
    if (block.type === 'heading') {
      const level = Math.min(6, Math.max(1, block.level));
      const sizes = [
        settings.headingSize,
        Math.max(settings.size + 4, settings.headingSize - 2),
        Math.max(settings.size + 2, settings.headingSize - 4),
        settings.size + 2,
        settings.size + 1,
        settings.size + 1,
      ];
      children.push(new Paragraph({
        keepNext: level <= 3,
        spacing: spacing(settings.lineSpacing, level === 1 ? 220 : 160, 70),
        children: inlineToRuns(block.text, {
          ...settings,
          size: sizes[level - 1],
          bold: true,
          color: level <= 2 ? settings.accent : COLORS.ink,
        }),
      }));
      continue;
    }

    if (block.type === 'paragraph') {
      children.push(new Paragraph({
        spacing: spacing(settings.lineSpacing, 0, after),
        children: inlineToRuns(block.text, settings),
      }));
      continue;
    }

    if (block.type === 'bullet' || block.type === 'ordered') {
      const indent = 360 + block.depth * 300;
      const marker = block.type === 'bullet' ? '•' : `${block.number}.`;
      const markerRun = new TextRun({
        ...baseRunOptions({ ...settings, color: settings.accent }, { bold: true }),
        text: `${marker} `,
      });
      children.push(new Paragraph({
        indent: { left: indent, hanging: 260 },
        spacing: spacing(settings.lineSpacing, 0, 45),
        children: [markerRun, ...inlineToRuns(block.text, settings)],
      }));
      continue;
    }

    if (block.type === 'quote') {
      children.push(new Paragraph({
        indent: { left: 380, right: 200 },
        border: {
          left: { style: BorderStyle.SINGLE, size: 12, color: COLORS.accent, space: 10 },
        },
        spacing: spacing(settings.lineSpacing, 60, 100),
        children: inlineToRuns(block.text, {
          ...settings,
          color: COLORS.muted,
          italics: true,
        }),
      }));
      continue;
    }

    if (block.type === 'code') {
      const codeLines = block.text.split('\n');
      const monoFont = {
        ascii: 'Consolas',
        hAnsi: 'Consolas',
        cs: 'Consolas',
        eastAsia: settings.font?.eastAsia || '宋体',
      };
      codeLines.forEach((line, lineIndex) => {
        children.push(new Paragraph({
          indent: { left: 180 },
          spacing: {
            before: lineIndex === 0 ? 40 : 0,
            after: lineIndex === codeLines.length - 1 ? 120 : 0,
            line: 240,
            lineRule: 'auto',
          },
          children: [new TextRun({
            font: monoFont,
            size: halfPoints(Math.max(8, settings.size - 1)),
            color: COLORS.ink,
            shading: { type: ShadingType.CLEAR, fill: COLORS.codeBg, color: 'auto' },
            text: line || ' ',
          })],
        }));
      });
      continue;
    }

    if (block.type === 'hr') {
      children.push(new Paragraph({
        spacing: { before: 80, after: 160 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line, space: 1 },
        },
        children: [new TextRun({ text: '', size: 4 })],
      }));
      continue;
    }

    if (block.type === 'table') {
      children.push(tableFromBlock(block, settings));
      children.push(new Paragraph({
        spacing: { after: 120, line: 240, lineRule: 'auto' },
        children: [new TextRun({ text: '', size: 4 })],
        alignment: AlignmentType.LEFT,
      }));
      continue;
    }
  }

  return children;
}

export default markdownToDocx;
