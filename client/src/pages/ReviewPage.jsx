import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, BookOpenText, Check, CheckCheck, ChevronRight, Inbox,
  Languages, NotebookPen, Sparkles, Trash2, Wand2, X,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api.js';
import { useQuery, useMediaQuery } from '../hooks/useQuery.js';
import { SENTENCE_THEMES, VOCAB_THEMES, TYPE_LABELS } from '../lib/constants.js';
import { formatDateTime, relativeTime, stripMarkdown } from '../lib/format.js';
import { getAiConfig, getPromptExtras, hasApiKey } from '../lib/settings.js';
import {
  Badge, Button, Card, Checkbox, Field, Input, Markdown, Modal, PageHeader, Segmented,
  SubjectBadge, TagInput, Textarea, Toggle, cx,
} from '../components/ui.jsx';
import MistakeForm from '../components/MistakeForm.jsx';
import AiFunctionGraphs from '../components/AiFunctionGraphs.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

const TYPE_ICONS = { mistake: NotebookPen, sentence: Languages, vocab: BookOpenText };
const TYPE_TONES = { mistake: 'green', sentence: 'blue', vocab: 'violet' };

function itemKey(entry) {
  return `${entry.type}:${entry.id}`;
}

export default function ReviewPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useMediaQuery('(max-width: 960px)');
  const [type, setType] = useState(params.get('type') || 'all');
  const [selectedId, setSelectedId] = useState(params.get('id') || '');
  const [checked, setChecked] = useState([]);
  const [mobileEditor, setMobileEditor] = useState(Boolean(params.get('id')));
  const [regenTarget, setRegenTarget] = useState(null);
  const [regenThink, setRegenThink] = useState(false);
  const [regenExtra, setRegenExtra] = useState('');
  const [regenLoading, setRegenLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  const { data, loading, error, refresh } = useQuery(() => api.get(`/api/review?type=${type}`), [type]);
  const items = data?.items || [];
  const counts = data?.counts || { all: 0, mistake: 0, sentence: 0, vocab: 0 };
  const selected = items.find((entry) => entry.id === selectedId) || null;

  useEffect(() => { document.title = '待审阅 · 拾穗 Study'; }, []);

  useEffect(() => {
    const nextParams = {};
    if (type !== 'all') nextParams.type = type;
    if (selectedId) nextParams.id = selectedId;
    setParams(nextParams, { replace: true });
  }, [type, selectedId, setParams]);

  useEffect(() => {
    if (!items.length) { setSelectedId(''); return; }
    const stillThere = items.some((entry) => entry.id === selectedId);
    if (!stillThere) setSelectedId(items[0].id);
  }, [items, selectedId]);

  const toggleChecked = (entry) => {
    const key = itemKey(entry);
    setChecked((list) => (list.includes(key) ? list.filter((item) => item !== key) : [...list, key]));
  };
  const checkedEntries = useMemo(() => {
    const map = new Map(items.map((entry) => [itemKey(entry), entry]));
    return checked.map((key) => map.get(key)).filter(Boolean);
  }, [checked, items]);

  const refreshAll = () => {
    refresh();
    window.dispatchEvent(new Event('shisui:review-changed'));
  };

  const bulk = async (action) => {
    if (!checkedEntries.length) return;
    setBulkLoading(true);
    try {
      await api.post('/api/review/bulk', {
        items: checkedEntries.map((entry) => ({ type: entry.type, id: entry.id })),
        action,
      });
      toast(action === 'approve' ? `已通过 ${checkedEntries.length} 项` : `已移除 ${checkedEntries.length} 项`, 'success');
      setChecked([]);
      refreshAll();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const openRegen = (entry) => {
    if (!hasApiKey()) {
      toast('请先在设置中填写 DeepSeek API Key', 'info', { action: { label: '去设置', onClick: () => navigate('/settings') } });
      return;
    }
    setRegenThink(false);
    setRegenExtra('');
    setRegenTarget(entry);
  };

  const regenerate = async () => {
    if (!regenTarget) return;
    setRegenLoading(true);
    try {
      const promptKey = regenTarget.type === 'mistake' ? 'mistake' : regenTarget.type === 'sentence' ? 'sentences' : 'vocab';
      const extraInstructions = [getPromptExtras()[promptKey], regenExtra].filter(Boolean).join('\n');
      const body = { think: regenThink, extraInstructions, ai: getAiConfig() };
      if (regenTarget.type === 'mistake') await api.post(`/api/ai/mistake/${regenTarget.id}/regenerate`, body, { timeout: 300_000 });
      else if (regenTarget.type === 'sentence') await api.post(`/api/ai/sentences/${regenTarget.id}/regenerate`, body, { timeout: 300_000 });
      else await api.post(`/api/ai/vocab/${regenTarget.id}/regenerate`, body, { timeout: 300_000 });
      setRegenTarget(null);
      toast('AI 已重新生成，请再次核对', 'success');
      refreshAll();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setRegenLoading(false);
    }
  };

  const handleDone = (message) => {
    toast(message, 'success');
    refreshAll();
    setMobileEditor(false);
  };

  const visibleEditor = Boolean(selected) && (!isMobile || mobileEditor);

  return (
    <div className="review-page">
      <PageHeader
        eyebrow="REVIEW QUEUE"
        title="待审阅"
        description="AI 整理好的内容会先停在这里。核对、修改、标记主题，确认后才会进入正式收藏。"
        actions={(
          <>
            <Badge tone="amber">{counts.all} 项待处理</Badge>
            {checkedEntries.length > 0 && (
              <>
                <Button variant="soft" size="sm" icon={CheckCheck} onClick={() => bulk('approve')} loading={bulkLoading}>通过所选</Button>
                <Button variant="danger-ghost" size="sm" icon={Trash2} onClick={() => bulk('trash')} disabled={bulkLoading}>移除所选</Button>
              </>
            )}
          </>
        )}
      />

      <div className="review-tabs-row">
        <Segmented
          value={type}
          onChange={(value) => { setType(value); setSelectedId(''); setChecked([]); setMobileEditor(false); }}
          options={[
            { value: 'all', label: '全部', count: counts.all },
            { value: 'mistake', label: '错题', count: counts.mistake },
            { value: 'sentence', label: '佳句', count: counts.sentence },
            { value: 'vocab', label: '词汇', count: counts.vocab },
          ]}
          ariaLabel="待审阅类型"
        />
        <div className="review-tabs-tip"><Sparkles size={14} /> 通过后自动进入对应收藏</div>
      </div>

      {error ? (
        <div className="review-empty"><AlertCircle size={22} /><p>{error.message}</p><Button variant="secondary" onClick={refresh}>重试</Button></div>
      ) : loading ? (
        <div className="review-layout"><div className="review-list-panel"><div className="review-loading">{'正在加载…'}</div></div><div className="review-editor-panel"><div className="review-loading">正在整理待审阅列表…</div></div></div>
      ) : items.length === 0 ? (
        <div className="review-empty-state">
          <div className="review-empty-icon"><CheckCheck size={30} /></div>
          <h2>{type === 'all' ? '待审阅已清空' : `「${TYPE_LABELS[type]}」已清空`}</h2>
          <p>
            {type === 'all'
              ? '你确认过的错题、佳句与词汇都已经进入收藏。新的 AI 结果会自动出现在这里。'
              : '这一类别的待审阅已经处理完，可以去对应收藏里查看；其他类型仍有内容时可切换筛选。'}
          </p>
          <div className="row">
            {type === 'sentence' || type === 'vocab' ? (
              <Link className="btn btn-secondary" to="/english">去 English</Link>
            ) : (
              <Link className="btn btn-secondary" to="/mistakes">去错题本</Link>
            )}
            <Link className="btn btn-primary" to={type === 'sentence' ? '/english?new=1' : type === 'vocab' ? '/english?tab=vocab' : '/mistakes/new'}>
              {type === 'sentence' ? '再收集佳句' : type === 'vocab' ? '再解析一个词' : '再收一道错题'}
            </Link>
          </div>
        </div>
      ) : (
        <div className={cx('review-layout', visibleEditor && 'has-editor')}>
          <aside className={cx('review-list-panel', visibleEditor && isMobile && 'mobile-hidden')}>
            <div className="review-list-head">
              <Checkbox
                checked={items.length > 0 && checked.length === items.length}
                onChange={(value) => setChecked(value ? items.map(itemKey) : [])}
                label="全选"
              />
              <span>{items.length} 项待审</span>
            </div>
            <div className="review-list">
              {items.map((entry) => {
                const Icon = TYPE_ICONS[entry.type] || Inbox;
                return (
                  <div
                    className={cx('review-item', selectedId === entry.id && 'is-active', checked.includes(itemKey(entry)) && 'is-checked')}
                    key={itemKey(entry)}
                    onClick={() => { setSelectedId(entry.id); setMobileEditor(true); }}
                  >
                    <div className="review-item-check" onClick={(event) => event.stopPropagation()}>
                      <Checkbox checked={checked.includes(itemKey(entry))} onChange={() => toggleChecked(entry)} />
                    </div>
                    <span className={cx('review-item-icon', `type-${entry.type}`)}><Icon size={17} /></span>
                    <div className="review-item-copy">
                      <div className="review-item-top">
                        <span className={cx('review-type-label', `type-${entry.type}`)}>{TYPE_LABELS[entry.type]}</span>
                        <span className="review-item-time">{relativeTime(entry.createdAt)}</span>
                      </div>
                      <strong className={cx('review-item-title', entry.type === 'sentence' && 'en')}>{entry.title}</strong>
                      <span className="review-item-subtitle">{entry.subtitle || '待补充信息'}</span>
                    </div>
                    <ChevronRight size={15} className="review-item-chevron" />
                  </div>
                );
              })}
            </div>
          </aside>

          <section className={cx('review-editor-panel', !visibleEditor && 'mobile-hidden')}>
            {!selected ? (
              <div className="review-empty"><Inbox size={26} /><p>从左侧选择一项开始审阅</p></div>
            ) : (
              <>
                {isMobile && (
                  <button type="button" className="review-mobile-back" onClick={() => setMobileEditor(false)}>
                    <ArrowLeft size={16} /> 返回列表
                  </button>
                )}
                <div className="review-editor-head">
                  <div>
                    <div className="review-editor-eyebrow">
                      <Badge tone={TYPE_TONES[selected.type]}>{TYPE_LABELS[selected.type]}</Badge>
                      <span>AI 生成于 {formatDateTime(selected.createdAt)}</span>
                    </div>
                    <h2>{selected.type === 'mistake' ? stripMarkdown(selected.item.questionText, 80) : selected.type === 'sentence' ? '英文佳句' : selected.item.term}</h2>
                  </div>
                  <div className="row-wrap">
                    <Button variant="secondary" size="sm" icon={Wand2} onClick={() => openRegen(selected)}>AI 重来</Button>
                    <Button variant="danger-ghost" size="sm" icon={Trash2} onClick={async () => {
                      try {
                        const resource = selected.type === 'mistake' ? 'mistakes' : selected.type === 'sentence' ? 'sentences' : 'vocab';
                        await api.patch(`/api/${resource}/${selected.id}`, { status: 'trashed' });
                        handleDone('已移入回收站');
                      } catch (err) {
                        toast(errorMessage(err), 'error');
                      }
                    }}>移入回收站</Button>
                  </div>
                </div>

                {selected.type === 'mistake' && (
                  <MistakeReviewEditor
                    key={`${selected.id}-${selected.item.updatedAt}`}
                    item={selected.item}
                    onDone={handleDone}
                  />
                )}
                {selected.type === 'sentence' && (
                  <SentenceReviewEditor
                    key={`${selected.id}-${selected.item.updatedAt}`}
                    item={selected.item}
                    onDone={handleDone}
                    onRegenerate={() => openRegen(selected)}
                  />
                )}
                {selected.type === 'vocab' && (
                  <VocabReviewEditor
                    key={`${selected.id}-${selected.item.updatedAt}`}
                    item={selected.item}
                    onDone={handleDone}
                    onRegenerate={() => openRegen(selected)}
                  />
                )}
              </>
            )}
          </section>
        </div>
      )}

      <Modal
        open={Boolean(regenTarget)}
        onClose={() => setRegenTarget(null)}
        title="AI 重新生成"
        description={`将重新生成这条${regenTarget ? TYPE_LABELS[regenTarget.type] : ''}内容，原内容会被覆盖，但仍需你确认后才归档。`}
        size="md"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setRegenTarget(null)} disabled={regenLoading}>取消</Button>
            <Button variant="primary" icon={Wand2} onClick={regenerate} loading={regenLoading}>开始重做</Button>
          </>
        )}
      >
        <div className="stack">
          <Toggle checked={regenThink} onChange={setRegenThink} label="深度思考模式" description="更准确，但会慢一些。适合难题或重要内容。" />
          <Field label="补充要求（可选）">
            <Textarea rows={3} value={regenExtra} onChange={(event) => setRegenExtra(event.target.value)} placeholder="例如：解析再详细一点；例句换成高中校园场景。" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function ReviewFooter({ saving, onSave, onApprove, saveLabel = '保存修改' }) {
  return (
    <div className="review-editor-footer">
      <span className="review-footer-hint">确认无误后再通过；通过后仍可在收藏中编辑。</span>
      <div className="row">
        <Button variant="secondary" onClick={onSave} loading={saving}>保存草稿</Button>
        <Button variant="primary" icon={Check} onClick={onApprove} loading={saving}>通过并归档</Button>
      </div>
    </div>
  );
}

function MistakeReviewEditor({ item, onDone }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    subject: item.subject || '',
    source: item.source || '',
    chapter: item.chapter || '',
    errorReason: item.errorReason || '',
    difficulty: item.difficulty || 3,
    questionText: item.questionText || '',
    answerText: item.answerText || '',
    analysisText: item.analysisText || '',
    knowledgePoints: item.knowledgePoints || [],
    tags: item.tags || [],
    images: item.images || [],
    figures: item.figures || [],
    figureHints: item.figureHints || [],
    note: item.note || '',
  });
  const [saving, setSaving] = useState(false);

  const save = async (approve) => {
    setSaving(true);
    try {
      await api.patch(`/api/mistakes/${item.id}`, { ...form, ...(approve ? { status: 'active' } : {}) });
      if (approve) onDone('错题已通过审阅，进入错题本');
      else toast('修改已保存', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="review-editor-body">
      <div className="review-reminder">
        <Sparkles size={15} />
        <span>建议先补全「错因」和「来源」，这两项会用于导出时的分类排版。</span>
      </div>
      {item.aiMeta?.functionGraphs?.length > 0 && (
        <AiFunctionGraphs functions={item.aiMeta.functionGraphs} />
      )}
      <MistakeForm value={form} onChange={setForm} />
      <ReviewFooter saving={saving} onSave={() => save(false)} onApprove={() => save(true)} />
    </div>
  );
}

function SentenceReviewEditor({ item, onDone }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    theme: item.theme || '',
    summary: item.summary || '',
    content: item.content || '',
    translation: item.translation || '',
    usage: item.usage || '',
    example: item.example || '',
    exampleTranslation: item.exampleTranslation || '',
    tags: item.tags || [],
    source: item.source || '',
    note: item.note || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  const save = async (approve) => {
    if (!form.content.trim()) { toast('英文句子不能为空', 'error'); return; }
    setSaving(true);
    try {
      await api.patch(`/api/sentences/${item.id}`, { ...form, ...(approve ? { status: 'active' } : {}) });
      if (approve) onDone('佳句已通过审阅，进入素材库');
      else toast('修改已保存', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="review-editor-body">
      <div className="sentence-review-grid">
        <Card className="form-section">
          <div className="form-section-head">
            <div><h3>主题与归类</h3><p>主题用于导出分类；内容概要单独记录句子讲什么。</p></div>
          </div>
          <div className="form-grid form-grid-2">
            <Field label="主题" required>
              <Input
                list="sentence-theme-list"
                value={form.theme}
                onChange={(event) => set({ theme: event.target.value })}
                placeholder="如：环境描写"
              />
              <datalist id="sentence-theme-list">{SENTENCE_THEMES.map((theme) => <option key={theme} value={theme} />)}</datalist>
            </Field>
            <Field label="来源">
              <Input value={form.source} onChange={(event) => set({ source: event.target.value })} placeholder="如：外刊阅读 / 自己的作文" />
            </Field>
          </div>
          <Field label="内容概要 / 适用场景" className="mt-14">
            <Textarea rows={3} value={form.summary} onChange={(event) => set({ summary: event.target.value })} placeholder="与主题分开：这句话在写什么、适合放在作文的哪个位置。" />
          </Field>
          <Field label="标签" className="mt-14">
            <TagInput value={form.tags} onChange={(tags) => set({ tags })} suggestions={['倒装', '修辞', '写作', '高级替换']} />
          </Field>
          <Field label="个人笔记" className="mt-14">
            <Textarea rows={2} value={form.note} onChange={(event) => set({ note: event.target.value })} placeholder="为什么喜欢这句话？" />
          </Field>
        </Card>

        <Card className="sentence-preview-card">
          <div className="sentence-preview-label">预览</div>
          <p className="sentence-preview-en">{form.content || 'English sentence…'}</p>
          <p className="sentence-preview-zh">{form.translation || '中文翻译'}</p>
          {form.theme && <Badge tone="blue">{form.theme}</Badge>}
        </Card>
      </div>

      <Card className="form-section">
        <div className="form-section-head"><div><h3>句子与用法</h3><p>可直接润色句子；用法说明会随导出一起排版。</p></div></div>
        <Field label="英文句子" required>
          <Textarea rows={3} className="textarea-en" value={form.content} onChange={(event) => set({ content: event.target.value })} />
        </Field>
        <Field label="中文翻译" className="mt-14">
          <Textarea rows={2} value={form.translation} onChange={(event) => set({ translation: event.target.value })} />
        </Field>
        <Field label="用法与句型" className="mt-14">
          <Textarea rows={4} value={form.usage} onChange={(event) => set({ usage: event.target.value })} />
        </Field>
        <div className="form-grid form-grid-2 mt-14">
          <Field label="举一反三 · 新例句">
            <Textarea rows={3} className="textarea-en" value={form.example} onChange={(event) => set({ example: event.target.value })} />
          </Field>
          <Field label="新例句翻译">
            <Textarea rows={3} value={form.exampleTranslation} onChange={(event) => set({ exampleTranslation: event.target.value })} />
          </Field>
        </div>
      </Card>

      <ReviewFooter saving={saving} onSave={() => save(false)} onApprove={() => save(true)} />
    </div>
  );
}

function VocabReviewEditor({ item, onDone }) {
  const { toast } = useToast();
  const [theme, setTheme] = useState(item.theme || item.data?.theme || '');
  const [saving, setSaving] = useState(false);
  const data = item.data || {};
  const save = async (approve) => {
    setSaving(true);
    try {
      await api.patch(`/api/vocab/${item.id}`, { theme, ...(approve ? { status: 'active' } : {}) });
      if (approve) onDone('词汇解析已通过审阅，进入词汇库');
      else toast('主题已保存', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="review-editor-body">
      <div className="vocab-review">
        <Card className="vocab-review-head">
          <div className="vocab-review-term">
            <h2>{item.term}</h2>
            <div className="row-wrap">
              {data.phonetic && <span className="phonetic">{data.phonetic}</span>}
              {data.partOfSpeech?.map((pos) => <Badge key={pos} tone="neutral">{pos}</Badge>)}
              <Badge tone={item.entryType === 'phrase' ? 'amber' : 'violet'}>{item.entryType === 'phrase' ? '词组' : '单词'}</Badge>
            </div>
            <p>{data.coreTranslation || data.definitions?.[0]?.zh || '暂无核心释义'}</p>
          </div>
          <div className="vocab-review-theme">
            <Field label="主题标签" hint="导出与筛选时使用">
              <Input list="vocab-theme-list" value={theme} onChange={(event) => setTheme(event.target.value)} />
              <datalist id="vocab-theme-list">{VOCAB_THEMES.map((value) => <option key={value} value={value} />)}</datalist>
            </Field>
            <Link className="btn btn-secondary btn-sm" to={`/english/vocab/${item.id}`}>打开完整词条</Link>
          </div>
        </Card>

        <div className="vocab-review-sections">
          {data.definitions?.length > 0 && (
            <Card><h3>释义</h3>{data.definitions.map((definition, index) => (
              <div className="vocab-def" key={index}><span>{definition.pos}</span><p>{definition.zh}</p></div>
            ))}</Card>
          )}
          {data.usage && <Card><h3>用法</h3><Markdown>{data.usage}</Markdown></Card>}
          {data.extensions?.length > 0 && (
            <Card><h3>延伸</h3>{data.extensions.map((extension, index) => (
              <div className="vocab-extension" key={index}><strong>{extension.label}</strong><p>{extension.content}</p></div>
            ))}</Card>
          )}
          {data.collocations?.length > 0 && (
            <Card><h3>高频搭配</h3><div className="tag-list">{data.collocations.map((collocation, index) => <span className="tag" key={index}>{collocation.phrase} · {collocation.zh}</span>)}</div></Card>
          )}
          {data.examples?.length > 0 && (
            <Card className="vocab-examples"><h3>例句</h3>{data.examples.map((example, index) => (
              <div key={index}><p className="en">{example.en}</p><span>{example.zh}</span></div>
            ))}</Card>
          )}
        </div>
      </div>
      <ReviewFooter saving={saving} onSave={() => save(false)} onApprove={() => save(true)} />
    </div>
  );
}
