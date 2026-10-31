import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Check, FileDown, Filter, ImageIcon, Inbox, NotebookPen, Plus,
  Search, Sparkles, Trash2,
} from 'lucide-react';
import { api, errorMessage, buildQuery } from '../lib/api.js';
import { useDebouncedValue, useQuery } from '../hooks/useQuery.js';
import { formatShortDate, relativeTime, stripMarkdown } from '../lib/format.js';
import { DIFFICULTY_LABELS, SUBJECTS } from '../lib/constants.js';
import {
  Badge, Button, Checkbox, ConfirmDialog, EmptyState, ErrorState, Lightbox, LinkButton,
  PageHeader, Pagination, SearchInput, Segmented, Select, Skeleton, SubjectBadge, cx,
} from '../components/ui.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

export default function MistakesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [status, setStatus] = useState('active');
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 280);
  const [subject, setSubject] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [working, setWorking] = useState(false);

  useEffect(() => { document.title = '错题本 · 拾穗 Study'; }, []);
  useEffect(() => { setPage(1); setSelected([]); }, [status, debouncedQ, subject, difficulty, sort]);
  useEffect(() => {
    if (location.state?.notice) {
      toast(location.state.notice, 'success');
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate, toast]);

  const query = buildQuery({
    status, q: debouncedQ, subject, difficulty, sort, page, limit: 24,
  });
  const { data, loading, error, refresh } = useQuery(() => api.get(`/api/mistakes${query}`), [query]);
  const items = data?.items || [];
  const counts = data?.counts || { active: 0, pending: 0, trashed: 0 };
  const allSelected = items.length > 0 && items.every((item) => selected.includes(item.id));

  const subjects = useMemo(() => {
    const known = new Set([...(data?.subjects || []).map((row) => row.subject), ...SUBJECTS]);
    return [...known].filter(Boolean);
  }, [data]);

  const toggle = (id) => setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const toggleAll = () => setSelected(allSelected ? [] : items.map((item) => item.id));

  const bulk = async (action) => {
    if (!selected.length) return;
    setWorking(true);
    try {
      await api.post('/api/mistakes/bulk', { ids: selected, action });
      toast(action === 'approve' ? `已归档 ${selected.length} 道错题` : `已将 ${selected.length} 道错题移入回收站`, 'success');
      setSelected([]);
      refresh();
      window.dispatchEvent(new Event('shisui:review-changed'));
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setWorking(false);
    }
  };

  const approve = async (id) => {
    try {
      await api.post('/api/mistakes/bulk', { ids: [id], action: 'approve' });
      toast('已通过审阅并归档', 'success');
      refresh();
      window.dispatchEvent(new Event('shisui:review-changed'));
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const trash = async (id) => {
    setConfirm({
      title: '移入回收站',
      description: '这道错题会先放进回收站，你仍可以从回收站恢复。',
      action: async () => {
        try {
          await api.post('/api/mistakes/bulk', { ids: [id], action: 'trash' });
          toast('已移入回收站', 'success');
          refresh();
          window.dispatchEvent(new Event('shisui:review-changed'));
        } catch (err) {
          toast(errorMessage(err), 'error');
        }
      },
    });
  };

  return (
    <div className="mistakes-page">
      <PageHeader
        eyebrow="MISTAKE ATLAS"
        title="错题本"
        description="把错题变成可复习的资产：题干、答案、解析和图像都在一起。"
        actions={(
          <>
            <LinkButton to="/export/mistakes" variant="secondary" icon={FileDown}>导出 Word</LinkButton>
            <LinkButton to="/mistakes/new" variant="primary" icon={Plus}>收一道错题</LinkButton>
          </>
        )}
      />

      <div className="mistake-summary-row">
        <div className="mistake-summary-item">
          <span>已归档</span><strong>{counts.active}</strong>
        </div>
        <div className="mistake-summary-item">
          <span>待审阅</span><strong>{counts.pending}</strong>
        </div>
        <div className="mistake-summary-item">
          <span>回收站</span><strong>{counts.trashed}</strong>
        </div>
        <div className="mistake-summary-quote">
          <Sparkles size={14} />
          <span>重做时，先只看题干。</span>
        </div>
      </div>

      <div className="list-toolbar">
        <Segmented
          value={status}
          onChange={(value) => setStatus(value)}
          options={[
            { value: 'active', label: '已收录', count: counts.active },
            { value: 'pending', label: '待审阅', count: counts.pending },
            { value: 'all', label: '全部' },
          ]}
          ariaLabel="错题状态"
        />
        <div className="grow" />
        <SearchInput value={q} onChange={setQ} placeholder="搜索题干、来源、标签…" />
        <div className="filter-selects">
          <Select value={subject} onChange={(event) => setSubject(event.target.value)} aria-label="按科目筛选">
            <option value="">全部科目</option>
            {subjects.map((name) => <option key={name} value={name}>{name}</option>)}
          </Select>
          <Select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} aria-label="按难度筛选">
            <option value="">全部难度</option>
            {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>{level} · {DIFFICULTY_LABELS[level]}</option>)}
          </Select>
          <Select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="排序">
            <option value="newest">最新收录</option>
            <option value="oldest">最早收录</option>
            <option value="difficulty">难度从高到低</option>
            <option value="difficulty-asc">难度从低到高</option>
            <option value="updated">最近修改</option>
          </Select>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="selection-note">
          <Check size={14} /> 已选择 {selected.length} 道
          <button type="button" onClick={() => setSelected([])}>取消选择</button>
        </div>
      )}

      {error ? (
        <ErrorState message={error.message} onRetry={refresh} />
      ) : loading ? (
        <div className="mistake-grid">
          {[1, 2, 3, 4].map((key) => <Skeleton key={key} height={238} radius={20} />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={status === 'pending' ? Inbox : NotebookPen}
          title={status === 'pending' ? '没有待审阅的错题' : '错题本还是空的'}
          description={status === 'pending' ? 'AI 识别完成后，会先放在这里等你确认。' : '上传题目照片，AI 会提取题干、答案和解析；你也可以在审阅时裁剪题目配图。'}
          action={<LinkButton to="/mistakes/new" variant="primary" icon={Plus}>上传第一道错题</LinkButton>}
        />
      ) : (
        <>
          <div className="mistake-grid-toolbar">
            <Checkbox checked={allSelected} onChange={toggleAll} label={allSelected ? '取消全选' : `全选本页（${items.length}）`} />
            <span className="toolbar-count">{data?.total || 0} 道错题</span>
          </div>
          <div className="mistake-grid">
            {items.map((item) => (
              <article
                key={item.id}
                className={cx('mistake-card', selected.includes(item.id) && 'is-selected')}
                onClick={() => navigate(`/mistakes/${item.id}`)}
              >
                <div className="mistake-card-top">
                  <SubjectBadge subject={item.subject} />
                  <div className="mistake-card-badges">
                    {item.status === 'pending' && <Badge tone="amber" dot>待审</Badge>}
                    <span className="mistake-date">{relativeTime(item.createdAt)}</span>
                    <span onClick={(event) => event.stopPropagation()}>
                      <Checkbox checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
                    </span>
                  </div>
                </div>

                <div className="mistake-card-body">
                  {item.images?.length > 0 && (
                    <div className="mistake-thumb">
                      <img src={item.images[0].url} alt="题目缩略图" loading="lazy" />
                      {item.images.length > 1 && <span>+{item.images.length - 1}</span>}
                    </div>
                  )}
                  {!item.images?.length && item.figures?.length > 0 && (
                    <div className="mistake-thumb">
                      <img src={item.figures[0].url} alt="题目配图" loading="lazy" />
                    </div>
                  )}
                  <p className="mistake-snippet">{stripMarkdown(item.questionText, 220) || '（图片题目，点击查看）'}</p>
                </div>

                <div className="mistake-card-tags">
                  {item.knowledgePoints?.slice(0, 2).map((tag) => <span className="tag" key={tag}>{tag}</span>)}
                  {item.tags?.slice(0, 2).map((tag) => <span className="tag" key={tag}>{tag}</span>)}
                </div>

                <div className="mistake-card-footer">
                  <span className="mistake-meta">
                    <span className="difficulty-dots">
                      {[1, 2, 3, 4, 5].map((n) => <span key={n} className={cx('difficulty-dot', n <= item.difficulty && 'on')} />)}
                    </span>
                    <span>{item.source || '未注明来源'}</span>
                  </span>
                  <span className="mistake-card-actions" onClick={(event) => event.stopPropagation()}>
                    {item.status === 'pending' ? (
                      <Button variant="soft" size="sm" icon={Check} onClick={() => approve(item.id)}>通过</Button>
                    ) : (
                      <IconButtonTrash onClick={() => trash(item.id)} />
                    )}
                    <span className="mistake-open"><ArrowRight size={14} /> 查看</span>
                  </span>
                </div>
              </article>
            ))}
          </div>
          <Pagination page={data?.page || 1} total={data?.total || 0} limit={data?.limit || 24} onChange={setPage} />
        </>
      )}

      {selected.length > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">已选 {selected.length} 项</span>
          <div className="bulk-actions">
            {status !== 'pending' ? null : (
              <Button variant="soft" size="sm" icon={Check} onClick={() => bulk('approve')} disabled={working}>批量通过</Button>
            )}
            <Link
              className="btn btn-secondary btn-sm"
              to={`/export/mistakes?ids=${encodeURIComponent(selected.join(','))}`}
            >
              <FileDown size={15} /> 导出所选
            </Link>
            <Button variant="danger-ghost" size="sm" icon={Trash2} onClick={() => setConfirm({
              title: '批量移入回收站',
              description: `将选中的 ${selected.length} 道错题移入回收站？之后可以恢复。`,
              action: () => bulk('trash'),
            })}>移入回收站</Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        description={confirm?.description}
        confirmText="确认"
        tone="danger"
        loading={working}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await confirm?.action?.();
          setConfirm(null);
        }}
      />
      <Lightbox open={Boolean(lightbox)} src={lightbox?.src} alt={lightbox?.alt} onClose={() => setLightbox(null)} />
    </div>
  );
}

function IconButtonTrash({ onClick }) {
  return (
    <button type="button" className="icon-btn icon-btn-sm icon-btn-danger" aria-label="移入回收站" onClick={onClick}>
      <Trash2 size={15} />
    </button>
  );
}
