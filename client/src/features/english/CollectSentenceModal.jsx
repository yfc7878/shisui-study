import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown, ImagePlus, ScanText, Sparkles, WandSparkles, X,
} from 'lucide-react';
import {
  Button, Field, Input, Modal, Segmented, Textarea, Toggle, cx,
} from '../../components/ui.jsx';
import { api, errorMessage, uploadImages } from '../../lib/api.js';
import { SENTENCE_THEMES } from '../../lib/constants.js';
import { compressImageFile } from '../../lib/image.js';
import { getAiConfig, getPromptExtras, loadSettings } from '../../lib/settings.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { AiProgress, NoApiKeyNotice, useApiKey } from './shared.jsx';
import { notifyReviewChanged } from './helpers.js';

const FORM_ID = 'eng-collect-sentence-form';
const MAX_IMAGES = 6;

const MODE_OPTIONS = [
  { value: 'topic', label: '主题生成', icon: Sparkles },
  { value: 'text', label: '文本提取', icon: ScanText },
  { value: 'images', label: '图片提取', icon: ImagePlus },
];

export default function CollectSentenceModal({
  open, onClose, onCreated, existingThemes = [],
}) {
  const ready = useApiKey();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  const [mode, setMode] = useState('topic');
  const [topic, setTopic] = useState('');
  const [text, setText] = useState('');
  const [images, setImages] = useState([]);
  const [count, setCount] = useState(6);
  const [think, setThink] = useState(false);
  const [extra, setExtra] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode('topic');
    setTopic('');
    setText('');
    setImages([]);
    setCount(6);
    setThink(Boolean(loadSettings().ai.thinkDefault));
    setExtra('');
    setError('');
    setElapsed(0);
    setUploading(false);
    setSubmitting(false);
  }, [open]);

  useEffect(() => {
    if (!submitting) return undefined;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [submitting]);

  const suggestions = Array.from(new Set([
    ...SENTENCE_THEMES,
    ...(existingThemes || []).map((entry) => (typeof entry === 'string' ? entry : entry.theme)).filter(Boolean),
  ])).slice(0, 12);

  const addFiles = async (fileList) => {
    if (uploading) return;
    const picked = Array.from(fileList || []).filter((file) => file?.type?.startsWith('image/'));
    if (!picked.length) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      toast(`最多上传 ${MAX_IMAGES} 张图片`, 'info');
      return;
    }
    if (picked.length > room) toast(`最多上传 ${MAX_IMAGES} 张，已截取前 ${room} 张`, 'info');
    setUploading(true);
    setError('');
    try {
      const compressed = [];
      for (const file of picked.slice(0, room)) {
        try {
          compressed.push(await compressImageFile(file, { maxSize: 1800 }));
        } catch (err) {
          toast(`${file.name || '图片'} 处理失败：${errorMessage(err)}`, 'error');
        }
      }
      if (!compressed.length) return;
      const uploaded = await uploadImages(compressed);
      setImages((prev) => [...prev, ...(uploaded || [])].slice(0, MAX_IMAGES));
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeImage = (id) => setImages((prev) => prev.filter((image) => image.id !== id));

  const submit = async (event) => {
    event.preventDefault();
    if (!ready) {
      toast('请先在设置中配置 API Key', 'error', {
        action: { label: '去设置', onClick: () => navigate('/settings') },
      });
      return;
    }
    const trimmedTopic = topic.trim();
    const trimmedText = text.trim();
    if (mode === 'topic' && !trimmedTopic) {
      setError('请填写一个中文主题，例如「环境描写」或「科技与生活」');
      return;
    }
    if (mode === 'text' && trimmedText.length < 20) {
      setError('请粘贴至少一两句英文文本，让 AI 有内容可提取');
      return;
    }
    if (mode === 'images' && !images.length) {
      setError('请先上传至少一张包含英文的图片');
      return;
    }

    setError('');
    setSubmitting(true);
    setElapsed(0);
    try {
      const data = await api.post('/api/ai/sentences', {
        mode,
        topic: mode === 'topic' ? trimmedTopic : '',
        text: mode === 'text' ? trimmedText : '',
        imageIds: mode === 'images' ? images.map((image) => image.id) : [],
        count: Number(count) || 6,
        think,
        extraInstructions: extra.trim(),
        ai: getAiConfig(),
      }, { timeout: 300_000 });
      const total = data.items?.length || 0;
      toast(`已生成 ${total} 条佳句，已放入待审阅`, 'success', {
        action: { label: '立即审阅', onClick: () => navigate('/review?type=sentence') },
      });
      notifyReviewChanged();
      onCreated?.(data);
      onClose?.();
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      toast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const stageLabel = elapsed > 35 ? '句子较多时会更久一些，请再等一会儿…' : '正在阅读并提炼佳句…';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI 收集佳句"
      description="从主题、文本或图片里拾取值得背下来的英文句子，生成后会先放进待审阅。"
      size="lg"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>取消</Button>
          <Button
            type="submit"
            form={FORM_ID}
            variant="primary"
            icon={WandSparkles}
            loading={submitting}
            disabled={!ready || uploading}
          >
            {submitting ? '正在生成…' : '生成佳句'}
          </Button>
        </>
      )}
    >
      <form id={FORM_ID} className="eng-collect" onSubmit={submit}>
        {!ready && <NoApiKeyNotice />}

        <Segmented
          ariaLabel="佳句来源"
          options={MODE_OPTIONS.map((option) => ({ ...option, icon: option.icon }))}
          value={mode}
          onChange={(next) => { setMode(next); setError(''); }}
        />

        {mode === 'topic' && (
          <div className="eng-collect-panel">
            <Field
              label="中文主题"
              hint="AI 会围绕这个主题写一批可直接用于写作的英文佳句。"
              required
              htmlFor="eng-collect-topic"
            >
              <Input
                id="eng-collect-topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="如：环境描写、科技与生活、成长的代价"
                autoComplete="off"
              />
            </Field>
            <div className="eng-suggest-row">
              {suggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="eng-suggestion"
                  onClick={() => setTopic(item)}
                >
                  + {item}
                </button>
              ))}
            </div>
            <div className="eng-count-row">
              <Field label="生成条数" htmlFor="eng-collect-count" className="grow">
                <div className="eng-range-wrap">
                  <input
                    id="eng-collect-count"
                    className="eng-range"
                    type="range"
                    min="3"
                    max="10"
                    step="1"
                    value={count}
                    onChange={(event) => setCount(Number(event.target.value))}
                  />
                  <output className="eng-range-value" htmlFor="eng-collect-count">{count} 条</output>
                </div>
              </Field>
            </div>
          </div>
        )}

        {mode === 'text' && (
          <div className="eng-collect-panel">
            <Field
              label="英文文本"
              hint="粘贴一段阅读材料、作文范文或台词，AI 会从中挑出佳句并补上翻译与用法。"
              required
              htmlFor="eng-collect-text"
            >
              <Textarea
                id="eng-collect-text"
                rows={9}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={'Paste any English passage here…\n\n例如一段外刊、一篇范文，或你正在读的小说。'}
                className="eng-textarea-en"
              />
            </Field>
            <div className="eng-inline-hint">
              <ScanText size={14} />
              至少粘贴一两句，文本越长，可提取的佳句越丰富。
            </div>
          </div>
        )}

        {mode === 'images' && (
          <div className="eng-collect-panel">
            <div
              className={cx('eng-drop', dragging && 'is-drag', (uploading || images.length >= MAX_IMAGES) && 'is-disabled')}
              role="button"
              tabIndex={0}
              aria-label="上传图片"
              onClick={() => { if (!uploading && images.length < MAX_IMAGES) fileInputRef.current?.click(); }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  if (!uploading && images.length < MAX_IMAGES) fileInputRef.current?.click();
                }
              }}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (images.length >= MAX_IMAGES) return;
                addFiles(event.dataTransfer?.files);
              }}
            >
              <span className="eng-drop-icon"><ImagePlus size={22} /></span>
              <strong>{uploading ? '正在压缩并上传…' : '拖拽图片到这里，或点击选择'}</strong>
              <span>已选 {images.length} / {MAX_IMAGES} 张 · 自动压缩到 1800px</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => addFiles(event.target.files)}
            />
            {images.length > 0 && (
              <div className="eng-thumbs">
                {images.map((image, index) => (
                  <div className="eng-thumb" key={image.id}>
                    <img src={image.url} alt={image.name || `图片 ${index + 1}`} loading="lazy" />
                    <button
                      type="button"
                      className="eng-thumb-remove"
                      aria-label={`移除第 ${index + 1} 张图片`}
                      onClick={() => removeImage(image.id)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="eng-inline-hint">
              <ImagePlus size={14} />
              拍照或截图都可以，纸张尽量平整、光线均匀。
            </div>
          </div>
        )}

        <div className="eng-collect-foot">
          <Toggle
            checked={think}
            onChange={setThink}
            label="深度思考 (Think)"
            description="让模型先推理再输出，更慢，但选句更准。"
          />
        </div>

        <details className="eng-advanced">
          <summary>
            <ChevronDown size={14} className="eng-advanced-chev" />
            高级选项
          </summary>
          <Field
            label="额外提示词"
            hint="会附加到本次生成任务，例如「多给长难句」「避免使用雅思词汇」。"
            htmlFor="eng-collect-extra"
          >
            <Textarea
              id="eng-collect-extra"
              rows={3}
              value={extra}
              onChange={(event) => setExtra(event.target.value)}
              placeholder="可选：补充你的偏好…"
            />
          </Field>
        </details>

        {submitting && <AiProgress label={stageLabel} elapsed={elapsed} />}
        {error && <p className="eng-form-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
