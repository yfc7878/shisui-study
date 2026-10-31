import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpenText, Clock3, Languages, NotebookPen, RefreshCw, RotateCcw,
  Settings2, ShieldCheck, Trash2,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api.js';
import { useQuery } from '../hooks/useQuery.js';
import { formatDateTime, relativeTime, stripMarkdown } from '../lib/format.js';
import { TYPE_LABELS } from '../lib/constants.js';
import {
  Badge, Button, Card, Checkbox, ConfirmDialog, EmptyState, ErrorState, LoadingBlock,
  PageHeader, Segmented, Select, Toggle, cx,
} from '../components/ui.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

const RETENTION_OPTIONS = [3, 7, 14, 30, 60, 90, 180, 365];

const TYPE_ICONS = { mistake: NotebookPen, sentence: Languages, vocab: BookOpenText };
const TYPE_TONES = { mistake: 'green', sentence: 'blue', vocab: 'violet' };

function trashTitle(entry) {
  if (entry.type === 'mistake') return stripMarkdown(entry.item.questionText || entry.item.title, 100) || '图片错题';
  if (entry.type === 'sentence') return entry.item.content || '英文佳句';
  return entry.item.term || '词汇';
}

function trashSubtitle(entry) {
  if (entry.type === 'mistake') return [entry.item.subject, entry.item.source].filter(Boolean).join(' · ');
  if (entry.type === 'sentence') return [entry.item.theme, entry.item.translation].filter(Boolean).join(' · ');
  return [entry.item.entryType === 'phrase' ? '词组' : '单词', entry.item.data?.coreTranslation].filter(Boolean).join(' · ');
}

export default function TrashPage() {
  const { toast } = useToast();
  const { data, loading, error, refresh } = useQuery(() => api.get('/api/trash'), []);
  const [type, setType] = useState('all');
  const [checked, setChecked] = useState([]);
  const [working, setWorking] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [autoPurge, setAutoPurge] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [savingSettings, setSavingSettings] = useState(false);
  const [purging, setPurging] = useState(false);

  useEffect(() => { document.title = '回收站 · 拾穗 Study'; }, []);
  useEffect(() => {
    setChecked([]);
  }, [data]);
  useEffect(() => {
    if (!data?.settings) return;
    setAutoPurge(Boolean(data.settings.autoPurge));
    setRetentionDays(Number(data.settings.retentionDays) || 30);
  }, [data?.settings]);

  const settings = data?.settings || { autoPurge: false, retentionDays: 30, lastPurgeAt: null };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const result = await api.put('/api/trash/settings', { autoPurge, retentionDays });
      toast(
        autoPurge
          ? `已开启自动清理：回收站内容保留 ${retentionDays} 天`
          : '已关闭自动清理，回收站内容将一直保留',
        'success',
      );
      if (result?.settings) {
        setAutoPurge(Boolean(result.settings.autoPurge));
        setRetentionDays(Number(result.settings.retentionDays) || retentionDays);
      }
      refresh();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const purgeExpired = async () => {
    setPurging(true);
    try {
      const result = await api.post('/api/trash/purge-expired', {});
      toast(
        result.affected
          ? `已手动清理 ${result.affected} 项过期内容${result.uploadsRemoved ? `，并释放 ${result.uploadsRemoved} 张图片` : ''}`
          : '没有超过保留期的内容需要清理',
        result.affected ? 'success' : 'info',
      );
      setChecked([]);
      refresh();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setPurging(false);
    }
  };

  const items = useMemo(() => (data?.items || []).filter((entry) => type === 'all' || entry.type === type), [data, type]);
  const counts = data?.counts || { all: 0, mistake: 0, sentence: 0, vocab: 0 };
  const selectedEntries = items.filter((entry) => checked.includes(`${entry.type}:${entry.id}`));
  const toggle = (key) => setChecked((list) => (list.includes(key) ? list.filter((item) => item !== key) : [...list, key]));

  const act = async (action, entries = selectedEntries) => {
    if (!entries.length) return;
    setWorking(true);
    try {
      const result = await api.post('/api/trash/bulk', {
        items: entries.map((entry) => ({ type: entry.type, id: entry.id })),
        action,
      });
      toast(
        action === 'restore'
          ? `已恢复 ${entries.length} 项`
          : `已永久删除 ${result?.affected ?? entries.length} 项${result?.uploadsRemoved ? `，并清理 ${result.uploadsRemoved} 张图片` : ''}`,
        'success',
      );
      setChecked([]);
      refresh();
      window.dispatchEvent(new Event('shisui:review-changed'));
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setWorking(false);
    }
  };

  const emptyAll = async () => {
    setWorking(true);
    try {
      const result = await api.post('/api/trash/empty', {});
      toast(
        `回收站已清空（${result.affected} 项${result.uploadsRemoved ? `，清理 ${result.uploadsRemoved} 张图片` : ''}）`,
        'success',
      );
      setChecked([]);
      refresh();
      window.dispatchEvent(new Event('shisui:review-changed'));
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="trash-page">
      <PageHeader
        eyebrow="RECYCLE BIN"
        title="回收站"
        description="误删的内容会先停在这里。永久删除后无法恢复，请确认后再操作。"
        actions={(
          <Button
            variant="danger-ghost"
            icon={Trash2}
            disabled={counts.all === 0}
            onClick={() => setConfirm({
              title: '清空回收站',
              description: `将永久删除回收站中的全部 ${counts.all} 项内容，此操作无法撤销。`,
              confirmText: '清空回收站',
              action: emptyAll,
            })}
          >
            清空回收站
          </Button>
        )}
      />

      <Card className="trash-settings-card">
        <div className="trash-settings-head">
          <span className="trash-settings-icon"><Clock3 size={20} /></span>
          <div>
            <h2>自动清理</h2>
            <p>开启后，超过保留天数的内容会在后台被永久删除；不开启时内容会一直留在回收站，随时可以手动清理。</p>
          </div>
          <Badge tone={autoPurge ? 'green' : 'neutral'} dot>
            {autoPurge ? `已开启 · ${retentionDays} 天` : '未开启'}
          </Badge>
        </div>
        <div className="trash-settings-controls">
          <div className="trash-auto-toggle">
            <Toggle
              checked={autoPurge}
              onChange={setAutoPurge}
              label="自动清理过期内容"
              description="后台每 6 小时检查一次；只清理已超过保留期的回收站内容。"
            />
          </div>
          <label className="trash-retention-field">
            <span>保留</span>
            <Select
              value={retentionDays}
              onChange={(event) => setRetentionDays(Number(event.target.value))}
              aria-label="回收站保留天数"
            >
              {RETENTION_OPTIONS.map((days) => (
                <option key={days} value={days}>{days} 天</option>
              ))}
            </Select>
          </label>
          <Button variant="secondary" size="sm" icon={Settings2} onClick={saveSettings} loading={savingSettings}>
            保存设置
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            disabled={purging}
            onClick={() => setConfirm({
              title: '立即清理过期内容',
              description: `将永久删除回收站中超过 ${retentionDays} 天的内容，并清理不再被引用的图片。不会删除未过期内容。`,
              confirmText: '清理过期内容',
              action: purgeExpired,
            })}
          >
            立即清理过期
          </Button>
        </div>
        <div className="trash-settings-foot">
          <span><ShieldCheck size={13} /> 手动永久删除与「清空回收站」不受此设置影响。</span>
          <span>
            上次清理：
            {settings.lastPurgeAt ? ` ${relativeTime(settings.lastPurgeAt)}` : ' 还没有执行过'}
          </span>
        </div>
      </Card>

      <div className="list-toolbar">
        <Segmented
          value={type}
          onChange={(value) => { setType(value); setChecked([]); }}
          options={[
            { value: 'all', label: '全部', count: counts.all },
            { value: 'mistake', label: '错题', count: counts.mistake },
            { value: 'sentence', label: '佳句', count: counts.sentence },
            { value: 'vocab', label: '词汇', count: counts.vocab },
          ]}
        />
        <div className="grow" />
        {items.length > 0 && (
          <Checkbox
            checked={items.length > 0 && checked.length === items.length}
            onChange={(value) => setChecked(value ? items.map((entry) => `${entry.type}:${entry.id}`) : [])}
            label="全选本页"
          />
        )}
      </div>

      {error ? (
        <ErrorState message={error.message} onRetry={refresh} />
      ) : loading ? (
        <LoadingBlock label="正在打开回收站…" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title="回收站是空的"
          description="删掉的错题、佳句和词汇会暂时出现在这里，给你一次反悔的机会。"
          action={<Link className="btn btn-secondary" to="/mistakes">回到错题本</Link>}
        />
      ) : (
        <>
          <div className="trash-list">
            {items.map((entry) => {
              const key = `${entry.type}:${entry.id}`;
              const Icon = TYPE_ICONS[entry.type];
              return (
                <article className={cx('trash-item', checked.includes(key) && 'is-selected')} key={key}>
                  <Checkbox checked={checked.includes(key)} onChange={() => toggle(key)} />
                  <span className={cx('trash-icon', `type-${entry.type}`)}><Icon size={17} /></span>
                  <div className="trash-copy">
                    <div className="trash-meta-top">
                      <Badge tone={TYPE_TONES[entry.type]}>{TYPE_LABELS[entry.type]}</Badge>
                      <span>删除于 {relativeTime(entry.deletedAt)}</span>
                      <span className="faint">· {formatDateTime(entry.deletedAt)}</span>
                    </div>
                    <strong className={cx(entry.type === 'sentence' && 'en')}>{trashTitle(entry)}</strong>
                    <span>{trashSubtitle(entry) || '无更多信息'}</span>
                  </div>
                  <div className="trash-actions">
                    <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => act('restore', [entry])} disabled={working}>恢复</Button>
                    <Button variant="danger-ghost" size="sm" icon={Trash2} onClick={() => setConfirm({
                      title: '永久删除',
                      description: '这一项将被永久删除，无法再恢复。确定吗？',
                      confirmText: '永久删除',
                      action: () => act('delete', [entry]),
                    })} disabled={working}>删除</Button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {selectedEntries.length > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">已选 {selectedEntries.length} 项</span>
          <div className="bulk-actions">
            <Button variant="soft" size="sm" icon={RotateCcw} onClick={() => act('restore')} disabled={working}>批量恢复</Button>
            <Button variant="danger" size="sm" icon={Trash2} onClick={() => setConfirm({
              title: '批量永久删除',
              description: `将永久删除选中的 ${selectedEntries.length} 项内容，无法撤销。`,
              confirmText: '永久删除',
              action: () => act('delete'),
            })} disabled={working}>永久删除</Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        description={confirm?.description}
        confirmText={confirm?.confirmText || '确认'}
        tone="danger"
        loading={working || purging}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await confirm?.action?.();
          setConfirm(null);
        }}
      />
    </div>
  );
}
