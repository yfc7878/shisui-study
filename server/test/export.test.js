import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import {
  buildEnglishDocx,
  buildMistakesDocx,
  latexToPlain,
} from '../src/export/index.js';
import { parseMarkdownBlocks } from '../src/export/markdown.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP_ROOT = path.join(HERE, '..', 'data', 'tmp-test');
fs.mkdirSync(TMP_ROOT, { recursive: true });
const RUN_DIR = fs.mkdtempSync(path.join(TMP_ROOT, 'export-test-'));
const UPLOAD_DIR = path.join(RUN_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

after(() => {
  // 只删除本次测试创建的随机目录；不碰 server/data 里的其他内容。
  if (process.env.KEEP_EXPORT_TEST === '1') {
    console.log(`[export-test] 保留测试产物：${RUN_DIR}`);
    return;
  }
  fs.rmSync(RUN_DIR, { recursive: true, force: true });
  try {
    fs.rmdirSync(TMP_ROOT);
  } catch {
    // 其他测试进程还在使用 tmp-test 时保留空目录即可。
  }
});

// ---------------------------------------------------------------------------
// 测试辅助：生成一张真实 PNG，既验证图片嵌入，也能让 docx 超过 20KB。
// ---------------------------------------------------------------------------

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

function makePng(width, height) {
  const rowSize = width * 3 + 1;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * rowSize;
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 3;
      raw[offset] = (x * 7 + y * 3) % 256;
      raw[offset + 1] = (x * 3 + y * 5 + 40) % 256;
      raw[offset + 2] = (x * 2 + y * 7 + 90) % 256;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const idat = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// 测试辅助：不依赖 unzip 的最小 ZIP 读取器，用于校验 docx 包结构。
// ---------------------------------------------------------------------------

function readZipEntries(buffer) {
  let eocd = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65557); index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  assert.notEqual(eocd, -1, 'docx 应包含 ZIP end-of-central-directory');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, 'ZIP central directory 头损坏');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function entryText(buffer, entry) {
  const local = entry.localOffset;
  assert.equal(buffer.readUInt32LE(local), 0x04034b50, 'ZIP local header 损坏');
  const nameLength = buffer.readUInt16LE(local + 26);
  const extraLength = buffer.readUInt16LE(local + 28);
  const start = local + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return compressed.toString('utf8');
  assert.equal(entry.method, 8, `不支持的 ZIP 压缩方式：${entry.method}`);
  return zlib.inflateRawSync(compressed).toString('utf8');
}

function packageText(buffer, names) {
  const entries = readZipEntries(buffer);
  const found = names
    .map((name) => entries.find((entry) => entry.name === name))
    .filter(Boolean);
  // 页眉页脚文件名由 docx 决定，统一纳入文本检查。
  const headerFooter = entries.filter((entry) => /^word\/(header|footer)\d+\.xml$/.test(entry.name));
  const selected = [...found];
  for (const entry of headerFooter) {
    if (!selected.includes(entry)) selected.push(entry);
  }
  return { entries, found, text: selected.map((entry) => entryText(buffer, entry)).join('\n') };
}

const PNG_A = makePng(620, 420);
const PNG_B = makePng(420, 300);
fs.writeFileSync(path.join(UPLOAD_DIR, 'sample-a.png'), PNG_A);
fs.writeFileSync(path.join(UPLOAD_DIR, 'sample-b.png'), PNG_B);

const MISTAKES = [
  {
    id: 'm-math',
    status: 'active',
    subject: '数学',
    source: '九月月考',
    chapter: '函数与导数',
    errorReason: '计算失误',
    difficulty: 4,
    title: '函数与导数综合',
    questionText: [
      '已知函数 $f(x)=\\frac{x^2+1}{x}$。',
      '',
      '### 第（1）问',
      '求 $f\'(x)$，并写出定义域。',
      '',
      '- **重点**：先看定义域',
      '- 再使用商的求导法则',
      '',
      '输入 `const x = 1` 只是行内代码示例。',
    ].join('\n'),
    answerText: '定义域为 $x\\ne 0$。\\n\\n$f\'(x)=\\frac{x^2-1}{x^2}$。',
    analysisText: '由 $\\left(\\frac{u}{v}\\right)\'=\\frac{u\'v-uv\'}{v^2}$ 可得。',
    knowledgePoints: ['导数', '定义域'],
    tags: ['月考', '易错'],
    images: [
      { id: 'img-a', url: '/uploads/sample-a.png', mime: 'image/png', width: 620, height: 420, name: '函数图像' },
    ],
    figures: [
      { id: 'fig-b', url: '/uploads/sample-b.png', mime: 'image/png', width: 420, height: 300, caption: '辅助受力图' },
    ],
    figureHints: [{ imageIndex: 0, bbox: [0, 0, 100, 100], caption: '提示' }],
    createdAt: '2026-10-01T08:00:00.000Z',
  },
  {
    id: 'm-physics',
    status: 'pending',
    subject: '物理',
    source: '周测',
    chapter: '牛顿运动定律',
    errorReason: '受力分析遗漏',
    difficulty: 5,
    title: '斜面上的连接体',
    questionText: '如图所示，物块 $A$ 与 $B$ 通过轻绳连接。求系统加速度 $a$。',
    answerText: '$a=\\frac{(m_A-m_B\\sin\\theta)g}{m_A+m_B}$。',
    analysisText: '1. 分别受力分析；2. 沿斜面方向列牛顿第二定律；3. 联立求解。',
    knowledgePoints: ['牛顿第二定律', '受力分析'],
    tags: ['压轴'],
    images: [
      { id: 'img-b', url: '/uploads/sample-b.png', mime: 'image/png', width: 420, height: 300, name: '题图' },
    ],
    figures: [],
    figureHints: [],
    createdAt: '2026-10-03T08:00:00.000Z',
  },
  {
    id: 'm-chem',
    status: 'active',
    subject: '化学',
    source: '课后练习',
    chapter: '氧化还原反应',
    errorReason: '概念不清',
    difficulty: 2,
    title: '氧化还原判断',
    questionText: '判断下列反应是否为氧化还原反应：$\\mathrm{Fe}+\\mathrm{CuSO_4}\\rightarrow\\mathrm{FeSO_4}+\\mathrm{Cu}$。',
    answerText: '是。铁元素化合价由 0 升至 +2，铜元素由 +2 降至 0。',
    analysisText: '有元素化合价升降的反应是氧化还原反应。',
    knowledgePoints: ['化合价', '氧化还原'],
    tags: ['基础'],
    images: [],
    figures: [],
    figureHints: [],
    createdAt: '2026-10-04T08:00:00.000Z',
  },
  {
    id: 'm-english',
    status: 'active',
    subject: '英语',
    source: '阅读理解',
    chapter: '长难句',
    errorReason: '句子结构不清',
    difficulty: 3,
    title: '定语从句分析',
    questionText: '分析句子：The book **that** you lent me is interesting.',
    answerText: '`that you lent me` 是定语从句，修饰 the book。',
    analysisText: '先行词为 the book，关系代词 that 在从句中作宾语。',
    knowledgePoints: ['定语从句'],
    tags: [],
    images: [],
    figures: [],
    figureHints: [],
    createdAt: '2026-10-05T08:00:00.000Z',
  },
];

const SENTENCES = [
  {
    id: 's-1',
    status: 'active',
    theme: '人物描写',
    title: '专注的目光',
    summary: '用视线与周围环境形成对比，突出专注。',
    content: 'Her eyes were fixed on the page, as if the rest of the world had melted away.',
    translation: '她的目光紧紧落在书页上，仿佛周围的世界都已消融。',
    usage: '用于描写人物专注阅读或思考的状态。',
    example: 'He sat still, as if time had stopped.',
    exampleTranslation: '他静静地坐着，仿佛时间已经停止。',
    source: '阅读理解 A 篇',
    sourceType: 'manual',
    tags: ['人物描写', '神态'],
    note: '',
    createdAt: '2026-10-01T08:00:00.000Z',
  },
  {
    id: 's-2',
    status: 'pending',
    theme: '环境描写',
    title: '黄昏的街道',
    summary: '用光线和影子营造安静氛围。',
    content: 'Long shadows stretched across the street, turning the ordinary afternoon into something quietly beautiful.',
    translation: '长长的影子铺过街道，把平凡的午后变得安静而美丽。',
    usage: '适合环境描写或故事开头的氛围铺垫。',
    example: 'The sky was painted in shades of gold and rose.',
    exampleTranslation: '天空被涂成金色与玫瑰色。',
    source: '读后续写素材',
    sourceType: 'manual',
    tags: ['环境描写', '光影'],
    note: '',
    createdAt: '2026-10-02T08:00:00.000Z',
  },
  {
    id: 's-3',
    status: 'active',
    theme: '人物描写',
    title: '克制的情绪',
    summary: '通过动作细节表达隐忍。',
    content: 'She pressed her lips together and looked away, saying nothing.',
    translation: '她抿紧嘴唇，移开视线，什么也没说。',
    usage: '用于表现人物隐忍、克制或不愿争辩。',
    example: 'He bit back the words that would have hurt her.',
    exampleTranslation: '他把那些会伤害她的话咽了回去。',
    source: '写作积累',
    sourceType: 'manual',
    tags: ['人物描写', '动作'],
    note: '',
    createdAt: '2026-10-03T08:00:00.000Z',
  },
  {
    id: 's-4',
    status: 'active',
    theme: '观点表达',
    title: '阅读的意义',
    summary: '用递进结构表达阅读带来的改变。',
    content: 'Reading does not merely inform us; it quietly reshapes the way we see the world.',
    translation: '阅读不只是告诉我们信息，它还在悄然重塑我们看世界的方式。',
    usage: '用于议论文开头或结尾的观点升华。',
    example: 'Travel does not merely change our location; it changes our perspective.',
    exampleTranslation: '旅行不只是改变我们的位置，也改变我们的视角。',
    source: '范文精选',
    sourceType: 'manual',
    tags: ['观点表达', '递进'],
    note: '',
    createdAt: '2026-10-04T08:00:00.000Z',
  },
  {
    id: 's-5',
    status: 'active',
    theme: '环境描写',
    title: '雨后的清晨',
    summary: '调动嗅觉与视觉，让场景更立体。',
    content: 'The air smelled of wet earth, and every leaf seemed to hold a small piece of the morning light.',
    translation: '空气里有湿润泥土的气息，每一片叶子似乎都捧着一小片晨光。',
    usage: '适合雨后、清晨等场景描写。',
    example: 'The garden glistened as the first sunlight broke through the clouds.',
    exampleTranslation: '第一缕阳光穿过云层时，花园闪闪发亮。',
    source: '读后续写素材',
    sourceType: 'manual',
    tags: ['环境描写', '感官'],
    note: '',
    createdAt: '2026-10-05T08:00:00.000Z',
  },
  {
    id: 's-6',
    status: 'active',
    theme: '观点表达',
    title: '坚持与积累',
    summary: '用短句表达长期主义。',
    content: 'Small efforts, repeated day after day, are rarely spectacular, but they are never wasted.',
    translation: '日复一日的小小努力很少轰轰烈烈，却从不会白费。',
    usage: '用于总结、演讲或议论文结尾。',
    example: 'A river is made of countless ordinary drops.',
    exampleTranslation: '河流由无数平凡的水滴汇成。',
    source: '写作积累',
    sourceType: 'manual',
    tags: ['观点表达', '坚持'],
    note: '',
    createdAt: '2026-10-06T08:00:00.000Z',
  },
  {
    id: 's-7',
    status: 'active',
    theme: '过渡衔接',
    title: '转折中的让步',
    summary: '先承认对方合理之处，再自然转入自己的观点。',
    content: 'It is true that technology has made our lives more convenient, but convenience is not the same as fulfillment.',
    translation: '诚然，科技让我们的生活更加便利，但便利并不等同于充实。',
    usage: '用于议论文让步段，先肯定再转折。',
    example: 'It is true that failure hurts, but it also teaches us where to begin again.',
    exampleTranslation: '诚然，失败令人痛苦，但它也教会我们从哪里重新开始。',
    source: '范文精选',
    sourceType: 'manual',
    tags: ['过渡衔接', '让步'],
    note: '',
    createdAt: '2026-10-07T08:00:00.000Z',
  },
  {
    id: 's-8',
    status: 'active',
    theme: '过渡衔接',
    title: '总结与呼应',
    summary: '用回扣主题的方式收束全文。',
    content: 'In the end, what stays with us is not the praise we received, but the courage we found when no one was watching.',
    translation: '最终留在我们心里的，不是曾经得到的赞美，而是在无人注视时找到的勇气。',
    usage: '用于记叙文结尾，回扣成长主题。',
    example: 'What matters is not how loudly we speak, but how honestly we listen.',
    exampleTranslation: '重要的不是我们说得多响亮，而是我们听得多真诚。',
    source: '写作积累',
    sourceType: 'manual',
    tags: ['过渡衔接', '结尾'],
    note: '',
    createdAt: '2026-10-08T08:00:00.000Z',
  },
  {
    id: 's-9',
    status: 'active',
    theme: '环境描写',
    title: '冬夜的灯火',
    summary: '用冷暖对比写出归家的感觉。',
    content: 'Beyond the frost-covered window, the city glittered coldly, but the small lamp in the kitchen made the whole night feel warm.',
    translation: '结霜的窗外，城市闪着清冷的光，而厨房里那盏小灯让整个夜晚都温暖起来。',
    usage: '适合写冬夜、归家、亲情等场景。',
    example: 'The wind rattled the windows, yet the room remained a quiet island of light.',
    exampleTranslation: '风把窗户吹得咯咯作响，房间却仍是光中安静的孤岛。',
    source: '读后续写素材',
    sourceType: 'manual',
    tags: ['环境描写', '冷暖对比'],
    note: '',
    createdAt: '2026-10-09T08:00:00.000Z',
  },
  {
    id: 's-10',
    status: 'active',
    theme: '人物描写',
    title: '迟疑的瞬间',
    summary: '用停顿和细节写人物内心的犹豫。',
    content: 'He reached for the door handle, stopped, and let his hand fall slowly back to his side.',
    translation: '他把手伸向门把手，停住了，又让手慢慢垂回身侧。',
    usage: '用于表现人物临门退缩、犹豫或改变主意。',
    example: 'She opened her mouth to speak, then thought better of it.',
    exampleTranslation: '她张嘴想说，想了想又作罢。',
    source: '阅读理解 B 篇',
    sourceType: 'manual',
    tags: ['人物描写', '动作细节'],
    note: '',
    createdAt: '2026-10-10T08:00:00.000Z',
  },
  {
    id: 's-11',
    status: 'active',
    theme: '观点表达',
    title: '真正的成长',
    summary: '用否定对比突出成长的内涵。',
    content: 'Growth is not measured by how many times we succeed, but by how honestly we face the moments when we do not.',
    translation: '衡量成长的标准，不是我们成功了多少次，而是我们如何诚实地面对那些没有成功的时刻。',
    usage: '用于成长类议论文或演讲稿。',
    example: 'Maturity begins when we stop explaining our mistakes and start learning from them.',
    exampleTranslation: '成熟始于我们不再为错误辩解，而是开始从中学习。',
    source: '范文精选',
    sourceType: 'manual',
    tags: ['观点表达', '成长'],
    note: '',
    createdAt: '2026-10-11T08:00:00.000Z',
  },
  {
    id: 's-12',
    status: 'active',
    theme: '过渡衔接',
    title: '递进与深化',
    summary: '从现象推进到本质。',
    content: 'The problem goes far beyond a single decision; it touches the values that shape every decision we make.',
    translation: '这个问题远不止于某一个决定，它触及的是塑造我们每一个决定的价值观念。',
    usage: '用于议论文由现象分析转入深层讨论。',
    example: 'This is not merely a question of time; it is a question of priorities.',
    exampleTranslation: '这不仅是时间问题，更是优先级问题。',
    source: '写作积累',
    sourceType: 'manual',
    tags: ['过渡衔接', '递进'],
    note: '',
    createdAt: '2026-10-12T08:00:00.000Z',
  },
  {
    id: 's-13',
    status: 'active',
    theme: '环境描写',
    title: '清晨的校园',
    summary: '用声音与光线写校园苏醒。',
    content: 'The campus was still half asleep when the first bell rang, its corridors slowly filling with light and hurried footsteps.',
    translation: '第一遍铃声响起时，校园还半梦半醒，走廊里慢慢有了光和匆忙的脚步声。',
    usage: '用于校园生活类记叙文的场景开头。',
    example: 'The classroom smelled of chalk and morning air.',
    exampleTranslation: '教室里弥漫着粉笔和清晨空气的味道。',
    source: '写作积累',
    sourceType: 'manual',
    tags: ['环境描写', '校园'],
    note: '',
    createdAt: '2026-10-13T08:00:00.000Z',
  },
  {
    id: 's-14',
    status: 'active',
    theme: '观点表达',
    title: '合作的价值',
    summary: '从个体与整体的关系谈合作。',
    content: 'A single note can make a sound, but it takes many notes, played together, to make music that stays with people.',
    translation: '一个音符可以发出声音，却需要许多音符共同演奏，才能成为留在人们心里的音乐。',
    usage: '用于合作、团队、集体类议论文。',
    example: 'No one can whistle a symphony alone.',
    exampleTranslation: '没有人能独自吹奏出一整部交响乐。',
    source: '范文精选',
    sourceType: 'manual',
    tags: ['观点表达', '合作'],
    note: '',
    createdAt: '2026-10-14T08:00:00.000Z',
  },
  {
    id: 's-15',
    status: 'active',
    theme: '人物描写',
    title: '久别重逢',
    summary: '用停顿与眼神写复杂情绪。',
    content: 'For a moment, neither of them spoke; they simply looked at each other, as if afraid that words might break the spell.',
    translation: '有那么一会儿，两人都没有说话，只是看着彼此，仿佛害怕一开口就会打破这个魔法。',
    usage: '用于写重逢、和解或情感转折。',
    example: 'Their eyes met, and everything they had never said seemed to pass between them.',
    exampleTranslation: '他们目光相遇，所有未曾说出口的话似乎都在那一刻流过。',
    source: '读后续写素材',
    sourceType: 'manual',
    tags: ['人物描写', '重逢'],
    note: '',
    createdAt: '2026-10-15T08:00:00.000Z',
  },
];

test('latexToPlain 覆盖常见公式且不残留反斜杠命令', () => {
  assert.equal(latexToPlain('$x=\\frac{a}{b}$'), 'x=a/b');
  assert.equal(latexToPlain('$\\sqrt{x}$'), '√(x)');
  assert.equal(latexToPlain('$\\frac{1}{2a}$'), '1/(2a)');
  const greek = latexToPlain('$\\alpha+\\beta=\\theta$，$\\Delta\\rightarrow\\infty$');
  assert.ok(greek.includes('α'));
  assert.ok(greek.includes('β'));
  assert.ok(greek.includes('θ'));
  assert.ok(greek.includes('Δ'));
  assert.ok(greek.includes('→'));
  assert.ok(greek.includes('∞'));
  const complex = latexToPlain('$x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$');
  assert.ok(complex.includes('±'));
  assert.ok(complex.includes('√'));
  assert.ok(complex.includes('²'));
  assert.doesNotMatch(complex, /\\[a-zA-Z]+/);
  assert.equal(latexToPlain('函数 $\\sin(\\omega x+\\varphi)$ 的周期'), '函数 sin(ω x+ϕ) 的周期');
  assert.equal(latexToPlain('$45^\\circ$'), '45°');
});

test('parseMarkdownBlocks 识别标题、列表、表格与代码块', () => {
  const blocks = parseMarkdownBlocks([
    '# 标题',
    '',
    '- **第一条**',
    '1. 有序项',
    '',
    '| 项目 | 数值 |',
    '| --- | --- |',
    '| 速度 | 3 |',
    '',
    '```js',
    'const x = 1;',
    '```',
  ].join('\n'));
  assert.ok(blocks.some((block) => block.type === 'heading' && block.text === '标题'));
  assert.ok(blocks.some((block) => block.type === 'bullet' && block.text.includes('**第一条**')));
  assert.ok(blocks.some((block) => block.type === 'ordered'));
  assert.ok(blocks.some((block) => block.type === 'table' && block.rows.length === 1));
  assert.ok(blocks.some((block) => block.type === 'code'));
});

test('生成错题 docx：包结构、字体、图片、页码与 Markdown/LaTeX 清理', async () => {
  const options = {
    title: '高三错题精选',
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
    includeBlankSpace: true,
    blankSpace: 'medium',
    groupBy: 'subject',
    sortBy: 'difficulty',
    fontFamily: '楷体',
    fontSize: 12,
    headingSize: 16,
    lineSpacing: 1.5,
    pageSize: 'B5',
    margin: 'narrow',
    showPageNumbers: true,
    showDate: true,
    numbered: true,
    coverStyle: 'classic',
    includeTags: true,
    includeChapter: true,
    watermarkText: '拾穗 Study · 内部资料',
  };
  const buffer = await buildMistakesDocx(MISTAKES, options, {
    uploadDir: UPLOAD_DIR,
    date: new Date('2026-10-24T12:00:00+08:00'),
  });
  const filePath = path.join(RUN_DIR, 'mistakes-sample.docx');
  fs.writeFileSync(filePath, buffer);
  assert.ok(buffer.length > 20 * 1024, `错题 docx 应大于 20KB，实际 ${buffer.length}`);

  const { entries, text } = packageText(buffer, [
    '[Content_Types].xml',
    'word/document.xml',
    'word/styles.xml',
    'docProps/core.xml',
  ]);
  const mediaEntries = entries.filter((entry) => (
    entry.name.startsWith('word/media/') && /\.(png|jpe?g|gif|bmp)$/i.test(entry.name)
  ));
  assert.equal(mediaEntries.length, 2, '应嵌入题目图片与配图');
  assert.ok(entries.some((entry) => entry.name.startsWith('word/footer')), '应存在页脚');
  assert.match(text, /wordprocessingml/);
  assert.ok(text.includes('高三错题精选'));
  assert.ok(text.includes('KaiTi'), '应写入中文 eastAsia 字体 KaiTi');
  assert.ok(text.includes('w:w="9979"'), 'B5 页面宽度应为 9979 twips');
  assert.ok(text.includes('函数图像') || text.includes('辅助受力图'), '应写入图注');
  assert.ok(text.includes('参考答案'));
  assert.ok(text.includes('解析'));
  assert.ok(text.includes('答题区'));
  const documentEntry = entries.find((entry) => entry.name === 'word/document.xml');
  const documentXml = entryText(buffer, documentEntry);
  const plainDocumentText = documentXml
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  assert.ok(
    plainDocumentText.includes('The book that you lent me is interesting.'),
    'Markdown 粗体两侧的空格必须保留',
  );
  assert.match(text, /<w:instrText[^>]*>\s*PAGE\s*<\/w:instrText>/);
  assert.match(text, /<w:drawing>/);
  assert.doesNotMatch(text, /\\frac|\\sqrt|\\left|\\right/);
  assert.doesNotMatch(text, /\*\*|###|```/);
  assert.ok(!text.includes('$f(x)'), '不应把 LaTeX 定界符原样输出');
  console.log(`[export-test] mistakes -> ${filePath} (${buffer.length} bytes)`);
});

test('生成英语 docx：卡片式、主题顺序、篇目顺序、页脚与引号', async () => {
  const options = {
    title: '英语佳句摘抄',
    subtitle: '在好句子里，遇见更好的表达',
    includeCover: true,
    includeOverview: true,
    includeTranslation: true,
    includeUsage: true,
    includeExample: true,
    includeExampleTranslation: true,
    includeSummary: true,
    includeTags: true,
    includeSource: true,
    groupBy: 'theme',
    themeOrder: ['人物描写', '环境描写', '观点表达', '过渡衔接'],
    itemOrder: ['s-3', 's-1', 's-2', 's-4', 's-5', 's-6', 's-7', 's-8', 's-9', 's-10', 's-11', 's-12', 's-13', 's-14', 's-15'],
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
    includeThemeIntro: true,
    quoteMarks: true,
    watermarkText: '拾穗 Study',
  };
  const buffer = await buildEnglishDocx(SENTENCES, options, {
    date: new Date('2026-10-24T12:00:00+08:00'),
  });
  const filePath = path.join(RUN_DIR, 'english-sample.docx');
  fs.writeFileSync(filePath, buffer);
  assert.ok(buffer.length > 20 * 1024, `英语 docx 应大于 20KB，实际 ${buffer.length}`);

  const { entries, text } = packageText(buffer, [
    '[Content_Types].xml',
    'word/document.xml',
    'word/styles.xml',
  ]);
  assert.ok(entries.some((entry) => entry.name === 'word/document.xml'));
  assert.ok(text.includes('英语佳句摘抄'));
  assert.ok(text.includes('SimSun'), '应写入中文 eastAsia 字体 SimSun');
  assert.ok(text.includes('人物描写'));
  assert.ok(text.includes('本主题共收录'));
  assert.ok(text.includes('“') && text.includes('”'), '应给英文句子加中文引号');
  assert.match(text, /<w:instrText[^>]*>\s*(PAGE|NUMPAGES)\s*<\/w:instrText>/);
  // 主题内顺序：人物描写组内 s-3 应在 s-1 之前；环境描写 s-2 在人物描写之后。
  const s3 = text.indexOf('She pressed her lips together');
  const s1 = text.indexOf('Her eyes were fixed on the page');
  const s2 = text.indexOf('Long shadows stretched across the street');
  assert.ok(s3 >= 0 && s1 >= 0 && s2 >= 0);
  assert.ok(s3 < s1, 'itemOrder 应让 s-3 排在 s-1 前面');
  assert.ok(s1 < s2, '主题顺序应让人物描写排在环境描写前面');
  assert.doesNotMatch(text, /\*\*|###|```/);
  console.log(`[export-test] english -> ${filePath} (${buffer.length} bytes)`);
});

test('分组/排序模式齐全，空数组会拒绝导出', async () => {
  const lightMistakes = MISTAKES.slice(2); // 不带图片，只验证分组与排序路径
  for (const groupBy of ['source', 'none', 'difficulty']) {
    const buffer = await buildMistakesDocx(lightMistakes, {
      includeCover: false,
      includeOverview: false,
      groupBy,
      sortBy: groupBy === 'source' ? 'subject' : 'created',
      answerPlacement: 'after',
    }, { date: new Date('2026-10-24T12:00:00+08:00') });
    assert.ok(buffer.length > 3000);
  }
  for (const groupBy of ['none']) {
    const buffer = await buildEnglishDocx(SENTENCES.slice(0, 3), {
      includeCover: false,
      includeOverview: false,
      groupBy,
      layout: 'list',
    }, { date: new Date('2026-10-24T12:00:00+08:00') });
    assert.ok(buffer.length > 3000);
  }
  await assert.rejects(() => buildMistakesDocx([], {}), /EMPTY_EXPORT/);
  await assert.rejects(() => buildEnglishDocx([], {}), /EMPTY_EXPORT/);
});

test('答案统一放末尾、无封面/总览与清单式英语也能生成', async () => {
  const mistakes = await buildMistakesDocx(MISTAKES, {
    includeCover: false,
    includeOverview: false,
    includeBlankSpace: false,
    answerPlacement: 'end',
    groupBy: 'difficulty',
    sortBy: 'created',
    fontFamily: '微软雅黑',
    pageSize: 'A4',
    margin: 'wide',
    coverStyle: 'simple',
  }, { uploadDir: UPLOAD_DIR, date: new Date('2026-10-24T12:00:00+08:00') });
  assert.ok(mistakes.length > 8 * 1024);
  fs.writeFileSync(path.join(RUN_DIR, 'mistakes-end-sample.docx'), mistakes);
  const mistakeText = packageText(mistakes, ['word/document.xml']).text;
  assert.ok(mistakeText.includes('参考答案'));
  assert.ok(mistakeText.indexOf('参考答案') > mistakeText.indexOf('氧化还原判断'));
  assert.ok(mistakeText.includes('Microsoft YaHei'));

  const english = await buildEnglishDocx(SENTENCES, {
    includeCover: false,
    includeOverview: false,
    groupBy: 'date',
    layout: 'list',
    fontFamily: '仿宋',
    quoteMarks: false,
    includeSummary: false,
    includeThemeIntro: true,
    numbered: false,
    showPageNumbers: false,
    showDate: false,
  }, { date: new Date('2026-10-24T12:00:00+08:00') });
  assert.ok(english.length > 8 * 1024);
  fs.writeFileSync(path.join(RUN_DIR, 'english-list-sample.docx'), english);
  const englishText = packageText(english, ['word/document.xml']).text;
  assert.ok(englishText.includes('FangSong'));
  assert.ok(englishText.includes('Her eyes were fixed'));
  assert.ok(!/[“”]/.test(englishText), 'quoteMarks=false 时不应自动加引号');
});
