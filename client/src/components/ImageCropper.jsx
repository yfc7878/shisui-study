import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crop, ImageOff, RotateCcw, X } from 'lucide-react';
import { cropImageRect } from '../lib/image.js';
import { Button, Spinner } from './ui.jsx';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function ImageCropper({
  open, src, title = '裁剪图片', hint = '拖动空白处框选，拖动手柄调整；只保留你需要的内容。',
  onClose, onApply, onSkip,
}) {
  const stageRef = useRef(null);
  const wrapRef = useRef(null);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [rect, setRect] = useState(null);
  const [drag, setDrag] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open || !src) return undefined;
    let alive = true;
    setReady(false);
    setError('');
    setRect(null);
    const image = new Image();
    image.onload = () => {
      if (!alive) return;
      setNatural({ width: image.naturalWidth, height: image.naturalHeight });
      setReady(true);
    };
    image.onerror = () => { if (alive) setError('图片加载失败，请重试'); };
    image.src = src;
    return () => { alive = false; };
  }, [open, src]);

  const fit = useCallback(() => {
    if (!wrapRef.current || !natural.width) return;
    const available = wrapRef.current.clientWidth;
    const maxHeight = Math.min(window.innerHeight * 0.52, 560);
    const scale = Math.min(available / natural.width, maxHeight / natural.height);
    const width = Math.max(80, Math.round(natural.width * scale));
    const height = Math.max(80, Math.round(natural.height * scale));
    setStage({ width, height });
    setRect({ x: 6, y: 6, width: width - 12, height: height - 12 });
  }, [natural]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    fit();
    const timer = setTimeout(fit, 50);
    const observer = new ResizeObserver(() => fit());
    if (wrapRef.current) observer.observe(wrapRef.current);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [open, natural, fit]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => { if (event.key === 'Escape' && !loading) onClose?.(); };
    document.addEventListener('keydown', handler);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = previous;
    };
  }, [open, loading, onClose]);

  const point = (event) => {
    const bounds = stageRef.current.getBoundingClientRect();
    return {
      x: clamp(event.clientX - bounds.left, 0, stage.width),
      y: clamp(event.clientY - bounds.top, 0, stage.height),
    };
  };

  const beginDrag = (event) => {
    if (!ready || !rect) return;
    const target = event.target;
    const handle = target?.dataset?.handle;
    const p = point(event);
    const inside = p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
    if (handle) {
      setDrag({ mode: 'resize', handle, start: p, origin: rect });
    } else if (inside) {
      setDrag({ mode: 'move', start: p, origin: rect });
    } else {
      setDrag({ mode: 'new', start: p, origin: rect });
      setRect({ x: p.x, y: p.y, width: 0, height: 0 });
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event) => {
    if (!drag) return;
    const p = point(event);
    if (drag.mode === 'new') {
      const x = Math.min(drag.start.x, p.x);
      const y = Math.min(drag.start.y, p.y);
      setRect({
        x, y,
        width: Math.max(12, Math.abs(p.x - drag.start.x)),
        height: Math.max(12, Math.abs(p.y - drag.start.y)),
      });
      return;
    }
    if (drag.mode === 'move') {
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      setRect({
        x: clamp(drag.origin.x + dx, 0, stage.width - drag.origin.width),
        y: clamp(drag.origin.y + dy, 0, stage.height - drag.origin.height),
        width: drag.origin.width,
        height: drag.origin.height,
      });
      return;
    }
    const origin = drag.origin;
    let left = origin.x;
    let top = origin.y;
    let right = origin.x + origin.width;
    let bottom = origin.y + origin.height;
    if (drag.handle.includes('w')) left = clamp(p.x, 0, right - 18);
    if (drag.handle.includes('e')) right = clamp(p.x, left + 18, stage.width);
    if (drag.handle.includes('n')) top = clamp(p.y, 0, bottom - 18);
    if (drag.handle.includes('s')) bottom = clamp(p.y, top + 18, stage.height);
    setRect({ x: left, y: top, width: right - left, height: bottom - top });
  };

  const endDrag = () => setDrag(null);

  const apply = async () => {
    if (!rect || !natural.width) return;
    const scale = natural.width / stage.width;
    setLoading(true);
    setError('');
    try {
      const blob = await cropImageRect(src, {
        x: rect.x * scale,
        y: rect.y * scale,
        width: rect.width * scale,
        height: rect.height * scale,
      }, { maxWidth: 1800 });
      await onApply?.(blob);
      onClose?.();
    } catch (err) {
      setError(err.message || '裁剪失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="cropper-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="cropper-panel">
        <header className="cropper-header">
          <div>
            <h2><Crop size={18} /> {title}</h2>
            <p>{hint}</p>
          </div>
          <button type="button" className="cropper-close" onClick={onClose} aria-label="关闭裁剪" disabled={loading}>
            <X size={20} />
          </button>
        </header>

        <div className="cropper-body" ref={wrapRef}>
          {error && <div className="cropper-error"><ImageOff size={16} /> {error}</div>}
          {!ready && !error && <div className="cropper-loading"><Spinner size={26} /><span>正在准备图片…</span></div>}
          {ready && (
            <div
              className="cropper-stage"
              ref={stageRef}
              style={{ width: stage.width, height: stage.height }}
              onPointerDown={beginDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <img src={src} alt="待裁剪" draggable={false} />
              {rect && (
                <div
                  className="cropper-selection"
                  style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
                >
                  <div className="crop-grid">
                    <span /><span /><span /><span />
                  </div>
                  {['nw', 'ne', 'sw', 'se'].map((handle) => (
                    <span key={handle} className={`crop-handle crop-${handle}`} data-handle={handle} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="cropper-footer">
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={fit} disabled={!ready || loading}>全图</Button>
          <span className="cropper-tip">选择区域将以 JPEG 保存，长边最大 1800px</span>
          <div className="cropper-actions">
            {onSkip && <Button variant="secondary" onClick={() => { onSkip(); onClose?.(); }} disabled={loading}>不裁剪，用原图</Button>}
            <Button variant="ghost" onClick={onClose} disabled={loading}>取消</Button>
            <Button variant="primary" icon={Crop} onClick={apply} loading={loading} disabled={!ready}>应用裁剪</Button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
