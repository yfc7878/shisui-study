import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, Delete, Sigma, Trash2,
} from 'lucide-react';
import { useToast } from '../../contexts/ToastContext.jsx';
import { IconButton, Segmented, cx } from '../../components/ui.jsx';
import {
  ExpressionError, evaluate, formatNumber, parseExpression,
} from './ExpressionParser.js';
import './tools.css';

const HISTORY_KEY = 'shisui.calc.history';
const HISTORY_LIMIT = 20;

const ANGLE_OPTIONS = [
  { value: 'deg', label: 'DEG' },
  { value: 'rad', label: 'RAD' },
];

const FUNCTION_KEYS = [
  { label: 'sin', insert: 'sin(' },
  { label: 'cos', insert: 'cos(' },
  { label: 'tan', insert: 'tan(' },
  { label: 'asin', insert: 'asin(' },
  { label: 'acos', insert: 'acos(' },
  { label: 'atan', insert: 'atan(' },
  { label: 'sinh', insert: 'sinh(' },
  { label: 'cosh', insert: 'cosh(' },
  { label: 'tanh', insert: 'tanh(' },
  { label: 'ln', insert: 'ln(' },
  { label: 'log', insert: 'log(' },
  { label: 'lg', insert: 'lg(' },
  { label: '√', insert: 'sqrt(', aria: '平方根 sqrt' },
  { label: '∛', insert: 'cbrt(', aria: '立方根 cbrt' },
  { label: '|x|', insert: 'abs(', aria: '绝对值 abs' },
  { label: 'exp', insert: 'exp(' },
  { label: 'floor', insert: 'floor(' },
  { label: 'ceil', insert: 'ceil(' },
  { label: 'round', insert: 'round(' },
  { label: 'min', insert: 'min(' },
  { label: 'max', insert: 'max(' },
  { label: 'Ans', insert: 'Ans' },
  { label: 'π', insert: 'π', aria: '圆周率 π' },
  { label: 'e', insert: 'e', aria: '自然常数 e' },
  { label: 'φ', insert: 'φ', aria: '黄金比例 φ' },
];

const KEYPAD = [
  { label: '(', insert: '(', variant: 'util', aria: '左括号' },
  { label: ')', insert: ')', variant: 'util', aria: '右括号' },
  { label: '%', insert: '%', variant: 'util', aria: '百分号' },
  { action: 'backspace', variant: 'util', icon: Delete, aria: '退格' },
  { label: 'AC', action: 'clear', variant: 'danger', aria: '清空表达式' },
  { label: '7' },
  { label: '8' },
  { label: '9' },
  { label: '÷', insert: '/', variant: 'op', aria: '除' },
  { label: '^', insert: '^', variant: 'op', aria: '乘方' },
  { label: '4' },
  { label: '5' },
  { label: '6' },
  { label: '×', insert: '*', variant: 'op', aria: '乘' },
  { label: '!', insert: '!', variant: 'op', aria: '阶乘' },
  { label: '1' },
  { label: '2' },
  { label: '3' },
  { label: '−', insert: '-', variant: 'op', aria: '减' },
  { label: 'Ans', insert: 'Ans', variant: 'util' },
  { label: '0' },
  { label: '.', insert: '.' },
  { label: 'π', insert: 'π', variant: 'util', aria: '圆周率 π' },
  { label: '+', insert: '+', variant: 'op', aria: '加' },
  { label: '=', action: 'compute', variant: 'equals', aria: '计算结果' },
];

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((item) => item && typeof item.expression === 'string' && typeof item.result === 'string')
      .slice(0, HISTORY_LIMIT)
      .map((item) => ({
        expression: item.expression.slice(0, 500),
        result: item.result.slice(0, 90),
        at: Number(item.at) || 0,
      }));
  } catch {
    return [];
  }
}

export default function Calculator({ active = true }) {
  const { toast } = useToast();
  const [expression, setExpression] = useState('');
  const [angleMode, setAngleMode] = useState('deg');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [ans, setAns] = useState(0);
  const [memory, setMemory] = useState(0);
  const [history, setHistory] = useState(loadHistory);

  const inputRef = useRef(null);
  const caretRef = useRef({ start: 0, end: 0 });
  const insertRef = useRef(null);
  const computeRef = useRef(null);
  const clearRef = useRef(null);
  const backspaceRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      /* 本地存储不可用时静默 */
    }
  }, [history]);

  const preview = useMemo(() => {
    const source = expression.trim();
    if (!source) return { value: null, error: null };
    try {
      const ast = parseExpression(source, { angleMode, variables: ['Ans'] });
      const value = evaluate(ast, { Ans: ans }, { angleMode });
      return { value: Number.isFinite(value) ? value : null, error: null };
    } catch (caught) {
      return { value: null, error: caught instanceof ExpressionError ? caught.message : '表达式有误' };
    }
  }, [angleMode, ans, expression]);

  const focusInput = useCallback((caret) => {
    window.requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) return;
      try {
        node.focus({ preventScroll: true });
        node.setSelectionRange(caret, caret);
      } catch {
        /* ignore */
      }
    });
  }, []);

  const replaceSelection = useCallback((text) => {
    const node = inputRef.current;
    const focused = node && document.activeElement === node;
    const start = focused ? (node.selectionStart ?? expression.length) : caretRef.current.start;
    const end = focused ? (node.selectionEnd ?? start) : caretRef.current.end;
    const from = Math.min(start, end);
    const to = Math.max(start, end);
    const next = expression.slice(0, from) + text + expression.slice(to);
    if (next.length > 500) return;
    setExpression(next);
    setError(null);
    const caret = from + text.length;
    caretRef.current = { start: caret, end: caret };
    focusInput(caret);
  }, [expression, focusInput]);

  const backspace = useCallback(() => {
    const node = inputRef.current;
    const focused = node && document.activeElement === node;
    let start = focused ? (node.selectionStart ?? 0) : caretRef.current.start;
    let end = focused ? (node.selectionEnd ?? start) : caretRef.current.end;
    const from = Math.min(start, end);
    const to = Math.max(start, end);
    const nextFrom = from === to ? Math.max(0, from - 1) : from;
    const next = expression.slice(0, nextFrom) + expression.slice(to);
    setExpression(next);
    setError(null);
    caretRef.current = { start: nextFrom, end: nextFrom };
    focusInput(nextFrom);
  }, [expression, focusInput]);

  const clearAll = useCallback(() => {
    setExpression('');
    setError(null);
    setResult(null);
    caretRef.current = { start: 0, end: 0 };
    focusInput(0);
  }, [focusInput]);

  const compute = useCallback(() => {
    const source = expression.trim();
    if (!source) {
      focusInput(0);
      return;
    }
    try {
      const ast = parseExpression(source, { angleMode, variables: ['Ans'] });
      const value = evaluate(ast, { Ans: ans }, { angleMode });
      if (!Number.isFinite(value)) throw new ExpressionError('结果超出可计算范围');
      const text = formatNumber(value);
      setResult({ value, text, expression: source });
      setAns(value);
      setError(null);
      setHistory((previous) => [
        { expression: source, result: text, at: Date.now() },
        ...previous,
      ].slice(0, HISTORY_LIMIT));
      focusInput(source.length);
    } catch (caught) {
      setError(caught instanceof ExpressionError ? caught.message : '表达式有误');
      focusInput(caretRef.current.start);
    }
  }, [angleMode, ans, expression, focusInput]);

  insertRef.current = replaceSelection;
  computeRef.current = compute;
  clearRef.current = clearAll;
  backspaceRef.current = backspace;

  /* 全局键盘：焦点不在输入框时也能继续输入 / 计算 */
  useEffect(() => {
    if (!active) return undefined;
    const handler = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const onButton = target instanceof Element && Boolean(target.closest('button, a, [role="button"]'));

      if (event.key === 'Enter') {
        if (onButton) return;
        event.preventDefault();
        computeRef.current?.();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        clearRef.current?.();
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        backspaceRef.current?.();
        return;
      }
      if (event.key.length !== 1) return;
      if (!/[0-9+\-*/^%!().,a-zA-Zπφ√]/.test(event.key)) return;
      if (event.key === '√') {
        event.preventDefault();
        insertRef.current?.('sqrt(');
        return;
      }
      event.preventDefault();
      insertRef.current?.(event.key);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active]);

  /* 桌面端切到计算器时自动聚焦输入框 */
  useEffect(() => {
    if (!active) return;
    if (typeof window === 'undefined' || !window.matchMedia) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    const node = inputRef.current;
    if (node) window.requestAnimationFrame(() => node.focus({ preventScroll: true }));
  }, [active]);

  const memoryValue = () => {
    if (preview.value !== null) return preview.value;
    if (result && Number.isFinite(result.value)) return result.value;
    return null;
  };

  const addToMemory = (sign) => {
    const value = memoryValue();
    if (value === null) return;
    setMemory((previous) => {
      const next = previous + sign * value;
      return Number.isFinite(next) ? next : previous;
    });
  };

  const recallMemory = () => {
    const text = Number.isFinite(memory) ? String(memory) : '0';
    replaceSelection(memory < 0 ? `(${text})` : text);
  };

  const clearMemory = () => setMemory(0);

  const clearHistory = () => {
    setHistory([]);
    toast('计算历史已清空', 'info');
  };

  const recallHistory = (item) => {
    setExpression(item.expression);
    setError(null);
    caretRef.current = { start: item.expression.length, end: item.expression.length };
    focusInput(item.expression.length);
  };

  const displayText = preview.value !== null
    ? formatNumber(preview.value)
    : result?.text || '0';
  const displaySize = displayText.length > 20 ? 'is-xlong' : displayText.length > 13 ? 'is-long' : '';
  const shownError = error;

  const renderKey = (key, index) => {
    const Icon = key.icon;
    return (
      <button
        key={`${key.label || key.action}-${index}`}
        type="button"
        className={cx('tool-key', key.variant && `tool-key-${key.variant}`)}
        aria-label={key.aria || key.label || key.action}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (key.action === 'backspace') backspaceRef.current?.();
          else if (key.action === 'clear') clearRef.current?.();
          else if (key.action === 'compute') computeRef.current?.();
          else replaceSelection(key.insert ?? key.label);
        }}
      >
        {Icon ? <Icon size={18} /> : key.label}
      </button>
    );
  };

  return (
    <div className="tool-calc-grid">
      <div className="card card-padded tool-calc-card">
        <div className={cx('tool-calc-display', shownError && 'has-error')}>
          <div className="tool-calc-display-top">
            <span className="tool-calc-tag">{angleMode === 'deg' ? 'DEG' : 'RAD'}</span>
            <button
              type="button"
              className="tool-calc-ans"
              onClick={() => replaceSelection('Ans')}
              title="把 Ans 插入表达式"
            >
              Ans = {formatNumber(ans)}
            </button>
            {memory !== 0 && (
              <span className="tool-calc-memory-tag">
                M {formatNumber(memory)}
                <button type="button" onClick={clearMemory} aria-label="清除内存">×</button>
              </span>
            )}
          </div>

          <input
            ref={inputRef}
            className="tool-calc-expression"
            value={expression}
            onChange={(event) => {
              setExpression(event.target.value);
              if (error) setError(null);
              const node = event.target;
              caretRef.current = {
                start: node.selectionStart ?? 0,
                end: node.selectionEnd ?? 0,
              };
            }}
            onSelect={(event) => {
              const node = event.currentTarget;
              caretRef.current = {
                start: node.selectionStart ?? 0,
                end: node.selectionEnd ?? 0,
              };
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                computeRef.current?.();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                clearRef.current?.();
              }
            }}
            placeholder="例如 2sin(30)+ln(e)，或 (12+8)/5"
            aria-label="数学表达式"
            aria-invalid={Boolean(shownError)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={500}
          />

          <div className="tool-calc-result-row">
            <span className="tool-calc-equals" aria-hidden="true">=</span>
            <strong
              className={cx('tool-calc-result', displaySize)}
              title={displayText}
              aria-live="polite"
            >
              {displayText}
            </strong>
          </div>

          <div className="tool-calc-message">
            {shownError ? (
              <span className="tool-calc-error" role="alert">
                <AlertCircle size={13} />
                {shownError}
              </span>
            ) : (
              <span className="tool-calc-hint">
                {angleMode === 'deg' ? '三角函数按角度计算' : '三角函数按弧度计算'}
                {' · '}Enter 计算 · Esc 清空
              </span>
            )}
          </div>
        </div>

        <div className="tool-calc-toolbar">
          <Segmented
            options={ANGLE_OPTIONS}
            value={angleMode}
            onChange={(value) => { setAngleMode(value); setError(null); }}
            ariaLabel="角度或弧度"
            className="tool-angle-segmented"
          />
          <div className="tool-calc-memory-row" role="group" aria-label="内存">
            <button type="button" className="tool-key tool-key-memory" onMouseDown={(e) => e.preventDefault()} onClick={() => addToMemory(1)} aria-label="M+ 把当前结果计入内存" title="M+">M+</button>
            <button type="button" className="tool-key tool-key-memory" onMouseDown={(e) => e.preventDefault()} onClick={() => addToMemory(-1)} aria-label="M− 从内存中减去当前结果" title="M−">M−</button>
            <button type="button" className="tool-key tool-key-memory" onMouseDown={(e) => e.preventDefault()} onClick={recallMemory} aria-label="MR 读取内存" title="MR">MR</button>
            <button type="button" className="tool-key tool-key-memory" onMouseDown={(e) => e.preventDefault()} onClick={clearMemory} aria-label="MC 清除内存" title="MC">MC</button>
          </div>
        </div>

        <div className="tool-calc-functions" role="group" aria-label="函数与常量">
          {FUNCTION_KEYS.map((key) => (
            <button
              key={key.label}
              type="button"
              className="tool-key tool-key-fn"
              aria-label={key.aria || `插入函数 ${key.label}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => replaceSelection(key.insert)}
            >
              {key.label}
            </button>
          ))}
        </div>

        <div className="tool-calc-keypad" role="group" aria-label="数字与运算符">
          {KEYPAD.map(renderKey)}
        </div>
      </div>

      <aside className="tool-calc-side">
        <div className="card tool-calc-history-card">
          <div className="tool-card-head">
            <div>
              <h2 className="tool-card-title">历史记录</h2>
              <p className="tool-card-sub">最近 {HISTORY_LIMIT} 条 · 点击回填</p>
            </div>
            {history.length > 0 && (
              <IconButton icon={Trash2} size="sm" label="清空计算历史" onClick={clearHistory} />
            )}
          </div>

          {history.length === 0 ? (
            <div className="tool-history-empty">
              <span className="tool-history-glyph" aria-hidden="true">∑</span>
              <strong>还没有计算</strong>
              <p>算出结果后，式子会安静地留在这里。</p>
            </div>
          ) : (
            <div className="tool-history-list">
              {history.map((item, index) => (
                <button
                  key={`${item.expression}-${item.at}-${index}`}
                  type="button"
                  className="tool-history-item"
                  onClick={() => recallHistory(item)}
                  title="点击回填表达式"
                >
                  <span className="tool-history-expression">{item.expression}</span>
                  <span className="tool-history-result">= {item.result}</span>
                </button>
              ))}
            </div>
          )}

          <p className="tool-calc-tip">
            支持 sin / cos / tan、ln / log、√、!、% 与 π / e / φ。
            百分号按上下文理解：<span className="mono">200+10% = 220</span>。
          </p>
        </div>

        <div className="card tool-calc-guide">
          <div className="tool-calc-guide-head">
            <h2 className="tool-card-title">计算小抄</h2>
            <Sigma size={17} aria-hidden="true" />
          </div>
          <ul className="tool-calc-guide-list">
            <li>
              <span>隐式乘法</span>
              <code>2π</code>
              <code>3(4+5)</code>
              <code>2x</code>
            </li>
            <li>
              <span>百分号</span>
              <code>200+10%</code>
              <em>= 220</em>
            </li>
            <li>
              <span>角度</span>
              <code>sin(30)</code>
              <em>DEG 下 = 0.5</em>
            </li>
            <li>
              <span>上次结果</span>
              <code>Ans</code>
              <em>可直接继续算</em>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
