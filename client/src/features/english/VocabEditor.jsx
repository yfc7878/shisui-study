import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Save, X } from 'lucide-react';
import {
  Button, Field, IconButton, Input, Select, TagInput, Textarea, cx,
} from '../../components/ui.jsx';
import { api, errorMessage } from '../../lib/api.js';
import { VOCAB_THEMES } from '../../lib/constants.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { notifyReviewChanged } from './helpers.js';

const ROW_DEFAULTS = {
  definitions: { pos: '', zh: '', en: '' },
  extensions: { label: '', content: '' },
  collocations: { phrase: '', zh: '' },
  synonyms: { word: '', zh: '' },
  antonyms: { word: '', zh: '' },
  examples: { en: '', zh: '' },
  related: { word: '', relation: '' },
};

function rowsOf(list, key) {
  const defaults = ROW_DEFAULTS[key] || {};
  if (!Array.isArray(list)) return [];
  return list.map((row) => ({ ...defaults, ...(row && typeof row === 'object' ? row : {}) }));
}

function buildForm(item) {
  const data = item?.data || {};
  return {
    term: item?.term || '',
    entryType: item?.entryType === 'phrase' ? 'phrase' : 'word',
    theme: item?.theme || '',
    data: {
      phonetic: data.phonetic || '',
      partOfSpeech: Array.isArray(data.partOfSpeech) ? data.partOfSpeech : [],
      coreTranslation: data.coreTranslation || '',
      usage: data.usage || '',
      confusions: data.confusions || '',
      memoryTip: data.memoryTip || '',
      examTips: data.examTips || '',
      definitions: rowsOf(data.definitions, 'definitions'),
      extensions: rowsOf(data.extensions, 'extensions'),
      collocations: rowsOf(data.collocations, 'collocations'),
      synonyms: rowsOf(data.synonyms, 'synonyms'),
      antonyms: rowsOf(data.antonyms, 'antonyms'),
      examples: rowsOf(data.examples, 'examples'),
      related: rowsOf(data.related, 'related'),
    },
  };
}

function cleanRows(rows) {
  return rows
    .map((row) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]),
    ))
    .filter((row) => Object.values(row).some(Boolean));
}

function Repeater({
  label, hint, items, fields, onChange, addLabel = '添加一项', empty = '暂无内容',
}) {
  const add = () => {
    const next = {};
    fields.forEach((field) => { next[field.key] = ''; });
    onChange([...items, next]);
  };
  const remove = (index) => onChange(items.filter((_, i) => i !== index));
  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const update = (index, key, value) => onChange(
    items.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
  );

  return (
    <div className="eng-rep">
      <div className="eng-rep-head">
        <span className="eng-rep-label">{label}</span>
        {items.length > 0 ? <span className="eng-rep-count">{items.length}</span> : null}
      </div>
      {hint ? <p className="eng-rep-hint">{hint}</p> : null}
      {items.length === 0 ? <p className="eng-rep-empty">{empty}</p> : null}
      {items.map((row, index) => (
        <div className="eng-rep-row" key={index}>
          <div className="eng-rep-fields">
            {fields.map((field) => (
              <span className={cx('eng-rep-field', field.full && 'is-full')} key={field.key}>
                {field.multiline ? (
                  <Textarea
                    rows={2}
                    value={row[field.key] || ''}
                    onChange={(event) => update(index, field.key, event.target.value)}
                    placeholder={field.placeholder}
                    aria-label={`${label} 第 ${index + 1} 项 ${field.label}`}
                  />
                ) : (
                  <Input
                    value={row[field.key] || ''}
                    onChange={(event) => update(index, field.key, event.target.value)}
                    placeholder={field.placeholder}
                    aria-label={`${label} 第 ${index + 1} 项 ${field.label}`}
                  />
                )}
              </span>
            ))}
          </div>
          <div className="eng-rep-actions">
            <IconButton
              icon={ChevronUp}
              size="sm"
              label="上移"
              onClick={() => move(index, -1)}
              disabled={index === 0}
            />
            <IconButton
              icon={ChevronDown}
              size="sm"
              label="下移"
              onClick={() => move(index, 1)}
              disabled={index === items.length - 1}
            />
            <IconButton
              icon={X}
              size="sm"
              variant="danger"
              label="删除这一项"
              onClick={() => remove(index)}
            />
          </div>
        </div>
      ))}
      <Button size="sm" variant="soft" icon={Plus} onClick={add} className="eng-rep-add">{addLabel}</Button>
    </div>
  );
}

export default function VocabEditor({ item, onSaved, onCancel }) {
  const { toast } = useToast();
  const [form, setForm] = useState(() => buildForm(item));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const themeSuggestions = useMemo(() => Array.from(new Set([
    ...VOCAB_THEMES,
    form.theme,
  ].filter(Boolean))), [form.theme]);

  const setRoot = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setData = (key, value) => setForm((prev) => ({ ...prev, data: { ...prev.data, [key]: value } }));
  const setRepeater = (key) => (rows) => setData(key, rows);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.term.trim()) {
      setError('单词或词组不能为空');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const data = {
        term: form.term.trim(),
        entryType: form.entryType,
        theme: form.theme.trim(),
        phonetic: form.data.phonetic.trim(),
        partOfSpeech: form.data.partOfSpeech.map((entry) => entry.trim()).filter(Boolean),
        coreTranslation: form.data.coreTranslation.trim(),
        usage: form.data.usage.trim(),
        confusions: form.data.confusions.trim(),
        memoryTip: form.data.memoryTip.trim(),
        examTips: form.data.examTips.trim(),
        definitions: cleanRows(form.data.definitions),
        extensions: cleanRows(form.data.extensions),
        collocations: cleanRows(form.data.collocations),
        synonyms: cleanRows(form.data.synonyms),
        antonyms: cleanRows(form.data.antonyms),
        examples: cleanRows(form.data.examples),
        related: cleanRows(form.data.related),
      };
      const response = await api.patch(`/api/vocab/${item.id}`, {
        term: form.term.trim(),
        entryType: form.entryType,
        theme: form.theme.trim(),
        data,
      });
      toast('词条已保存', 'success');
      notifyReviewChanged();
      onSaved?.(response.item);
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      toast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="eng-edit" onSubmit={submit}>
      <div className="eng-edit-grid">
        <div className="eng-edit-col">
          <section className="eng-edit-card">
            <h3>基础信息</h3>
            <div className="eng-two">
              <Field label="单词 / 词组" required htmlFor="eng-vocab-term">
                <Input
                  id="eng-vocab-term"
                  value={form.term}
                  onChange={(event) => setRoot('term', event.target.value)}
                  className="eng-input-en"
                  placeholder="resilience"
                />
              </Field>
              <Field label="类型" htmlFor="eng-vocab-type">
                <Select
                  id="eng-vocab-type"
                  value={form.entryType}
                  onChange={(event) => setRoot('entryType', event.target.value)}
                >
                  <option value="word">单词</option>
                  <option value="phrase">词组</option>
                </Select>
              </Field>
            </div>
            <div className="eng-two">
              <Field label="音标" htmlFor="eng-vocab-phonetic">
                <Input
                  id="eng-vocab-phonetic"
                  value={form.data.phonetic}
                  onChange={(event) => setData('phonetic', event.target.value)}
                  placeholder="/rɪˈzɪliəns/"
                />
              </Field>
              <Field label="主题" htmlFor="eng-vocab-theme">
                <Input
                  id="eng-vocab-theme"
                  value={form.theme}
                  onChange={(event) => setRoot('theme', event.target.value)}
                  placeholder="如：高频词"
                  list="eng-vocab-theme-list"
                />
                <datalist id="eng-vocab-theme-list">
                  {themeSuggestions.map((theme) => <option key={theme} value={theme} />)}
                </datalist>
              </Field>
            </div>
            <div className="eng-suggest-row">
              {themeSuggestions.map((theme) => (
                <button
                  key={theme}
                  type="button"
                  className={cx('eng-suggestion', form.theme === theme && 'is-active')}
                  onClick={() => setRoot('theme', theme)}
                >
                  {theme}
                </button>
              ))}
            </div>
            <Field label="词性" hint="回车添加，如 n. / v. / adj.">
              <TagInput
                value={form.data.partOfSpeech}
                onChange={(value) => setData('partOfSpeech', value)}
                suggestions={['n.', 'v.', 'adj.', 'adv.', 'phr.']}
                placeholder="添加词性…"
              />
            </Field>
            <Field label="核心翻译" htmlFor="eng-vocab-core">
              <Textarea
                id="eng-vocab-core"
                rows={2}
                value={form.data.coreTranslation}
                onChange={(event) => setData('coreTranslation', event.target.value)}
                placeholder="韧性；恢复力；适应力"
              />
            </Field>
          </section>

          <section className="eng-edit-card">
            <h3>释义</h3>
            <Repeater
              label="分项释义"
              hint="按词性拆开写，英文释义可选。"
              items={form.data.definitions}
              onChange={setRepeater('definitions')}
              addLabel="添加释义"
              empty="还没有分项释义"
              fields={[
                { key: 'pos', label: '词性', placeholder: 'n.' },
                { key: 'zh', label: '中文', placeholder: '韧性' },
                { key: 'en', label: '英文', placeholder: 'the ability to recover quickly', full: true, multiline: true },
              ]}
            />
          </section>

          <section className="eng-edit-card">
            <h3>用法与延伸</h3>
            <Field label="用法" htmlFor="eng-vocab-usage" hint="支持 Markdown。">
              <Textarea
                id="eng-vocab-usage"
                rows={4}
                value={form.data.usage}
                onChange={(event) => setData('usage', event.target.value)}
                placeholder="作不可数名词，常与 build / show 搭配…"
              />
            </Field>
            <Repeater
              label="延伸（熟词生义、辨析、构词等）"
              items={form.data.extensions}
              onChange={setRepeater('extensions')}
              addLabel="添加延伸"
              empty="暂无延伸内容"
              fields={[
                { key: 'label', label: '标签', placeholder: '熟词生义' },
                { key: 'content', label: '内容', placeholder: '…', full: true, multiline: true },
              ]}
            />
          </section>
        </div>

        <div className="eng-edit-col">
          <section className="eng-edit-card">
            <h3>搭配与关联</h3>
            <Repeater
              label="常用搭配"
              items={form.data.collocations}
              onChange={setRepeater('collocations')}
              addLabel="添加搭配"
              empty="暂无搭配"
              fields={[
                { key: 'phrase', label: '搭配', placeholder: 'build resilience' },
                { key: 'zh', label: '中文', placeholder: '培养韧性' },
              ]}
            />
            <div className="eng-edit-divider" />
            <Repeater
              label="同义词"
              items={form.data.synonyms}
              onChange={setRepeater('synonyms')}
              addLabel="添加同义词"
              empty="暂无同义词"
              fields={[
                { key: 'word', label: '单词', placeholder: 'toughness' },
                { key: 'zh', label: '中文', placeholder: '坚韧' },
              ]}
            />
            <div className="eng-edit-divider" />
            <Repeater
              label="反义词"
              items={form.data.antonyms}
              onChange={setRepeater('antonyms')}
              addLabel="添加反义词"
              empty="暂无反义词"
              fields={[
                { key: 'word', label: '单词', placeholder: 'fragility' },
                { key: 'zh', label: '中文', placeholder: '脆弱' },
              ]}
            />
            <div className="eng-edit-divider" />
            <Repeater
              label="相关词"
              items={form.data.related}
              onChange={setRepeater('related')}
              addLabel="添加相关词"
              empty="暂无相关词"
              fields={[
                { key: 'word', label: '单词', placeholder: 'resilient' },
                { key: 'relation', label: '关系', placeholder: '形容词形式' },
              ]}
            />
          </section>

          <section className="eng-edit-card">
            <h3>例句</h3>
            <Repeater
              label="例句"
              hint="英文用 Georgia 显示，建议每句都配中文。"
              items={form.data.examples}
              onChange={setRepeater('examples')}
              addLabel="添加例句"
              empty="暂无例句"
              fields={[
                { key: 'en', label: '英文', placeholder: 'She showed remarkable resilience.', full: true, multiline: true },
                { key: 'zh', label: '中文', placeholder: '她表现出惊人的韧性。', full: true, multiline: true },
              ]}
            />
          </section>

          <section className="eng-edit-card">
            <h3>记忆与考试</h3>
            <Field label="易混辨析" htmlFor="eng-vocab-confusions" hint="支持 Markdown。">
              <Textarea
                id="eng-vocab-confusions"
                rows={3}
                value={form.data.confusions}
                onChange={(event) => setData('confusions', event.target.value)}
                placeholder="resilience 强调恢复力，endurance 强调持久…"
              />
            </Field>
            <Field label="记忆法" htmlFor="eng-vocab-memory">
              <Textarea
                id="eng-vocab-memory"
                rows={3}
                value={form.data.memoryTip}
                onChange={(event) => setData('memoryTip', event.target.value)}
                placeholder="re + sil（跳）→ 被击倒还能弹回来"
              />
            </Field>
            <Field label="考试提醒" htmlFor="eng-vocab-exam">
              <Textarea
                id="eng-vocab-exam"
                rows={3}
                value={form.data.examTips}
                onChange={(event) => setData('examTips', event.target.value)}
                placeholder="写作中可替换 hardiness，注意不可数。"
              />
            </Field>
          </section>
        </div>
      </div>

      {error && <p className="eng-form-error" role="alert">{error}</p>}

      <div className="eng-edit-actions">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>取消</Button>
        <Button type="submit" icon={Save} loading={saving}>保存词条</Button>
      </div>
    </form>
  );
}
