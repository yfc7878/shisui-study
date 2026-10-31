export const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理', '其他'];

export const ERROR_REASONS = [
  '概念不清', '计算失误', '审题不清', '思路错误', '公式记错', '单位/符号错误',
  '粗心抄错', '方法不熟', '时间不足', '完全不会', '其他',
];

export const SOURCES = ['日常作业', '周测', '月考', '期中', '期末', '模拟卷', '练习册', '其他'];

export const SENTENCE_THEMES = [
  '人物描写', '环境描写', '观点表达', '过渡衔接', '因果论证', '对比转折',
  '情感态度', '高级替换', '其他',
];

export const VOCAB_THEMES = ['高频词', '熟词生义', '完形填空', '阅读理解', '写作升级', '易混词', '其他'];

export const SUBJECT_COLORS = {
  语文: '#b45f4d',
  数学: '#2f6d5b',
  英语: '#456b9c',
  物理: '#6f5da0',
  化学: '#a36f2b',
  生物: '#3e7d55',
  政治: '#9c4f63',
  历史: '#80603f',
  地理: '#3f7581',
  其他: '#6b7a72',
};

export const DIFFICULTY_LABELS = ['', '很基础', '较基础', '中等', '较难', '压轴'];

export const STATUS_LABELS = {
  active: '已收录',
  pending: '待审阅',
  trashed: '回收站',
};

export const TYPE_LABELS = {
  mistake: '错题',
  sentence: '佳句',
  vocab: '词汇',
};

export function subjectColor(subject) {
  return SUBJECT_COLORS[subject] || SUBJECT_COLORS['其他'];
}
