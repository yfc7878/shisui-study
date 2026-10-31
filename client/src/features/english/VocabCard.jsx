import { ArrowUpRight, BookOpen, Clock } from 'lucide-react';
import { Checkbox, StatusBadge, cx } from '../../components/ui.jsx';
import { relativeTime } from '../../lib/format.js';
import { excerpt } from './helpers.js';
import { ThemeBadge } from './shared.jsx';

export default function VocabCard({ item, selected = false, selectMode = false, onCardClick, onToggleSelect }) {
  const data = item.data || {};
  const pos = Array.isArray(data.partOfSpeech) ? data.partOfSpeech.filter(Boolean) : [];
  const examples = Array.isArray(data.examples) ? data.examples : [];
  const pending = item.status === 'pending';
  const initial = (item.term || '?').trim().slice(0, 1).toUpperCase();

  const handleKeyDown = (event) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onCardClick?.(item);
    }
  };

  return (
    <article
      className={cx('eng-vocab-card', selected && 'is-selected', pending && 'is-pending')}
      role="button"
      tabIndex={0}
      aria-label={selectMode ? `${selected ? '取消选择' : '选择'}词条：${item.term}` : `打开词条 ${item.term}`}
      aria-pressed={selectMode ? selected : undefined}
      onClick={() => onCardClick?.(item)}
      onKeyDown={handleKeyDown}
    >
      <span className="eng-vc-mark" aria-hidden="true">{initial}</span>

      <header className="eng-vc-head">
        <span className="eng-vc-check" onClick={(event) => event.stopPropagation()}>
          <Checkbox
            checked={selected}
            onChange={() => onToggleSelect?.(item)}
            label={selected ? '取消选择这个词条' : '选择这个词条'}
          />
        </span>
        <span className="eng-vc-kind">{item.entryType === 'phrase' ? '词组' : '单词'}</span>
        <ThemeBadge theme={item.theme} />
        <span className="eng-vc-head-grow" />
        <StatusBadge status={item.status} />
      </header>

      <div className="eng-vc-body">
        <h3 className="eng-vc-term">{item.term}</h3>
        {data.phonetic ? <p className="eng-vc-phonetic">{data.phonetic}</p> : null}
        {pos.length > 0 && (
          <div className="eng-pos-row">
            {pos.slice(0, 3).map((entry) => (
              <span className="eng-pos" key={entry}>{entry}</span>
            ))}
            {pos.length > 3 ? <span className="eng-pos eng-pos-more">+{pos.length - 3}</span> : null}
          </div>
        )}
        <p className="eng-vc-core">{excerpt(data.coreTranslation || data.definitions?.[0]?.zh, 80) || '暂无释义'}</p>
      </div>

      <footer className="eng-vc-foot">
        <span className="eng-vc-meta">
          <BookOpen size={12} aria-hidden="true" />
          {examples.length ? `${examples.length} 例句` : '暂无例句'}
        </span>
        <span className="eng-vc-meta">
          <Clock size={12} aria-hidden="true" />
          {relativeTime(item.createdAt)}
        </span>
        <span className="eng-vc-go" aria-hidden="true"><ArrowUpRight size={15} /></span>
      </footer>
    </article>
  );
}
