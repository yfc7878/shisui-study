import { useState } from 'react';
import { Eye, PencilLine } from 'lucide-react';
import { Markdown, Textarea, cx } from './ui.jsx';

export default function MarkdownField({
  label, value, onChange, placeholder = '支持 Markdown 与 LaTeX，例如 $x^2$ 或 $$\\frac{a}{b}$$',
  rows = 10, minHeight, readOnly = false, action, className = '',
}) {
  const [mode, setMode] = useState(readOnly ? 'preview' : 'edit');
  return (
    <div className={cx('markdown-field', className)}>
      <div className="markdown-field-head">
        <span className="field-label">{label}</span>
        <div className="markdown-field-tools">
          {action}
          {!readOnly && (
            <div className="mini-toggle">
              <button type="button" className={mode === 'edit' ? 'is-active' : ''} onClick={() => setMode('edit')}>
                <PencilLine size={12} /> 编辑
              </button>
              <button type="button" className={mode === 'preview' ? 'is-active' : ''} onClick={() => setMode('preview')}>
                <Eye size={12} /> 预览
              </button>
            </div>
          )}
        </div>
      </div>
      {mode === 'edit' && !readOnly ? (
        <Textarea
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder={placeholder}
          rows={rows}
          style={minHeight ? { minHeight } : undefined}
          className="textarea-content"
        />
      ) : (
        <div className="markdown-preview-box" style={minHeight ? { minHeight } : undefined}>
          {value ? <Markdown>{value}</Markdown> : <p className="muted small">暂无内容，切换到编辑开始书写。</p>}
        </div>
      )}
    </div>
  );
}
