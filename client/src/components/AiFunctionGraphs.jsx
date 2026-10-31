import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, LineChart, Sparkles } from 'lucide-react';
import { evaluate, parseExpression } from '../features/tools/ExpressionParser.js';
import { Badge, Card } from './ui.jsx';

const COLORS = ['#2f6d5b', '#cc7152', '#466c9a'];
const WIDTH = 340;
const HEIGHT = 200;
const PAD = { left: 34, right: 14, top: 14, bottom: 26 };

function safeRange(min, max) {
  let lo = Number(min);
  let hi = Number(max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo < 0.5) {
    lo = -10;
    hi = 10;
  }
  return [lo, hi];
}

function buildSeries(item, index) {
  const [xMin, xMax] = safeRange(item.xMin, item.xMax);
  let ast;
  try {
    ast = parseExpression(item.expression, { variables: ['x'] });
  } catch (error) {
    return { ...item, error: error.message, points: [], xMin, xMax, index };
  }
  const raw = [];
  const samples = 220;
  for (let i = 0; i <= samples; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / samples;
    let y;
    try {
      y = evaluate(ast, { x }, { throwOnDomain: false, angleMode: 'rad' });
    } catch {
      y = NaN;
    }
    raw.push({ x, y: Number.isFinite(y) ? y : NaN });
  }
  const finite = raw.map((point) => point.y).filter((value) => Number.isFinite(value) && Math.abs(value) < 1e8).sort((a, b) => a - b);
  if (!finite.length) return { ...item, error: '这个表达式在当前范围内没有可绘制的值', points: raw, xMin, xMax, index };
  const q = (p) => finite[Math.min(finite.length - 1, Math.max(0, Math.floor((finite.length - 1) * p)))];
  let yMin = q(0.02);
  let yMax = q(0.98);
  if (Math.abs(yMax - yMin) < 1e-6) {
    const center = yMin;
    yMin = center - 1;
    yMax = center + 1;
  } else {
    const pad = (yMax - yMin) * 0.12;
    yMin -= pad;
    yMax += pad;
  }
  return { ...item, points: raw, xMin, xMax, yMin, yMax, index };
}

function Plot({ series }) {
  if (series.error) {
    return <div className="ai-graph-error">{series.error}</div>;
  }
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const mapX = (x) => PAD.left + ((x - series.xMin) / (series.xMax - series.xMin)) * innerW;
  const mapY = (y) => PAD.top + innerH - ((y - series.yMin) / (series.yMax - series.yMin)) * innerH;
  const clipped = [];
  for (const point of series.points) {
    if (!Number.isFinite(point.y) || point.y < series.yMin - (series.yMax - series.yMin) * 0.5 || point.y > series.yMax + (series.yMax - series.yMin) * 0.5) {
      clipped.push(null);
    } else {
      clipped.push([mapX(point.x), mapY(point.y)]);
    }
  }
  const path = clipped.reduce((acc, point, i) => {
    if (!point) return acc;
    const prev = clipped[i - 1];
    return `${acc}${prev ? 'L' : 'M'}${point[0].toFixed(1)} ${point[1].toFixed(1)} `;
  }, '');
  const axisY = mapY(0);
  const axisX = mapX(0);
  const showXAxis = axisY >= PAD.top && axisY <= HEIGHT - PAD.bottom;
  const showYAxis = axisX >= PAD.left && axisX <= WIDTH - PAD.right;
  return (
    <svg className="ai-graph-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`函数图像 ${series.label}`}>
      <defs>
        <clipPath id={`graph-clip-${series.index}`}>
          <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} />
        </clipPath>
      </defs>
      <g className="ai-graph-grid">
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={`v${i}`} x1={PAD.left + (innerW * i) / 4} y1={PAD.top} x2={PAD.left + (innerW * i) / 4} y2={HEIGHT - PAD.bottom} />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <line key={`h${i}`} x1={PAD.left} y1={PAD.top + (innerH * i) / 3} x2={WIDTH - PAD.right} y2={PAD.top + (innerH * i) / 3} />
        ))}
      </g>
      {showXAxis && <line className="ai-graph-axis" x1={PAD.left} y1={axisY} x2={WIDTH - PAD.right} y2={axisY} />}
      {showYAxis && <line className="ai-graph-axis" x1={axisX} y1={PAD.top} x2={axisX} y2={HEIGHT - PAD.bottom} />}
      <g clipPath={`url(#graph-clip-${series.index})`}>
        <path d={path} className="ai-graph-path" style={{ stroke: COLORS[series.index % COLORS.length] }} />
      </g>
      <text className="ai-graph-tick" x={PAD.left} y={HEIGHT - 8} textAnchor="start">{Number(series.xMin).toFixed(1)}</text>
      <text className="ai-graph-tick" x={WIDTH - PAD.right} y={HEIGHT - 8} textAnchor="end">{Number(series.xMax).toFixed(1)}</text>
      <text className="ai-graph-tick" x={PAD.left - 5} y={PAD.top + 8} textAnchor="end">{Number(series.yMax).toFixed(1)}</text>
      <text className="ai-graph-tick" x={PAD.left - 5} y={HEIGHT - PAD.bottom} textAnchor="end">{Number(series.yMin).toFixed(1)}</text>
    </svg>
  );
}

export default function AiFunctionGraphs({ functions = [], className = '', title = 'AI 参考函数图像' }) {
  const seriesList = useMemo(() => {
    if (!Array.isArray(functions) || !functions.length) return [];
    return functions.slice(0, 3).map((item, index) => buildSeries(item, index));
  }, [functions]);

  if (!seriesList.length) return null;

  return (
    <Card className={`ai-graph-card ${className}`}>
      <div className="ai-graph-head">
        <div>
          <h3><LineChart size={16} /> {title}</h3>
          <p>根据题目涉及的函数自动生成，用来辅助观察图像；不是原题配图。</p>
        </div>
        <div className="row-wrap">
          <Badge tone="violet"><Sparkles size={12} /> AI 辅助</Badge>
          <Link className="ai-graph-tool-link" to="/tools">
            图形工具 <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>
      <div className="ai-graph-grid-wrap">
        {seriesList.map((series) => (
          <figure className="ai-graph-item" key={`${series.expression}-${series.index}`}>
            <figcaption>
              <strong>{series.label || `y = ${series.expression}`}</strong>
              <code>{series.expression}</code>
            </figcaption>
            <Plot series={series} />
          </figure>
        ))}
      </div>
    </Card>
  );
}
