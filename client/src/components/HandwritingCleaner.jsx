import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brush, Check, Eraser, Eye, EyeOff, Loader2, PaintBucket, Redo2, RotateCcw, Scan, Sparkles, Undo2, Wand2,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api.js';
import { loadImage } from '../lib/image.js';
import { getAiConfig, hasApiKey } from '../lib/settings.js';
import { Button, IconButton, Modal, cx } from './ui.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

function hexToRgb(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!match) return { r: 255, g: 253, b: 248 };
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function saturationOf(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function expandMask(mask, width, height, radius = 1) {
  const expanded = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          expanded[yy * width + xx] = 1;
        }
      }
    }
  }
  return expanded;
}

// 蓝/红/绿等彩色笔迹：不仅看饱和度，也看颜色通道偏向，
// 这样连笔迹边缘很淡的抗锯齿像素也能一起修补掉，避免留下残影。
function buildColorMask(data, width, height) {
  const mask = new Uint8Array(width * height);
  let count = 0;
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const r = data[offset]; const g = data[offset + 1]; const b = data[offset + 2];
    const max = Math.max(r, g, b);
    // 只认“红/蓝/绿明显压过另外两个通道”的彩色笔迹。
    // 不再使用通用饱和度：照片里的深色印刷字常有轻微色偏，容易被误删。
    if (max < 65) continue;
    const red = r - g > 8 && r - b > 7;
    const blue = b - r > 8 && b - g > 5;
    const green = g - r > 16 && g - b > 10;
    if (red || blue || green) {
      mask[index] = 1;
      count += 1;
    }
  }
  return { mask: count ? expandMask(mask, width, height, 4) : mask, count };
}

function buildStrokeMask(points, size, width, height) {
  const mask = new Uint8Array(width * height);
  const radius = Math.max(2, size / 2);
  const stamp = (cx, cy) => {
    const left = Math.max(0, Math.floor(cx - radius));
    const right = Math.min(width - 1, Math.ceil(cx + radius));
    const top = Math.max(0, Math.floor(cy - radius));
    const bottom = Math.min(height - 1, Math.ceil(cy + radius));
    const radiusSq = radius * radius;
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const dx = x - cx; const dy = y - cy;
        if (dx * dx + dy * dy <= radiusSq) mask[y * width + x] = 1;
      }
    }
  };
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    stamp(point.x, point.y);
    if (i > 0) {
      const previous = points[i - 1];
      const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
      const steps = Math.max(1, Math.ceil(distance / Math.max(2, radius / 2)));
      for (let step = 1; step < steps; step += 1) {
        const ratio = step / steps;
        stamp(previous.x + (point.x - previous.x) * ratio, previous.y + (point.y - previous.y) * ratio);
      }
    }
  }
  return mask;
}

// AI 标记框：只擦掉框内明显深于纸张或带颜色的笔迹像素，而不是整块矩形。
function buildRegionMask(data, width, height, rects, paperColor) {
  const paper = hexToRgb(paperColor);
  const paperLum = paper.r * 0.299 + paper.g * 0.587 + paper.b * 0.114;
  const mask = new Uint8Array(width * height);
  let count = 0;
  for (const rect of rects) {
    const left = Math.max(0, Math.floor(rect.x));
    const top = Math.max(0, Math.floor(rect.y));
    const right = Math.min(width, Math.ceil(rect.x + rect.width));
    const bottom = Math.min(height, Math.ceil(rect.y + rect.height));
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const index = y * width + x;
        const offset = index * 4;
        const r = data[offset]; const g = data[offset + 1]; const b = data[offset + 2];
        const lum = r * 0.299 + g * 0.587 + b * 0.114;
        if (lum < paperLum - 28 || saturationOf(r, g, b) > 0.24) {
          mask[index] = 1;
          count += 1;
        }
      }
    }
  }
  return { mask: count ? expandMask(mask, width, height, 1) : mask, count };
}

// 从边界向内扩散颜色，把笔迹下面的纸张补回来；比直接涂一块纯色自然。
function inpaintCanvasMask(ctx, mask, paperColor) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const total = width * height;
  const state = new Uint8Array(total);
  const pending = [];
  for (let index = 0; index < total; index += 1) {
    if (mask[index]) pending.push(index);
    else state[index] = 1;
  }
  if (!pending.length) return 0;
  let remaining = pending.length;
  for (let pass = 0; pass < 90 && remaining > 0; pass += 1) {
    const updates = [];
    for (const index of pending) {
      if (state[index]) continue;
      const x = index % width;
      const y = Math.floor(index / width);
      let r = 0; let g = 0; let b = 0; let n = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const neighbor = yy * width + xx;
          if (!state[neighbor]) continue;
          const offset = neighbor * 4;
          r += data[offset]; g += data[offset + 1]; b += data[offset + 2]; n += 1;
        }
      }
      if (n) updates.push([index, r / n, g / n, b / n]);
    }
    if (!updates.length) break;
    for (const [index, r, g, b] of updates) {
      const offset = index * 4;
      data[offset] = r; data[offset + 1] = g; data[offset + 2] = b; data[offset + 3] = 255;
      state[index] = 1;
      remaining -= 1;
    }
  }
  if (remaining > 0) {
    const fallback = hexToRgb(paperColor);
    for (const index of pending) {
      if (state[index]) continue;
      const offset = index * 4;
      data[offset] = fallback.r; data[offset + 1] = fallback.g; data[offset + 2] = fallback.b; data[offset + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return pending.length;
}

function findCleanPaperPatch(data, width, height, rect, paperColor) {
  const patch = 96;
  const paper = hexToRgb(paperColor);
  const paperLum = paper.r * 0.299 + paper.g * 0.587 + paper.b * 0.114;
  const target = {
    left: Math.max(0, Math.floor(rect.x)),
    top: Math.max(0, Math.floor(rect.y)),
    right: Math.min(width, Math.ceil(rect.x + rect.width)),
    bottom: Math.min(height, Math.ceil(rect.y + rect.height)),
  };
  let best = null;
  for (let y = 0; y <= height - patch; y += 36) {
    for (let x = 0; x <= width - patch; x += 36) {
      // 不能从选区附近取样，否则会把笔迹又复制回来。
      if (x + patch > target.left - 8 && x < target.right + 8
        && y + patch > target.top - 8 && y < target.bottom + 8) continue;
      let ink = 0; let lumSum = 0; let lumSq = 0; let samples = 0;
      for (let yy = y; yy < y + patch; yy += 4) {
        for (let xx = x; xx < x + patch; xx += 4) {
          const offset = (yy * width + xx) * 4;
          const r = data[offset]; const g = data[offset + 1]; const b = data[offset + 2];
          const lum = r * 0.299 + g * 0.587 + b * 0.114;
          lumSum += lum; lumSq += lum * lum; samples += 1;
          if (lum < paperLum - 34 || saturationOf(r, g, b) > 0.3) ink += 1;
        }
      }
      const inkFrac = ink / samples;
      const meanLum = lumSum / samples;
      const std = Math.sqrt(Math.max(0, lumSq / samples - meanLum * meanLum));
      const centerX = x + patch / 2;
      const centerY = y + patch / 2;
      const targetX = (target.left + target.right) / 2;
      const targetY = (target.top + target.bottom) / 2;
      const distance = Math.hypot(centerX - targetX, centerY - targetY);
      // 纸张纹理的亮度标准差很小；带铅笔字/印刷字的纹理标准差明显更大。
      const score = inkFrac * 240 + std * 2.2 + Math.abs(meanLum - paperLum) * 0.08 + distance / 1800;
      if (!best || score < best.score) best = { x, y, score, inkFrac, std };
    }
  }
  return best && best.inkFrac < 0.015 ? best : null;
}

// 用附近干净纸张纹理补选区：比纯色/扩散更自然，适合擦掉铅笔字、批注。
function textureFillRect(ctx, rect, paperColor) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const left = Math.max(0, Math.floor(rect.x));
  const top = Math.max(0, Math.floor(rect.y));
  const right = Math.min(width, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(height, Math.ceil(rect.y + rect.height));
  const w = right - left; const h = bottom - top;
  if (w < 4 || h < 4) return false;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const donor = findCleanPaperPatch(data, width, height, { x: left, y: top, width: w, height: h }, paperColor);
  if (!donor) {
    const mask = new Uint8Array(width * height);
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) mask[y * width + x] = 1;
    }
    inpaintCanvasMask(ctx, mask, paperColor);
    return true;
  }
  const patch = 96;
  const donorCanvas = document.createElement('canvas');
  donorCanvas.width = width; donorCanvas.height = height;
  const donorCtx = donorCanvas.getContext('2d');
  donorCtx.filter = 'blur(22px)';
  donorCtx.drawImage(ctx.canvas, 0, 0);
  const blur = donorCtx.getImageData(0, 0, width, height).data;
  const feather = Math.min(18, Math.floor(Math.min(w, h) / 3));
  const output = new Uint8ClampedArray(data);
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const sx = donor.x + ((x - left) % patch);
      const sy = donor.y + ((y - top) % patch);
      const dst = (y * width + x) * 4;
      const src = (sy * width + sx) * 4;
      const bdst = dst; const bsrc = src;
      const edgeX = Math.min(x - left, right - 1 - x);
      const edgeY = Math.min(y - top, bottom - 1 - y);
      const alpha = feather > 0 ? Math.min(1, Math.min(edgeX, edgeY) / feather) : 1;
      for (let c = 0; c < 3; c += 1) {
        const value = data[src + c] + (blur[bdst + c] - blur[bsrc + c]);
        output[dst + c] = value * alpha + data[dst + c] * (1 - alpha);
      }
      output[dst + 3] = 255;
    }
  }
  ctx.putImageData(new ImageData(output, width, height), 0, 0);
  return true;
}

function samplePaperColor(image) {
  try {
    const canvas = document.createElement('canvas');
    const size = 24;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const points = [
      [0, 0], [canvas.width - size, 0], [0, canvas.height - size], [canvas.width - size, canvas.height - size],
      [Math.floor(canvas.width / 2), 4], [4, Math.floor(canvas.height / 2)],
    ];
    let r = 0; let g = 0; let b = 0; let count = 0;
    for (const [x, y] of points) {
      const data = ctx.getImageData(Math.max(0, x), Math.max(0, y), Math.min(size, canvas.width), Math.min(size, canvas.height)).data;
      for (let i = 0; i < data.length; i += 4) {
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        if (lum < 120) continue;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; count += 1;
      }
    }
    if (!count) return '#ffffff';
    const hex = (value) => Math.min(255, Math.round(value / count)).toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } catch {
    return '#fffdf8';
  }
}

function toDataUrl(image) {
  const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fffdf8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.88);
}

export default function HandwritingCleaner({ open, src, title = '去除图片笔迹', onClose, onApply }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const imageRef = useRef(null);
  const canvasRef = useRef(null);
  const aiMaskCanvasRef = useRef(null);
  const pointerRef = useRef(null);
  const maskPointerRef = useRef(null);
  const selectRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [actions, setActions] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [regions, setRegions] = useState([]);
  const [brushSize, setBrushSize] = useState(28);
  const [brushMode, setBrushMode] = useState('heal');
  const [tool, setTool] = useState('brush');
  const [selection, setSelection] = useState(null);
  const [paperColor, setPaperColor] = useState('#fffdf8');
  const [detecting, setDetecting] = useState(false);
  const [colorBusy, setColorBusy] = useState(false);
  const [aiMaskDirty, setAiMaskDirty] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiClean, setAiClean] = useState(null);
  const [applying, setApplying] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [error, setError] = useState('');
  const [natural, setNatural] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!open || !src) return undefined;
    let alive = true;
    setReady(false);
    setActions([]);
    setRedoStack([]);
    setRegions([]);
    setSelection(null);
    setTool('brush');
    setAiMaskDirty(false);
    setError('');
    setShowOriginal(false);
    api.get('/api/ai/clean-status').then(setAiClean).catch(() => setAiClean({ available: false }));
    loadImage(src).then((image) => {
      if (!alive) return;
      imageRef.current = image;
      setNatural({ width: image.naturalWidth, height: image.naturalHeight });
      setPaperColor(samplePaperColor(image));
      setReady(true);
    }).catch(() => { if (alive) setError('图片加载失败，请重试'); });
    return () => { alive = false; };
  }, [open, src]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    for (const action of actions) {
      if (action.type === 'brush') {
        ctx.strokeStyle = action.color;
        ctx.lineWidth = action.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        action.points.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        if (action.points.length === 1) {
          ctx.arc(action.points[0].x, action.points[0].y, action.size / 2, 0, Math.PI * 2);
          ctx.fillStyle = action.color;
          ctx.fill();
        } else {
          ctx.stroke();
        }
      } else if (action.type === 'region') {
        ctx.fillStyle = action.color;
        for (const rect of action.rects) {
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        }
      } else if (action.type === 'healStroke') {
        const mask = buildStrokeMask(action.points, action.size, canvas.width, canvas.height);
        inpaintCanvasMask(ctx, mask, paperColor);
      } else if (action.type === 'autoColor') {
        // 两遍：第一遍去掉主笔画，第二遍补掉残留的淡色抗锯齿边缘。
        for (let pass = 0; pass < 2; pass += 1) {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const { count, mask } = buildColorMask(imageData.data, canvas.width, canvas.height);
          if (!count) break;
          inpaintCanvasMask(ctx, mask, paperColor);
        }
      } else if (action.type === 'smartRegion') {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { mask } = buildRegionMask(imageData.data, canvas.width, canvas.height, action.rects, paperColor);
        inpaintCanvasMask(ctx, mask, paperColor);
      } else if (action.type === 'textureRect') {
        textureFillRect(ctx, action.rect, paperColor);
      } else if (action.type === 'bitmap') {
        ctx.drawImage(action.image, 0, 0, canvas.width, canvas.height);
      }
    }
  }, [actions, paperColor]);

  useEffect(() => {
    if (!ready) return;
    redraw();
  }, [ready, redraw]);

  useEffect(() => {
    const maskCanvas = aiMaskCanvasRef.current;
    if (!ready || !maskCanvas || !natural.width) return;
    maskCanvas.width = natural.width;
    maskCanvas.height = natural.height;
    maskCanvas.getContext('2d').clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    setAiMaskDirty(false);
  }, [ready, natural]);

  const pointFromEvent = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const onPointerDown = (event) => {
    if (!ready || showOriginal || detecting || colorBusy) return;
    const point = pointFromEvent(event);
    canvasRef.current.setPointerCapture?.(event.pointerId);
    if (tool === 'select') {
      selectRef.current = { start: point };
      setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
      return;
    }
    pointerRef.current = { points: [point], color: paperColor, size: brushSize };
    const ctx = canvasRef.current.getContext('2d');
    ctx.fillStyle = paperColor;
    ctx.beginPath();
    ctx.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const onPointerMove = (event) => {
    if (!ready) return;
    const point = pointFromEvent(event);
    if (tool === 'select' && selectRef.current) {
      const start = selectRef.current.start;
      setSelection({
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        width: Math.abs(point.x - start.x),
        height: Math.abs(point.y - start.y),
      });
      return;
    }
    if (!pointerRef.current) return;
    const points = pointerRef.current.points;
    const previous = points[points.length - 1];
    points.push(point);
    const ctx = canvasRef.current.getContext('2d');
    ctx.strokeStyle = pointerRef.current.color;
    ctx.lineWidth = pointerRef.current.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const onPointerUp = () => {
    if (tool === 'select') {
      if (selectRef.current) {
        selectRef.current = null;
        setSelection((current) => (current && current.width > 8 && current.height > 8 ? current : null));
      }
      return;
    }
    if (!pointerRef.current) return;
    const stroke = pointerRef.current;
    pointerRef.current = null;
    const action = brushMode === 'heal'
      ? { type: 'healStroke', points: stroke.points, size: stroke.size }
      : { type: 'brush', points: stroke.points, color: stroke.color, size: stroke.size };
    setActions((current) => [...current, action]);
    setRedoStack([]);
  };

  const applySelection = () => {
    if (!selection || selection.width < 8 || selection.height < 8) return;
    setActions((current) => [...current, { type: 'textureRect', rect: selection }]);
    setRedoStack([]);
    setSelection(null);
    setTool('brush');
    toast('已用周围干净纸张纹理修补选区；如果位置不对可以撤销', 'success');
  };

  const maskPointFromEvent = (event) => {
    const canvas = aiMaskCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const drawMaskSegment = (from, to) => {
    const canvas = aiMaskCanvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = 'rgba(206, 66, 54, 0.55)';
    ctx.fillStyle = 'rgba(206, 66, 54, 0.55)';
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (from && to) {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    } else if (to) {
      ctx.beginPath();
      ctx.arc(to.x, to.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    setAiMaskDirty(true);
  };

  const onAiMaskPointerDown = (event) => {
    if (tool !== 'aiMask' || !ready || aiBusy) return;
    const point = maskPointFromEvent(event);
    maskPointerRef.current = point;
    aiMaskCanvasRef.current.setPointerCapture?.(event.pointerId);
    drawMaskSegment(null, point);
  };

  const onAiMaskPointerMove = (event) => {
    if (!maskPointerRef.current || tool !== 'aiMask') return;
    const point = maskPointFromEvent(event);
    drawMaskSegment(maskPointerRef.current, point);
    maskPointerRef.current = point;
  };

  const onAiMaskPointerUp = () => {
    maskPointerRef.current = null;
  };

  const clearAiMask = () => {
    const canvas = aiMaskCanvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setAiMaskDirty(false);
    setTool('brush');
  };

  const applyAiRepair = async () => {
    if (!aiMaskDirty) {
      toast('请先点「AI 蒙版」，把要修掉的笔迹涂红', 'info');
      return;
    }
    if (!aiClean?.available) {
      toast(aiClean?.message || '本机 AI 修补未配置，请参考 server/ai/README.md', 'info');
      return;
    }
    setAiBusy(true);
    setError('');
    try {
      const imageData = canvasRef.current.toDataURL('image/jpeg', 0.9);
      const maskData = aiMaskCanvasRef.current.toDataURL('image/png');
      const result = await api.post('/api/ai/inpaint', { imageData, maskData }, { timeout: 310_000 });
      const repaired = await loadImage(result.image);
      setActions((current) => [...current, { type: 'bitmap', image: repaired }]);
      setRedoStack([]);
      clearAiMask();
      toast(`AI 修补完成${result.ms ? `（${Math.round(result.ms / 1000)} 秒）` : ''}，可撤销`, 'success');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAiBusy(false);
    }
  };

  const undo = () => {
    if (!actions.length) return;
    const last = actions[actions.length - 1];
    setActions((current) => current.slice(0, -1));
    setRedoStack((current) => [...current, last]);
  };

  const redo = () => {
    if (!redoStack.length) return;
    const last = redoStack[redoStack.length - 1];
    setRedoStack((current) => current.slice(0, -1));
    setActions((current) => [...current, last]);
  };

  const reset = () => {
    setActions([]);
    setRedoStack([]);
    setRegions([]);
    setError('');
  };

  const autoDetect = async () => {
    if (!hasApiKey()) {
      toast('请先在设置中配置 DeepSeek API Key，才能自动识别笔迹', 'info', {
        action: { label: '去设置', onClick: () => navigate('/settings') },
      });
      return;
    }
    if (!imageRef.current) return;
    setDetecting(true);
    setError('');
    try {
      const imageData = toDataUrl(imageRef.current);
      const result = await api.post('/api/ai/detect-handwriting', {
        imageData,
        think: false,
        ai: getAiConfig(),
      }, { timeout: 300_000 });
      const found = Array.isArray(result.regions) ? result.regions : [];
      setRegions(found);
      if (found.length) {
        toast(`AI 找到 ${found.length} 处手写笔迹，请确认红色框后再去除`, 'success');
      } else {
        toast('AI 没有找到明显的手写笔迹，可以继续手动擦除', 'info');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDetecting(false);
    }
  };

  const removeColoredInk = async () => {
    if (!ready || !canvasRef.current) return;
    setColorBusy(true);
    setError('');
    try {
      await new Promise((resolve) => { setTimeout(resolve, 30); });
      const ctx = canvasRef.current.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
      const { count } = buildColorMask(imageData.data, canvasRef.current.width, canvasRef.current.height);
      if (!count) {
        toast('没有检测到明显的蓝/红/绿色笔迹；黑色笔迹请用 AI 识别或手动修补', 'info');
        return;
      }
      setActions((current) => [...current, { type: 'autoColor' }]);
      setRedoStack([]);
      toast(`已找到并修补 ${count.toLocaleString()} 个彩色笔迹像素，可撤销`, 'success');
    } catch (err) {
      setError(err.message || '彩色笔迹处理失败');
    } finally {
      setColorBusy(false);
    }
  };

  const eraseRegions = () => {
    if (!regions.length || !natural.width) return;
    const rects = regions.map((region) => ({
      x: region.bbox[0] * natural.width,
      y: region.bbox[1] * natural.height,
      width: region.bbox[2] * natural.width,
      height: region.bbox[3] * natural.height,
    }));
    setActions((current) => [...current, { type: 'smartRegion', rects }]);
    setRedoStack([]);
    setRegions([]);
    toast('已智能修补标记区域；如果误删，可以撤销或继续手动修补', 'success');
  };

  const apply = async () => {
    if (!canvasRef.current) return;
    setApplying(true);
    try {
      const blob = await new Promise((resolve, reject) => {
        canvasRef.current.toBlob((result) => (result ? resolve(result) : reject(new Error('图片生成失败'))), 'image/jpeg', 0.92);
      });
      await onApply?.(blob);
      onClose?.();
    } catch (err) {
      setError(err.message || '保存失败');
    } finally {
      setApplying(false);
    }
  };

  const regionOverlays = useMemo(() => regions.map((region, index) => ({
    ...region,
    style: {
      left: `${region.bbox[0] * 100}%`,
      top: `${region.bbox[1] * 100}%`,
      width: `${region.bbox[2] * 100}%`,
      height: `${region.bbox[3] * 100}%`,
    },
    key: `${region.label}-${index}`,
  })), [regions]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description="手动擦除笔迹，或让 AI 找出手写区域后一键去除。所有修改在点「完成并应用」前都不会保存。"
      size="xl"
      footer={(
        <>
          <span className="hw-footer-note">{actions.length ? `已做 ${actions.length} 步修改` : '尚未修改'}</span>
          <Button variant="ghost" onClick={onClose} disabled={applying}>取消</Button>
          <Button variant="primary" icon={Check} onClick={apply} loading={applying} disabled={!ready}>完成并应用</Button>
        </>
      )}
    >
      <div className="hw-shell">
        <div className="hw-toolbar">
          <div className="hw-tool-group">
            <span className="hw-tool-label"><Brush size={14} /> 手动擦除</span>
            <span className="hw-brush-hint">{tool === 'select' ? '拖拽框住要清理的笔迹，再点“修补选区”' : '智能修补会从周围纸张取样填补，比整块涂白更自然'}</span>
          </div>
          <div className="hw-tools">
            <button
              type="button"
              className={cx('hw-select-toggle', tool === 'select' && 'is-active')}
              onClick={() => {
                setTool(tool === 'select' ? 'brush' : 'select');
                setSelection(null);
              }}
              title="框选一块区域，用周围干净纸张纹理修补"
            >
              <Scan size={14} /> 框选修补
            </button>
            <button
              type="button"
              className={cx('hw-select-toggle', tool === 'aiMask' && 'is-active')}
              onClick={() => setTool(tool === 'aiMask' ? 'brush' : 'aiMask')}
              title="涂红要修掉的笔迹，再交给本机 LaMa 修补"
            >
              <Wand2 size={14} /> AI 蒙版
            </button>
            {aiMaskDirty && (
              <IconButton icon={Eraser} label="清除 AI 蒙版" size="sm" onClick={clearAiMask} />
            )}
            <label className="hw-size-control" title="笔刷大小">
              <span>{brushSize}px</span>
              <input type="range" min="8" max="90" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
            </label>
            <label className="hw-color-control" title="修补/填充颜色">
              <input type="color" value={paperColor} onChange={(event) => setPaperColor(event.target.value)} />
              <span>纸张色</span>
            </label>
            <label className="hw-mode-control" title="手动笔刷模式">
              <select value={brushMode} onChange={(event) => setBrushMode(event.target.value)}>
                <option value="heal">智能修补</option>
                <option value="solid">纸张色平涂</option>
              </select>
            </label>
            <IconButton icon={Undo2} label="撤销" size="sm" onClick={undo} disabled={!actions.length} />
            <IconButton icon={Redo2} label="重做" size="sm" onClick={redo} disabled={!redoStack.length} />
            <IconButton icon={RotateCcw} label="重置所有修改" size="sm" onClick={reset} disabled={!actions.length && !regions.length} />
            <IconButton icon={showOriginal ? EyeOff : Eye} label={showOriginal ? '返回清理结果' : '对比原图'} variant={showOriginal ? 'outline' : 'ghost'} size="sm" onClick={() => setShowOriginal((value) => !value)} />
          </div>
        </div>

        <div className="hw-ai-bar">
          <div>
            <strong><Sparkles size={15} /> 自动去笔迹</strong>
            <p>蓝/红/绿笔迹可直接本地清除；黑色、铅笔或照片纸纹用「AI 蒙版」涂红后交给本机 LaMa 修补（需安装服务）。</p>
          </div>
          <div className="hw-ai-actions">
            {aiClean && !aiClean.available && <span className="hw-ai-unavailable">本机 AI 未配置</span>}
            <Button
              variant="primary"
              size="sm"
              icon={aiBusy ? Loader2 : Wand2}
              onClick={applyAiRepair}
              loading={aiBusy}
              disabled={!aiMaskDirty || !aiClean?.available}
              title={aiClean?.available ? '用本机 LaMa 修补红色蒙版区域' : '本机 AI 修补未配置'}
            >
              {aiBusy ? 'AI 修补中…' : 'AI 修补'}
            </Button>
            <Button
              variant="soft"
              size="sm"
              icon={colorBusy ? Loader2 : PaintBucket}
              onClick={removeColoredInk}
              loading={colorBusy}
              disabled={!ready}
            >
              {colorBusy ? '处理中…' : '去彩色笔迹'}
            </Button>
            <Button
              variant={hasApiKey() ? 'soft' : 'secondary'}
              size="sm"
              icon={detecting ? Loader2 : Wand2}
              onClick={autoDetect}
              loading={detecting}
              disabled={!ready}
            >
              {detecting ? 'AI 正在找手写…' : 'AI 识别笔迹'}
            </Button>
          </div>
        </div>

        {error && <div className="hw-error">{error}</div>}
        {regions.length > 0 && (
          <div className="hw-region-banner">
            <span><Eraser size={15} /> AI 标记了 {regions.length} 处区域，确认后会智能补纸，而不是整块涂白。</span>
            <div className="row">
              <Button variant="ghost" size="sm" onClick={() => setRegions([])}>忽略标记</Button>
              <Button variant="primary" size="sm" icon={Eraser} onClick={eraseRegions}>去除全部标记</Button>
            </div>
          </div>
        )}

        {selection && (
          <div className="hw-region-banner hw-selection-banner">
            <span><Scan size={15} /> 已框选 {Math.round(selection.width)} × {Math.round(selection.height)} 区域</span>
            <div className="row">
              <Button variant="ghost" size="sm" onClick={() => setSelection(null)}>取消框选</Button>
              <Button variant="primary" size="sm" icon={Eraser} onClick={applySelection}>修补选区</Button>
            </div>
          </div>
        )}

        <div className={cx('hw-canvas-wrap', showOriginal && 'is-original')}>
          {!ready && !error && <div className="hw-loading"><Loader2 size={22} className="spin" /> 正在准备图片…</div>}
          <div
            className="hw-canvas-box"
            style={{
              '--hw-ratio': natural.width && natural.height ? natural.width / natural.height : 1.5,
            }}
          >
            <canvas
              ref={canvasRef}
              className={cx('hw-canvas', tool === 'select' && 'is-select')}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              aria-label="笔迹擦除画布"
            />
            <canvas
              ref={aiMaskCanvasRef}
              className={cx('hw-ai-mask-canvas', tool === 'aiMask' && 'is-active')}
              onPointerDown={onAiMaskPointerDown}
              onPointerMove={onAiMaskPointerMove}
              onPointerUp={onAiMaskPointerUp}
              onPointerCancel={onAiMaskPointerUp}
              aria-label="AI 修补蒙版画布"
            />
            {showOriginal && <img className="hw-original-overlay" src={src} alt="原图" />}
            {!showOriginal && regionOverlays.map((region) => (
              <span className="hw-region-box" style={region.style} key={region.key} title={region.label} />
            ))}
            {!showOriginal && selection && (
              <span
                className="hw-selection-box"
                style={{
                  left: `${(selection.x / (natural.width || 1)) * 100}%`,
                  top: `${(selection.y / (natural.height || 1)) * 100}%`,
                  width: `${(selection.width / (natural.width || 1)) * 100}%`,
                  height: `${(selection.height / (natural.height || 1)) * 100}%`,
                }}
              />
            )}
            {showOriginal && <span className="hw-compare-label">原图</span>}
          </div>
        </div>

        <div className="hw-tip">
          <span><Brush size={13} /> 手动擦除：按住鼠标/手指涂抹</span>
          <span><Scan size={13} /> 框选修补：适合成片铅笔字/批注</span>
          <span><PaintBucket size={13} /> 彩色笔迹：本地一键清除</span>
          <span><Wand2 size={13} /> AI 蒙版 + AI 修补：适合复杂纸纹/铅笔</span>
          <span><Undo2 size={13} /> 每一步都可以撤销</span>
        </div>
      </div>
    </Modal>
  );
}
