import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BookOpen, Check, Download, ListChecks, Pencil, Quote, Sparkles, Trash2, WandSparkles, X,
} from 'lucide-react';
import {
  Badge, Button, EmptyState, ErrorState, LinkButton, LoadingBlock, Pagination,
  SearchInput, Segmented, Select, Toggle, cx,
} from '../../components/ui.jsx';
import { useDebouncedValue, useQuery } from '../../hooks/useQuery.js';
import './english.css';
import { useToast } from '../../contexts/ToastContext.jsx';
import { api, buildQuery, errorMessage } from '../../lib/api.js';
import { getAiConfig, getPromptExtras } from '../../lib/settings.js';
import { VOCAB_THEMES } from '../../lib/constants.js';
import SentenceCard from './SentenceCard.jsx';
import SentenceEditorModal from './SentenceEditorModal.jsx';
import CollectSentenceModal from './CollectSentenceModal.jsx';
import ManualSentenceModal from './ManualSentenceModal.jsx';
import VocabCard from './VocabCard.jsx';
import { NoApiKeyNotice, ThemeChips, useApiKey } from './shared.jsx';
import { SENTENCE_STATUS_OPTIONS, notifyReviewChanged } from './helpers.js';

const SENTENCE_PAGE_SIZE = 24;
const VOCAB_PAGE_SIZE = 30;
const ALL_LIMIT = 100;

const SENTENCE_SORT_OPTIONS = [
  { value: 'newest', label: '最新在前' },
  { value: 'oldest', label: '最早在前' },
];

const VOCAB_SORT_OPTIONS = [
  { value: 'newest', label: '最新在前' },
  { value: 'az', label: 'A → Z' },
];

async function fetchSentenceList({ q, theme, sort, status, page }) {
  if (status !== 'all') {
    const data = await api.get(`/api/sentences${buildQuery({
      status, theme, q, page, limit: SENTENCE_PAGE_SIZE, sort,
    })}`);
    return { ...data, paged: true };
  }
  const [active, pending] = await Promise.all([
    api.get(`/api/sentences${buildQuery({ status: 'active', theme, q, sort, page: 1, limit: ALL_LIMIT })}`),
    api.get(`/api/sentences${buildQuery({ status: 'pending', theme, q, sort, page: 1, limit: ALL_LIMIT })}`),
  ]);
  const items = [...(active.items || []), ...(pending.items || [])];
  items.sort((a, b) => (sort === 'oldest' ? 1 : -1) * String(a.createdAt).localeCompare(String(b.createdAt)));
  return {
    items,
    total: (active.total || 0) + (pending.total || 0),
    counts: active.counts || pending.counts,
    themes: active.themes || [],
    page: 1,
    limit: items.length || 1,
    paged: false,
  };
}

async function fetchVocabList({ q, theme, sort, status, page }) {
  if (status !== 'all') {
    const data = await api.get(`/api/vocab${buildQuery({
      status, q, theme, page, limit: VOCAB_PAGE_SIZE, sort,
    })}`);
    return { ...data, paged: true };
  }
  const [active, pending] = await Promise.all([
    api.get(`/api/vocab${buildQuery({ status: 'active', q, theme, sort, page: 1, limit: ALL_LIMIT })}`),
    api.get(`/api/vocab${buildQuery({ status: 'pending', q, theme, sort, page: 1, limit: ALL_LIMIT })}`),
  ]);
  const items = [...(active.items || []), ...(pending.items || [])];
  items.sort((a, b) => {
    if (sort === 'az') return String(a.term).localeCompare(String(b.term), 'en', { sensitivity: 'base' });
    return -String(a.createdAt).localeCompare(String(b.createdAt));
  });
  return {
    items,
    total: (active.total || 0) + (pending.total || 0),
    counts: active.counts || pending.counts,
    themes: active.themes || [],
    page: 1,
    limit: items.length || 1,
    paged: false,
  };
}

export default function EnglishPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const ready = useApiKey();

  const tab = searchParams.get('tab') === 'vocab' ? 'vocab' : 'sentence';
  const collectOpen = searchParams.get('new') === '1';

  const [sentenceFilters, setSentenceFilters] = useState({
    q: '', theme: '', status: 'active', sort: 'newest', page: 1,
  });
  const [vocabFilters, setVocabFilters] = useState({
    q: '', theme: '', status: 'active', sort: 'newest', page: 1,
  });
  const sentenceQueryText = useDebouncedValue(sentenceFilters.q, 300);
  const vocabQueryText = useDebouncedValue(vocabFilters.q, 300);

  const sentenceList = useQuery(
    () => fetchSentenceList({
      q: sentenceQueryText,
      theme: sentenceFilters.theme,
      sort: sentenceFilters.sort,
      status: sentenceFilters.status,
      page: sentenceFilters.page,
    }),
    [
      tab, sentenceQueryText, sentenceFilters.theme, sentenceFilters.status,
      sentenceFilters.sort, sentenceFilters.page,
    ],
    { enabled: tab === 'sentence' },
  );

  const vocabList = useQuery(
    () => fetchVocabList({
      q: vocabQueryText,
      theme: vocabFilters.theme,
      sort: vocabFilters.sort,
      status: vocabFilters.status,
      page: vocabFilters.page,
    }),
    [
      tab, vocabQueryText, vocabFilters.theme, vocabFilters.status,
      vocabFilters.sort, vocabFilters.page,
    ],
    { enabled: tab === 'vocab' },
  );

  const metaQuery = useQuery(async () => {
    const [sentences, vocab] = await Promise.all([
      api.get('/api/sentences?status=active&limit=1'),
      api.get('/api/vocab?status=active&limit=1'),
    ]);
    return {
      counts: { sentences: sentences.counts, vocab: vocab.counts },
      themes: { sentences: sentences.themes || [], vocab: vocab.themes || [] },
    };
  }, []);

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [regeneratingId, setRegeneratingId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);

  const [lookup, setLookup] = useState({ term: '', theme: '', think: false });
  const [lookupLoading, setLookupLoading] = useState(false);
  const lookupRef = useRef(null);

  const sentenceCounts = sentenceList.data?.counts || metaQuery.data?.counts?.sentences
    || { active: 0, pending: 0, trashed: 0 };
  const vocabCounts = vocabList.data?.counts || metaQuery.data?.counts?.vocab
    || { active: 0, pending: 0, trashed: 0 };
  const sentenceThemes = sentenceList.data?.themes || metaQuery.data?.themes?.sentences || [];
  const vocabThemes = vocabList.data?.themes || metaQuery.data?.themes?.vocab || [];

  const sentenceItems = sentenceList.data?.items || [];
  const vocabItems = vocabList.data?.items || [];

  const patchSentenceFilters = useCallback((patch) => {
    setSentenceFilters((prev) => ({ ...prev, ...patch, page: patch.page ?? 1 }));
  }, []);
  const patchVocabFilters = useCallback((patch) => {
    setVocabFilters((prev) => ({ ...prev, ...patch, page: patch.page ?? 1 }));
  }, []);

  useEffect(() => {
    setSelected(new Set());
    setSelectMode(false);
  }, [
    tab, sentenceQueryText, sentenceFilters.theme, sentenceFilters.status,
    vocabQueryText, vocabFilters.theme, vocabFilters.status,
  ]);

  useEffect(() => {
    if (!selected.size) return;
    const ids = new Set((tab === 'sentence' ? sentenceItems : vocabItems).map((item) => item.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tab, sentenceItems, vocabItems]);

  const switchTab = useCallback((next) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'vocab') params.set('tab', 'vocab');
      else params.delete('tab');
      params.delete('id');
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const openCollect = useCallback(() => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('new', '1');
      return params;
    });
  }, [setSearchParams]);

  const closeCollect = useCallback(() => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.delete('new');
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const closeManual = useCallback(() => setManualOpen(false), []);
  const closeEditor = useCallback(() => setEditing(null), []);

  const refreshSentences = useCallback(() => {
    sentenceList.refresh();
    metaQuery.refresh();
  }, [sentenceList.refresh, metaQuery.refresh]);

  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = () => {
    setSelected(new Set());
    setSelectMode(false);
  };

  const sentencePendingSelected = useMemo(
    () => sentenceItems.filter((item) => selected.has(item.id) && item.status === 'pending'),
    [sentenceItems, selected],
  );
  const vocabPendingSelected = useMemo(
    () => vocabItems.filter((item) => selected.has(item.id) && item.status === 'pending'),
    [vocabItems, selected],
  );

  const runBulk = async (kind, action) => {
    const list = kind === 'sentence' ? sentenceList : vocabList;
    const items = list.data?.items || [];
    const ids = action === 'approve'
      ? items.filter((item) => selected.has(item.id) && item.status === 'pending').map((item) => item.id)
      : [...selected];
    if (!ids.length) {
      toast('没有可以操作的条目', 'info');
      return;
    }
    setBulkBusy(true);
    try {
      const response = await api.post(`/api/${kind === 'sentence' ? 'sentences' : 'vocab'}/bulk`, { ids, action });
      const affected = response?.affected ?? ids.length;
      toast(`${action === 'approve' ? '已通过' : '已移入回收站'} ${affected} 条`, 'success');
      notifyReviewChanged();
      clearSelection();
      list.refresh();
      metaQuery.refresh();
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  const approveSentence = async (item) => {
    setBusyId(item.id);
    try {
      await api.patch(`/api/sentences/${item.id}`, { status: 'active' });
      toast('已通过并归档', 'success');
      notifyReviewChanged();
      sentenceList.refresh();
      metaQuery.refresh();
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const trashSentence = async (item) => {
    setBusyId(item.id);
    try {
      await api.patch(`/api/sentences/${item.id}`, { status: 'trashed' });
      toast('已移入回收站', 'success');
      notifyReviewChanged();
      sentenceList.refresh();
      metaQuery.refresh();
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const regenerateSentence = async (item) => {
    if (!ready) {
      toast('请先在设置中配置 API Key', 'error', {
        action: { label: '去设置', onClick: () => navigate('/settings') },
      });
      return;
    }
    setRegeneratingId(item.id);
    try {
      await api.post(`/api/ai/sentences/${item.id}/regenerate`, {
        think: Boolean(item.think),
        ai: getAiConfig(),
        extraInstructions: getPromptExtras().sentences,
      }, { timeout: 240_000 });
      toast('AI 已重新润色这句佳句', 'success');
      notifyReviewChanged();
      sentenceList.refresh();
      metaQuery.refresh();
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setRegeneratingId(null);
    }
  };

  const openSentence = (item) => {
    if (selectMode) {
      toggleSelect(item.id);
      return;
    }
    setEditing(item);
  };

  const openVocab = (item) => {
    if (selectMode) {
      toggleSelect(item.id);
      return;
    }
    navigate(`/english/vocab/${item.id}`);
  };

  const focusLookup = () => {
    lookupRef.current?.focus();
    lookupRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const generateVocab = async (event) => {
    event.preventDefault();
    if (!ready) {
      toast('请先在设置中配置 API Key', 'error', {
        action: { label: '去设置', onClick: () => navigate('/settings') },
      });
      return;
    }
    const term = lookup.term.trim();
    if (!term) {
      toast('先输入一个单词或词组', 'error');
      focusLookup();
      return;
    }
    setLookupLoading(true);
    try {
      const data = await api.post('/api/ai/vocab', {
        term,
        theme: lookup.theme,
        think: lookup.think,
        extraInstructions: getPromptExtras().vocab,
        ai: getAiConfig(),
      }, { timeout: 240_000 });
      toast('解析已生成，正在打开词条', 'success', {
        action: { label: '去审阅', onClick: () => navigate('/review?type=vocab') },
      });
      notifyReviewChanged();
      setLookup((prev) => ({ ...prev, term: '' }));
      vocabList.refresh();
      metaQuery.refresh();
      if (data?.item?.id) navigate(`/english/vocab/${data.item.id}`);
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setLookupLoading(false);
    }
  };

  const heroStats = tab === 'sentence'
    ? [
      { label: '佳句', value: sentenceCounts.active },
      { label: '主题', value: sentenceThemes.length },
      { label: '待审阅', value: sentenceCounts.pending, accent: true, onClick: () => patchSentenceFilters({ status: 'pending' }) },
    ]
    : [
      { label: '词条', value: vocabCounts.active },
      { label: '主题', value: vocabThemes.length },
      { label: '待审阅', value: vocabCounts.pending, accent: true, onClick: () => patchVocabFilters({ status: 'pending' }) },
    ];

  const sentenceStatusOptions = SENTENCE_STATUS_OPTIONS.map((option) => ({
    ...option,
    count: option.value === 'all'
      ? sentenceCounts.active + sentenceCounts.pending
      : sentenceCounts[option.value],
  }));
  const vocabStatusOptions = SENTENCE_STATUS_OPTIONS.map((option) => ({
    ...option,
    count: option.value === 'all'
      ? vocabCounts.active + vocabCounts.pending
      : vocabCounts[option.value],
  }));

  const sentenceEmpty = sentenceFilters.q || sentenceFilters.theme
    ? {
      title: '没有找到匹配的佳句',
      description: '换个关键词或主题试试，也可以清空筛选看看全部。',
    }
    : sentenceFilters.status === 'pending'
      ? { title: '待审阅的佳句都清空了', description: 'AI 新生成的佳句会先出现在这里，等你过目。' }
      : { title: '还没有拾到佳句', description: '用 AI 从主题、文本或图片里收集，或者手动录入一句。' };

  const vocabEmpty = vocabFilters.q || vocabFilters.theme
    ? {
      title: '没有找到匹配的词条',
      description: '换个关键词或主题试试，或者直接生成一个新词条。',
    }
    : vocabFilters.status === 'pending'
      ? { title: '没有待审阅的词条', description: '新生成的词条会先停在这里，等你确认后归档。' }
      : { title: '词林还空着', description: '输入一个单词或词组，让 AI 生成完整的用法解析与思维导图。' };

  return (
    <div className="eng-page">
      <section className="eng-hero">
        <div className="eng-hero-main">
          <div className="eyebrow">English Atelier</div>
          <h1 className="eng-hero-title">拾句 · 词林</h1>
          <p className="eng-hero-desc">
            把读到的漂亮句子和值得咀嚼的词，收进这本暖纸手帐。AI 生成的条目会先经过你的审阅。
          </p>
        </div>
        <div className="eng-hero-stats">
          {heroStats.map((stat) => (
            stat.onClick ? (
              <button
                key={stat.label}
                type="button"
                className={cx('eng-hero-stat', 'is-action', stat.accent && 'is-accent')}
                onClick={stat.onClick}
                title="只看待审阅"
              >
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </button>
            ) : (
              <div className={cx('eng-hero-stat', stat.accent && 'is-accent')} key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            )
          ))}
        </div>
      </section>

      <div className="eng-tabs-row">
        <Segmented
          ariaLabel="English 内容类型"
          value={tab}
          onChange={switchTab}
          options={[
            { value: 'sentence', label: '佳句', icon: Quote, count: sentenceCounts.active },
            { value: 'vocab', label: '单词', icon: BookOpen, count: vocabCounts.active },
          ]}
        />
        <span className="eng-tabs-note">
          {tab === 'sentence' ? '所有 AI 生成的佳句都会先进入待审阅' : '生成词条后会直接打开思维导图，方便马上审阅'}
        </span>
      </div>

      {tab === 'sentence' ? (
        <section className="eng-panel">
          <div className="list-toolbar eng-toolbar">
            <SearchInput
              value={sentenceFilters.q}
              onChange={(q) => patchSentenceFilters({ q })}
              placeholder="搜索句子、翻译或主题"
              className="eng-search"
            />
            <Select
              className="eng-sort"
              value={sentenceFilters.sort}
              onChange={(event) => patchSentenceFilters({ sort: event.target.value })}
              aria-label="佳句排序"
            >
              {SENTENCE_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
            <div className="eng-toolbar-actions">
              <Button
                size="sm"
                variant={selectMode ? 'soft' : 'secondary'}
                icon={ListChecks}
                onClick={() => {
                  if (selectMode) clearSelection();
                  else setSelectMode(true);
                }}
              >
                {selectMode ? '退出多选' : '多选'}
              </Button>
              <LinkButton to="/export/english" variant="secondary" size="sm" icon={Download}>导出</LinkButton>
              <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setManualOpen(true)}>手动录入</Button>
              <Button size="sm" variant="primary" icon={Sparkles} onClick={openCollect}>AI 收集</Button>
            </div>
          </div>

          <div className="eng-filterbar">
            <Segmented
              ariaLabel="佳句状态"
              value={sentenceFilters.status}
              onChange={(status) => patchSentenceFilters({ status })}
              options={sentenceStatusOptions}
            />
            <ThemeChips
              options={sentenceThemes}
              value={sentenceFilters.theme}
              onChange={(theme) => patchSentenceFilters({ theme })}
            />
          </div>

          <div className="eng-result-line">
            <span>
              共 {sentenceList.data?.total ?? 0} 条
              {sentenceFilters.status === 'all' ? '（已收录 + 待审阅）' : ''}
            </span>
            {selected.size > 0 ? <span className="eng-result-selected">已选 {selected.size} 条</span> : null}
          </div>

          {sentenceList.error && !sentenceItems.length ? (
            <ErrorState message={errorMessage(sentenceList.error)} onRetry={() => sentenceList.refresh()} />
          ) : sentenceList.loading && !sentenceList.data ? (
            <LoadingBlock label="正在翻开佳句本…" />
          ) : sentenceItems.length === 0 ? (
            <EmptyState
              icon={Quote}
              title={sentenceEmpty.title}
              description={sentenceEmpty.description}
              action={(
                <>
                  <Button icon={Sparkles} onClick={openCollect}>AI 收集</Button>
                  <Button variant="secondary" icon={Pencil} onClick={() => setManualOpen(true)}>手动录入</Button>
                </>
              )}
            />
          ) : (
            <div className={cx('eng-grid', sentenceList.loading && 'is-refreshing')}>
              {sentenceItems.map((item) => (
                <SentenceCard
                  key={item.id}
                  item={item}
                  selected={selected.has(item.id)}
                  selectMode={selectMode}
                  busy={busyId === item.id}
                  regenerating={regeneratingId === item.id}
                  onCardClick={openSentence}
                  onToggleSelect={(target) => toggleSelect(target.id)}
                  onOpen={(target) => setEditing(target)}
                  onApprove={approveSentence}
                  onTrash={trashSentence}
                  onRegenerate={regenerateSentence}
                />
              ))}
            </div>
          )}

          {sentenceList.data?.paged && (
            <Pagination
              page={sentenceFilters.page}
              total={sentenceList.data?.total || 0}
              limit={SENTENCE_PAGE_SIZE}
              onChange={(page) => patchSentenceFilters({ page })}
            />
          )}
        </section>
      ) : (
        <section className="eng-panel">
          <section className="eng-lookup">
            <div className="eng-lookup-head">
              <span className="eng-lookup-icon"><Sparkles size={18} /></span>
              <div>
                <h2 className="eng-lookup-title">生成词条解析</h2>
                <p className="eng-lookup-desc">输入一个单词或词组，AI 会整理释义、搭配、例句、记忆点，并画成一张思维导图。</p>
              </div>
              <Badge tone="coral" className="eng-lookup-badge">AI</Badge>
            </div>
            <form className="eng-lookup-form" onSubmit={generateVocab}>
              <input
                ref={lookupRef}
                className="input eng-lookup-input"
                value={lookup.term}
                onChange={(event) => setLookup((prev) => ({ ...prev, term: event.target.value }))}
                placeholder="输入单词或词组，如 resilience / take … for granted"
                aria-label="要解析的单词或词组"
                autoComplete="off"
                spellCheck="false"
              />
              <Select
                className="eng-lookup-theme"
                value={lookup.theme}
                onChange={(event) => setLookup((prev) => ({ ...prev, theme: event.target.value }))}
                aria-label="词条主题"
              >
                <option value="">自动判断主题</option>
                {VOCAB_THEMES.map((theme) => <option key={theme} value={theme}>{theme}</option>)}
              </Select>
              <Button
                type="submit"
                variant="primary"
                icon={WandSparkles}
                loading={lookupLoading}
                disabled={!ready}
              >
                生成解析
              </Button>
            </form>
            <div className="eng-lookup-foot">
              <Toggle
                checked={lookup.think}
                onChange={(think) => setLookup((prev) => ({ ...prev, think }))}
                label="深度思考 (Think)"
                description="更慢，但辨析更细。"
              />
              {!ready && <NoApiKeyNotice compact />}
            </div>
            {lookupLoading && (
              <p className="eng-lookup-loading" role="status">
                正在生成思维导图，通常需要 20–60 秒，请稍候…
              </p>
            )}
          </section>

          <div className="list-toolbar eng-toolbar">
            <SearchInput
              value={vocabFilters.q}
              onChange={(q) => patchVocabFilters({ q })}
              placeholder="搜索单词、释义或主题"
              className="eng-search"
            />
            <Select
              className="eng-sort"
              value={vocabFilters.sort}
              onChange={(event) => patchVocabFilters({ sort: event.target.value })}
              aria-label="词条排序"
            >
              {VOCAB_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
            <div className="eng-toolbar-actions">
              <Button
                size="sm"
                variant={selectMode ? 'soft' : 'secondary'}
                icon={ListChecks}
                onClick={() => {
                  if (selectMode) clearSelection();
                  else setSelectMode(true);
                }}
              >
                {selectMode ? '退出多选' : '多选'}
              </Button>
              <LinkButton to="/export/english?tab=vocab" variant="secondary" size="sm" icon={Download}>导出</LinkButton>
              <Button size="sm" variant="primary" icon={WandSparkles} onClick={focusLookup}>生成词条</Button>
            </div>
          </div>

          <div className="eng-filterbar">
            <Segmented
              ariaLabel="词条状态"
              value={vocabFilters.status}
              onChange={(status) => patchVocabFilters({ status })}
              options={vocabStatusOptions}
            />
            <ThemeChips
              options={vocabThemes}
              value={vocabFilters.theme}
              onChange={(theme) => patchVocabFilters({ theme })}
            />
          </div>

          <div className="eng-result-line">
            <span>
              共 {vocabList.data?.total ?? 0} 条
              {vocabFilters.status === 'all' ? '（已收录 + 待审阅）' : ''}
            </span>
            {selected.size > 0 ? <span className="eng-result-selected">已选 {selected.size} 条</span> : null}
          </div>

          {vocabList.error && !vocabItems.length ? (
            <ErrorState message={errorMessage(vocabList.error)} onRetry={() => vocabList.refresh()} />
          ) : vocabList.loading && !vocabList.data ? (
            <LoadingBlock label="正在翻开词林…" />
          ) : vocabItems.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title={vocabEmpty.title}
              description={vocabEmpty.description}
              action={<Button icon={WandSparkles} onClick={focusLookup}>生成第一个词条</Button>}
            />
          ) : (
            <div className={cx('eng-grid', 'eng-grid-vocab', vocabList.loading && 'is-refreshing')}>
              {vocabItems.map((item) => (
                <VocabCard
                  key={item.id}
                  item={item}
                  selected={selected.has(item.id)}
                  selectMode={selectMode}
                  onCardClick={openVocab}
                  onToggleSelect={(target) => toggleSelect(target.id)}
                />
              ))}
            </div>
          )}

          {vocabList.data?.paged && (
            <Pagination
              page={vocabFilters.page}
              total={vocabList.data?.total || 0}
              limit={VOCAB_PAGE_SIZE}
              onChange={(page) => patchVocabFilters({ page })}
            />
          )}
        </section>
      )}

      {selected.size > 0 && (
        <div className="bulk-bar eng-bulk-bar" role="region" aria-label="批量操作">
          <span className="bulk-count">{selected.size} 条已选</span>
          <div className="bulk-actions">
            {tab === 'sentence' && sentencePendingSelected.length > 0 && (
              <Button
                size="sm"
                variant="soft"
                icon={Check}
                loading={bulkBusy}
                onClick={() => runBulk('sentence', 'approve')}
              >
                通过 {sentencePendingSelected.length}
              </Button>
            )}
            {tab === 'vocab' && vocabPendingSelected.length > 0 && (
              <Button
                size="sm"
                variant="soft"
                icon={Check}
                loading={bulkBusy}
                onClick={() => runBulk('vocab', 'approve')}
              >
                通过 {vocabPendingSelected.length}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              loading={bulkBusy}
              onClick={() => runBulk(tab, 'trash')}
            >
              移入回收站
            </Button>
            <Button size="sm" variant="ghost" icon={X} onClick={clearSelection}>取消</Button>
          </div>
        </div>
      )}

      <CollectSentenceModal
        open={collectOpen}
        onClose={closeCollect}
        onCreated={refreshSentences}
        existingThemes={sentenceThemes}
      />

      <ManualSentenceModal
        open={manualOpen}
        onClose={closeManual}
        onCreated={refreshSentences}
        existingThemes={sentenceThemes}
      />

      <SentenceEditorModal
        open={Boolean(editing)}
        item={editing}
        onClose={closeEditor}
        onSaved={refreshSentences}
        onTrashed={refreshSentences}
        onChanged={refreshSentences}
      />
    </div>
  );
}
