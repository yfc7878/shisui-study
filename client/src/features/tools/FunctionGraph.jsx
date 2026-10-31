import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Download, Eye, EyeOff, ImageDown, LineChart, Plus, RotateCcw, Trash2, ZoomIn, ZoomOut,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { IconButton, cx } from '../../components/ui.jsx';
import { triggerDownload } from '../../lib/api.js';
import { evaluate, formatNumber, parseExpression } from './ExpressionParser.js';
import './tools.css';

const DEFAULT_VIEW = { xMin: -10, xMax: 10, yMin: -6, yMax: 6 };
const MAX_CURVES = 4;

const TOKEN_VARS = {
  surface: '--surface',
  surface2: '--surface-2',
  line: '--line',
  lineStrong: '--line-strong',
  ink: '--ink',
  muted: '--muted',
  faint: '--faint',
  primary: '--primary',
  accent: '--accent',
  blue: '--blue',
  gold: '--gold',
  danger: '--danger',
};

const FALLBACK_TOKENS = {
  surface: '#fffdf8',
  surface2: '#f7f3ea',
  line: '#e5ded0',
  lineStrong: '#d3c9b8',
  ink: '#1e2d27',
  muted: '#7a8981',
  faint: '#9aa69f',
  primary: '#235b49',
  accent: '#cc7152',
  blue: '#466c9a',
  gold: '#a9833d',
  danger: '#ad4a42',
};

const PRESETS = ['sin(x)', 'x^2-2x-3', '1/x', 'sqrt(x)', 'e^x', 'ln(x)', 'tan(x)'];

function readTokens() {
  if (typeof window === 'undefined') return FALLBACK_TOKENS;
  const styles = window.getComputedStyle(document.documentElement);
  const next = {};
  for (const [key, variable] of Object.entries(TOKEN_VARS)) {
    const value = styles.getPropertyValue(variable).trim();
    next[key] = value || FALLBACK_TOKENS[key];
  }
  return next;
}

function niceStep(rawStep) {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  const normalized = rawStep / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

function buildTicks(min, max, step) {
  const ticks = [];
  if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(min) || !Number.isFinite(max)) return ticks;
  const first = Math.ceil(min / step) * step;
  const count = Math.floor((max - first) / step) + 1;
  if (count <= 0 || count > 500) return ticks;
  for (let index = 0; index < count; index += 1) {
    const value = first + index * step;
    if (value < min - step * 1e-6 || value > max + step * 1e-6) continue;
    ticks.push(Number(value.toPrecision(12)) || 0);
  }
  return ticks;
}

function formatCoord(value) {
  return formatNumber(value, { significant: 6, scientificFrom: 1e5, scientificBelow: 1e-4 });
}

function rangeToDraft(range) {
  const field = (value) => {
    const rounded = Number(value.toPrecision(8));
    return String(Object.is(rounded, -0) ? 0 : rounded);
  };
  return {
    xMin: field(range.xMin),
    xMax: field(range.xMax),
    yMin: field(range.yMin),
    yMax: field(range.yMax),
  };
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function RangeEditor({ view, onApply, onReset }) {
  const [draft, setDraft] = useState(() => rangeToDraft(view));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editing) return;
    setDraft(rangeToDraft(view));
    setError('');
  }, [editing, view]);

  const apply = () => {
    const numbers = {};
    for (const key of ['xMin', 'xMax', 'yMin', 'yMax']) {
      const value = Number(draft[key]);
      if (!Number.isFinite(value)) {
        setError('请输入有效的数字');
        return;
      }
      numbers[key] = value;
    }
    if (numbers.xMin >= numbers.xMax) {
      setError('X 轴需要 最小 < 最大');
      return;
    }
    if (numbers.yMin >= numbers.yMax) {
      setError('Y 轴需要 最小 < 最大');
      return;
    }
    if (numbers.xMax - numbers.xMin < 1e-6 || numbers.yMax - numbers.yMin < 1e-6) {
      setError('范围太小，看不清了');
      return;
    }
    setError('');
    setEditing(false);
    onApply(numbers);
  };

  const reset = () => {
    setEditing(false);
    setError('');
    setDraft(rangeToDraft(DEFAULT_VIEW));
    onReset();
  };

  const cancel = () => {
    setEditing(false);
    setError('');
  };

  const fields = [
    { key: 'xMin', label: 'X 最小' },
    { key: 'xMax', label: 'X 最大' },
    { key: 'yMin', label: 'Y 最小' },
    { key: 'yMax', label: 'Y 最大' },
  ];

  return (
    <div className="tool-range-editor">
      <div className="tool-range-grid">
        {fields.map((field) => (
          <label className="field" key={field.key}>
            <span className="field-label">{field.label}</span>
            <input
              className="input input-sm tool-range-input"
              type="number"
              step="any"
              inputMode="decimal"
              value={draft[field.key]}
              onFocus={() => setEditing(true)}
              onChange={(event) => {
                setEditing(true);
                setDraft((previous) => ({ ...previous, [field.key]: event.target.value }));
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  apply();
                  event.currentTarget.blur();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  cancel();
                  event.currentTarget.blur();
                }
              }}
              aria-label={`${field.label} 视窗范围`}
            />
          </label>
        ))}
      </div>
      <div className="tool-range-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={apply}>应用范围</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>默认视图</button>
      </div>
      {error && <p className="tool-range-error" role="alert">{error}</p>}
    </div>
  );
}

export default function FunctionGraph() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const reactId = useId();
  const clipId = `tool-graph-clip-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const [tokens, setTokens] = useState(readTokens);
  const [curves, setCurves] = useState(() => [{ id: 'curve-1', expression: 'sin(x)', colorIndex: 0, visible: true }]);
  const [view, setView] = useState(DEFAULT_VIEW);
  const [hover, setHover] = useState(null);
  const [point, setPoint] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState({ width: 820, height: 460 });
  const [exporting, setExporting] = useState(false);

  const curveIdRef = useRef(1);
  const stageRef = useRef(null);
  const svgRef = useRef(null);
  const dragRef = useRef(null);

  const palette = useMemo(
    () => [tokens.primary, tokens.accent, tokens.blue, tokens.gold],
    [tokens],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setTokens(readTokens()));
    return () => window.cancelAnimationFrame(frame);
  }, [theme]);

  const parsedCurves = useMemo(() => curves.map((curve) => {
    const raw = curve.expression.trim();
    const source = raw.replace(/^\s*y\s*=\s*/i, '').trim();
    if (!source) return { ...curve, source: '', ast: null, error: null };
    try {
      const ast = parseExpression(source, { variables: ['x'], angleMode: 'rad' });
      return { ...curve, source, ast, error: null };
    } catch (caught) {
      return { ...curve, source, ast: null, error: caught?.message || '表达式有误' };
    }
  }), [curves]);

  /* 尺寸测量：宽度自适应，高度由 CSS clamp 决定 */
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return undefined;
    const measure = () => {
      const width = Math.round(element.clientWidth);
      const height = Math.round(element.clientHeight);
      if (width < 40 || height < 40) return;
      setSize((previous) => (previous.width === width && previous.height === height ? previous : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const plot = useMemo(() => {
    const pad = size.width < 520
      ? { left: 38, right: 12, top: 12, bottom: 26 }
      : { left: 52, right: 18, top: 16, bottom: 32 };
    return {
      x: pad.left,
      y: pad.top,
      w: Math.max(20, size.width - pad.left - pad.right),
      h: Math.max(20, size.height - pad.top - pad.bottom),
    };
  }, [size.height, size.width]);

  const xToPx = useCallback((x) => (
    plot.x + ((x - view.xMin) / (view.xMax - view.xMin)) * plot.w
  ), [plot, view]);

  const yToPx = useCallback((y) => (
    plot.y + plot.h - ((y - view.yMin) / (view.yMax - view.yMin)) * plot.h
  ), [plot, view]);

  const pxToX = useCallback((px) => (
    view.xMin + ((px - plot.x) / plot.w) * (view.xMax - view.xMin)
  ), [plot, view]);

  const applyView = useCallback((next) => {
    const values = [next.xMin, next.xMax, next.yMin, next.yMax];
    if (!values.every(Number.isFinite)) return;
    const xSpan = next.xMax - next.xMin;
    const ySpan = next.yMax - next.yMin;
    if (xSpan < 1e-7 || ySpan < 1e-7) return;
    if (xSpan > 1e9 || ySpan > 1e9) return;
    setView(next);
  }, []);

  const zoomAt = useCallback((px, py, factor) => {
    const x = pxToX(px);
    const y = view.yMax - ((py - plot.y) / plot.h) * (view.yMax - view.yMin);
    applyView({
      xMin: x - (x - view.xMin) * factor,
      xMax: x + (view.xMax - x) * factor,
      yMin: y - (y - view.yMin) * factor,
      yMax: y + (view.yMax - y) * factor,
    });
  }, [applyView, plot, pxToX, view]);

  const zoomBy = useCallback((factor) => {
    zoomAt(plot.x + plot.w / 2, plot.y + plot.h / 2, factor);
  }, [plot, zoomAt]);

  const resetView = useCallback(() => {
    setView(DEFAULT_VIEW);
    setPoint(null);
    setHover(null);
  }, []);

  const xStep = useMemo(
    () => niceStep((view.xMax - view.xMin) / Math.max(3, plot.w / 88)),
    [plot.w, view.xMax, view.xMin],
  );
  const yStep = useMemo(
    () => niceStep((view.yMax - view.yMin) / Math.max(3, plot.h / 62)),
    [plot.h, view.yMax, view.yMin],
  );

  const xTicks = useMemo(() => buildTicks(view.xMin, view.xMax, xStep), [view.xMax, view.xMin, xStep]);
  const yTicks = useMemo(() => buildTicks(view.yMin, view.yMax, yStep), [view.yMax, view.yMin, yStep]);

  const xMinorVisible = (xStep / 5 / (view.xMax - view.xMin)) * plot.w >= 5;
  const yMinorVisible = (yStep / 5 / (view.yMax - view.yMin)) * plot.h >= 5;

  const xMinorTicks = useMemo(() => {
    if (!xMinorVisible) return [];
    return buildTicks(view.xMin, view.xMax, xStep / 5)
      .filter((value) => Math.abs(value / xStep - Math.round(value / xStep)) > 1e-6);
  }, [view.xMax, view.xMin, xMinorVisible, xStep]);

  const yMinorTicks = useMemo(() => {
    if (!yMinorVisible) return [];
    return buildTicks(view.yMin, view.yMax, yStep / 5)
      .filter((value) => Math.abs(value / yStep - Math.round(value / yStep)) > 1e-6);
  }, [view.yMax, view.yMin, yMinorVisible, yStep]);

  const series = useMemo(() => {
    const xSpan = view.xMax - view.xMin;
    const ySpan = view.yMax - view.yMin;
    const yLimit = ySpan * 40;
    const steps = Math.max(160, Math.min(1400, Math.round(plot.w * 1.25)));

    return parsedCurves.map((curve) => {
      if (!curve.ast || !curve.visible) return { ...curve, path: '' };
      const segments = [];
      let current = [];
      let previous = null;

      for (let index = 0; index <= steps; index += 1) {
        const fraction = index / steps;
        const x = view.xMin + fraction * xSpan;
        let y = NaN;
        try {
          y = evaluate(curve.ast, { x }, { throwOnDomain: false });
        } catch {
          y = NaN;
        }
        const px = plot.x + fraction * plot.w;
        const py = yToPx(y);
        const plottable = Number.isFinite(y) && Math.abs(y) <= yLimit && Number.isFinite(py);

        if (!plottable) {
          if (current.length > 1) segments.push(current);
          current = [];
          previous = null;
          continue;
        }

        if (previous) {
          const jump = Math.abs(py - previous.py);
          const crossesAsymptote = jump > plot.h * 3.2
            && Math.sign(y) !== Math.sign(previous.y)
            && Math.abs(y - previous.y) > ySpan * 2;
          if (crossesAsymptote) {
            if (current.length > 1) segments.push(current);
            current = [];
            previous = null;
          }
        }

        current.push([px, py]);
        previous = { py, y };
      }

      if (current.length > 1) segments.push(current);
      const path = segments.map((segment) => segment
        .map(([px, py], index) => `${index === 0 ? 'M' : 'L'}${px.toFixed(2)} ${py.toFixed(2)}`)
        .join(' ')).join(' ');

      return { ...curve, path };
    });
  }, [parsedCurves, plot.h, plot.w, plot.x, view.xMax, view.xMin, view.yMax, view.yMin, yToPx]);

  const hasPath = series.some((curve) => curve.path);
  const emptyHint = !hasPath
    ? (parsedCurves.some((curve) => curve.ast) ? '所有曲线都被隐藏了' : '输入一个函数，开始画图')
    : '';

  const computeReadings = useCallback((px, py) => {
    const x = pxToX(px);
    const readings = parsedCurves
      .filter((curve) => curve.visible && curve.ast)
      .map((curve) => {
        let y = NaN;
        try {
          y = evaluate(curve.ast, { x }, { throwOnDomain: false });
        } catch {
          y = NaN;
        }
        return { curve, y, py: yToPx(y) };
      });
    const nearest = readings
      .filter((item) => Number.isFinite(item.y) && Number.isFinite(item.py))
      .sort((a, b) => Math.abs(a.py - py) - Math.abs(b.py - py))[0] || null;
    return { x, readings, nearest };
  }, [parsedCurves, pxToX, yToPx]);

  const locate = (px, py) => {
    const readings = parsedCurves
      .filter((curve) => curve.visible && curve.ast)
      .map((curve) => {
        let y = NaN;
        try {
          y = evaluate(curve.ast, { x: pxToX(px) }, { throwOnDomain: false });
        } catch {
          y = NaN;
        }
        return { curve, y, py: yToPx(y) };
      })
      .filter((item) => Number.isFinite(item.y) && Number.isFinite(item.py) && Math.abs(item.py - py) <= 48)
      .sort((a, b) => Math.abs(a.py - py) - Math.abs(b.py - py));
    if (!readings.length) {
      setPoint(null);
      return;
    }
    const chosen = readings[0];
    setPoint({
      curveId: chosen.curve.id,
      x: pxToX(px),
      y: chosen.y,
      colorIndex: chosen.curve.colorIndex,
    });
  };

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    if (px < plot.x || px > plot.x + plot.w || py < plot.y || py > plot.y + plot.h) return;
    dragRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      view,
      moved: false,
    };
    setDragging(true);
    setHover(null);
    try { stage.setPointerCapture(event.pointerId); } catch { /* ignore */ }
  };

  const handlePointerMove = (event) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;

    const drag = dragRef.current;
    if (drag) {
      const dx = event.clientX - drag.clientX;
      const dy = event.clientY - drag.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.moved) {
        const xShift = (-dx * (drag.view.xMax - drag.view.xMin)) / plot.w;
        const yShift = (dy * (drag.view.yMax - drag.view.yMin)) / plot.h;
        applyView({
          xMin: drag.view.xMin + xShift,
          xMax: drag.view.xMax + xShift,
          yMin: drag.view.yMin + yShift,
          yMax: drag.view.yMax + yShift,
        });
      }
      return;
    }

    if (px < plot.x || px > plot.x + plot.w || py < plot.y || py > plot.y + plot.h) {
      setHover(null);
      return;
    }
    setHover({ px, py, ...computeReadings(px, py) });
  };

  const handlePointerUp = (event) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    try { stageRef.current?.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
    if (!drag || drag.moved) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    if (px < plot.x || px > plot.x + plot.w || py < plot.y || py > plot.y + plot.h) return;
    locate(px, py);
  };

  const handlePointerLeave = () => {
    if (dragRef.current) return;
    setHover(null);
  };

  /* 滚轮缩放：需要非 passive 监听，避免页面跟着滚动 */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const onWheel = (event) => {
      const rect = stage.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      if (px < plot.x || px > plot.x + plot.w || py < plot.y || py > plot.y + plot.h) return;
      event.preventDefault();
      zoomAt(px, py, event.deltaY > 0 ? 1.14 : 1 / 1.14);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [plot, zoomAt]);

  /* 曲线操作 */
  const addCurve = (expression = '') => {
    if (curves.length >= MAX_CURVES) {
      toast(`最多同时绘制 ${MAX_CURVES} 条曲线`, 'info');
      return;
    }
    const used = new Set(curves.map((curve) => curve.colorIndex));
    const colorIndex = [0, 1, 2, 3].find((index) => !used.has(index)) ?? 0;
    curveIdRef.current += 1;
    setCurves((previous) => [
      ...previous,
      { id: `curve-${curveIdRef.current}`, expression, colorIndex, visible: true },
    ]);
    setPoint(null);
  };

  const updateCurve = (id, patch) => {
    setCurves((previous) => previous.map((curve) => (curve.id === id ? { ...curve, ...patch } : curve)));
  };

  const removeCurve = (id) => {
    setCurves((previous) => {
      if (previous.length <= 1) return previous;
      return previous.filter((curve) => curve.id !== id);
    });
    setPoint((previous) => (previous?.curveId === id ? null : previous));
  };

  /* 导出 */
  const buildSvgSource = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return null;
    const clone = svg.cloneNode(true);
    clone.querySelectorAll('[data-export="skip"]').forEach((node) => node.remove());
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(size.width));
    clone.setAttribute('height', String(size.height));
    clone.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    background.setAttribute('x', '0');
    background.setAttribute('y', '0');
    background.setAttribute('width', String(size.width));
    background.setAttribute('height', String(size.height));
    background.setAttribute('fill', tokens.surface);
    clone.insertBefore(background, clone.firstChild);
    return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
  }, [size.height, size.width, tokens.surface]);

  const exportSvg = () => {
    const source = buildSvgSource();
    if (!source) return;
    try {
      triggerDownload(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }), `function-graph-${dateStamp()}.svg`);
      toast('SVG 已导出', 'success');
    } catch {
      toast('SVG 导出失败，请重试', 'error');
    }
  };

  const exportPng = () => {
    const source = buildSvgSource();
    if (!source) return;
    setExporting(true);
    const image = new Image();
    image.onload = () => {
      try {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(size.width * scale);
        canvas.height = Math.round(size.height * scale);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas unavailable');
        context.fillStyle = tokens.surface;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          setExporting(false);
          if (!blob) {
            toast('PNG 导出失败，请重试', 'error');
            return;
          }
          triggerDownload(blob, `function-graph-${dateStamp()}.png`);
          toast('PNG 已导出', 'success');
        }, 'image/png');
      } catch {
        setExporting(false);
        toast('PNG 导出失败，请重试', 'error');
      }
    };
    image.onerror = () => {
      setExporting(false);
      toast('PNG 导出失败，请重试', 'error');
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  };

  /* 键盘平移 / 缩放 */
  const handleStageKeyDown = (event) => {
    const step = 0.07;
    const xSpan = view.xMax - view.xMin;
    const ySpan = view.yMax - view.yMin;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
      applyView({
        xMin: view.xMin + xSpan * dx,
        xMax: view.xMax + xSpan * dx,
        yMin: view.yMin + ySpan * dy,
        yMax: view.yMax + ySpan * dy,
      });
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomBy(0.82);
      return;
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomBy(1.22);
      return;
    }
    if (event.key === '0') {
      event.preventDefault();
      resetView();
    }
  };

  const originX = xToPx(0);
  const originY = yToPx(0);
  const xAxisVisible = originY >= plot.y && originY <= plot.y + plot.h;
  const yAxisVisible = originX >= plot.x && originX <= plot.x + plot.w;
  const axisY = xAxisVisible ? originY : plot.y + plot.h;
  const axisX = yAxisVisible ? originX : plot.x;
  const xLabelY = axisY > plot.y + plot.h - 18 ? axisY - 8 : axisY + 15;
  const yLabelX = yAxisVisible ? Math.max(axisX - 8, plot.x + 26) : plot.x - 8;

  const pointPx = point ? { x: xToPx(point.x), y: yToPx(point.y) } : null;
  const pointCardStyle = pointPx ? {
    left: Math.min(Math.max(pointPx.x + 12, 8), Math.max(8, size.width - 172)),
    top: Math.min(Math.max(pointPx.y > 80 ? pointPx.y - 44 : pointPx.y + 16, 8), Math.max(8, size.height - 50)),
  } : undefined;
  const pointColor = point ? palette[point.colorIndex] || palette[0] : palette[0];

  const tooltipStyle = hover ? {
    left: Math.min(Math.max(hover.px + 16, 8), Math.max(8, size.width - 210)),
    top: Math.min(Math.max(hover.py > 150 ? hover.py - 14 : hover.py + 14, 8), Math.max(8, size.height - 150)),
  } : undefined;

  const hoverNearest = hover?.nearest || null;
  const viewText = `X ∈ [${formatCoord(view.xMin)}, ${formatCoord(view.xMax)}]  ·  Y ∈ [${formatCoord(view.yMin)}, ${formatCoord(view.yMax)}]`;

  return (
    <div className="tool-graph-layout">
      <div className="card tool-graph-card">
        <div className="tool-card-head tool-graph-head">
          <div>
            <h2 className="tool-card-title">函数图像</h2>
            <p className="tool-card-sub">最多 {MAX_CURVES} 条曲线 · 拖动平移 · 滚轮缩放</p>
          </div>
          <div className="tool-graph-toolbar" role="group" aria-label="图形操作">
            <IconButton icon={ZoomIn} label="放大" onClick={() => zoomBy(0.8)} />
            <IconButton icon={ZoomOut} label="缩小" onClick={() => zoomBy(1.25)} />
            <IconButton icon={RotateCcw} label="重置视图" onClick={resetView} />
            <IconButton icon={Download} label="导出 SVG" onClick={exportSvg} />
            <IconButton
              icon={ImageDown}
              label={exporting ? '正在导出 PNG' : '导出 PNG'}
              onClick={exportPng}
              disabled={exporting}
              className={exporting ? 'is-spinning' : undefined}
            />
          </div>
        </div>

        <div
          ref={stageRef}
          className={cx('tool-graph-stage', dragging && 'is-dragging')}
          tabIndex={0}
          role="application"
          aria-label="函数图像画布，方向键平移，加号减号缩放，数字 0 重置"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onKeyDown={handleStageKeyDown}
        >
          <svg
            ref={svgRef}
            className="tool-graph-svg"
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
            role="img"
            aria-label={`函数图像，当前视窗 ${viewText}`}
            fontFamily="Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif"
          >
            <defs>
              <clipPath id={clipId}>
                <rect x={plot.x} y={plot.y} width={plot.w} height={plot.h} />
              </clipPath>
            </defs>

            <rect x="0" y="0" width={size.width} height={size.height} fill={tokens.surface} />
            <rect x={plot.x} y={plot.y} width={plot.w} height={plot.h} fill={tokens.surface} />

            {/* 次网格 */}
            <g aria-hidden="true">
              {xMinorTicks.map((value) => (
                <line
                  key={`xm-${value}`}
                  x1={xToPx(value)}
                  x2={xToPx(value)}
                  y1={plot.y}
                  y2={plot.y + plot.h}
                  stroke={tokens.line}
                  strokeWidth="1"
                  strokeOpacity="0.5"
                />
              ))}
              {yMinorTicks.map((value) => (
                <line
                  key={`ym-${value}`}
                  x1={plot.x}
                  x2={plot.x + plot.w}
                  y1={yToPx(value)}
                  y2={yToPx(value)}
                  stroke={tokens.line}
                  strokeWidth="1"
                  strokeOpacity="0.5"
                />
              ))}
            </g>

            {/* 主网格 */}
            <g aria-hidden="true">
              {xTicks.filter((value) => value !== 0).map((value) => (
                <line
                  key={`x-${value}`}
                  x1={xToPx(value)}
                  x2={xToPx(value)}
                  y1={plot.y}
                  y2={plot.y + plot.h}
                  stroke={tokens.line}
                  strokeWidth="1"
                />
              ))}
              {yTicks.filter((value) => value !== 0).map((value) => (
                <line
                  key={`y-${value}`}
                  x1={plot.x}
                  x2={plot.x + plot.w}
                  y1={yToPx(value)}
                  y2={yToPx(value)}
                  stroke={tokens.line}
                  strokeWidth="1"
                />
              ))}
            </g>

            {/* 坐标轴 */}
            <g aria-hidden="true">
              {xAxisVisible && (
                <line x1={plot.x} x2={plot.x + plot.w} y1={originY} y2={originY} stroke={tokens.lineStrong} strokeWidth="1.3" />
              )}
              {yAxisVisible && (
                <line x1={originX} x2={originX} y1={plot.y} y2={plot.y + plot.h} stroke={tokens.lineStrong} strokeWidth="1.3" />
              )}
              {xTicks.filter((value) => value !== 0).map((value) => (
                <line
                  key={`xt-${value}`}
                  x1={xToPx(value)}
                  x2={xToPx(value)}
                  y1={axisY - 3}
                  y2={axisY + 3}
                  stroke={tokens.lineStrong}
                  strokeWidth="1"
                />
              ))}
              {yTicks.filter((value) => value !== 0).map((value) => (
                <line
                  key={`yt-${value}`}
                  x1={axisX - 3}
                  x2={axisX + 3}
                  y1={yToPx(value)}
                  y2={yToPx(value)}
                  stroke={tokens.lineStrong}
                  strokeWidth="1"
                />
              ))}
            </g>

            {/* 曲线 */}
            <g clipPath={`url(#${clipId})`}>
              {series.map((curve) => (
                curve.visible && curve.path ? (
                  <path
                    key={curve.id}
                    d={curve.path}
                    fill="none"
                    stroke={palette[curve.colorIndex] || palette[0]}
                    strokeWidth="2.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null
              ))}
            </g>

            {/* 刻度与数字 */}
            <g aria-hidden="true" fontSize="10" fill={tokens.faint}>
              {xTicks.filter((value) => value !== 0).map((value) => (
                <text key={`xl-${value}`} x={xToPx(value)} y={xLabelY} textAnchor="middle">
                  {formatCoord(value)}
                </text>
              ))}
              {yTicks.filter((value) => value !== 0).map((value) => (
                <text
                  key={`yl-${value}`}
                  x={yLabelX}
                  y={yToPx(value) + 3.5}
                  textAnchor="end"
                >
                  {formatCoord(value)}
                </text>
              ))}
              {xAxisVisible && yAxisVisible && (
                <text x={originX - 7} y={originY + 15} textAnchor="end">0</text>
              )}
            </g>

            <rect
              x={plot.x}
              y={plot.y}
              width={plot.w}
              height={plot.h}
              fill="none"
              stroke={tokens.line}
              strokeWidth="1"
            />

            {/* 悬停十字准线，不参与导出 */}
            <g clipPath={`url(#${clipId})`} data-export="skip">
              {hover && (
                <line
                  x1={hover.px}
                  x2={hover.px}
                  y1={plot.y}
                  y2={plot.y + plot.h}
                  stroke={tokens.muted}
                  strokeWidth="1"
                  strokeDasharray="3 4"
                  strokeOpacity="0.65"
                />
              )}
              {hoverNearest && hoverNearest.py >= plot.y && hoverNearest.py <= plot.y + plot.h && (
                <>
                  <line
                    x1={plot.x}
                    x2={plot.x + plot.w}
                    y1={hoverNearest.py}
                    y2={hoverNearest.py}
                    stroke={palette[hoverNearest.curve.colorIndex] || palette[0]}
                    strokeWidth="1"
                    strokeDasharray="3 4"
                    strokeOpacity="0.6"
                  />
                  <circle
                    cx={hover.px}
                    cy={hoverNearest.py}
                    r="3.6"
                    fill={palette[hoverNearest.curve.colorIndex] || palette[0]}
                    stroke={tokens.surface}
                    strokeWidth="1.6"
                  />
                </>
              )}
              {point && pointPx && (
                <circle
                  cx={pointPx.x}
                  cy={pointPx.y}
                  r="4.4"
                  fill={pointColor}
                  stroke={tokens.surface}
                  strokeWidth="2"
                />
              )}
            </g>
          </svg>

          {emptyHint && !hover && (
            <div className="tool-graph-empty" aria-hidden="true">
              <LineChart size={20} />
              <span>{emptyHint}</span>
            </div>
          )}

          {hover && (
            <div className="tool-graph-tooltip" style={tooltipStyle} role="status">
              <div className="tool-graph-tooltip-head">
                <span>x = {formatCoord(hover.x)}</span>
                {hoverNearest && (
                  <span className="tool-graph-tooltip-tag" style={{ color: palette[hoverNearest.curve.colorIndex] || palette[0] }}>
                    {hoverNearest.curve.source}
                  </span>
                )}
              </div>
              {hover.readings.length === 0 ? (
                <p className="tool-graph-tooltip-empty">没有可求值的曲线</p>
              ) : (
                <div className="tool-graph-readings">
                  {hover.readings.map((reading) => (
                    <div
                      className={cx('tool-graph-reading', hoverNearest?.curve.id === reading.curve.id && 'is-nearest')}
                      key={reading.curve.id}
                    >
                      <span className="tool-graph-reading-dot" style={{ background: palette[reading.curve.colorIndex] || palette[0] }} />
                      <span className="tool-graph-reading-name">{reading.curve.source || '（空）'}</span>
                      <span className="tool-graph-reading-value">
                        {Number.isFinite(reading.y) ? formatCoord(reading.y) : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <span className="tool-graph-tooltip-foot">点击曲线附近可描点</span>
            </div>
          )}

          {point && pointCardStyle && (
            <div
              className="tool-graph-point"
              style={pointCardStyle}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <span className="tool-graph-point-dot" style={{ background: pointColor }} />
              <span className="tool-graph-point-text">
                ({formatCoord(point.x)}, {formatCoord(point.y)})
              </span>
              <button type="button" onClick={() => setPoint(null)} aria-label="清除描点">×</button>
            </div>
          )}

          <div className="tool-graph-hint" aria-hidden="true">
            拖动平移 · 滚轮缩放 · 点击曲线描点
          </div>
        </div>

        <div className="tool-graph-foot">
          <span className="tool-graph-view-text">{viewText}</span>
          <span className="tool-graph-axis-note">刻度按当前视窗自动取整</span>
        </div>
      </div>

      <aside className="card tool-graph-side">
        <div className="tool-card-head">
          <div>
            <h2 className="tool-card-title">曲线与图例</h2>
            <p className="tool-card-sub">{curves.length} / {MAX_CURVES} 条</p>
          </div>
          <IconButton
            icon={Plus}
            label="添加曲线"
            onClick={() => addCurve('')}
            disabled={curves.length >= MAX_CURVES}
          />
        </div>

        <div className="tool-curve-list">
          {parsedCurves.map((curve, index) => (
            <div className="tool-curve-block" key={curve.id}>
              <div className={cx('tool-curve-row', !curve.visible && 'is-hidden', curve.error && 'has-error')}>
                <span
                  className="tool-curve-swatch"
                  style={{ background: palette[curve.colorIndex] || palette[0] }}
                  aria-hidden="true"
                />
                <input
                  className="input input-sm tool-curve-input"
                  value={curve.expression}
                  onChange={(event) => updateCurve(curve.id, { expression: event.target.value })}
                  placeholder="例如 sin(x)"
                  aria-label={`第 ${index + 1} 条曲线表达式`}
                  aria-invalid={Boolean(curve.error)}
                  spellCheck={false}
                  autoComplete="off"
                />
                <IconButton
                  icon={curve.visible ? Eye : EyeOff}
                  size="sm"
                  label={curve.visible ? `隐藏第 ${index + 1} 条曲线` : `显示第 ${index + 1} 条曲线`}
                  onClick={() => updateCurve(curve.id, { visible: !curve.visible })}
                />
                <IconButton
                  icon={Trash2}
                  size="sm"
                  label={`删除第 ${index + 1} 条曲线`}
                  onClick={() => removeCurve(curve.id)}
                  disabled={curves.length <= 1}
                />
              </div>
              {curve.error && <p className="tool-curve-error" role="alert">{curve.error}</p>}
            </div>
          ))}
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-sm btn-block tool-add-curve"
          onClick={() => addCurve('')}
          disabled={curves.length >= MAX_CURVES}
        >
          <Plus size={14} />
          添加曲线
        </button>

        <div className="tool-presets">
          <span className="tool-presets-label">快速添加</span>
          <div className="tool-preset-list">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className="tool-preset"
                onClick={() => addCurve(preset)}
                disabled={curves.length >= MAX_CURVES}
                title={`添加 ${preset}`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <div className="tool-graph-range">
          <div className="tool-panel-title">
            <span>视窗范围</span>
            <span className="tiny muted">Enter 应用</span>
          </div>
          <RangeEditor view={view} onApply={applyView} onReset={resetView} />
        </div>

        <div className="tool-graph-tips">
          <strong>怎么读这张图</strong>
          <p>
            曲线在除零、开偶次方或对数定义域外会自动断开，不会硬连成一条直线。
            悬停显示同一个 x 下各曲线的值；点击曲线附近可以钉住一个点。
          </p>
          <p className="tool-graph-legend-note">
            <span className="tool-graph-reading-dot" style={{ background: palette[0] }} /> 松绿
            <span className="tool-graph-reading-dot" style={{ background: palette[1] }} /> 柿橙
            <span className="tool-graph-reading-dot" style={{ background: palette[2] }} /> 靛蓝
            <span className="tool-graph-reading-dot" style={{ background: palette[3] }} /> 赭金
          </p>
        </div>
      </aside>
    </div>
  );
}
