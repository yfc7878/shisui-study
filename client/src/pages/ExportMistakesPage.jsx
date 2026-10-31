import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Check, Download, FileDown, FileText, LayoutTemplate, ListChecks,
  Loader2, NotebookPen, Settings2, Sparkles,
} from 'lucide-react';
import { api, downloadFile, errorMessage, buildQuery, triggerDownload } from '../lib/api.js';
import { useQuery } from '../hooks/useQuery.js';
import { stripMarkdown } from '../lib/format.js';
import { DIFFICULTY_LABELS, SUBJECTS } from '../lib/constants.js';
import {
  Badge, Button, Card, Checkbox, EmptyState, ErrorState, Field, Input, LoadingBlock,
  PageHeader, SearchInput, Select, SubjectBadge, Toggle, cx,
} from '../components/ui.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

const DEFAULT_OPTIONS = {
  title: '错题精练',
  subtitle: '把每一次出错，变成下一次的底气',
  includeCover: true,
  coverStyle: 'simple',
  includeOverview: true,
  includeAnswer: true,
  includeAnalysis: true,
  includeMeta: true,
  includeFigures: true,
  includeKnowledgePoints: true,
  includeSource: true,
  includeErrorReason: true,
  answerPlacement: 'after',
  includeBlankSpace: true,
  blankSpace: 'medium',
  groupBy: 'subject',
  sortBy: 'created',
  fontFamily: '宋体',
  fontSize: 12,
  headingSize: 16,
  lineSpacing: 1.5,
  pageSize: 'A4',
  margin: 'normal',
  showPageNumbers: true,
  showDate: true,
  numbered: true,
  includeTags: true,
  includeChapter: true,
  watermarkText: '',
};

export default function ExportMistakesPage() {
  const { toast } = useToast();
  const [params] = useSearchParams();
  const [selected, setSelected] = useState([]);
  const [subject, setSubject] = useState('');
  const [q, setQ] = useState('');
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { document.title = '导出错题 · 拾穗 Study'; }, []);

  const query = buildQuery({ status: 'active', limit: 200, sort: 'newest' });
  const { data, loading, error } = useQuery(() => api.get(`/api/mistakes${query}`), [query]);
  const items = data?.items || [];

  useEffect(() => {
    if (!items.length) return;
    const requested = (params.get('ids') || '').split(',').map((id) => id.trim()).filter(Boolean);
    if (requested.length) setSelected(requested.filter((id) => items.some((item) => item.id === id)));
    else setSelected((current) => (current.length ? current : items.map((item) => item.id)));
  }, [items, params]);

  const filtered = useMemo(() => items.filter((item) => {
    if (subject && item.subject !== subject) return false;
    if (q && !`${item.questionText} ${item.source} ${item.tags?.join(' ')} ${item.knowledgePoints?.join(' ')}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [items, subject, q]);

  const selectedItems = items.filter((item) => selected.includes(item.id));
  const allFilteredSelected = filtered.length > 0 && filtered.every((item) => selected.includes(item.id));
  const set = (patch) => setOptions((current) => ({ ...current, ...patch }));

  const exportDoc = async () => {
    if (!selected.length) { toast('请先选择要导出的错题', 'error'); return; }
    setExporting(true);
    try {
      const { blob, filename } = await downloadFile('/api/export/mistakes', {
        ids: selectedItems.map((item) => item.id),
        options,
      }, '错题精练.docx');
      triggerDownload(blob, filename);
      toast(`已生成 Word 文档（${selected.length} 道题）`, 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="export-page">
      <PageHeader
        back={{ to: '/mistakes', label: '返回错题本' }}
        eyebrow="EXPORT STUDIO"
        title="导出错题 Word"
        description="先选择要导出的题目，再调整版式。生成的文档可直接打印或在 Word 里继续编辑。"
        actions={(
          <Button variant="primary" icon={Download} onClick={exportDoc} loading={exporting} disabled={!selected.length}>
            生成 Word · {selected.length} 题
          </Button>
        )}
      />

      {error ? <ErrorState message={error.message} /> : loading ? <LoadingBlock label="正在整理可导出的错题…" /> : items.length === 0 ? (
        <EmptyState icon={NotebookPen} title="还没有已归档的错题" description="待审阅通过后的错题才会出现在导出中。" />
      ) : (
        <div className="export-layout">
          <div className="export-select-column">
            <Card className="export-select-card">
              <div className="export-step-head">
                <span className="export-step">1</span>
                <div><h2>选择内容</h2><p>已选 {selected.length} / {items.length} 道</p></div>
                <Badge tone="green"><ListChecks size={12} /> 题目与配图</Badge>
              </div>
              <div className="export-filters">
                <SearchInput value={q} onChange={setQ} placeholder="搜索题目、来源、标签…" />
                <Select value={subject} onChange={(event) => setSubject(event.target.value)}>
                  <option value="">全部科目</option>
                  {SUBJECTS.map((name) => <option key={name} value={name}>{name}</option>)}
                </Select>
              </div>
              <div className="export-select-tools">
                <Checkbox
                  checked={allFilteredSelected}
                  onChange={(value) => {
                    if (value) setSelected((current) => [...new Set([...current, ...filtered.map((item) => item.id)])]);
                    else setSelected((current) => current.filter((id) => !filtered.some((item) => item.id === id)));
                  }}
                  label="全选筛选结果"
                />
                <button type="button" className="text-link" onClick={() => setSelected([])}>清空选择</button>
              </div>
              <div className="export-item-list">
                {filtered.length === 0 ? (
                  <p className="muted small" style={{ padding: 20 }}>没有匹配的题目。</p>
                ) : filtered.map((item, index) => (
                  <label className={cx('export-item', selected.includes(item.id) && 'is-selected')} key={item.id}>
                    <Checkbox
                      checked={selected.includes(item.id)}
                      onChange={() => setSelected((current) => (current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]))}
                    />
                    <span className="export-item-index">{String(index + 1).padStart(2, '0')}</span>
                    <div className="export-item-copy">
                      <div className="row-wrap">
                        <SubjectBadge subject={item.subject} />
                        <span className="export-item-diff">难度 {item.difficulty} · {DIFFICULTY_LABELS[item.difficulty]}</span>
                      </div>
                      <strong>{stripMarkdown(item.questionText, 110) || '图片错题'}</strong>
                      <span>{[item.source, item.knowledgePoints?.slice(0, 2).join('、')].filter(Boolean).join(' · ') || '未填写来源'}</span>
                    </div>
                    {item.figures?.length > 0 && <Badge tone="neutral">{item.figures.length} 图</Badge>}
                  </label>
                ))}
              </div>
            </Card>

            <Card className="export-preview-card">
              <div className="export-preview-head"><LayoutTemplate size={15} /> 版式预览</div>
              <div className="page-mock">
                {options.includeCover && (
                  <div className="mock-cover">
                    <span className="mock-eyebrow">错题整理</span>
                    <strong>{options.title || '错题精练'}</strong>
                    <span>{options.subtitle}</span>
                    <i />
                  </div>
                )}
                <div className="mock-meta">共 {selected.length} 道 · {options.groupBy === 'subject' ? '按科目分组' : options.groupBy === 'source' ? '按来源分组' : options.groupBy === 'difficulty' ? '按难度分组' : '不分组'}</div>
                <div className="mock-question">
                  <span className="mock-number">01</span>
                  <p>{selectedItems[0] ? stripMarkdown(selectedItems[0].questionText, 88) : '选择题干后，这里会显示预览。'}</p>
                  {options.includeBlankSpace && options.answerPlacement === 'after' && <div className={`mock-blank ${options.blankSpace}`} />}
                  {options.includeAnswer && options.answerPlacement === 'after' && <div className="mock-answer">答案与解析会紧跟题目</div>}
                </div>
                <div className="mock-foot">第 1 页 {options.showPageNumbers ? '· 页码已开启' : ''}</div>
              </div>
            </Card>
          </div>

          <aside className="export-options-column">
            <Card className="export-options-card">
              <div className="export-step-head">
                <span className="export-step">2</span>
                <div><h2>排版设置</h2><p>字体、留白与分类方式</p></div>
                <Settings2 size={18} className="export-step-icon" />
              </div>

              <div className="option-group">
                <h3>文档信息</h3>
                <Field label="标题"><Input value={options.title} onChange={(event) => set({ title: event.target.value })} /></Field>
                <Field label="副标题 / 寄语" className="mt-12"><Input value={options.subtitle} onChange={(event) => set({ subtitle: event.target.value })} /></Field>
                <div className="option-row">
                  <Toggle checked={options.includeCover} onChange={(value) => set({ includeCover: value })} label="生成封面" />
                  <Toggle checked={options.showDate} onChange={(value) => set({ showDate: value })} label="显示日期" />
                </div>
              </div>

              <div className="option-group">
                <h3>内容与排版</h3>
                <Field label="题目 / 答案顺序">
                  <Select value={options.answerPlacement} onChange={(event) => set({ answerPlacement: event.target.value })}>
                    <option value="after">每题后紧跟答案与解析</option>
                    <option value="end">题目在前，答案统一放在卷末</option>
                  </Select>
                </Field>
                <div className="option-row mt-12">
                  <Toggle checked={options.includeAnswer} onChange={(value) => set({ includeAnswer: value })} label="包含答案" />
                  <Toggle checked={options.includeAnalysis} onChange={(value) => set({ includeAnalysis: value })} label="包含解析" />
                </div>
                <div className="option-row">
                  <Toggle checked={options.includeFigures} onChange={(value) => set({ includeFigures: value })} label="包含题目配图" />
                  <Toggle checked={options.includeMeta} onChange={(value) => set({ includeMeta: value })} label="显示题目档案" />
                </div>
                <div className="option-row">
                  <Toggle checked={options.includeKnowledgePoints} onChange={(value) => set({ includeKnowledgePoints: value })} label="知识点" />
                  <Toggle checked={options.includeErrorReason} onChange={(value) => set({ includeErrorReason: value })} label="错因" />
                </div>
                <div className="option-row">
                  <Toggle checked={options.includeBlankSpace} onChange={(value) => set({ includeBlankSpace: value })} label="留出重作空间" />
                  <Select value={options.blankSpace} onChange={(event) => set({ blankSpace: event.target.value })} disabled={!options.includeBlankSpace} className="input-sm">
                    <option value="small">少量（约 6 行）</option>
                    <option value="medium">适中（约 12 行）</option>
                    <option value="large">充足（约 20 行）</option>
                  </Select>
                </div>
                <div className="form-grid form-grid-2 mt-12">
                  <Field label="分类方式">
                    <Select value={options.groupBy} onChange={(event) => set({ groupBy: event.target.value })}>
                      <option value="subject">按科目</option>
                      <option value="source">按来源</option>
                      <option value="difficulty">按难度</option>
                      <option value="none">不分组</option>
                    </Select>
                  </Field>
                  <Field label="排序">
                    <Select value={options.sortBy} onChange={(event) => set({ sortBy: event.target.value })}>
                      <option value="created">收录时间</option>
                      <option value="difficulty">难度</option>
                      <option value="subject">科目</option>
                    </Select>
                  </Field>
                </div>
              </div>

              <div className="option-group">
                <h3>字体与页面</h3>
                <div className="form-grid form-grid-2">
                  <Field label="中文字体">
                    <Select value={options.fontFamily} onChange={(event) => set({ fontFamily: event.target.value })}>
                      {['宋体', '仿宋', '楷体', '微软雅黑', '黑体'].map((font) => <option key={font} value={font}>{font}</option>)}
                    </Select>
                  </Field>
                  <Field label="正文字号">
                    <Select value={options.fontSize} onChange={(event) => set({ fontSize: Number(event.target.value) })}>
                      {[10.5, 11, 12, 14, 16].map((size) => <option key={size} value={size}>{size} pt</option>)}
                    </Select>
                  </Field>
                </div>
                <div className="form-grid form-grid-2 mt-12">
                  <Field label="标题字号">
                    <Select value={options.headingSize} onChange={(event) => set({ headingSize: Number(event.target.value) })}>
                      {[14, 15, 16, 18, 20, 22].map((size) => <option key={size} value={size}>{size} pt</option>)}
                    </Select>
                  </Field>
                  <Field label="行距">
                    <Select value={options.lineSpacing} onChange={(event) => set({ lineSpacing: Number(event.target.value) })}>
                      <option value={1.15}>紧凑 1.15</option>
                      <option value={1.5}>舒适 1.5</option>
                      <option value={1.8}>宽松 1.8</option>
                      <option value={2}>双倍 2.0</option>
                    </Select>
                  </Field>
                </div>
                <div className="form-grid form-grid-2 mt-12">
                  <Field label="纸张">
                    <Select value={options.pageSize} onChange={(event) => set({ pageSize: event.target.value })}>
                      <option value="A4">A4</option>
                      <option value="B5">B5</option>
                    </Select>
                  </Field>
                  <Field label="页边距">
                    <Select value={options.margin} onChange={(event) => set({ margin: event.target.value })}>
                      <option value="normal">标准</option>
                      <option value="narrow">窄边距</option>
                      <option value="wide">宽边距</option>
                    </Select>
                  </Field>
                </div>
                <div className="option-row mt-12">
                  <Toggle checked={options.showPageNumbers} onChange={(value) => set({ showPageNumbers: value })} label="页脚页码" />
                  <Toggle checked={options.numbered} onChange={(value) => set({ numbered: value })} label="题目编号" />
                </div>
                <Field label="页眉水印（可选）" className="mt-12">
                  <Input value={options.watermarkText} onChange={(event) => set({ watermarkText: event.target.value })} placeholder="如：拾穗 Study · 错题精练" />
                </Field>
              </div>

              <div className="export-download-block">
                <div className="export-download-summary">
                  <FileText size={18} />
                  <div><strong>错题精练.docx</strong><span>{selected.length} 道题 · {options.pageSize} · {options.fontFamily}</span></div>
                </div>
                <Button variant="primary" size="lg" icon={Download} className="btn-block" onClick={exportDoc} loading={exporting} disabled={!selected.length}>
                  生成并下载 Word
                </Button>
                <p className="export-privacy"><Sparkles size={12} /> 在服务器本地生成，不会上传到第三方存储。</p>
              </div>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
