import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brush, Check, Eraser, Eye, EyeOff, Loader2, Redo2, RotateCcw, Sparkles, Undo2, Wand2,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api.js';
import { loadImage } from '../lib/image.js';
import { getAiConfig, hasApiKey } from '../lib/settings.js';
import { Button, IconButton, Modal, cx } from './ui.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

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
  const pointerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [actions, setActions] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [regions, setRegions] = useState([]);
  const [brushSize, setBrushSize] = useState(28);
  const [paperColor, setPaperColor] = useState('#fffdf8');
  const [detecting, setDetecting] = useState(false);
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
    setError('');
    setShowOriginal(false);
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
      }
    }
  }, [actions]);

  useEffect(() => {
    if (!ready) return;
    redraw();
  }, [ready, redraw]);

  const pointFromEvent = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const onPointerDown = (event) => {
    if (!ready || showOriginal || detecting) return;
    const point = pointFromEvent(event);
    pointerRef.current = { points: [point], color: paperColor, size: brushSize };
    canvasRef.current.setPointerCapture?.(event.pointerId);
    const ctx = canvasRef.current.getContext('2d');
    ctx.fillStyle = paperColor;
    ctx.beginPath();
    ctx.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const onPointerMove = (event) => {
    if (!pointerRef.current || !ready) return;
    const point = pointFromEvent(event);
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
    if (!pointerRef.current) return;
    const stroke = pointerRef.current;
    pointerRef.current = null;
    setActions((current) => [...current, { type: 'brush', points: stroke.points, color: stroke.color, size: stroke.size }]);
    setRedoStack([]);
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

  const eraseRegions = () => {
    if (!regions.length || !natural.width) return;
    const rects = regions.map((region) => ({
      x: region.bbox[0] * natural.width,
      y: region.bbox[1] * natural.height,
      width: region.bbox[2] * natural.width,
      height: region.bbox[3] * natural.height,
    }));
    setActions((current) => [...current, { type: 'region', rects, color: paperColor }]);
    setRedoStack([]);
    setRegions([]);
    toast('已去除标记区域；如果误删，可以撤销或继续手动修补', 'success');
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
            <span className="hw-brush-hint">在图片上涂抹，擦除颜色默认为纸张色</span>
          </div>
          <div className="hw-tools">
            <label className="hw-size-control" title="笔刷大小">
              <span>{brushSize}px</span>
              <input type="range" min="8" max="90" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
            </label>
            <label className="hw-color-control" title="擦除颜色">
              <input type="color" value={paperColor} onChange={(event) => setPaperColor(event.target.value)} />
              <span>纸张色</span>
            </label>
            <IconButton icon={Undo2} label="撤销" size="sm" onClick={undo} disabled={!actions.length} />
            <IconButton icon={Redo2} label="重做" size="sm" onClick={redo} disabled={!redoStack.length} />
            <IconButton icon={RotateCcw} label="重置所有修改" size="sm" onClick={reset} disabled={!actions.length && !regions.length} />
            <IconButton icon={showOriginal ? EyeOff : Eye} label={showOriginal ? '返回清理结果' : '对比原图'} variant={showOriginal ? 'outline' : 'ghost'} size="sm" onClick={() => setShowOriginal((value) => !value)} />
          </div>
        </div>

        <div className="hw-ai-bar">
          <div>
            <strong><Sparkles size={15} /> AI 自动识别笔迹</strong>
            <p>让 AI 框出学生手写答案、批注与划痕。不会直接删除，先显示红色区域，由你确认后去除。</p>
          </div>
          <Button
            variant={hasApiKey() ? 'soft' : 'secondary'}
            size="sm"
            icon={detecting ? Loader2 : Wand2}
            onClick={autoDetect}
            loading={detecting}
            disabled={!ready}
          >
            {detecting ? 'AI 正在找手写…' : '自动识别手写笔迹'}
          </Button>
        </div>

        {error && <div className="hw-error">{error}</div>}
        {regions.length > 0 && (
          <div className="hw-region-banner">
            <span><Eraser size={15} /> AI 标记了 {regions.length} 处区域，红色框内将被填充为纸张色。</span>
            <div className="row">
              <Button variant="ghost" size="sm" onClick={() => setRegions([])}>忽略标记</Button>
              <Button variant="primary" size="sm" icon={Eraser} onClick={eraseRegions}>去除全部标记</Button>
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
              className="hw-canvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              aria-label="笔迹擦除画布"
            />
            {showOriginal && <img className="hw-original-overlay" src={src} alt="原图" />}
            {!showOriginal && regionOverlays.map((region) => (
              <span className="hw-region-box" style={region.style} key={region.key} title={region.label} />
            ))}
            {showOriginal && <span className="hw-compare-label">原图</span>}
          </div>
        </div>

        <div className="hw-tip">
          <span><Brush size={13} /> 手动擦除：按住鼠标/手指涂抹</span>
          <span><Undo2 size={13} /> 每一步都可以撤销</span>
          <span><Eraser size={13} /> AI 区域只会填充颜色，不改变原文件</span>
        </div>
      </div>
    </Modal>
  );
}
