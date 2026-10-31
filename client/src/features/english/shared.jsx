import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Sparkles } from 'lucide-react';
import { Badge, cx } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';
import { hasApiKey } from '../../lib/settings.js';
import { themeTone } from './helpers.js';

/** 订阅设置变化，实时反映 API Key 是否已配置 */
export function useApiKey() {
  const [ready, setReady] = useState(() => hasApiKey());

  useEffect(() => {
    const sync = () => setReady(hasApiKey());
    const onStorage = (event) => {
      if (!event.key || event.key === 'shisui.settings.v1') sync();
    };
    window.addEventListener('shisui:settings', sync);
    window.addEventListener('focus', sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('shisui:settings', sync);
      window.removeEventListener('focus', sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return ready;
}

export function ThemeBadge({ theme, className = '' }) {
  if (!theme) return null;
  return <Badge tone={themeTone(theme)} className={className}>{theme}</Badge>;
}

export function ThemeChips({ options = [], value = '', onChange, allLabel = '全部主题', className = '' }) {
  return (
    <div className={cx('eng-chiprow', className)} role="group" aria-label="主题筛选">
      <button
        type="button"
        className={cx('eng-chip', !value && 'is-active')}
        aria-pressed={!value}
        onClick={() => onChange('')}
      >
        {allLabel}
      </button>
      {options.map((option) => {
        const name = typeof option === 'string' ? option : option.theme;
        const count = typeof option === 'string' ? null : option.count;
        if (!name) return null;
        const active = value === name;
        return (
          <button
            key={name}
            type="button"
            className={cx('eng-chip', active && 'is-active')}
            aria-pressed={active}
            title={active ? '再次点击取消筛选' : `只看「${name}」`}
            onClick={() => onChange(active ? '' : name)}
          >
            {name}
            {count != null && <span className="eng-chip-count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function NoApiKeyNotice({ children }) {
  return (
    <div className="eng-nokey" role="status">
      <Sparkles size={15} />
      <span>
        {children || '还没有配置 AI API Key，生成功能暂不可用。'}
        <Link to="/settings">去设置</Link>
      </span>
    </div>
  );
}

export function AiProgress({ label = 'AI 正在整理…', elapsed = 0 }) {
  return (
    <div className="eng-ai-progress" role="status" aria-live="polite">
      <span className="eng-ai-dots" aria-hidden="true"><span /><span /><span /></span>
      <span className="eng-ai-progress-label">{label}</span>
      {elapsed > 0 && <span className="eng-ai-elapsed">{elapsed}s</span>}
    </div>
  );
}

/** 可折叠的 AI 元信息（模型 / token / 生成时间 / 思考过程） */
export function AiMetaDetails({ item, className = '' }) {
  const meta = item?.aiMeta || {};
  const usage = meta.usage || null;
  const rows = [];
  if (meta.model) rows.push(['模型', meta.model]);
  if (meta.generatedAt) rows.push(['生成时间', formatDateTime(meta.generatedAt)]);
  if (meta.promptVersion) rows.push(['Prompt 版本', meta.promptVersion]);
  if (meta.regenerated) rows.push(['来源', 'AI 重新生成']);
  if (usage?.total_tokens) {
    rows.push(['Token', `${usage.total_tokens}（入 ${usage.prompt_tokens ?? '—'} / 出 ${usage.completion_tokens ?? '—'}）`]);
  }
  if (meta.themeReason) rows.push(['主题依据', meta.themeReason]);

  if (!rows.length && !item?.reasoning) return null;

  return (
    <details className={cx('eng-ai-meta', className)}>
      <summary>
        <Sparkles size={13} />
        <span>AI 生成信息</span>
        <ChevronDown size={13} className="eng-ai-meta-chev" />
      </summary>
      <div className="eng-ai-meta-body">
        {rows.length > 0 && (
          <dl>
            {rows.map(([label, value]) => (
              <div className="eng-ai-meta-row" key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {item?.reasoning && (
          <div className="eng-ai-reasoning">
            <div className="eng-mini-label">思考过程</div>
            <pre>{item.reasoning}</pre>
          </div>
        )}
      </div>
    </details>
  );
}

export function MiniLabel({ children }) {
  return <span className="eng-mini-label">{children}</span>;
}
