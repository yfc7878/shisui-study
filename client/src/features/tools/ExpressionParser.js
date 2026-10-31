/* =========================================================
   拾穗 Study · 安全的数学表达式解析器
   - 递归下降 + AST，不使用 eval / new Function
   - 支持四则、括号、幂、百分号、阶乘、隐式乘法
   - 支持三角函数（DEG/RAD）、对数、根号、取整、min/max
   - 常量 π / pi / e / φ
   - 解析错误带位置；求值区分「计算器报错」与「图像静默断开」
   ========================================================= */

export class ExpressionError extends Error {
  constructor(message, position = null) {
    super(message);
    this.name = 'ExpressionError';
    this.position = position;
  }
}

export const CONSTANTS = Object.freeze({
  pi: Math.PI,
  π: Math.PI,
  e: Math.E,
  phi: (1 + Math.sqrt(5)) / 2,
  φ: (1 + Math.sqrt(5)) / 2,
});

/* ---------------- 词法 ---------------- */

const IDENT_START = /[A-Za-z_\u0370-\u03ff]/;
const IDENT_PART = /[A-Za-z0-9_\u0370-\u03ff]/;
const OPERATOR_CHARS = '+-*/^%!(),';

const CHAR_REPLACEMENTS = [
  [/[×·⋅]/g, '*'],
  [/÷/g, '/'],
  [/[−–—]/g, '-'],
  [/（/g, '('],
  [/）/g, ')'],
  [/[，、]/g, ','],
];

function normalizeSource(source) {
  let text = String(source ?? '');
  for (const [pattern, replacement] of CHAR_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function isDigit(ch) {
  return ch >= '0' && ch <= '9';
}

function tokenize(source) {
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const ch = source[index];

    if (/\s/.test(ch)) {
      index += 1;
      continue;
    }

    if (isDigit(ch) || (ch === '.' && isDigit(source[index + 1]))) {
      const start = index;
      let sawDot = false;
      while (index < source.length) {
        const current = source[index];
        if (isDigit(current)) {
          index += 1;
          continue;
        }
        if (current === '.' && !sawDot) {
          sawDot = true;
          index += 1;
          continue;
        }
        break;
      }
      if (source[index] === 'e' || source[index] === 'E') {
        let lookahead = index + 1;
        if (source[lookahead] === '+' || source[lookahead] === '-') lookahead += 1;
        if (isDigit(source[lookahead])) {
          index = lookahead;
          while (index < source.length && isDigit(source[index])) index += 1;
        }
      }
      const text = source.slice(start, index);
      const value = Number(text);
      if (!Number.isFinite(value)) {
        throw new ExpressionError(`数字「${text}」超出范围`, start);
      }
      tokens.push({ type: 'number', value, text, position: start });
      continue;
    }

    if (IDENT_START.test(ch)) {
      const start = index;
      index += 1;
      while (index < source.length && IDENT_PART.test(source[index])) index += 1;
      const text = source.slice(start, index);
      tokens.push({ type: 'ident', text, position: start });
      continue;
    }

    if (OPERATOR_CHARS.includes(ch)) {
      tokens.push({ type: 'op', text: ch, position: index });
      index += 1;
      continue;
    }

    throw new ExpressionError(`无法识别的字符「${ch}」`, index);
  }

  tokens.push({ type: 'eof', text: '', position: source.length });
  return tokens;
}

/* ---------------- 求值上下文工具 ---------------- */

function domainFail(ctx, message, position) {
  if (ctx.throwOnDomain) throw new ExpressionError(message, position);
  return NaN;
}

function finiteResult(ctx, value, message, position) {
  if (Number.isFinite(value)) return value;
  return domainFail(ctx, message, position);
}

function toRadians(value, mode) {
  return mode === 'deg' ? (value * Math.PI) / 180 : value;
}

function fromRadians(value, mode) {
  return mode === 'deg' ? (value * 180) / Math.PI : value;
}

function requireFiniteArg(value, ctx, node) {
  if (Number.isFinite(value)) return value;
  return domainFail(ctx, '函数参数必须是有效数值', node.position);
}

function unaryFunction(evaluate) {
  return { minArgs: 1, maxArgs: 1, evaluate };
}

/* ---------------- 函数表 ---------------- */

const FUNCTIONS = {
  sin: unaryFunction(([x], ctx, node) => Math.sin(toRadians(requireFiniteArg(x, ctx, node), ctx.angleMode))),
  cos: unaryFunction(([x], ctx, node) => Math.cos(toRadians(requireFiniteArg(x, ctx, node), ctx.angleMode))),
  tan: unaryFunction(([x], ctx, node) => {
    const radians = toRadians(requireFiniteArg(x, ctx, node), ctx.angleMode);
    if (Math.abs(Math.cos(radians)) < 1e-12) return domainFail(ctx, 'tan 在该角度没有定义', node.position);
    return Math.tan(radians);
  }),
  asin: unaryFunction(([x], ctx, node) => {
    requireFiniteArg(x, ctx, node);
    if (x < -1 || x > 1) return domainFail(ctx, 'asin 的定义域是 [-1, 1]', node.position);
    return fromRadians(Math.asin(x), ctx.angleMode);
  }),
  acos: unaryFunction(([x], ctx, node) => {
    requireFiniteArg(x, ctx, node);
    if (x < -1 || x > 1) return domainFail(ctx, 'acos 的定义域是 [-1, 1]', node.position);
    return fromRadians(Math.acos(x), ctx.angleMode);
  }),
  atan: unaryFunction(([x], ctx, node) => fromRadians(Math.atan(requireFiniteArg(x, ctx, node)), ctx.angleMode)),
  sinh: unaryFunction(([x], ctx, node) => finiteResult(ctx, Math.sinh(requireFiniteArg(x, ctx, node)), 'sinh 结果超出范围', node.position)),
  cosh: unaryFunction(([x], ctx, node) => finiteResult(ctx, Math.cosh(requireFiniteArg(x, ctx, node)), 'cosh 结果超出范围', node.position)),
  tanh: unaryFunction(([x], ctx, node) => Math.tanh(requireFiniteArg(x, ctx, node))),
  ln: unaryFunction(([x], ctx, node) => {
    requireFiniteArg(x, ctx, node);
    if (x <= 0) return domainFail(ctx, 'ln 的定义域是正数', node.position);
    return Math.log(x);
  }),
  log: unaryFunction(([x], ctx, node) => {
    requireFiniteArg(x, ctx, node);
    if (x <= 0) return domainFail(ctx, 'log 的定义域是正数', node.position);
    return Math.log10(x);
  }),
  lg: unaryFunction(([x], ctx, node) => {
    requireFiniteArg(x, ctx, node);
    if (x <= 0) return domainFail(ctx, 'lg 的定义域是正数', node.position);
    return Math.log10(x);
  }),
  sqrt: unaryFunction(([x], ctx, node) => {
    requireFiniteArg(x, ctx, node);
    if (x < 0) return domainFail(ctx, 'sqrt 不能对负数开平方', node.position);
    return Math.sqrt(x);
  }),
  cbrt: unaryFunction(([x], ctx, node) => Math.cbrt(requireFiniteArg(x, ctx, node))),
  abs: unaryFunction(([x], ctx, node) => Math.abs(requireFiniteArg(x, ctx, node))),
  exp: unaryFunction(([x], ctx, node) => finiteResult(ctx, Math.exp(requireFiniteArg(x, ctx, node)), 'exp 结果超出范围', node.position)),
  floor: unaryFunction(([x], ctx, node) => Math.floor(requireFiniteArg(x, ctx, node))),
  ceil: unaryFunction(([x], ctx, node) => Math.ceil(requireFiniteArg(x, ctx, node))),
  round: unaryFunction(([x], ctx, node) => Math.round(requireFiniteArg(x, ctx, node))),
  min: {
    minArgs: 2,
    maxArgs: 8,
    evaluate: (args, ctx, node) => {
      if (args.some((value) => !Number.isFinite(value))) {
        return domainFail(ctx, 'min 的参数必须是有效数值', node.position);
      }
      return Math.min(...args);
    },
  },
  max: {
    minArgs: 2,
    maxArgs: 8,
    evaluate: (args, ctx, node) => {
      if (args.some((value) => !Number.isFinite(value))) {
        return domainFail(ctx, 'max 的参数必须是有效数值', node.position);
      }
      return Math.max(...args);
    },
  },
};

export const FUNCTION_NAMES = Object.freeze(Object.keys(FUNCTIONS));

export function describeArgumentCount(name) {
  const def = FUNCTIONS[name];
  if (!def) return '';
  if (def.minArgs === def.maxArgs) return `${name} 需要 ${def.minArgs} 个参数，例如 ${name}(30)`;
  return `${name} 需要 ${def.minArgs}–${def.maxArgs} 个参数`;
}

/* ---------------- 语法分析 ---------------- */

class Parser {
  constructor(tokens, options = {}) {
    this.tokens = tokens;
    this.index = 0;
    this.options = options;
    this.variables = new Set(options.variables || []);
    this.angleMode = options.angleMode === 'deg' ? 'deg' : 'rad';
  }

  peek(offset = 0) {
    return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)];
  }

  previous() {
    return this.tokens[Math.max(0, this.index - 1)];
  }

  next() {
    const token = this.peek();
    if (token.type !== 'eof') this.index += 1;
    return token;
  }

  isOperator(text) {
    const token = this.peek();
    return token.type === 'op' && token.text === text;
  }

  parseAll() {
    const node = this.parseExpression();
    const token = this.peek();
    if (token.type !== 'eof') {
      if (token.type === 'op' && token.text === ')') {
        throw new ExpressionError('括号不匹配：多余的右括号', token.position);
      }
      if (token.type === 'number') {
        throw new ExpressionError('两个数字之间缺少运算符', token.position);
      }
      throw new ExpressionError(`无法理解的内容「${token.text}」`, token.position);
    }
    return node;
  }

  parseExpression() {
    let node = this.parseTerm();
    while (this.isOperator('+') || this.isOperator('-')) {
      const operator = this.next();
      const right = this.parseTerm();
      node = { type: 'binary', op: operator.text, left: node, right, position: operator.position };
    }
    return node;
  }

  startsImplicitFactor() {
    const token = this.peek();
    if (token.type === 'number' || token.type === 'ident') return true;
    return token.type === 'op' && token.text === '(';
  }

  parseTerm() {
    let node = this.parseUnary();
    for (;;) {
      if (this.isOperator('*') || this.isOperator('/')) {
        const operator = this.next();
        const right = this.parseUnary();
        node = { type: 'binary', op: operator.text, left: node, right, position: operator.position };
        continue;
      }
      if (this.startsImplicitFactor()) {
        const previous = this.previous();
        const nextToken = this.peek();
        if (previous?.type === 'number' && nextToken.type === 'number') break;
        const right = this.parseUnary();
        node = { type: 'binary', op: '*', implicit: true, left: node, right, position: nextToken.position };
        continue;
      }
      break;
    }
    return node;
  }

  parseUnary() {
    if (this.isOperator('+') || this.isOperator('-')) {
      const operator = this.next();
      return { type: 'unary', op: operator.text, operand: this.parseUnary(), position: operator.position };
    }
    return this.parsePower();
  }

  parsePower() {
    const base = this.parsePostfix();
    if (this.isOperator('^')) {
      const operator = this.next();
      const exponent = this.parseUnary();
      return { type: 'binary', op: '^', left: base, right: exponent, position: operator.position };
    }
    return base;
  }

  parsePostfix() {
    let node = this.parsePrimary();
    for (;;) {
      if (this.isOperator('!')) {
        const operator = this.next();
        node = { type: 'factorial', operand: node, position: operator.position };
        continue;
      }
      if (this.isOperator('%')) {
        const operator = this.next();
        node = { type: 'percent', operand: node, position: operator.position };
        continue;
      }
      break;
    }
    return node;
  }

  parseArguments(name) {
    if (!this.isOperator('(')) {
      throw new ExpressionError(`函数「${name}」后面需要括号，例如 ${name}(30)`, this.peek().position);
    }
    this.next();
    const args = [];
    if (!this.isOperator(')')) {
      for (;;) {
        args.push(this.parseExpression());
        if (this.isOperator(',')) {
          this.next();
          continue;
        }
        break;
      }
    }
    if (!this.isOperator(')')) {
      throw new ExpressionError(`函数「${name}」的括号没有闭合`, this.peek().position);
    }
    this.next();
    return args;
  }

  parseIdentifier(token) {
    const name = token.text.toLowerCase();

    if (FUNCTIONS[name]) {
      const args = this.parseArguments(name);
      const def = FUNCTIONS[name];
      if (args.length < def.minArgs || args.length > def.maxArgs) {
        throw new ExpressionError(describeArgumentCount(name), token.position);
      }
      return { type: 'call', name, args, position: token.position };
    }

    const isVariable = this.variables.has(token.text) || this.variables.has(name);
    if (!isVariable && Object.prototype.hasOwnProperty.call(CONSTANTS, name)) {
      return { type: 'constant', name, value: CONSTANTS[name], position: token.position };
    }
    if (isVariable) {
      return { type: 'variable', name: token.text, position: token.position };
    }
    throw new ExpressionError(`未知符号「${token.text}」`, token.position);
  }

  parsePrimary() {
    const token = this.next();

    if (token.type === 'number') {
      return { type: 'number', value: token.value, position: token.position };
    }
    if (token.type === 'ident') {
      return this.parseIdentifier(token);
    }
    if (token.type === 'op' && token.text === '(') {
      const inner = this.parseExpression();
      if (!this.isOperator(')')) {
        throw new ExpressionError('括号不匹配：缺少右括号', this.peek().position);
      }
      this.next();
      return inner;
    }
    if (token.type === 'op' && token.text === ')') {
      throw new ExpressionError('括号不匹配：多余的右括号', token.position);
    }
    if (token.type === 'eof') {
      throw new ExpressionError('表达式不完整', token.position);
    }
    throw new ExpressionError(`无法理解的「${token.text}」`, token.position);
  }
}

/**
 * 解析表达式，返回带 angleMode 元信息的 AST。
 * @param {string} source
 * @param {{ angleMode?: 'deg'|'rad', variables?: string[] }} options
 */
export function parseExpression(source, options = {}) {
  const text = normalizeSource(source);
  if (!text.trim()) throw new ExpressionError('请输入表达式', 0);
  if (text.length > 500) throw new ExpressionError('表达式过长（最多 500 个字符）', 0);
  const tokens = tokenize(text);
  const parser = new Parser(tokens, options);
  const body = parser.parseAll();
  return {
    type: 'program',
    body,
    source: text,
    angleMode: options.angleMode === 'deg' ? 'deg' : 'rad',
  };
}

/* ---------------- 求值 ---------------- */

function evaluateNode(node, ctx) {
  switch (node.type) {
    case 'number':
      return node.value;

    case 'constant':
      return node.value;

    case 'variable': {
      const value = ctx.scope[node.name];
      if (typeof value === 'number') return value;
      return domainFail(ctx, `未知变量「${node.name}」`, node.position);
    }

    case 'unary': {
      const value = evaluateNode(node.operand, ctx);
      if (node.op === '-') {
        if (value === 0) return 0;
        return -value;
      }
      return value;
    }

    case 'binary': {
      if (node.op === '+' || node.op === '-') {
        const left = evaluateNode(node.left, ctx);
        if (node.right.type === 'percent') {
          const percent = evaluateNode(node.right.operand, ctx);
          if (!Number.isFinite(left) || !Number.isFinite(percent)) {
            return domainFail(ctx, '百分数计算需要有效数值', node.position);
          }
          const delta = (left * percent) / 100;
          return finiteResult(
            ctx,
            node.op === '+' ? left + delta : left - delta,
            '结果超出可计算范围',
            node.position,
          );
        }
        const right = evaluateNode(node.right, ctx);
        return finiteResult(
          ctx,
          node.op === '+' ? left + right : left - right,
          '结果超出可计算范围',
          node.position,
        );
      }

      if (node.op === '*') {
        const left = evaluateNode(node.left, ctx);
        const right = evaluateNode(node.right, ctx);
        return finiteResult(ctx, left * right, '结果超出可计算范围', node.position);
      }

      if (node.op === '/') {
        const left = evaluateNode(node.left, ctx);
        const right = evaluateNode(node.right, ctx);
        if (right === 0) return domainFail(ctx, '不能除以 0', node.position);
        return finiteResult(ctx, left / right, '结果超出可计算范围', node.position);
      }

      if (node.op === '^') {
        const left = evaluateNode(node.left, ctx);
        const right = evaluateNode(node.right, ctx);
        const value = Math.pow(left, right);
        if (Number.isNaN(value)) return domainFail(ctx, '幂运算没有实数结果', node.position);
        return finiteResult(ctx, value, '结果超出可计算范围', node.position);
      }

      return domainFail(ctx, `未支持运算符「${node.op}」`, node.position);
    }

    case 'percent': {
      const value = evaluateNode(node.operand, ctx);
      return value / 100;
    }

    case 'factorial': {
      const value = evaluateNode(node.operand, ctx);
      if (!Number.isFinite(value)) return domainFail(ctx, '阶乘需要有效数值', node.position);
      if (!Number.isInteger(value) || value < 0) {
        return domainFail(ctx, '阶乘仅支持非负整数', node.position);
      }
      if (value > 170) return domainFail(ctx, '阶乘结果过大', node.position);
      let result = 1;
      for (let i = 2; i <= value; i += 1) result *= i;
      return result;
    }

    case 'call': {
      const def = FUNCTIONS[node.name];
      if (!def) return domainFail(ctx, `未知函数「${node.name}」`, node.position);
      const args = node.args.map((arg) => evaluateNode(arg, ctx));
      return def.evaluate(args, ctx, node);
    }

    default:
      return domainFail(ctx, '无法求值的表达式', node.position);
  }
}

/**
 * 对 AST 求值。
 * @param {object} ast parseExpression 的返回值
 * @param {Record<string, number>} scope 变量表，例如 { x: 1.5 }
 * @param {{ angleMode?: 'deg'|'rad', throwOnDomain?: boolean }} options
 */
export function evaluate(ast, scope = {}, options = {}) {
  if (!ast) throw new ExpressionError('表达式为空');
  const root = ast.type === 'program' ? ast.body : ast;
  const ctx = {
    scope: scope || {},
    angleMode: options.angleMode || (ast.type === 'program' ? ast.angleMode : 'rad'),
    throwOnDomain: options.throwOnDomain !== false,
  };
  return evaluateNode(root, ctx);
}

/** 解析并求值，计算器与图像共用的便捷入口。 */
export function evaluateExpression(source, scope = {}, options = {}) {
  return evaluate(parseExpression(source, options), scope, options);
}

/* ---------------- 数字格式化 ---------------- */

function tidyExponential(text) {
  return text
    .replace(/\.?0+e/, 'e')
    .replace(/e\+/, 'e')
    .replace(/e-0+(\d)/, 'e-$1');
}

/**
 * 以「人读得懂」的方式格式化数字：抹掉浮点噪声、限制有效位数、
 * 过大或过小时使用科学计数法。
 */
export function formatNumber(value, options = {}) {
  const {
    significant = 12,
    scientificFrom = 1e12,
    scientificBelow = 1e-9,
  } = options;

  if (typeof value !== 'number' || Number.isNaN(value)) return 'NaN';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞';
  if (value === 0) return '0';

  const absolute = Math.abs(value);
  if (absolute >= scientificFrom || absolute < scientificBelow) {
    return tidyExponential(value.toExponential(Math.max(1, significant - 1)));
  }

  const rounded = Number(value.toPrecision(significant));
  if (rounded === 0) return '0';
  const text = String(rounded);
  return text.includes('e') ? tidyExponential(text) : text;
}

/** 计算器结果大屏使用的格式化。 */
export function formatResult(value) {
  return formatNumber(value);
}

/** 宽松判断一个值是否适合绘制（有限数字）。 */
export function isPlottable(value) {
  return typeof value === 'number' && Number.isFinite(value);
}
