/**
 * 轻量 LaTeX → 纯文本 / Unicode 转换。
 *
 * Word 不能直接渲染 LaTeX，而 AI 生成的题目、解析中经常混有 `$...$`。
 * 这里不做完整 TeX 解析，只覆盖高中题目里最常见的命令，并保证输出里
 * 不会残留大量反斜杠命令。目标是「可读、可打印、不破坏排版」。
 */

const SYMBOLS = new Map(Object.entries({
  // 算术与关系
  times: '×', cdot: '·', div: '÷', ast: '∗', star: '⋆',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠',
  approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', cong: '≅',
  pm: '±', mp: '∓', propto: '∝', ll: '≪', gg: '≫',
  infty: '∞', partial: '∂', nabla: '∇', degree: '°', circ: '∘',
  // 几何与箭头
  rightarrow: '→', to: '→', leftarrow: '←', gets: '←',
  Rightarrow: '⇒', Leftarrow: '⇐', leftrightarrow: '↔', Leftrightarrow: '⇔',
  longrightarrow: '⟶', longleftarrow: '⟵', uparrow: '↑', downarrow: '↓',
  angle: '∠', triangle: '△', square: '□', perp: '⊥', parallel: '∥',
  because: '∵', therefore: '∴', degree_symbol: '°',
  // 集合
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆',
  supset: '⊃', supseteq: '⊇', cup: '∪', cap: '∩', emptyset: '∅',
  varnothing: '∅', setminus: '∖', forall: '∀', exists: '∃',
  // 大型运算符
  sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', oint: '∮',
  // 省略号与特殊符号
  ldots: '…', cdots: '⋯', dots: '…', vdots: '⋮', ddots: '⋱',
  prime: '′', backslash: '\\', percent: '%', copyright: '©',
  // 希腊字母（小写）
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', varpi: 'ϖ',
  rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ',
  phi: 'φ', varphi: 'ϕ', chi: 'χ', psi: 'ψ', omega: 'ω',
  // 希腊字母（大写）
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  // 常见函数
  sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc',
  arcsin: 'arcsin', arccos: 'arccos', arctan: 'arctan',
  sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
  ln: 'ln', log: 'log', lg: 'lg', exp: 'exp', lim: 'lim',
  max: 'max', min: 'min', sup: 'sup', inf: 'inf', det: 'det', gcd: 'gcd',
  // 间距
  quad: '  ', qquad: '    ', space: ' ', enspace: ' ', thinspace: ' ',
  // 转义字符
  '%': '%', '_': '_', '&': '&', '#': '#', '$': '$', '{': '{', '}': '}',
}));

const SUPERSCRIPTS = new Map(Object.entries({
  0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ',
  '∘': '°', '°': '°', '′': '′',
}));

const SUBSCRIPTS = new Map(Object.entries({
  0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', o: 'ₒ',
  x: 'ₓ', n: 'ₙ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', m: 'ₘ', p: 'ₚ', s: 'ₛ', t: 'ₜ',
}));

const ACCENTS = new Map(Object.entries({
  vec: '\u20d7', hat: '\u0302', bar: '\u0304', tilde: '\u0303',
  dot: '\u0307', ddot: '\u0308', acute: '\u0301', grave: '\u0300',
}));

const SIMPLE_WRAP_COMMANDS = new Set([
  'text', 'textrm', 'textnormal', 'textbf', 'textit', 'textsf', 'texttt',
  'mathrm', 'mathbf', 'mathit', 'mathsf', 'mathtt', 'mathcal', 'mathbb',
  'mathfrak', 'operatorname', 'mathop', 'boldsymbol', 'bm',
]);

const SKIP_COMMANDS = new Set([
  'left', 'right', 'middle', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'Bigl',
  'biggl', 'Biggl', 'bigr', 'Bigr', 'biggr', 'Biggr', 'displaystyle',
  'textstyle', 'scriptstyle', 'scriptscriptstyle', 'limits', 'nolimits',
  'nonumber', 'notag', 'hline', 'relax', 'protect', 'mathstrut',
]);

const plainStorage = [];

function escapePlaceholder(value) {
  const index = plainStorage.push(value) - 1;
  return `\uE100${index}\uE101`;
}

/** 从 `{` 读取一个平衡花括号组；返回内容（不含外层花括号）。 */
function readGroup(source, start) {
  if (source[start] !== '{') return null;
  let depth = 0;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return { content: source.slice(start + 1, index), end: index + 1 };
      }
    }
  }
  return null;
}

/** 读取一个参数：花括号组，或单个 token（用于 \frac12 这类简写）。 */
function readGroupOrToken(source, start) {
  const group = readGroup(source, start);
  if (group) return group;
  if (start >= source.length) return null;
  if (source[start] === '\\') {
    let end = start + 1;
    while (end < source.length && /[a-zA-Z]/.test(source[end])) end += 1;
    if (end === start + 1) end += 1;
    const argument = readGroup(source, skipSpaces(source, end));
    if (argument) end = argument.end;
    return { content: source.slice(start, end), end };
  }
  if (/[0-9A-Za-z.]/.test(source[start])) {
    return { content: source[start], end: start + 1 };
  }
  return null;
}

function readOptionalGroup(source, start) {
  if (source[start] !== '[') return null;
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '[') depth += 1;
    else if (source[index] === ']') {
      depth -= 1;
      if (depth === 0) {
        return { content: source.slice(start + 1, index), end: index + 1 };
      }
    }
  }
  return null;
}

function skipSpaces(source, index) {
  let cursor = index;
  while (cursor < source.length && /[ \t]/.test(source[cursor])) cursor += 1;
  return cursor;
}

function wrapFractionPart(value, denominator = false) {
  const text = value.trim();
  if (!text) return '';
  if (/^[\w\u0370-\u03ff\u4e00-\u9fff.'′]+$/.test(text)) {
    // 分子单 token 可以不加括号；分母若是 2a 这类多字符，仍加括号避免歧义。
    if (!denominator || text.length <= 1 || /^\d+$/.test(text)) return text;
  }
  return `(${text})`;
}

function replaceScripts(text) {
  let result = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== '^' && char !== '_') {
      result += char;
      continue;
    }
    const map = char === '^' ? SUPERSCRIPTS : SUBSCRIPTS;
    let content = '';
    let end = index + 1;
    if (text[end] === '{') {
      const group = readGroup(text, end);
      if (group) {
        content = group.content;
        end = group.end;
      }
    }
    // 无花括号时只转换明确的数字/符号上下标，避免把 snake_case 误判成下标。
    if (!content && end < text.length && /[0-9+\-∘°′]/.test(text[end])) {
      content = text[end];
      end += 1;
    }
    if (!content) {
      result += char;
      continue;
    }
    const plain = content.replace(/[{}]/g, '').trim();
    if (plain && [...plain].every((item) => map.has(item))) {
      result += [...plain].map((item) => map.get(item)).join('');
    } else if (char === '^') {
      result += `^(${plain})`;
    } else {
      result += `_(${plain})`;
    }
    index = end - 1;
  }
  return result;
}

function convertEnvironments(input) {
  let text = input;
  // 同时吃掉 array 等环境的列格式参数，例如 \begin{array}{l}。
  const pattern = /\\begin\{([a-zA-Z*]+)\}(?:\{[^{}]*\})?([\s\S]*?)\\end\{\1\}/g;
  // 两层足够覆盖 cases 里再嵌 aligned 的情况；避免病态输入陷入死循环。
  for (let pass = 0; pass < 2; pass += 1) {
    text = text.replace(pattern, (_match, _env, body) => {
      const rows = body
        .split(/\\\\/)
        .map((row) => row.replace(/&/g, '  ').trim())
        .filter(Boolean);
      return rows.join('；');
    });
  }
  return text;
}

function convertLatex(source) {
  let result = '';
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (char === '$') {
      index += 1;
      continue;
    }

    if (char === '~') {
      result += ' ';
      index += 1;
      continue;
    }

    if (char !== '\\') {
      result += char;
      index += 1;
      continue;
    }

    // 反斜杠命令 / 转义 / 换行
    if (source[index + 1] === '\\') {
      result += '\n';
      index += 2;
      continue;
    }

    if (index + 1 >= source.length) {
      index += 1;
      continue;
    }

    const next = source[index + 1];
    if (!/[a-zA-Z]/.test(next)) {
      const escaped = source[index + 1];
      if (escaped === ',' || escaped === ';' || escaped === ':' || escaped === '!') {
        result += escaped === '!' ? '' : ' ';
      } else if (escaped === '(' || escaped === ')' || escaped === '[' || escaped === ']') {
        // \( \) \[ \] 只是数学定界符
      } else if (escaped === ' ') {
        result += ' ';
      } else {
        const literal = SYMBOLS.get(escaped) || escaped;
        result += literal === '\\' ? '\\' : literal;
      }
      index += 2;
      continue;
    }

    let end = index + 1;
    while (end < source.length && /[a-zA-Z]/.test(source[end])) end += 1;
    let command = source.slice(index + 1, end);
    if (source[end] === '*') end += 1;

    // \begin / \end 的残余（未配对时也不要留下命令）
    if (command === 'begin' || command === 'end') {
      const cursor = skipSpaces(source, end);
      const group = readGroup(source, cursor);
      index = group ? group.end : end;
      continue;
    }

    if (command === 'frac' || command === 'dfrac' || command === 'tfrac' || command === 'cfrac') {
      const numerator = readGroupOrToken(source, skipSpaces(source, end));
      if (numerator) {
        const denominator = readGroupOrToken(source, skipSpaces(source, numerator.end));
        if (denominator) {
          const top = wrapFractionPart(convertLatex(numerator.content));
          const bottom = wrapFractionPart(convertLatex(denominator.content), true);
          result += `${top}/${bottom}`;
          index = denominator.end;
          continue;
        }
      }
      result += ' ';
      index = end;
      continue;
    }

    if (command === 'sqrt') {
      let cursor = skipSpaces(source, end);
      let degree = '';
      const optional = readOptionalGroup(source, cursor);
      if (optional) {
        degree = convertLatex(optional.content);
        cursor = skipSpaces(source, optional.end);
      }
      const group = readGroup(source, cursor);
      if (group) {
        const content = convertLatex(group.content);
        if (degree === '3') result += `∛(${content})`;
        else if (degree === '4') result += `∜(${content})`;
        else if (degree) result += `${degree}√(${content})`;
        else result += `√(${content})`;
        index = group.end;
        continue;
      }
      result += '√';
      index = end;
      continue;
    }

    if (command === 'binom' || command === 'dbinom' || command === 'tbinom') {
      let cursor = skipSpaces(source, end);
      const top = readGroup(source, cursor);
      const bottom = top ? readGroup(source, skipSpaces(source, top.end)) : null;
      if (top && bottom) {
        result += `C(${convertLatex(top.content)}, ${convertLatex(bottom.content)})`;
        index = bottom.end;
        continue;
      }
      index = end;
      continue;
    }

    if (SIMPLE_WRAP_COMMANDS.has(command) || ACCENTS.has(command)) {
      let cursor = skipSpaces(source, end);
      const group = readGroup(source, cursor);
      if (group) {
        const content = convertLatex(group.content);
        if (ACCENTS.has(command)) {
          // 组合附加符号放在第一个字符之后；空内容则直接忽略。
          if (content) {
            const [first, ...rest] = [...content];
            result += `${first}${ACCENTS.get(command)}${rest.join('')}`;
          }
        } else {
          result += content;
        }
        index = group.end;
        continue;
      }
      index = end;
      continue;
    }

    if (command === 'boxed' || command === 'fbox' || command === 'overline' || command === 'underline') {
      const cursor = skipSpaces(source, end);
      const group = readGroup(source, cursor);
      if (group) {
        const content = convertLatex(group.content);
        if (command === 'boxed' || command === 'fbox') result += `[${content}]`;
        else result += content;
        index = group.end;
        continue;
      }
      index = end;
      continue;
    }

    if (command === 'overbrace' || command === 'underbrace' || command === 'overset' || command === 'underset') {
      let cursor = skipSpaces(source, end);
      const first = readGroup(source, cursor);
      if (first) {
        cursor = skipSpaces(source, first.end);
        const second = readGroup(source, cursor);
        if (second && (command === 'overset' || command === 'underset')) {
          result += convertLatex(second.content);
          index = second.end;
        } else {
          result += convertLatex(first.content);
          index = first.end;
        }
        continue;
      }
      index = end;
      continue;
    }

    if (command === 'tag' || command === 'color' || command === 'textcolor' || command === 'label'
      || command === 'phantom' || command === 'hphantom' || command === 'vphantom'
      || command === 'require' || command === 'mathchoice') {
      let cursor = skipSpaces(source, end);
      let group = readGroup(source, cursor);
      if (command === 'textcolor') {
        // \textcolor{red}{文本}：丢掉颜色，再取文本
        cursor = group ? skipSpaces(source, group.end) : cursor;
        group = readGroup(source, cursor);
        if (group) {
          result += convertLatex(group.content);
          index = group.end;
          continue;
        }
      }
      if (command === 'tag' && group) {
        result += `（${convertLatex(group.content)}）`;
        index = group.end;
        continue;
      }
      index = group ? group.end : end;
      continue;
    }

    if (command === 'not') {
      result += '¬';
      index = end;
      continue;
    }

    if (SKIP_COMMANDS.has(command)) {
      let cursor = skipSpaces(source, end);
      // \left( / \right) 后紧跟的定界符要保留；\left. 则忽略。
      const delimiter = source[cursor];
      if (delimiter && '()[]|'.includes(delimiter)) {
        result += delimiter;
        cursor += 1;
      } else if (delimiter === '.') {
        cursor += 1;
      } else if (delimiter === '\\' && (source[cursor + 1] === '{' || source[cursor + 1] === '}')) {
        result += source[cursor + 1];
        cursor += 2;
      } else if (delimiter === '\\' && source[cursor + 1] === '|') {
        result += '∥';
        cursor += 2;
      }
      index = cursor;
      continue;
    }

    // 未识别命令：保留命令名；若后面紧跟参数组，则输出参数内容，
    // 这样 \ce{NaCl}、\cancel{x} 之类不会留下反斜杠。
    const symbol = SYMBOLS.get(command);
    if (symbol !== undefined) {
      result += symbol;
      index = end;
      continue;
    }

    const cursor = skipSpaces(source, end);
    const group = readGroup(source, cursor);
    if (group) {
      result += convertLatex(group.content);
      index = group.end;
      continue;
    }

    if (command.length > 1) result += command;
    index = end;
  }

  return result;
}

/**
 * @param {string} input 可能包含 Markdown / LaTeX 的文本
 * @returns {string} 适合放进 Word 的纯文本
 */
export function latexToPlain(input) {
  if (input === null || input === undefined) return '';
  plainStorage.length = 0;
  let text = String(input).replace(/\r\n?/g, '\n');

  // 先保护 code span 与转义字符，避免 $ 或反斜杠被误删；反引号保留给行内解析器。
  text = text.replace(/`([^`\n]*)`/g, (_match, code) => `\`${escapePlaceholder(code)}\``);
  text = text.replace(/\\([_%&#${}])/g, (_match, char) => escapePlaceholder(char));

  text = convertEnvironments(text);
  text = convertLatex(text);

  // 数学定界符中可能残留的 \( \) \[ \]
  text = text
    .replace(/\\[()[\]]/g, '')
    .replace(/\$\$?/g, '')
    .replace(/\uE100(\d+)\uE101/g, (_match, index) => plainStorage[Number(index)] ?? '');

  text = replaceScripts(text);

  // 规范化空白：保留换行，压缩行内空格，去掉空行首尾。
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // 最后兜底：不留下成片的 LaTeX 命令。
  text = text
    .replace(/\\([a-zA-Z]+)\b/g, '$1')
    .replace(/\\[{}]/g, '')
    .replace(/[{}]/g, (brace) => brace)
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return text;
}

export default latexToPlain;
