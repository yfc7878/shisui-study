import { Check, Clock, Pencil, RotateCcw, Trash2, Quote } from 'lucide-react';
import { Badge, Button, Checkbox, IconButton, cx } from '../../components/ui.jsx';
import { relativeTime } from '../../lib/format.js';
import { excerpt } from './helpers.js';
import { MiniLabel, ThemeBadge } from './shared.jsx';

export default function SentenceCard({
  item,
  selected = false,
  selectMode = false,
  busy = false,
  regenerating = false,
  onCardClick,
  onToggleSelect,
  onOpen,
  onApprove,
  onTrash,
  onRegenerate,
}) {
  const pending = item.status === 'pending';
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const stop = (event) => event.stopPropagation();
  const handleKeyDown = (event) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onCardClick?.(item);
    }
  };

  return (
    <article
      className={cx(
        'eng-sq-card',
        selected && 'is-selected',
        pending && 'is-pending',
        busy && 'is-busy',
      )}
      role="button"
      tabIndex={0}
      aria-label={selectMode ? `${selected ? '取消选择' : '选择'}佳句：${excerpt(item.content, 48)}` : '打开佳句详情'}
      aria-pressed={selectMode ? selected : undefined}
      onClick={() => onCardClick?.(item)}
      onKeyDown={handleKeyDown}
    >
      <header className="eng-sq-head">
        <span className="eng-sq-check" onClick={stop}>
          <Checkbox
            checked={selected}
            onChange={() => onToggleSelect?.(item)}
            label={selected ? '取消选择这条佳句' : '选择这条佳句'}
          />
        </span>
        <ThemeBadge theme={item.theme} />
        {item.title ? <span className="eng-sq-title truncate">{item.title}</span> : null}
        <span className="eng-sq-head-grow" />
        {pending ? <Badge tone="amber" dot>待审阅</Badge> : null}
      </header>

      <div className="eng-sq-body">
        <p className="eng-sq-en">{item.content || '（空句子）'}</p>
        {item.translation ? <p className="eng-sq-zh">{item.translation}</p> : null}
        {item.summary ? (
          <p className="eng-sq-summary">
            <Quote size={11} aria-hidden="true" />
            {item.summary}
          </p>
        ) : null}
        {item.usage ? (
          <p className="eng-sq-usage">
            <MiniLabel>用法</MiniLabel>
            {excerpt(item.usage, 92)}
          </p>
        ) : null}
        {tags.length > 0 && (
          <div className="tag-list eng-sq-tags">
            {tags.slice(0, 4).map((tag) => (
              <span className="tag" key={tag}>#{tag}</span>
            ))}
            {tags.length > 4 ? <span className="tag">+{tags.length - 4}</span> : null}
          </div>
        )}
      </div>

      <footer className="eng-sq-foot">
        <span className="eng-sq-meta">
          <Clock size={12} aria-hidden="true" />
          {relativeTime(item.createdAt)}
        </span>
        {item.source ? <span className="eng-sq-source truncate" title={item.source}>{item.source}</span> : null}
        {!selectMode && (
          <div className="eng-sq-actions" onClick={stop}>
            {pending ? (
              <>
                <Button
                  size="sm"
                  variant="soft"
                  icon={Check}
                  onClick={() => onApprove?.(item)}
                  disabled={busy}
                >
                  通过
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  onClick={() => onTrash?.(item)}
                  disabled={busy}
                >
                  丢弃
                </Button>
              </>
            ) : (
              <>
                <IconButton
                  icon={Pencil}
                  size="sm"
                  label="编辑佳句"
                  onClick={() => onOpen?.(item)}
                />
                <IconButton
                  icon={RotateCcw}
                  size="sm"
                  label="让 AI 重新生成"
                  onClick={() => onRegenerate?.(item)}
                  disabled={regenerating || busy}
                  className={regenerating ? 'is-spinning' : ''}
                />
                <IconButton
                  icon={Trash2}
                  size="sm"
                  variant="danger"
                  label="移入回收站"
                  onClick={() => onTrash?.(item)}
                  disabled={busy}
                />
              </>
            )}
          </div>
        )}
      </footer>
    </article>
  );
}
