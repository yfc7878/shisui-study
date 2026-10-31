const rtf = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });

export function formatDate(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', ...options,
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export function formatShortDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date);
}

export function relativeTime(value) {
  if (!value) return '';
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return '';
  const diff = date - Date.now();
  const abs = Math.abs(diff);
  if (abs < 60_000) return '刚刚';
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 604_800_000) return rtf.format(Math.round(diff / 86_400_000), 'day');
  return formatShortDate(value);
}

export function todayLabel() {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long', day: 'numeric', weekday: 'long',
  }).format(new Date());
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return '夜深了';
  if (hour < 9) return '早上好';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function formatMinutes(minutes) {
  const value = Number(minutes) || 0;
  if (value < 60) return `${value} 分钟`;
  const h = Math.floor(value / 60);
  const m = value % 60;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

export function formatSeconds(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(value / 60);
  const s = value % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const LATEX_SYMBOLS = {
  '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\Delta': 'Δ',
  '\\theta': 'θ', '\\lambda': 'λ', '\\mu': 'μ', '\\pi': 'π', '\\sigma': 'σ',
  '\\phi': 'φ', '\\omega': 'ω', '\\Omega': 'Ω', '\\infty': '∞',
  '\\times': '×', '\\cdot': '·', '\\div': '÷', '\\pm': '±', '\\mp': '∓',
  '\\le': '≤', '\\leq': '≤', '\\ge': '≥', '\\geq': '≥', '\\ne': '≠', '\\neq': '≠',
  '\\approx': '≈', '\\equiv': '≡', '\\sim': '∼', '\\propto': '∝',
  '\\sum': 'Σ', '\\prod': 'Π', '\\int': '∫', '\\partial': '∂', '\\nabla': '∇',
  '\\rightarrow': '→', '\\to': '→', '\\leftarrow': '←', '\\leftrightarrow': '↔',
  '\\Rightarrow': '⇒', '\\Leftarrow': '⇐', '\\Leftrightarrow': '⇔',
  '\\because': '∵', '\\therefore': '∴', '\\angle': '∠', '\\triangle': '△',
  '\\perp': '⊥', '\\parallel': '∥', '\\in': '∈', '\\notin': '∉',
  '\\subset': '⊂', '\\subseteq': '⊆', '\\cup': '∪', '\\cap': '∩', '\\emptyset': '∅',
  '\\degree': '°', '\\circ': '°', '\\ldots': '…', '\\dots': '…',
};

const SUPERSCRIPTS = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', n: 'ⁿ', i: 'ⁱ' };
const SUBSCRIPTS = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', n: 'ₙ', i: 'ᵢ' };

function scripts(text, map) {
  return [...text].map((char) => map[char] ?? char).join('');
}

/** 把常见 LaTeX 转成可读的纯文本，用于卡片摘要、导出预览等不适合 KaTeX 的位置。 */
export function latexToSnippet(value = '') {
  let text = String(value);
  text = text.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '$1/$2');
  text = text.replace(/\\dfrac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '$1/$2');
  text = text.replace(/\\sqrt\s*\{([^{}]+)\}/g, '√($1)');
  text = text.replace(/\\sqrt\s*([a-zA-Z0-9])/g, '√$1');
  text = text.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname|displaystyle)\s*\{([^{}]*)\}/g, '$1');
  for (const [command, symbol] of Object.entries(LATEX_SYMBOLS)) {
    text = text.split(command).join(symbol);
  }
  text = text.replace(/\^\{([0-9+\-ni]+)\}/g, (match, group) => scripts(group, SUPERSCRIPTS));
  text = text.replace(/\^([0-9+\-ni])/g, (match, group) => scripts(group, SUPERSCRIPTS));
  text = text.replace(/_\{([0-9+\-ni]+)\}/g, (match, group) => scripts(group, SUBSCRIPTS));
  text = text.replace(/_([0-9+\-ni])/g, (match, group) => scripts(group, SUBSCRIPTS));
  // 常见的 \sin \cos \log 等函数名保留为普通字母。
  text = text.replace(/\\(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|log|ln|lg|lim|max|min)/g, '$1');
  text = text.replace(/\\(?:left|right|big|Big|quad|qquad|,|;|!| )/g, '');
  text = text.replace(/\\[a-zA-Z]+/g, ' ');
  text = text.replace(/[{}]/g, '');
  return text;
}

export function stripMarkdown(text = '', max = 140) {
  let clean = String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => latexToSnippet(formula))
    .replace(/\$([^$]*)\$/g, (match, formula) => latexToSnippet(formula))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  clean = latexToSnippet(clean).replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export function fileSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function initials(name = '同学') {
  return String(name).slice(0, 1);
}

export function plural(count, unit) {
  return `${count} ${unit}`;
}
