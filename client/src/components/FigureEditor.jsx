import { useState } from 'react';
import { Crop, ImagePlus, Loader2, Maximize2, Trash2, WandSparkles } from 'lucide-react';
import { uploadBlob } from '../lib/api.js';
import { cropImageRegion } from '../lib/image.js';
import { Button, IconButton, Lightbox, Modal, cx } from './ui.jsx';
import ImageCropper from './ImageCropper.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

export default function FigureEditor({ images = [], figures = [], hints = [], onChange, onError }) {
  const { toast } = useToast();
  const [autoLoading, setAutoLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cropper, setCropper] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  const alreadyCropped = (hint) => figures.some((figure) => (
    figure.imageId === (images[hint.imageIndex]?.id) &&
    Array.isArray(figure.bbox) &&
    hint.bbox.every((value, index) => Math.abs(value - figure.bbox[index]) < 0.005)
  ));

  const autoCrop = async () => {
    if (!images.length || !hints.length) return;
    setAutoLoading(true);
    let added = 0;
    try {
      const next = [...figures];
      for (const hint of hints) {
        if (alreadyCropped(hint)) continue;
        const source = images[hint.imageIndex];
        if (!source?.url) continue;
        const blob = await cropImageRegion(source.url, hint.bbox);
        const uploaded = await uploadBlob(blob, `figure-${Date.now()}.jpg`);
        if (uploaded) {
          next.push({
            ...uploaded,
            imageId: source.id,
            bbox: hint.bbox,
            caption: hint.caption || '题目配图',
          });
          added += 1;
        }
      }
      onChange(next);
      if (added) toast(`已裁剪 ${added} 张题目配图，可继续调整`, 'success');
      else toast('这些配图已经裁剪过了', 'info');
    } catch (error) {
      toast(error.message || '自动裁剪失败，请手动裁剪', 'error');
      onError?.(error);
    } finally {
      setAutoLoading(false);
    }
  };

  const handleManualCrop = async (blob) => {
    const uploaded = await uploadBlob(blob, `figure-${Date.now()}.jpg`);
    if (!uploaded) return;
    if (cropper?.replaceIndex !== undefined) {
      const index = cropper.replaceIndex;
      onChange(figures.map((figure, i) => (i === index ? { ...figure, ...uploaded } : figure)));
      toast('配图已更新', 'success');
    } else {
      onChange([...figures, { ...uploaded, caption: '题目配图' }]);
      toast('配图已添加', 'success');
    }
  };

  const updateFigure = (index, patch) => {
    onChange(figures.map((figure, i) => (i === index ? { ...figure, ...patch } : figure)));
  };

  const remove = (index) => onChange(figures.filter((_, i) => i !== index));
  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= figures.length) return;
    const next = [...figures];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="figure-editor">
      <div className="figure-toolbar">
        <div>
          <span className="field-label">题目配图</span>
          <p className="field-hint">函数图、几何图等会被单独裁剪，在导出 Word 时随题目一起排版。</p>
        </div>
        <div className="row-wrap">
          {hints.length > 0 && (
            <Button variant="soft" size="sm" icon={autoLoading ? Loader2 : WandSparkles} onClick={autoCrop} loading={autoLoading}>
              按 AI 标记裁剪 {hints.length}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={ImagePlus}
            onClick={() => {
              if (images.length === 1) setCropper({ src: images[0].url, imageId: images[0].id });
              else setPickerOpen(true);
            }}
            disabled={!images.length}
          >
            手动裁剪配图
          </Button>
        </div>
      </div>

      {figures.length === 0 ? (
        <div className="figure-empty">
          <Crop size={20} />
          <div>
            <strong>还没有配图</strong>
            <span>如果题目含图像，可从原图中裁剪并附在题目后。</span>
          </div>
        </div>
      ) : (
        <div className="figure-grid">
          {figures.map((figure, index) => (
            <figure className={cx('figure-item')} key={figure.id || index}>
              <button type="button" className="figure-thumb" onClick={() => setLightbox(figure)}>
                <img src={figure.url} alt={figure.caption || '题目配图'} loading="lazy" />
                <span className="figure-zoom"><Maximize2 size={14} /></span>
              </button>
              <figcaption>
                <input
                  className="input input-sm"
                  value={figure.caption || ''}
                  onChange={(event) => updateFigure(index, { caption: event.target.value })}
                  placeholder="图注，如：函数图像"
                  aria-label="配图说明"
                />
                <div className="figure-actions">
                  <IconButton icon={Crop} label="重新裁剪" size="sm" onClick={() => setCropper({ src: images.find((image) => image.id === figure.imageId)?.url || images[0]?.url, imageId: figure.imageId || images[0]?.id, replaceIndex: index })} />
                  <button type="button" className="figure-move" onClick={() => move(index, -1)} disabled={index === 0} aria-label="前移">↑</button>
                  <button type="button" className="figure-move" onClick={() => move(index, 1)} disabled={index === figures.length - 1} aria-label="后移">↓</button>
                  <IconButton icon={Trash2} label="删除配图" size="sm" variant="ghost" onClick={() => remove(index)} />
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="选择原图" description="从哪张 uploaded 图片中裁剪配图？" size="md">
        <div className="source-image-grid">
          {images.map((image, index) => (
            <button
              type="button"
              key={image.id}
              className="source-image-option"
              onClick={() => { setPickerOpen(false); setCropper({ src: image.url, imageId: image.id }); }}
            >
              <img src={image.url} alt={`原图 ${index + 1}`} />
              <span>第 {index + 1} 张</span>
            </button>
          ))}
        </div>
      </Modal>

      <ImageCropper
        open={Boolean(cropper?.src)}
        src={cropper?.src}
        title="裁剪题目配图"
        hint="只框住函数图/几何图等图形本身，不要包含大段文字。"
        onClose={() => setCropper(null)}
        onApply={handleManualCrop}
      />
      <Lightbox open={Boolean(lightbox)} src={lightbox?.url} alt={lightbox?.caption} onClose={() => setLightbox(null)} />
    </div>
  );
}
