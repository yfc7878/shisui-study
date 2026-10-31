/**
 * 版式工具：页面、字体、封面、总览、组标题、页眉页脚、图片、答题区。
 * 这里的函数只接收已经归一化的 options 和普通对象，不访问数据库。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  AlignmentType, BorderStyle, Footer, Header, HeightRule, ImageRun, NumberFormat, PageBreak,
  PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlignTable,
  WidthType,
} from 'docx';
import { imageSize } from 'image-size';
import {
  BLANK_SPACE_HEIGHT, COLORS, formatChineseDate, pageLayout,
} from './options.js';

export const halfPoints = (pt) => Math.max(2, Math.round(Number(pt) * 2));

export function bodyFont(common, latin = 'Times New Roman') {
  return {
    ascii: latin,
    hAnsi: latin,
    cs: latin,
    eastAsia: common.font.eastAsia,
  };
}

export function headingFont(common, latin = 'Georgia') {
  return {
    ascii: latin,
    hAnsi: latin,
    cs: latin,
    eastAsia: common.font.eastAsia,
  };
}

export function textRunStyle(common, options = {}) {
  return {
    font: options.font || bodyFont(common, options.latin),
    size: options.size ?? common.fontSize,
    color: options.color || COLORS.body,
    bold: Boolean(options.bold),
    italics: Boolean(options.italics),
  };
}

export function makeTextRun(common, text, options = {}) {
  const style = textRunStyle(common, options);
  const runOptions = {
    text: String(text ?? ''),
    font: style.font,
    size: halfPoints(style.size),
    color: style.color,
  };
  if (style.bold) runOptions.bold = true;
  if (style.italics) runOptions.italics = true;
  if (options.underline) runOptions.underline = {};
  if (options.shading) {
    runOptions.shading = { type: ShadingType.CLEAR, fill: options.shading, color: 'auto' };
  }
  return new TextRun(runOptions);
}

export function paragraphSpacing(common, before = 0, after = 80) {
  return {
    before,
    after,
    line: Math.round(common.lineSpacing * 240),
    lineRule: 'auto',
  };
}

export function emptyParagraph(heightTwips = 120) {
  return new Paragraph({
    spacing: { before: 0, after: 0, line: heightTwips, lineRule: 'exact' },
    children: [new TextRun({ text: '', size: 2 })],
  });
}

export function separator(common, options = {}) {
  return new Paragraph({
    spacing: { before: options.before ?? 40, after: options.after ?? 120 },
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: options.size ?? 4,
        color: options.color || COLORS.lineSoft,
        space: 1,
      },
    },
    children: [new TextRun({ text: '', size: 2 })],
  });
}

export function documentStyles(common) {
  const font = bodyFont(common);
  const heading = headingFont(common);
  const baseSize = halfPoints(common.fontSize);
  const headingSize = halfPoints(common.headingSize);
  return {
    default: {
      document: {
        run: {
          font,
          size: baseSize,
          color: COLORS.body,
        },
        paragraph: {
          spacing: {
            line: Math.round(common.lineSpacing * 240),
            lineRule: 'auto',
            after: 80,
          },
        },
      },
      heading1: {
        run: { font: heading, size: headingSize + 4, bold: true, color: COLORS.accent },
        paragraph: { spacing: { before: 260, after: 120 }, keepNext: true },
      },
      heading2: {
        run: { font: heading, size: headingSize, bold: true, color: COLORS.ink },
        paragraph: { spacing: { before: 220, after: 100 }, keepNext: true },
      },
      heading3: {
        run: { font: heading, size: Math.max(baseSize + 2, headingSize - 4), bold: true, color: COLORS.ink },
        paragraph: { spacing: { before: 180, after: 80 }, keepNext: true },
      },
    },
  };
}

function blankHeader() {
  return new Header({
    children: [new Paragraph({ children: [new TextRun({ text: '', size: 2 })] })],
  });
}

function blankFooter() {
  return new Footer({
    children: [new Paragraph({ children: [new TextRun({ text: '', size: 2 })] })],
  });
}

function buildHeader(common) {
  if (!common.watermarkText) return null;
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 0, line: 240, lineRule: 'auto' },
        children: [
          makeTextRun(common, common.watermarkText, {
            size: 9,
            color: COLORS.faint,
            italics: true,
          }),
        ],
      }),
    ],
  });
}

function buildFooter(common, date) {
  if (!common.showPageNumbers && !common.showDate) return null;
  const runs = [];
  if (common.showDate) {
    runs.push(makeTextRun(common, formatChineseDate(date), {
      size: 9,
      color: COLORS.faint,
    }));
  }
  if (common.showPageNumbers) {
    if (runs.length) {
      runs.push(makeTextRun(common, '    ·    ', { size: 9, color: COLORS.faint }));
    }
    runs.push(makeTextRun(common, '第 ', { size: 9, color: COLORS.muted }));
    runs.push(new TextRun({
      children: [PageNumber.CURRENT],
      font: bodyFont(common),
      size: halfPoints(9),
      color: COLORS.muted,
    }));
    runs.push(makeTextRun(common, ' 页 / 共 ', { size: 9, color: COLORS.muted }));
    runs.push(new TextRun({
      children: [PageNumber.TOTAL_PAGES],
      font: bodyFont(common),
      size: halfPoints(9),
      color: COLORS.muted,
    }));
    runs.push(makeTextRun(common, ' 页', { size: 9, color: COLORS.muted }));
  }
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: {
          top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.lineSoft, space: 6 },
        },
        spacing: { before: 80, after: 0, line: 240, lineRule: 'auto' },
        children: runs,
      }),
    ],
  });
}

export function documentSection(children, common, date = new Date()) {
  const layout = pageLayout(common);
  const header = buildHeader(common);
  const footer = buildFooter(common, date);
  const section = {
    properties: {
      titlePage: Boolean(common.includeCover),
      page: {
        size: { width: layout.width, height: layout.height },
        margin: { ...layout.margin },
        pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
      },
    },
    children,
  };

  if (header) {
    section.headers = {
      default: header,
      ...(common.includeCover ? { first: blankHeader() } : {}),
    };
  }
  if (footer) {
    section.footers = {
      default: footer,
      ...(common.includeCover ? { first: blankFooter() } : {}),
    };
  }
  return section;
}

/**
 * 封面。调用方负责传入已经拼好的统计行。
 * @returns {(Paragraph|Table)[]}
 */
export function coverChildren(common, { eyebrow, title, subtitle, statsLine, date }) {
  const accent = COLORS.accent;
  const titleSize = Math.min(46, Math.max(30, common.headingSize * 2.15));
  const pageBreak = new Paragraph({
    spacing: { before: 0, after: 0 },
    children: [new PageBreak()],
  });

  if (common.coverStyle === 'classic') {
    const content = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 220, line: 240, lineRule: 'auto' },
        children: [
          makeTextRun(common, eyebrow, {
            font: headingFont(common),
            size: 10,
            color: accent,
            bold: true,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 260, after: 200, line: 240, lineRule: 'auto' },
        children: [
          makeTextRun(common, title, {
            font: headingFont(common),
            size: titleSize,
            color: COLORS.ink,
            bold: true,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 180 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 12, color: COLORS.gold, space: 4 },
        },
        children: [new TextRun({ text: '', size: 2 })],
      }),
      ...(subtitle ? [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 340, line: 300, lineRule: 'auto' },
          children: [
            makeTextRun(common, subtitle, {
              size: common.fontSize + 1,
              color: COLORS.muted,
              italics: true,
            }),
          ],
        }),
      ] : []),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 160, after: 100, line: 260, lineRule: 'auto' },
        children: [makeTextRun(common, statsLine, { size: 10.5, color: COLORS.ink })],
      }),
      ...(common.showDate ? [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 60, after: 0, line: 240, lineRule: 'auto' },
          children: [makeTextRun(common, formatChineseDate(date), { size: 10, color: COLORS.muted })],
        }),
      ] : []),
    ];

    const frame = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      alignment: AlignmentType.CENTER,
      borders: {
        top: { style: BorderStyle.DOUBLE, size: 8, color: accent },
        bottom: { style: BorderStyle.DOUBLE, size: 8, color: accent },
        left: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line },
        right: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { type: ShadingType.CLEAR, fill: COLORS.paper, color: 'auto' },
              margins: { top: 900, bottom: 900, left: 700, right: 700 },
              children: content,
            }),
          ],
        }),
      ],
    });

    return [
      new Paragraph({
        spacing: { before: 1100, after: 0 },
        children: [new TextRun({ text: '', size: 2 })],
      }),
      frame,
      pageBreak,
    ];
  }

  // simple：细线、留白、克制的学术封面。
  return [
    new Paragraph({
      spacing: { before: 1750, after: 0 },
      children: [new TextRun({ text: '', size: 2 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200, line: 240, lineRule: 'auto' },
      children: [
        makeTextRun(common, eyebrow, {
          font: headingFont(common),
          size: 10,
          color: accent,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 180 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 10, color: accent, space: 4 },
      },
      children: [new TextRun({ text: '', size: 2 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 420, after: 180, line: 300, lineRule: 'auto' },
      children: [
        makeTextRun(common, title, {
          font: headingFont(common),
          size: titleSize,
          color: COLORS.ink,
          bold: true,
        }),
      ],
    }),
    ...(subtitle ? [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 20, after: 300, line: 300, lineRule: 'auto' },
        children: [
          makeTextRun(common, subtitle, {
            size: common.fontSize + 1.5,
            color: COLORS.muted,
            italics: true,
          }),
        ],
      }),
    ] : []),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60, after: 260 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line, space: 4 },
      },
      children: [new TextRun({ text: '', size: 2 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 70, line: 260, lineRule: 'auto' },
      children: [makeTextRun(common, statsLine, { size: 10.5, color: COLORS.ink })],
    }),
    ...(common.showDate ? [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 20, after: 0, line: 240, lineRule: 'auto' },
        children: [makeTextRun(common, formatChineseDate(date), { size: 10, color: COLORS.muted })],
      }),
    ] : []),
    pageBreak,
  ];
}

export function overviewHeader(common, eyebrow = 'OVERVIEW', title = '内容总览') {
  return [
    new Paragraph({
      spacing: { before: 120, after: 60, line: 240, lineRule: 'auto' },
      children: [
        makeTextRun(common, eyebrow, {
          size: 8.5,
          color: COLORS.accent,
          bold: true,
          font: headingFont(common),
        }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 240, line: 260, lineRule: 'auto' },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 8, color: COLORS.accent, space: 6 },
      },
      children: [
        makeTextRun(common, title, {
          size: Math.max(common.fontSize + 5, common.headingSize),
          color: COLORS.ink,
          bold: true,
          font: headingFont(common),
        }),
      ],
    }),
  ];
}

function statCell(common, value, label, width) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: COLORS.paper, color: 'auto' },
    margins: { top: 220, bottom: 220, left: 200, right: 200 },
    verticalAlign: VerticalAlignTable.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 20, line: 280, lineRule: 'auto' },
        children: [
          makeTextRun(common, value, {
            size: Math.max(18, common.fontSize + 7),
            color: COLORS.accent,
            bold: true,
            font: headingFont(common),
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: 220, lineRule: 'auto' },
        children: [makeTextRun(common, label, { size: 8.5, color: COLORS.muted })],
      }),
    ],
  });
}

export function statTable(common, stats) {
  const layout = pageLayout(common);
  const count = Math.max(1, stats.length);
  const widths = Array.from({ length: count }, () => Math.floor(layout.availableWidthTwips / count));
  return new Table({
    width: { size: layout.availableWidthTwips, type: WidthType.DXA },
    columnWidths: widths,
    layout: 'fixed',
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: COLORS.white },
      bottom: { style: BorderStyle.NONE, size: 0, color: COLORS.white },
      left: { style: BorderStyle.NONE, size: 0, color: COLORS.white },
      right: { style: BorderStyle.NONE, size: 0, color: COLORS.white },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: COLORS.white },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: COLORS.white },
    },
    rows: [
      new TableRow({
        cantSplit: true,
        children: stats.map((stat, index) => statCell(common, stat.value, stat.label, widths[index])),
      }),
    ],
  });
}

export function distributionTable(common, rows, { label = '项目', count = '数量', ratio = '占比' } = {}) {
  const layout = pageLayout(common);
  const widths = [
    Math.floor(layout.availableWidthTwips * 0.56),
    Math.floor(layout.availableWidthTwips * 0.2),
    layout.availableWidthTwips - Math.floor(layout.availableWidthTwips * 0.56) - Math.floor(layout.availableWidthTwips * 0.2),
  ];
  const borders = {
    top: { style: BorderStyle.NONE, size: 0, color: COLORS.white },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line },
    left: { style: BorderStyle.NONE, size: 0, color: COLORS.white },
    right: { style: BorderStyle.NONE, size: 0, color: COLORS.white },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: COLORS.lineSoft },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: COLORS.white },
  };
  const makeCell = (value, index, { header = false } = {}) => new TableCell({
    width: { size: widths[index], type: WidthType.DXA },
    shading: header ? { type: ShadingType.CLEAR, fill: COLORS.paper, color: 'auto' } : undefined,
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children: [
      new Paragraph({
        alignment: index === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
        children: [
          makeTextRun(common, value, {
            size: header ? 8.5 : common.fontSize - 0.5,
            color: header ? COLORS.muted : COLORS.body,
            bold: header,
          }),
        ],
      }),
    ],
  });
  return new Table({
    width: { size: layout.availableWidthTwips, type: WidthType.DXA },
    columnWidths: widths,
    layout: 'fixed',
    borders,
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: [label, count, ratio].map((value, index) => makeCell(value, index, { header: true })),
      }),
      ...rows.map((row) => new TableRow({
        cantSplit: true,
        children: row.map((value, index) => makeCell(String(value), index)),
      })),
    ],
  });
}

export function overviewDateLine(common, date) {
  return new Paragraph({
    spacing: { before: 160, after: 120, line: 240, lineRule: 'auto' },
    children: [
      makeTextRun(common, `导出日期：${formatChineseDate(date)}`, {
        size: 9,
        color: COLORS.faint,
      }),
    ],
  });
}

export function groupHeading(common, index, title, countLabel) {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 380, after: 180, line: 280, lineRule: 'auto' },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 8, color: COLORS.accent, space: 6 },
    },
    children: [
      makeTextRun(common, String(index).padStart(2, '0'), {
        size: 9,
        color: COLORS.accent,
        bold: true,
        font: headingFont(common),
      }),
      makeTextRun(common, '   ', { size: 10 }),
      makeTextRun(common, title, {
        size: Math.max(common.fontSize + 3, common.headingSize - 2),
        color: COLORS.ink,
        bold: true,
        font: headingFont(common),
      }),
      ...(countLabel ? [
        makeTextRun(common, `    ${countLabel}`, {
          size: 9,
          color: COLORS.muted,
        }),
      ] : []),
    ],
  });
}

export function metaLine(common, parts) {
  const values = parts.filter(Boolean);
  if (!values.length) return null;
  const runs = [];
  values.forEach((value, index) => {
    if (index > 0) runs.push(makeTextRun(common, '   ·   ', { size: 8.5, color: COLORS.line }));
    runs.push(makeTextRun(common, value, { size: 8.5, color: COLORS.muted }));
  });
  return new Paragraph({
    keepNext: true,
    spacing: { before: 0, after: 90, line: 240, lineRule: 'auto' },
    children: runs,
  });
}

export function detailLine(common, label, value, options = {}) {
  if (!value) return null;
  return new Paragraph({
    spacing: {
      before: options.before ?? 0,
      after: options.after ?? 60,
      line: Math.round(common.lineSpacing * 250),
      lineRule: 'auto',
    },
    indent: options.indent,
    children: [
      makeTextRun(common, `${label}  `, {
        size: options.labelSize ?? 8.5,
        color: COLORS.accent,
        bold: true,
      }),
      ...(Array.isArray(value) ? value : [makeTextRun(common, value, {
        size: options.size ?? common.fontSize - 0.5,
        color: options.color || COLORS.body,
        italics: Boolean(options.italics),
      })]),
    ],
  });
}

export function blankAnswerArea(common, size = 'medium') {
  const heightPt = BLANK_SPACE_HEIGHT[size] || BLANK_SPACE_HEIGHT.medium;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.DASHED, size: 4, color: COLORS.line },
      bottom: { style: BorderStyle.DASHED, size: 4, color: COLORS.line },
      left: { style: BorderStyle.DASHED, size: 4, color: COLORS.line },
      right: { style: BorderStyle.DASHED, size: 4, color: COLORS.line },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: COLORS.white },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: COLORS.white },
    },
    rows: [
      new TableRow({
        cantSplit: true,
        height: { value: heightPt * 20, rule: HeightRule.ATLEAST },
        children: [
          new TableCell({
            margins: { top: 100, bottom: 100, left: 160, right: 160 },
            verticalAlign: VerticalAlignTable.TOP,
            children: [
              new Paragraph({
                spacing: { before: 0, after: 0, line: 220, lineRule: 'auto' },
                children: [
                  makeTextRun(common, '答题区 · 在虚线框内重做', {
                    size: 8,
                    color: COLORS.faint,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

const IMAGE_SIGNATURES = [
  { type: 'png', test: (buffer) => buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'jpg', test: (buffer) => buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  { type: 'gif', test: (buffer) => buffer.length > 6 && /^GIF8[79]a$/.test(buffer.subarray(0, 6).toString('ascii')) },
  { type: 'bmp', test: (buffer) => buffer.length > 2 && buffer[0] === 0x42 && buffer[1] === 0x4d },
];

function detectImageType(buffer) {
  const match = IMAGE_SIGNATURES.find((signature) => signature.test(buffer));
  return match ? match.type : null;
}

function isWebp(buffer) {
  return buffer.length > 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
}

function safeImagePath(uploadDir, url) {
  if (!uploadDir || !url) return null;
  const raw = String(url).split('#')[0].split('?')[0];
  let filename = path.basename(raw);
  try {
    filename = decodeURIComponent(filename);
  } catch {
    // 保留 basename 原值
  }
  if (!filename || filename === '.' || filename === '..') return null;
  const root = path.resolve(uploadDir);
  const target = path.resolve(root, filename);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return null;
  return target;
}

function prettyCaption(value, fallback) {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text.replace(/\.(png|jpe?g|webp|gif|bmp)$/i, '') || fallback;
}

/**
 * 读取并排版一组图片。单张图片失败只跳过，不影响整份导出。
 * @param {Array} entries {url,width,height,name,caption,mime}
 */
export async function imageChildren(entries, common, context = {}) {
  const list = Array.isArray(entries) ? entries.filter((item) => item && item.url) : [];
  if (!list.length) return [];
  const layout = pageLayout(common);
  const maxWidthPx = context.maxWidthPx || layout.availableWidthPx;
  const maxHeightPx = context.maxHeightPx || 620;
  const uploadDir = context.uploadDir;
  const children = [];
  let rendered = 0;

  for (const entry of list) {
    const target = safeImagePath(uploadDir, entry.url);
    if (!target) {
      console.warn(`[export] 跳过非法图片路径：${entry.url}`);
      continue;
    }
    let buffer;
    try {
      buffer = await fs.readFile(target);
    } catch {
      console.warn(`[export] 图片文件不存在，已跳过：${target}`);
      continue;
    }
    if (isWebp(buffer)) {
      console.warn(`[export] docx 不支持 webp，已跳过图片：${entry.url}`);
      continue;
    }
    const type = detectImageType(buffer);
    if (!type) {
      console.warn(`[export] 无法识别的图片格式，已跳过：${entry.url}`);
      continue;
    }

    let width = Number(entry.width) || 0;
    let height = Number(entry.height) || 0;
    if (!(width > 0 && height > 0)) {
      try {
        const dimensions = imageSize(buffer);
        width = Number(dimensions.width) || 0;
        height = Number(dimensions.height) || 0;
      } catch {
        // 下面使用兜底尺寸
      }
    }
    if (!(width > 0 && height > 0)) {
      width = 480;
      height = 320;
    }

    // 只缩小、不无限放大；留一点页边距给题号/图注。
    const scale = Math.min(maxWidthPx / width, maxHeightPx / height, 1.25);
    const finalWidth = Math.max(48, Math.round(width * scale));
    const finalHeight = Math.max(32, Math.round(height * scale));
    const caption = prettyCaption(
      entry.caption || entry.name,
      `图 ${context.startIndex ? context.startIndex + rendered : rendered + 1}`,
    );

    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      keepNext: true,
      spacing: { before: rendered === 0 ? 110 : 160, after: 40, line: 240, lineRule: 'auto' },
      children: [
        new ImageRun({
          data: buffer,
          type,
          transformation: { width: finalWidth, height: finalHeight },
          altText: { name: '拾穗插图', description: caption, title: caption },
        }),
      ],
    }));
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 130, line: 220, lineRule: 'auto' },
      children: [
        makeTextRun(common, caption, {
          size: 8.5,
          color: COLORS.faint,
          italics: true,
        }),
      ],
    }));
    rendered += 1;
  }

  return children;
}

export function imageEntryCaption(entry, index) {
  return prettyCaption(entry?.caption || entry?.name, `图 ${index + 1}`);
}
