import { useEffect, useState } from 'react';
import { PenLine } from 'lucide-react';
import {
  Button, Field, Input, Modal, TagInput, Textarea, cx,
} from '../../components/ui.jsx';
import { api, errorMessage } from '../../lib/api.js';
import { SENTENCE_THEMES } from '../../lib/constants.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { notifyReviewChanged } from './helpers.js';

const FORM_ID = 'eng-manual-sentence-form';

const EMPTY = {
  content: '',
  translation: '',
  theme: '',
  title: '',
  summary: '',
  usage: '',
  example: '',
  exampleTranslation: '',
  source: '',
  tags: [],
};

export default function ManualSentenceModal({
  open, onClose, onCreated, existingThemes = [],
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setError('');
    setSaving(false);
  }, [open]);

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const setValue = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const suggestions = Array.from(new Set([
    ...SENTENCE_THEMES,
    ...(existingThemes || []).map((entry) => (typeof entry === 'string' ? entry : entry.theme)).filter(Boolean),
  ])).slice(0, 12);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.content.trim()) {
      setError('英文句子不能为空');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await api.post('/api/sentences', {
        content: form.content.trim(),
        translation: form.translation.trim(),
        theme: form.theme.trim(),
        title: form.title.trim(),
        summary: form.summary.trim(),
        usage: form.usage.trim(),
        example: form.example.trim(),
        exampleTranslation: form.exampleTranslation.trim(),
        source: form.source.trim() || '手动录入',
        sourceType: 'manual',
        tags: form.tags,
        status: 'active',
      });
      toast('已录入佳句', 'success');
      notifyReviewChanged();
      onCreated?.();
      onClose?.();
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      toast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="手动录入佳句"
      description="你自己摘下的句子会直接收录，不经过审阅。"
      size="lg"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
          <Button type="submit" form={FORM_ID} icon={PenLine} loading={saving}>录入</Button>
        </>
      )}
    >
      <form id={FORM_ID} className="eng-manual" onSubmit={submit}>
        <Field label="英文句子" required htmlFor="eng-manual-content" hint="只填这一项也能保存。">
          <Textarea
            id="eng-manual-content"
            rows={4}
            value={form.content}
            onChange={set('content')}
            placeholder="The wind was a torrent of darkness among the gusty trees."
            className="eng-textarea-en"
            autoFocus
          />
        </Field>

        <div className="eng-two">
          <Field label="中文翻译" htmlFor="eng-manual-translation">
            <Textarea
              id="eng-manual-translation"
              rows={3}
              value={form.translation}
              onChange={set('translation')}
              placeholder="风在摇曳的树间奔涌，如一片漆黑的洪流。"
            />
          </Field>
          <div className="eng-manual-side">
            <Field label="主题" htmlFor="eng-manual-theme">
              <Input
                id="eng-manual-theme"
                value={form.theme}
                onChange={set('theme')}
                placeholder="如：环境描写"
                list="eng-manual-theme-list"
              />
              <datalist id="eng-manual-theme-list">
                {suggestions.map((item) => <option key={item} value={item} />)}
              </datalist>
            </Field>
            <div className="eng-suggest-row">
              {suggestions.slice(0, 8).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={cx('eng-suggestion', form.theme === item && 'is-active')}
                  onClick={() => setValue('theme', item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Field label="内容概要" htmlFor="eng-manual-summary" hint="一句话说明这句好在哪里。">
          <Input
            id="eng-manual-summary"
            value={form.summary}
            onChange={set('summary')}
            placeholder="用风与树的意象写出压迫感，适合氛围描写。"
          />
        </Field>

        <Field label="用法" htmlFor="eng-manual-usage">
          <Textarea
            id="eng-manual-usage"
            rows={3}
            value={form.usage}
            onChange={set('usage')}
            placeholder="可用于写景、渲染情绪，注意 a torrent of 的隐喻用法。"
          />
        </Field>

        <div className="eng-two">
          <Field label="仿写例句" htmlFor="eng-manual-example">
            <Textarea
              id="eng-manual-example"
              rows={3}
              value={form.example}
              onChange={set('example')}
              placeholder="Her laughter was a river of light through the quiet house."
              className="eng-textarea-en"
            />
          </Field>
          <Field label="例句翻译" htmlFor="eng-manual-example-translation">
            <Textarea
              id="eng-manual-example-translation"
              rows={3}
              value={form.exampleTranslation}
              onChange={set('exampleTranslation')}
              placeholder="她的笑声像一条光河，穿过安静的屋子。"
            />
          </Field>
        </div>

        <div className="eng-two">
          <Field label="来源" htmlFor="eng-manual-source">
            <Input
              id="eng-manual-source"
              value={form.source}
              onChange={set('source')}
              placeholder="书名 / 文章 / 演讲"
            />
          </Field>
          <Field label="标签" htmlFor="eng-manual-tags" hint="回车或逗号添加，可留空。">
            <TagInput
              value={form.tags}
              onChange={(tags) => setValue('tags', tags)}
              suggestions={['描写', '写作', '阅读', '口语']}
              placeholder="添加标签…"
            />
          </Field>
        </div>

        {error && <p className="eng-form-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
