/**
 * 载入一组可删除的示例数据，便于第一次打开时查看界面。
 * 只会在数据库几乎为空时写入；使用 `npm run seed` 运行。
 * 演示数据均可在回收站删除。
 */
import {
  createMistake, createSentence, createVocab, db,
} from './db.js';

const counts = {
  mistakes: db.prepare('SELECT COUNT(*) n FROM mistakes').get().n,
  sentences: db.prepare('SELECT COUNT(*) n FROM sentences').get().n,
  vocab: db.prepare('SELECT COUNT(*) n FROM vocab_entries').get().n,
};

if (counts.mistakes + counts.sentences + counts.vocab > 0) {
  console.log('数据库里已经有内容，为避免混入真实数据，示例数据未写入。');
  console.log(counts);
  process.exit(0);
}

const now = Date.now();
const hoursAgo = (h) => new Date(now - h * 3600_000).toISOString();

const mistakes = [
  {
    subject: '数学',
    source: '高一上 · 第一次月考',
    chapter: '函数与导数',
    errorReason: '审题不清',
    difficulty: 4,
    title: '二次函数在闭区间上的最值',
    questionText: '已知函数 $f(x)=x^2-2ax+3$ 在区间 $[0,2]$ 上的最小值为 $2$，求实数 $a$ 的值。',
    answerText: '$a=\\sqrt{2}$ 或 $a=-\\dfrac{1}{2}$（需按对称轴位置分类讨论）。',
    analysisText: '先配方：$f(x)=(x-a)^2+3-a^2$。\n\n对称轴为 $x=a$，按 $a<0$、$0\\le a\\le 2$、$a>2$ 三种情况讨论最小值出现的位置。这是含参二次函数最值的标准思路。',
    knowledgePoints: ['二次函数', '分类讨论', '闭区间最值'],
    tags: ['需重做', '易错'],
    think: true,
  },
  {
    subject: '物理',
    source: '日常作业 · 第三章',
    chapter: '牛顿运动定律',
    errorReason: '思路错误',
    difficulty: 3,
    title: '斜面上的物块受力分析',
    questionText: '质量为 $m$ 的物块沿倾角为 $\\theta$ 的光滑斜面下滑，求物块的加速度大小。',
    answerText: '$a=g\\sin\\theta$，方向沿斜面向下。',
    analysisText: '沿斜面方向，重力分量为 $mg\\sin\\theta$，支持力与运动方向垂直不产生加速度。由牛顿第二定律 $mg\\sin\\theta=ma$，得 $a=g\\sin\\theta$。',
    knowledgePoints: ['受力分析', '牛顿第二定律'],
    tags: ['基础模型'],
    think: false,
  },
  {
    subject: '英语',
    source: '外刊阅读',
    chapter: '读后续写',
    errorReason: '概念不清',
    difficulty: 2,
    title: 'not until 倒装句',
    questionText: '翻译并说明句型：*Not until he lost his sight did he realize the beauty of the ordinary world.*',
    answerText: '直到失去视力，他才意识到平凡世界的美。',
    analysisText: '$Not until$ 置于句首时，主句使用部分倒装：$did+主语+动词原形$。注意从句本身不倒装。',
    knowledgePoints: ['倒装句', 'not until'],
    tags: ['写作升级'],
    think: false,
  },
];

for (const [index, item] of mistakes.entries()) {
  const row = createMistake({
    ...item,
    images: [],
    figures: [],
    aiMeta: {
      model: 'deepseek-flash',
      demo: true,
      generatedAt: hoursAgo(24 + index),
      ...(index === 0
        ? { functionGraphs: [{ expression: 'x^2-2*x+3', label: 'f(x) = x² - 2x + 3', xMin: -2, xMax: 4 }] }
        : {}),
    },
  }, index === 2 ? 'pending' : 'active');
  if (row.status === 'active') {
    db.prepare('UPDATE mistakes SET created_at=?, updated_at=?, reviewed_at=? WHERE id=?')
      .run(hoursAgo(30 + index * 6), hoursAgo(30 + index * 6), hoursAgo(29 + index * 6), row.id);
  } else {
    db.prepare('UPDATE mistakes SET created_at=?, updated_at=? WHERE id=?')
      .run(hoursAgo(2), hoursAgo(2), row.id);
  }
}

const sentences = [
  {
    theme: '环境描写',
    title: '黄昏的风',
    content: 'The wind carried the scent of rain across the empty playground, and for a moment the whole world seemed to hold its breath.',
    translation: '风把雨的气息吹过空荡的操场，有那么一瞬间，整个世界仿佛都屏住了呼吸。',
    usage: '用 and 连接两个并列分句，后半句用 seemed to 制造拟人化的停顿感；适合写雨前、黄昏等场景。',
    example: 'The classroom carried the scent of chalk and sunshine, and for a moment all the noise outside seemed to fade away.',
    exampleTranslation: '教室里弥漫着粉笔和阳光的味道，有那么一瞬间，外面的喧闹仿佛都远去了。',
    summary: '适合放在读后续写的环境铺垫段，渲染寂静、期待或转折前的氛围。',
    tags: ['环境描写', '拟人', '读后续写'],
  },
  {
    theme: '观点表达',
    title: '不完美的价值',
    content: 'It is not the absence of mistakes that makes us wise, but the courage to look at them honestly.',
    translation: '让我们变得明智的，不是不犯错，而是有勇气诚实地面对错误。',
    usage: 'It is not A that ..., but B. 强调句式的变体；not A but B 形成对比，适合议论性写作。',
    example: 'It is not the number of books we read that makes us thoughtful, but the questions we dare to ask.',
    exampleTranslation: '让我们变得有思想的，不是读了多少书，而是敢于提出怎样的问题。',
    summary: '适合议论文开头或结尾，用对比句亮明观点。',
    tags: ['强调句', '对比', '写作'],
  },
  {
    theme: '过渡衔接',
    title: '时间的重量',
    content: 'As the days slipped by, what had once felt unbearable quietly became a story worth telling.',
    translation: '随着日子悄然流逝，曾经觉得无法承受的事，悄悄变成了值得讲述的故事。',
    usage: 'as 引导时间状语从句；what 引导主语从句；worth telling 作后置定语。适合时间过渡与成长主题。',
    example: 'As the months slipped by, what had once felt impossible quietly became a habit I could not live without.',
    exampleTranslation: '随着几个月悄然过去，曾经觉得不可能的事，悄悄变成了我离不开的习惯。',
    summary: '适合读后续写中时间跳跃后的过渡句，也可用于成长类作文。',
    tags: ['过渡', '主语从句', '成长'],
  },
  {
    theme: '高级替换',
    title: '重要的不是速度',
    content: 'What matters is not how fast we move, but whether we are moving in the right direction.',
    translation: '重要的不是我们走得多快，而是我们是否朝着正确的方向前进。',
    usage: 'What matters is ... 是比 It is important that ... 更简洁有力的表达；whether 引导表语从句。',
    example: 'What matters is not how much we say, but whether our words can make a difference.',
    exampleTranslation: '重要的不是我们说了多少，而是我们的话能否带来改变。',
    summary: '可用于议论文中心句，替换 the most important thing is。',
    tags: ['观点表达', '高级替换'],
  },
];

for (const [index, sentence] of sentences.entries()) {
  const row = createSentence({
    ...sentence,
    source: '外刊摘录 · 个人收藏',
    sourceType: 'text',
    aiMeta: { model: 'deepseek-flash', demo: true },
  }, 'active');
  db.prepare('UPDATE sentences SET created_at=?, updated_at=?, reviewed_at=? WHERE id=?')
    .run(hoursAgo(18 + index * 9), hoursAgo(18 + index * 9), hoursAgo(17 + index * 9), row.id);
}

const vocab = {
  term: 'available',
  entryType: 'word',
  theme: '熟词生义',
  data: {
    term: 'available',
    entryType: 'word',
    phonetic: '/əˈveɪləbl/',
    partOfSpeech: ['adj.'],
    coreTranslation: '可获得的；有空的；（人）单身的',
    theme: '熟词生义',
    definitions: [
      { pos: 'adj.', zh: '可获得的；可用的', en: 'able to be obtained or used' },
      { pos: 'adj.', zh: '（人）有空的', en: 'free to see or talk to someone' },
      { pos: 'adj.', zh: '（物）可买到的', en: 'able to be bought' },
    ],
    usage: '常作表语或定语。表示“有空的”时指人，不能用于物；表示“可获得的”时多用 be available to sb. 或 be available for sth.。',
    extensions: [
      { label: '词形变化', content: 'availability n. 可获得性；可利用性；unavailable adj. 不可获得的；没空的' },
      { label: '近义辨析', content: 'available 强调“能够被使用/找到”；accessible 强调“容易接近/使用”；free 强调“空闲的”，口语更常用。' },
    ],
    collocations: [
      { phrase: 'be available to sb.', zh: '对某人可用/可接触' },
      { phrase: 'be available for sth.', zh: '可用于某事' },
      { phrase: 'make sth. available', zh: '使某物可供使用' },
      { phrase: 'readily available', zh: '容易获得的' },
    ],
    synonyms: [{ word: 'accessible', zh: '可接近的' }, { word: 'obtainable', zh: '可获得的' }],
    antonyms: [{ word: 'unavailable', zh: '不可获得的' }, { word: 'occupied', zh: '忙碌的' }],
    confusions: 'available 作“有空的”时主语通常是人；表示“商品有货”用 available，不用 free。',
    examples: [
      { en: 'The book is available in both print and digital forms.', zh: '这本书有纸质版和电子版两种形式。' },
      { en: 'Is the doctor available this afternoon?', zh: '医生今天下午有空吗？' },
      { en: 'Our school makes many online resources available to students.', zh: '学校为学生提供了许多在线资源。' },
    ],
    memoryTip: 'a + vail + able：vail 与 value 同源，值得被取用 → 可获得的。',
    examTips: '完形填空中常与 free、accessible 辨析；写作中可用 be readily available to 替换 can easily get。',
    related: [{ word: 'availability', relation: '名词派生' }],
  },
  aiMeta: { model: 'deepseek-flash', demo: true },
};

const vocabRow = createVocab(vocab, 'active');
db.prepare('UPDATE vocab_entries SET created_at=?, updated_at=?, reviewed_at=? WHERE id=?')
  .run(hoursAgo(12), hoursAgo(12), hoursAgo(11), vocabRow.id);

// 一个待审阅的词汇示例
const pendingVocab = createVocab({
  term: 'sustain',
  entryType: 'word',
  theme: '写作升级',
  data: {
    term: 'sustain',
    entryType: 'word',
    phonetic: '/səˈsteɪn/',
    partOfSpeech: ['v.'],
    coreTranslation: '维持；支撑；遭受',
    theme: '写作升级',
    definitions: [
      { pos: 'v.', zh: '维持（生命、状态）', en: 'to make something continue over time' },
      { pos: 'v.', zh: '支撑；承受', en: 'to support or hold something' },
    ],
    usage: '及物动词。sustain interest / growth / life；sustain an injury 表示“遭受伤害”。',
    extensions: [{ label: '词形变化', content: 'sustainable adj. 可持续的；sustained adj. 持续的；sustenance n. 食物；维持' }],
    collocations: [
      { phrase: 'sustain growth', zh: '维持增长' },
      { phrase: 'sustain interest', zh: '保持兴趣' },
      { phrase: 'sustain an injury', zh: '受伤' },
    ],
    synonyms: [{ word: 'maintain', zh: '维持' }, { word: 'support', zh: '支撑' }],
    antonyms: [{ word: 'weaken', zh: '削弱' }],
    confusions: 'maintain 更强调“保持某种状态”；sustain 更强调“提供支撑使其持续”。',
    examples: [
      { en: 'Small daily habits can sustain our motivation.', zh: '微小的日常习惯能够维持我们的动力。' },
      { en: 'The bridge is strong enough to sustain heavy traffic.', zh: '这座桥足够坚固，可以承受繁忙的交通。' },
    ],
    memoryTip: 'sus（下）+ tain（保持）→ 从下面托住，使其持续。',
    examTips: '写作中常用 sustainable development 替换 development that can continue。',
    related: [{ word: 'sustainable', relation: '形容词派生' }],
  },
  aiMeta: { model: 'deepseek-flash', demo: true },
}, 'pending');
db.prepare('UPDATE vocab_entries SET created_at=?, updated_at=? WHERE id=?')
  .run(hoursAgo(1), hoursAgo(1), pendingVocab.id);

const focus = [
  { mode: 'focus', duration_sec: 25 * 60, label: '数学错题整理', completed: 1, hours: 20 },
  { mode: 'focus', duration_sec: 25 * 60, label: '英语阅读', completed: 1, hours: 26 },
  { mode: 'focus', duration_sec: 50 * 60, label: '函数专题', completed: 1, hours: 44 },
];
for (const session of focus) {
  db.prepare(`
    INSERT INTO focus_sessions (id, mode, duration_sec, label, completed, started_at, ended_at, created_at)
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?)
  `).run(
    session.mode,
    session.duration_sec,
    session.label,
    session.completed,
    hoursAgo(session.hours),
    hoursAgo(session.hours - 1),
    hoursAgo(session.hours),
  );
}

console.log('示例数据已写入：');
console.log(`  错题 ${db.prepare('SELECT COUNT(*) n FROM mistakes').get().n} 道`);
console.log(`  佳句 ${db.prepare('SELECT COUNT(*) n FROM sentences').get().n} 条`);
console.log(`  词汇 ${db.prepare('SELECT COUNT(*) n FROM vocab_entries').get().n} 条`);
console.log('  其中一条英语错题、一条词汇为「待审阅」，用于体验审阅流程。');
