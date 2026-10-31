import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, CalendarDays, Check, ChevronDown, Download, Edit3, FileDown, Info,
  Lightbulb, Loader2, Save, Sparkles, Tag, Trash2, Wand2, X,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api.js';
import { useQuery } from '../hooks/useQuery.js';
import { formatDateTime, relativeTime } from '../lib/format.js';
import { ERROR_REASONS, SUBJECTS, DIFFICULTY_LABELS } from '../lib/constants.js';
import { getAiConfig, getPromptExtras, hasApiKey } from '../lib/settings.js';
import {
  Badge, Button, Card, ConfirmDialog, DifficultyDots, ErrorState, Field, Lightbox, LoadingBlock,
  Markdown, Modal, PageHeader, StatusBadge, SubjectBadge, Textarea, Toggle, cx,
} from '../components/ui.jsx';
import MistakeForm from '../components/MistakeForm.jsx';
import AiFunctionGraphs from '../components/AiFunctionGraphs.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

function toForm(item) {
  return {
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
  };
}

export default function MistakeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, loading, error, refresh } = useQuery(() => api.get(`/api/mistakes/${id}`), [id]);
  const [item, setItem] = useState(null);
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenThink, setRegenThink] = useState(false);
  const [regenExtra, setRegenExtra] = useState('');
  const [regenLoading, setRegenLoading] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(false);

  useEffect(() => { document.title = '错题详情 · 拾穗 Study'; }, []);
  useEffect(() => {
    if (data?.item) {
      setItem(data.item);
      setForm(toForm(data.item));
    }
  }, [data]);

  const save = async ({ approve = false, patch = {} } = {}) => {
    if (!form) return null;
    setSaving(true);
    try {
      const result = await api.patch(`/api/mistakes/${item.id}`, {
        ...form,
        ...patch,
        ...(approve ? { status: 'active' } : {}),
      });
      setItem(result.item);
      setForm(toForm(result.item));
      setEditing(false);
      toast(approve ? '已通过审阅并归档' : '修改已保存', 'success');
      window.dispatchEvent(new Event('shisui:review-changed'));
      refresh();
      return result.item;
    } catch (err) {
      toast(errorMessage(err), 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    if (!hasApiKey()) {
      toast('请先在设置中填写 API Key', 'info', { action: { label: '去设置', onClick: () => navigate('/settings') } });
      return;
    }
    setRegenLoading(true);
    try {
      const result = await api.post(`/api/ai/mistake/${item.id}/regenerate`, {
        think: regenThink,
        extraInstructions: [getPromptExtras().mistake, regenExtra].filter(Boolean).join('\n'),
        ai: getAiConfig(),
      }, { timeout: 300_000 });
      setItem(result.item);
      setForm(toForm(result.item));
      setRegenOpen(false);
      setEditing(false);
      toast('AI 已重新作答，请检查后通过', 'success');
      refresh();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setRegenLoading(false);
    }
  };

  if (error) return <ErrorState message={error.message} onRetry={refresh} />;
  if (loading || !item || !form) return <LoadingBlock label="正在翻到这一页…" />;

  return (
    <div className="mistake-detail-page">
      <PageHeader
        back={{ to: '/mistakes', label: '返回错题本' }}
        eyebrow={`MISTAKE · ${item.subject || '未分类'}`}
        title={item.title || '错题详情'}
        description={`收录于 ${formatDateTime(item.createdAt)}${item.reviewedAt ? ` · 归档于 ${formatDateTime(item.reviewedAt)}` : ''}`}
        actions={(
          <>
            <Link className="btn btn-secondary btn-sm" to={`/export/mistakes?ids=${item.id}`}>
              <FileDown size={15} /> 导出
            </Link>
            <Button
              variant="secondary"
              size="sm"
              icon={Sparkles}
              onClick={() => setRegenOpen(true)}
            >
              AI 重来
            </Button>
            {item.status === 'pending' && (
              <Button variant="primary" size="sm" icon={Check} onClick={() => save({ approve: true })} loading={saving}>
                通过并归档
              </Button>
            )}
            {editing ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => { setForm(toForm(item)); setEditing(false); }}>取消</Button>
                <Button variant="primary" size="sm" icon={Save} onClick={() => save()} loading={saving}>保存修改</Button>
              </>
            ) : (
              <Button variant="secondary" size="sm" icon={Edit3} onClick={() => setEditing(true)}>编辑</Button>
            )}
          </>
        )}
      >
        <SubjectBadge subject={item.subject} />
        <StatusBadge status={item.status} />
      </PageHeader>

      {item.status === 'pending' && (
        <div className="review-banner">
          <Info size={17} />
          <div>
            <strong>这道题还在待审阅</strong>
            <span>核对题目、答案与配图，补上错因和来源后，再点击「通过并归档」。</span>
          </div>
        </div>
      )}

      {editing ? (
        <MistakeForm value={form} onChange={setForm} />
      ) : (
        <div className="detail-layout">
          <div className="detail-main">
            <Card className="detail-card question-card">
              <div className="detail-card-head">
                <h2><span className="detail-index">Q</span> 题目</h2>
                <div className="row-wrap">
                  <DifficultyDots value={item.difficulty} showLabel />
                  {item.knowledgePoints?.slice(0, 3).map((point) => <span className="tag" key={point}>{point}</span>)}
                </div>
              </div>
              {item.questionText ? <Markdown>{item.questionText}</Markdown> : <p className="muted">暂无题干文字，请查看原图或编辑补全。</p>}

              {item.images?.length > 0 && (
                <div className="detail-images">
                  {item.images.map((image, index) => (
                    <button type="button" className="detail-image" key={image.id || index} onClick={() => setLightbox({ src: image.url, alt: `原图 ${index + 1}` })}>
                      <img src={image.url} alt={`题目原图 ${index + 1}`} loading="lazy" />
                      <span>原图 {index + 1}</span>
                    </button>
                  ))}
                </div>
              )}

              {item.figures?.length > 0 && (
                <div className="detail-figures">
                  <h3>题目配图</h3>
                  <div className="detail-figure-grid">
                    {item.figures.map((figure, index) => (
                      <figure key={figure.id || index}>
                        <button type="button" onClick={() => setLightbox({ src: figure.url, alt: figure.caption })}>
                          <img src={figure.url} alt={figure.caption || `配图 ${index + 1}`} loading="lazy" />
                        </button>
                        <figcaption>{figure.caption || `配图 ${index + 1}`}</figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              )}

              {item.aiMeta?.functionGraphs?.length > 0 && (
                <AiFunctionGraphs functions={item.aiMeta.functionGraphs} className="detail-ai-graph" />
              )}

              {item.note && (
                <div className="detail-note"><Lightbulb size={15} /><span>{item.note}</span></div>
              )}
            </Card>

            <Card className="detail-card answer-card">
              <div className="detail-card-head">
                <h2><span className="detail-index">A</span> 答案</h2>
              </div>
              {item.answerText ? <Markdown>{item.answerText}</Markdown> : <p className="muted">暂无答案。</p>}
            </Card>

            <Card className="detail-card analysis-card">
              <div className="detail-card-head">
                <h2><span className="detail-index">S</span> 解析</h2>
              </div>
              {item.analysisText ? <Markdown>{item.analysisText}</Markdown> : <p className="muted">暂无解析。</p>}
            </Card>

            {item.reasoning && (
              <Card className="detail-card reasoning-card">
                <button type="button" className="reasoning-toggle" onClick={() => setReasoningOpen((value) => !value)}>
                  <span><Sparkles size={15} /> AI 思考过程</span>
                  <ChevronDown size={16} className={reasoningOpen ? 'rotate' : ''} />
                </button>
                {reasoningOpen && <div className="reasoning-body">{item.reasoning}</div>}
              </Card>
            )}
          </div>

          <aside className="detail-side">
            <Card>
              <h3 className="side-title">档案</h3>
              <dl className="meta-list">
                <div><dt>科目</dt><dd><SubjectBadge subject={item.subject} /></dd></div>
                <div><dt>来源</dt><dd>{item.source || '未注明'}</dd></div>
                <div><dt>章节</dt><dd>{item.chapter || '未注明'}</dd></div>
                <div><dt>错因</dt><dd>{item.errorReason ? <Badge tone="coral">{item.errorReason}</Badge> : '未填写'}</dd></div>
                <div><dt>难度</dt><dd>{DIFFICULTY_LABELS[item.difficulty] || item.difficulty}</dd></div>
                <div><dt>知识点</dt><dd>{item.knowledgePoints?.length ? item.knowledgePoints.join(' / ') : '未填写'}</dd></div>
                <div><dt>标签</dt><dd>{item.tags?.length ? item.tags.join(' / ') : '无'}</dd></div>
              </dl>
            </Card>

            <Card>
              <h3 className="side-title"><CalendarDays size={15} /> 时间</h3>
              <dl className="meta-list">
                <div><dt>收录</dt><dd>{formatDateTime(item.createdAt)}</dd></div>
                <div><dt>更新</dt><dd>{relativeTime(item.updatedAt)}</dd></div>
                {item.reviewedAt && <div><dt>归档</dt><dd>{formatDateTime(item.reviewedAt)}</dd></div>}
              </dl>
            </Card>

            {item.aiMeta?.model && (
              <Card className="ai-meta-card">
                <h3 className="side-title"><Sparkles size={15} /> AI 信息</h3>
                <dl className="meta-list">
                  <div><dt>模型</dt><dd className="mono">{item.aiMeta.model}</dd></div>
                  <div><dt>思考模式</dt><dd>{item.think ? '已开启' : '关闭'}</dd></div>
                  {item.aiMeta.usage?.total_tokens && <div><dt>Token</dt><dd>{item.aiMeta.usage.total_tokens}</dd></div>}
                </dl>
                <p className="ai-disclaimer">AI 内容可能有误，请以自己的理解与老师讲解为准。</p>
              </Card>
            )}

            <Card className="danger-zone">
              <h3 className="side-title">管理</h3>
              <Button variant="danger-ghost" icon={Trash2} className="btn-block" onClick={() => setConfirm({
                title: '移入回收站',
                description: '这道错题会被移入回收站，可在回收站恢复或永久删除。',
                action: async () => {
                  try {
                    await api.patch(`/api/mistakes/${item.id}`, { status: 'trashed' });
                    toast('已移入回收站', 'success');
                    window.dispatchEvent(new Event('shisui:review-changed'));
                    navigate('/mistakes');
                  } catch (err) {
                    toast(errorMessage(err), 'error');
                  }
                },
              })}>
                移入回收站
              </Button>
            </Card>
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        description={confirm?.description}
        confirmText="移入回收站"
        tone="danger"
        onClose={() => setConfirm(null)}
        onConfirm={async () => { await confirm?.action?.(); setConfirm(null); }}
      />

      <Modal
        open={regenOpen}
        onClose={() => setRegenOpen(false)}
        title="让 AI 重新作答"
        description="会根据原图和题干重新审题，覆盖当前的答案与解析。你仍有最后确认权。"
        size="md"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setRegenOpen(false)} disabled={regenLoading}>取消</Button>
            <Button variant="primary" icon={Wand2} onClick={regenerate} loading={regenLoading}>开始重做</Button>
          </>
        )}
      >
        <div className="stack">
          <Toggle
            checked={regenThink}
            onChange={setRegenThink}
            label="深度思考模式"
            description="适合压轴题或需要多步推导的题目。"
          />
          <Field label="补充要求（可选）">
            <Textarea rows={3} value={regenExtra} onChange={(event) => setRegenExtra(event.target.value)} placeholder="例如：请用高一能理解的方法，不要用导数。" />
          </Field>
          <p className="form-note">重做完成后，这道题仍保持在当前状态，建议核对后再通过。</p>
        </div>
      </Modal>

      <Lightbox open={Boolean(lightbox)} src={lightbox?.src} alt={lightbox?.alt} onClose={() => setLightbox(null)} />
    </div>
  );
}
