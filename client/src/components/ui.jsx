import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Loader2,
  Search, Sparkles, X,
} from 'lucide-react';
import { DIFFICULTY_LABELS, STATUS_LABELS, subjectColor } from '../lib/constants.js';

export function cx(...values) {
  return values.filter(Boolean).join(' ');
}

export function Button({
  children, variant = 'primary', size = 'md', loading = false, icon: Icon,
  className = '', type = 'button', disabled, ...props
}) {
  return (
    <button
      type={type}
      className={cx('btn', `btn-${variant}`, `btn-${size}`, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={16} className="spin" /> : Icon ? <Icon size={16} /> : null}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({ icon: Icon, label, variant = 'ghost', size = 'md', className = '', ...props }) {
  return (
    <button
      type="button"
      className={cx('icon-btn', `icon-btn-${variant}`, `icon-btn-${size}`, className)}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon size={size === 'sm' ? 16 : 18} />
    </button>
  );
}

export function Spinner({ size = 20, className = '' }) {
  return <Loader2 size={size} className={cx('spin', className)} />;
}

export function Card({ children, className = '', padded = true, hover = false, as: Tag = 'div', ...props }) {
  return (
    <Tag className={cx('card', padded && 'card-padded', hover && 'card-hover', className)} {...props}>
      {children}
    </Tag>
  );
}

const BADGE_TONES = ['neutral', 'green', 'amber', 'coral', 'blue', 'violet', 'red'];
export function Badge({ children, tone = 'neutral', dot = false, className = '' }) {
  return (
    <span className={cx('badge', `badge-${BADGE_TONES.includes(tone) ? tone : 'neutral'}`, className)}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

export function SubjectBadge({ subject, className = '' }) {
  if (!subject) return null;
  const color = subjectColor(subject);
  return (
    <span
      className={cx('subject-badge', className)}
      style={{ '--subject-color': color, '--subject-bg': `${color}18` }}
    >
      <span className="subject-dot" />
      {subject}
    </span>
  );
}

export function DifficultyDots({ value = 3, showLabel = false }) {
  return (
    <span className="difficulty" title={`难度 ${value}/5 · ${DIFFICULTY_LABELS[value] || ''}`}>
      <span className="difficulty-dots" aria-label={`难度 ${value} / 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={cx('difficulty-dot', n <= value && 'on')} />
        ))}
      </span>
      {showLabel && <span className="difficulty-label">{DIFFICULTY_LABELS[value]}</span>}
    </span>
  );
}

export function StatusBadge({ status }) {
  const tone = status === 'active' ? 'green' : status === 'pending' ? 'amber' : 'neutral';
  return <Badge tone={tone} dot>{STATUS_LABELS[status] || status}</Badge>;
}

export function Field({ label, hint, error, required, children, className = '', htmlFor }) {
  return (
    <label className={cx('field', className)} htmlFor={htmlFor}>
      {label && (
        <span className="field-label">
          {label}
          {required && <span className="field-required">*</span>}
        </span>
      )}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Input({ className = '', ...props }) {
  return <input className={cx('input', className)} {...props} />;
}

export function Textarea({ className = '', rows = 4, ...props }) {
  return <textarea rows={rows} className={cx('input textarea', className)} {...props} />;
}

export function Select({ children, className = '', ...props }) {
  return <select className={cx('input select', className)} {...props}>{children}</select>;
}

export function SearchInput({ value, onChange, placeholder = '搜索…', className = '', onClear }) {
  return (
    <div className={cx('search-input', className)}>
      <Search size={17} className="search-icon" />
      <input
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {value ? (
        <button
          type="button"
          className="search-clear"
          onClick={() => { onChange(''); onClear?.(); }}
          aria-label="清空搜索"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label className={cx('toggle-row', disabled && 'is-disabled')}>
      <span className="toggle-copy">
        {label && <span className="toggle-label">{label}</span>}
        {description && <span className="toggle-desc">{description}</span>}
      </span>
      <span className={cx('switch', checked && 'is-on')}>
        <input
          type="checkbox"
          checked={Boolean(checked)}
          onChange={(event) => onChange?.(event.target.checked)}
          disabled={disabled}
        />
        <span className="switch-thumb" />
      </span>
    </label>
  );
}

export function Segmented({ options, value, onChange, className = '', ariaLabel }) {
  return (
    <div className={cx('segmented', className)} role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={cx('segmented-item', value === option.value && 'is-active')}
          onClick={() => onChange(option.value)}
        >
          {option.icon ? <option.icon size={15} /> : null}
          {option.label}
          {option.count !== undefined && <span className="segmented-count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open, onClose, title, description, children, footer, size = 'md', className = '',
  hideClose = false, closeOnBackdrop = true,
}) {
  const panelRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const keyHandler = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', keyHandler);
    const timer = setTimeout(() => {
      const focusable = panelRef.current?.querySelector(
        '.modal-body input:not([type="hidden"]), .modal-body textarea, .modal-body select, .modal-body button, .modal-footer .btn-primary, .modal-footer .btn-danger',
      );
      focusable?.focus?.();
    }, 60);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', keyHandler);
      clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className={cx('modal-panel', `modal-${size}`, className)} role="dialog" aria-modal="true" aria-label={title} ref={panelRef}>
        {(title || !hideClose) && (
          <header className="modal-header">
            <div>
              {title && <h2 className="modal-title">{title}</h2>}
              {description && <p className="modal-desc">{description}</p>}
            </div>
            {!hideClose && (
              <IconButton icon={X} label="关闭" onClick={onClose} className="modal-close" />
            )}
          </header>
        )}
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open, title = '确认操作', description, confirmText = '确认', cancelText = '取消',
  tone = 'primary', loading = false, onConfirm, onClose,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>{cancelText}</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </>
      )}
    >
      <div className="confirm-body">
        {tone === 'danger' && (
          <div className="confirm-icon"><AlertTriangle size={22} /></div>
        )}
        <p>{description}</p>
      </div>
    </Modal>
  );
}

export function PageHeader({ eyebrow, title, description, actions, back, children }) {
  return (
    <header className="page-header">
      <div className="page-header-main">
        {back && (
          <Link className="back-link" to={back.to}>
            <ArrowLeft size={15} />
            {back.label || '返回'}
          </Link>
        )}
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <div className="page-title-row">
          <h1 className="page-title">{title}</h1>
          {children}
        </div>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function EmptyState({ icon: Icon = Sparkles, title, description, action, compact = false }) {
  return (
    <div className={cx('empty-state', compact && 'empty-compact')}>
      <div className="empty-icon"><Icon size={compact ? 22 : 28} /></div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Skeleton({ width = '100%', height = 16, radius = 8, className = '' }) {
  return <span className={cx('skeleton', className)} style={{ width, height, borderRadius: radius }} />;
}

export function LoadingBlock({ label = '正在加载…', className = '' }) {
  return (
    <div className={cx('loading-block', className)}>
      <Spinner size={22} />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="empty-state">
      <div className="empty-icon error"><AlertTriangle size={26} /></div>
      <h3>加载失败</h3>
      <p>{message || '请稍后再试'}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>重新加载</Button>}
    </div>
  );
}

export function TagInput({ value = [], onChange, suggestions = [], placeholder = '输入后按回车添加' }) {
  const [draft, setDraft] = useState('');
  const add = (raw) => {
    const text = String(raw || '').trim().replace(/^#/, '');
    if (!text) return;
    if (!value.includes(text)) onChange([...value, text]);
    setDraft('');
  };
  const remove = (index) => onChange(value.filter((_, i) => i !== index));
  return (
    <div className="tag-input-wrap">
      <div className="tag-input">
        {value.map((tag, index) => (
          <span className="tag-chip" key={`${tag}-${index}`}>
            {tag}
            <button type="button" onClick={() => remove(index)} aria-label={`移除 ${tag}`}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
              event.preventDefault();
              add(draft);
            } else if (event.key === 'Backspace' && !draft && value.length) {
              remove(value.length - 1);
            }
          }}
          onBlur={() => add(draft)}
          placeholder={value.length ? '' : placeholder}
          aria-label={placeholder}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="tag-suggestions">
          {suggestions.filter((item) => !value.includes(item)).slice(0, 8).map((item) => (
            <button key={item} type="button" className="tag-suggestion" onClick={() => add(item)}>
              + {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Markdown({ children, className = '' }) {
  if (!children) return <p className="muted">暂无内容</p>;
  return (
    <div className={cx('markdown', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        components={{
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
          img: ({ node, ...props }) => <img {...props} loading="lazy" alt={props.alt || ''} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function Lightbox({ open, src, alt = '', onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => { if (event.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);
  if (!open || !src) return null;
  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={alt || '查看图片'} onClick={onClose}>
      <button type="button" className="lightbox-close" aria-label="关闭" onClick={onClose}><X size={22} /></button>
      <img src={src} alt={alt} onClick={(event) => event.stopPropagation()} />
    </div>,
    document.body,
  );
}

export function Pagination({ page = 1, total = 0, limit = 20, onChange }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <div className="pagination">
      <IconButton icon={ChevronLeft} label="上一页" disabled={page <= 1} onClick={() => onChange(page - 1)} />
      <span className="pagination-info">第 {page} / {pages} 页</span>
      <IconButton icon={ChevronRight} label="下一页" disabled={page >= pages} onClick={() => onChange(page + 1)} />
    </div>
  );
}

export function ProgressRing({ value = 0, size = 132, stroke = 9, label, sublabel }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="progress-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
        <circle
          className="ring-value"
          cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="progress-ring-label">
        <strong>{label}</strong>
        {sublabel && <span>{sublabel}</span>}
      </div>
    </div>
  );
}

export function Checkbox({ checked, onChange, label, disabled = false, className = '' }) {
  return (
    <label className={cx('check', className, disabled && 'is-disabled')}>
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange?.(event.target.checked)} disabled={disabled} />
      <span className="check-box"><Check size={12} /></span>
      {label && <span className="check-label">{label}</span>}
    </label>
  );
}

export function LinkButton({ to, children, variant = 'secondary', size = 'md', icon: Icon, className = '' }) {
  return (
    <Link className={cx('btn', `btn-${variant}`, `btn-${size}`, className)} to={to}>
      {Icon && <Icon size={16} />}
      {children && <span>{children}</span>}
    </Link>
  );
}

export function StatCard({ icon: Icon, label, value, meta, tone = 'green', to, onClick }) {
  const content = (
    <>
      <div className={cx('stat-icon', `tone-${tone}`)}>{Icon && <Icon size={20} />}</div>
      <div className="stat-copy">
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{value}</strong>
        {meta && <span className="stat-meta">{meta}</span>}
      </div>
      <ArrowRight size={16} className="stat-arrow" />
    </>
  );
  if (to) return <Link className="stat-card" to={to}>{content}</Link>;
  if (onClick) return <button type="button" className="stat-card" onClick={onClick}>{content}</button>;
  return <div className="stat-card">{content}</div>;
}
