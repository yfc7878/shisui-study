import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, Copy, RotateCcw, Trash2 } from 'lucide-react';
import {
  Badge, Button, Field, Input, Modal, TagInput, Textarea, cx,
} from '../../components/ui.jsx';
import { api, errorMessage } from '../../lib/api.js';
import { SENTENCE_THEMES } from '../../lib/constants.js';
import { formatDateTime } from '../../lib/format.js';
import { getAiConfig, getPromptExtras } from '../../lib/settings.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { copyText, notifyReviewChanged, sentenceToText } from './helpers.js';
import {
  AiMetaDetails, NoApiKeyNotice, ThemeBadge, useApiKey,
} from './shared.jsx';

const EMPTY_FORM = {
  theme: '',
  title: '',
  summary: '',
  content: '',
  translation: '',
  usage: '',
  example: '',
  exampleTranslation: '',
  source: '',
  tags: [],
};

const TAG_SUGGESTIONS = ['写作', '阅读', '口语', '描写', '议论', '高级替换'];

export default function SentenceEditorModal({
  open, item, onClose, onSaved, onTrashed, onChanged,
}) {
  const ready = useApiKey();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState('');
  const [aiInfo, setAiInfo] = useState({ aiMeta: {}, reasoning: '', think: false });

  const pending = item?.status === 'pending';

  useEffect(() => {
    if (!open || !item) return;
    setForm({
      theme: item.theme || '',
      title: item.title || '',
      summary: item.summary || '',
      content: item.content || '',
      translation: item.translation || '',
      usage: item.usage || '',
      example: item.example || '',
      exampleTranslation: item.exampleTranslation || '',
      source: item.source || '',
      tags: Array.isArray(item.tags) ? item.tags : [],
    });
    setAiInfo({ aiMeta: item.aiMeta || {}, reasoning: item.reasoning || '', think: Boolean(item.think) });
    setError('');
    setSaving(false);
    setRegenerating(false);
  }, [open, item]);

  if (!item) return null;

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const setValue = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const buildPayload = () => ({
    theme: form.theme.trim(),
    title: form.title.trim(),
    summary: form.summary.trim(),
    content: form.content.trim(),
    translation: form.translation.trim(),
    usage: form.usage.trim(),
    example: form.example.trim(),
    exampleTranslation: form.exampleTranslation.trim(),
    source: form.source.trim(),
    tags: form.tags,
  });

  const save = async ({ approve = false } = {}) => {
    if (!form.content.trim()) {
      setError('英文句子不能为空');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await api.patch(`/api/sentences/${item.id}`, {
        ...buildPayload(),
        ...(approve ? { status: 'active' } : {}),
      });
      toast(approve ? '已通过并归档' : '佳句已保存', 'success');
      notifyReviewChanged();
      onSaved?.(approve);
      onClose?.();
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      toast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    if (!ready) {
      toast('请先在设置中配置 API Key', 'error', {
        action: { label: '去设置', onClick: () => navigate('/settings') },
      });
      return;
    }
    setError('');
    setRegenerating(true);
    try {
      const data = await api.post(`/api/ai/sentences/${item.id}/regenerate`, {
        think: Boolean(item.think),
        ai: getAiConfig(),
        extraInstructions: getPromptExtras().sentences,
      }, { timeout: 240_000 });
      const next = data.item || {};
      setForm((prev) => ({
        ...prev,
        theme: next.theme ?? prev.theme,
        title: next.title ?? prev.title,
        summary: next.summary ?? prev.summary,
        content: next.content ?? prev.content,
        translation: next.translation ?? prev.translation,
        usage: next.usage ?? prev.usage,
        example: next.example ?? prev.example,
        exampleTranslation: next.exampleTranslation ?? prev.exampleTranslation,
        tags: Array.isArray(next.tags) ? next.tags : prev.tags,
      }));
      setAiInfo({
        aiMeta: next.aiMeta || {},
        reasoning: next.reasoning || '',
        think: Boolean(next.think),
      });
      toast('AI 已重新生成这句佳句，记得保存', 'success');
      notifyReviewChanged();
      onChanged?.();
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      toast(message, 'error');
    } finally {
      setRegenerating(false);
    }
  };

  const moveToTrash = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/sentences/${item.id}`, { status: 'trashed' });
      toast('已移入回收站', 'success');
      notifyReviewChanged();
      onTrashed?.();
      onClose?.();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    try {
      await copyText(sentenceToText({ ...item, ...form }));
      toast('已复制这句佳句', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const themeSuggestions = SENTENCE_THEMES;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="佳句详情"
      description="读一读，改一改，再让它留在你的本子里。"
      size="xl"
      footer={(
        <div className="eng-footer-split">
          <Button
            variant="danger-ghost"
            size="sm"
            icon={Trash2}
            onClick={moveToTrash}
            disabled={saving || regenerating}
          >
            移入回收站
          </Button>
          <div className="eng-footer-actions">
            <Button variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
            <Button
              variant={pending ? 'secondary' : 'primary'}
              onClick={() => save()}
              loading={saving}
              disabled={regenerating}
            >
              保存
            </Button>
            {pending && (
              <Button
                variant="primary"
                icon={Check}
                onClick={() => save({ approve: true })}
                loading={saving}
                disabled={regenerating}
              >
                通过并归档
              </Button>
            )}
          </div>
        </div>
      )}
    >
      <div className="eng-editor">
        {!ready && <NoApiKeyNotice />}

        <div className="eng-preview">
          <div className="eng-preview-head">
            <ThemeBadge theme={form.theme} />
            {form.title ? <span className="eng-preview-title">{form.title}</span> : null}
            <span className="eng-preview-grow" />
            {pending ? <Badge tone="amber" dot>待审阅</Badge> : <Badge tone="green" dot>已收录</Badge>}
            <Button variant="ghost" size="sm" icon={Copy} onClick={copy}>复制</Button>
          </div>
          <p className={cx('eng-preview-en', !form.content && 'is-placeholder')}>
            {form.content || '在这里写下你拾到的句子…'}
          </p>
          <p className={cx('eng-preview-zh', !form.translation && 'is-placeholder')}>
            {form.translation || '（还没有翻译）'}
          </p>
        </div>

        <div className="eng-form-grid">
          <div className="eng-form-main">
            <Field label="英文句子" required htmlFor="eng-sentence-content">
              <Textarea
                id="eng-sentence-content"
                rows={3}
                value={form.content}
                onChange={set('content')}
                className="eng-textarea-en"
                placeholder="The quietest moments often hold the loudest truths."
              />
            </Field>
            <Field label="中文翻译" htmlFor="eng-sentence-translation">
              <Textarea
                id="eng-sentence-translation"
                rows={2}
                value={form.translation}
                onChange={set('translation')}
                placeholder="最安静的时刻，往往藏着最响亮的真相。"
              />
            </Field>
            <Field label="用法 / 赏析" htmlFor="eng-sentence-usage" hint="适合什么场景、句式亮点、可替换表达。">
              <Textarea
                id="eng-sentence-usage"
                rows={4}
                value={form.usage}
                onChange={set('usage')}
                placeholder="适合用在议论文开头，quietest 与 loudest 形成反差…"
              />
            </Field>
            <div className="eng-two">
              <Field label="仿写例句" htmlFor="eng-sentence-example">
                <Textarea
                  id="eng-sentence-example"
                  rows={3}
                  value={form.example}
                  onChange={set('example')}
                  className="eng-textarea-en"
                  placeholder="The smallest acts often carry the greatest weight."
                />
              </Field>
              <Field label="例句翻译" htmlFor="eng-sentence-example-translation">
                <Textarea
                  id="eng-sentence-example-translation"
                  rows={3}
                  value={form.exampleTranslation}
                  onChange={set('exampleTranslation')}
                  placeholder="最小的举动，往往承载着最重的分量。"
                />
              </Field>
            </div>
          </div>

          <aside className="eng-form-side">
            <Field label="主题" htmlFor="eng-sentence-theme">
              <Input
                id="eng-sentence-theme"
                value={form.theme}
                onChange={set('theme')}
                placeholder="如：环境描写"
                list="eng-sentence-theme-list"
              />
              <datalist id="eng-sentence-theme-list">
                {themeSuggestions.map((theme) => <option key={theme} value={theme} />)}
              </datalist>
            </Field>
            <div className="eng-suggest-row">
              {themeSuggestions.slice(0, 8).map((theme) => (
                <button
                  key={theme}
                  type="button"
                  className={cx('eng-suggestion', form.theme === theme && 'is-active')}
                  onClick={() => setValue('theme', theme)}
                >
                  {theme}
                </button>
              ))}
            </div>
            <Field label="小标题" htmlFor="eng-sentence-title" hint="选填，用于卡片上的简短标记。">
              <Input
                id="eng-sentence-title"
                value={form.title}
                onChange={set('title')}
                placeholder="如：风的隐喻"
              />
            </Field>
            <Field label="内容概要" htmlFor="eng-sentence-summary">
              <Textarea
                id="eng-sentence-summary"
                rows={3}
                value={form.summary}
                onChange={set('summary')}
                placeholder="一句话说明这句好在哪里。"
              />
            </Field>
            <Field label="来源" htmlFor="eng-sentence-source">
              <Input
                id="eng-sentence-source"
                value={form.source}
                onChange={set('source')}
                placeholder="书名 / 文章 / 演讲"
              />
            </Field>
            <Field label="标签" hint="回车或逗号添加">
              <TagInput
                value={form.tags}
                onChange={(tags) => setValue('tags', tags)}
                suggestions={TAG_SUGGESTIONS}
                placeholder="添加标签…"
              />
            </Field>

            <div className="eng-side-meta">
              <div className="eng-meta-line">
                <span>收录时间</span>
                <strong>{formatDateTime(item.createdAt)}</strong>
              </div>
              {item.reviewedAt ? (
                <div className="eng-meta-line">
                  <span>通过时间</span>
                  <strong>{formatDateTime(item.reviewedAt)}</strong>
                </div>
              ) : null}
              <div className="eng-meta-line">
                <span>最近修改</span>
                <strong>{formatDateTime(item.updatedAt)}</strong>
              </div>
            </div>

            <div className="eng-ai-box">
              <div className="eng-ai-box-head">
                <AiMetaDetails item={{ ...item, ...aiInfo, reasoning: '' }} />
                <Button
                  variant="secondary"
                  size="sm"
                  icon={RotateCcw}
                  onClick={regenerate}
                  loading={regenerating}
                  disabled={saving}
                >
                  AI 重来
                </Button>
              </div>
              <p className="eng-ai-box-hint">
                AI 会基于原句重新润色并覆盖左侧内容，保存后才会生效。
              </p>
            </div>

            <details className="eng-advanced">
              <summary>
                <ChevronDown size={14} className="eng-advanced-chev" />
                生成时的完整思考
              </summary>
              <pre className="eng-reasoning">
                {aiInfo.reasoning || item.reasoning || '这条记录没有保存思考过程。'}
              </pre>
            </details>
          </aside>
        </div>

        {error && <p className="eng-form-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
