import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Brain, Check, Copy, List, Pencil, RotateCcw, Trash2,
} from 'lucide-react';
import {
  Badge, Button, ConfirmDialog, EmptyState, ErrorState, IconButton, LoadingBlock,
  Segmented, StatusBadge, cx,
} from '../../components/ui.jsx';
import { useQuery } from '../../hooks/useQuery.js';
import './english.css';
import { useToast } from '../../contexts/ToastContext.jsx';
import { api, errorMessage } from '../../lib/api.js';
import { formatDate } from '../../lib/format.js';
import { getAiConfig, getPromptExtras } from '../../lib/settings.js';
import { copyText, notifyReviewChanged, vocabToText } from './helpers.js';
import { AiMetaDetails, ThemeBadge, useApiKey } from './shared.jsx';
import VocabMindMap from './VocabMindMap.jsx';
import VocabTextView from './VocabTextView.jsx';
import VocabEditor from './VocabEditor.jsx';

const VIEW_OPTIONS = [
  { value: 'map', label: '思维导图', icon: Brain },
  { value: 'text', label: '文字行', icon: List },
  { value: 'edit', label: '编辑', icon: Pencil },
];

export default function VocabDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const ready = useApiKey();

  const [view, setView] = useState('map');
  const [busy, setBusy] = useState(null);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const closeTrashConfirm = useCallback(() => setConfirmTrash(false), []);

  const query = useQuery(() => api.get(`/api/vocab/${id}`).then((data) => data.item), [id]);
  const item = query.data;

  useEffect(() => {
    setView('map');
    setBusy(null);
    setConfirmTrash(false);
  }, [id]);

  const approve = async () => {
    if (!item) return;
    setBusy('approve');
    try {
      const data = await api.patch(`/api/vocab/${item.id}`, { status: 'active' });
      query.setData(data.item);
      toast('已通过并归档', 'success');
      notifyReviewChanged();
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(null);
    }
  };

  const regenerate = async () => {
    if (!item) return;
    if (view === 'edit') {
      toast('请先退出编辑，再让 AI 重来', 'info');
      return;
    }
    if (!ready) {
      toast('请先在设置中配置 API Key', 'error', {
        action: { label: '去设置', onClick: () => navigate('/settings') },
      });
      return;
    }
    setBusy('regen');
    try {
      const data = await api.post(`/api/ai/vocab/${item.id}/regenerate`, {
        think: Boolean(item.think),
        ai: getAiConfig(),
        extraInstructions: getPromptExtras().vocab,
      }, { timeout: 240_000 });
      query.setData(data.item);
      toast('AI 已重新生成解析', 'success');
      notifyReviewChanged();
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(null);
    }
  };

  const moveToTrash = async () => {
    if (!item) return;
    setBusy('trash');
    try {
      await api.patch(`/api/vocab/${item.id}`, { status: 'trashed' });
      toast('已移入回收站，可在回收站恢复', 'success');
      notifyReviewChanged();
      setConfirmTrash(false);
      navigate('/english?tab=vocab');
    } catch (error) {
      toast(errorMessage(error), 'error');
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!item) return;
    try {
      await copyText(vocabToText(item));
      toast('已复制词条全文', 'success');
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  };

  const handleSaved = (updated) => {
    if (updated) query.setData(updated);
    setView('map');
  };

  const data = item?.data || {};
  const pos = Array.isArray(data.partOfSpeech) ? data.partOfSpeech.filter(Boolean) : [];
  const initial = (item?.term || '?').trim().slice(0, 1).toUpperCase();

  return (
    <div className="eng-page eng-detail">
      <Link className="back-link" to="/english?tab=vocab">
        <ArrowLeft size={15} />
        返回单词库
      </Link>

      {query.loading && !item ? (
        <LoadingBlock label="正在翻开这条词…" />
      ) : query.error && !item ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refresh()} />
      ) : !item ? (
        <EmptyState
          icon={Brain}
          title="词条不存在"
          description="它可能已被删除，或者链接不完整。"
          action={<Button variant="secondary" onClick={() => navigate('/english?tab=vocab')}>回到单词库</Button>}
        />
      ) : (
        <>
          <section className="eng-vocab-hero">
            <div className="eng-vocab-hero-main">
              <div className="eng-vocab-kicker">
                <span className="eng-vocab-kind">{item.entryType === 'phrase' ? 'PHRASE' : 'WORD'}</span>
                <ThemeBadge theme={item.theme} />
                <StatusBadge status={item.status} />
              </div>
              <h1 className="eng-vocab-term">{item.term}</h1>
              <div className="eng-vocab-sub">
                {data.phonetic ? <span className="eng-vocab-phonetic">{data.phonetic}</span> : null}
                {pos.map((entry) => <span className="eng-pos" key={entry}>{entry}</span>)}
                <span className="eng-vocab-date">收录于 {formatDate(item.createdAt)}</span>
              </div>
              <p className="eng-vocab-core">{data.coreTranslation || '还没有核心释义，去编辑里补一句吧。'}</p>
            </div>
            <div className="eng-vocab-hero-actions">
              <Button size="sm" variant="secondary" icon={Copy} onClick={copy}>复制文本</Button>
              <Button
                size="sm"
                variant="secondary"
                icon={RotateCcw}
                onClick={regenerate}
                loading={busy === 'regen'}
                disabled={busy === 'trash'}
              >
                AI 重来
              </Button>
              <IconButton
                icon={Trash2}
                variant="danger"
                label="移入回收站"
                onClick={() => setConfirmTrash(true)}
                disabled={busy === 'trash'}
              />
            </div>
            <span className="eng-vocab-mark" aria-hidden="true">{initial}</span>
          </section>

          {item.status === 'pending' && (
            <div className="eng-pending-banner">
              <div className="eng-pending-copy">
                <Badge tone="amber" dot>待审阅</Badge>
                <p>这条解析是 AI 生成的。确认无误后通过归档，它才会进入单词库的正式列表。</p>
              </div>
              <div className="eng-pending-actions">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={RotateCcw}
                  onClick={regenerate}
                  loading={busy === 'regen'}
                >
                  AI 重来
                </Button>
                <Button
                  size="sm"
                  variant="danger-ghost"
                  icon={Trash2}
                  onClick={() => setConfirmTrash(true)}
                  disabled={busy === 'trash'}
                >
                  移入回收站
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon={Check}
                  onClick={approve}
                  loading={busy === 'approve'}
                >
                  通过并归档
                </Button>
              </div>
            </div>
          )}

          <div className="eng-viewbar">
            <Segmented ariaLabel="词条视图" value={view} onChange={setView} options={VIEW_OPTIONS} />
            <div className="eng-viewbar-side">
              <AiMetaDetails item={item} />
            </div>
          </div>

          {view === 'map' && <VocabMindMap item={item} />}
          {view === 'text' && <VocabTextView item={item} />}
          {view === 'edit' && (
            <VocabEditor
              key={item.id}
              item={item}
              onSaved={handleSaved}
              onCancel={() => setView('map')}
            />
          )}

          <div className={cx('eng-detail-foot', busy && 'is-busy')}>
            <span>最近修改：{formatDate(item.updatedAt)}</span>
            {item.reviewedAt ? <span>通过时间：{formatDate(item.reviewedAt)}</span> : null}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmTrash}
        title="移入回收站？"
        description={item ? `「${item.term}」会被移入回收站，之后可以在回收站里恢复。` : ''}
        confirmText="移入回收站"
        tone="danger"
        loading={busy === 'trash'}
        onConfirm={moveToTrash}
        onClose={closeTrashConfirm}
      />
    </div>
  );
}
