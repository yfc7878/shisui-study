import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown, ArrowUp, BookOpen, Check, Download, FileText, Languages, LayoutTemplate,
  ListChecks, Settings2, Sparkles,
} from 'lucide-react';
import { api, downloadFile, errorMessage, buildQuery, triggerDownload } from '../lib/api.js';
import { useQuery } from '../hooks/useQuery.js';
import { formatShortDate, stripMarkdown } from '../lib/format.js';
import {
  Badge, Button, Card, Checkbox, EmptyState, ErrorState, Field, Input, LoadingBlock,
  PageHeader, SearchInput, Select, Toggle, cx,
} from '../components/ui.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

const DEFAULT_OPTIONS = {
  title: '佳句拾遗',
  subtitle: '一句一句，长成自己的英文表达',
  includeCover: true,
  coverStyle: 'simple',
  includeOverview: true,
  includeTranslation: true,
  includeUsage: true,
  includeExample: true,
  includeExampleTranslation: true,
  includeSummary: true,
  includeTags: true,
  includeSource: false,
  includeThemeIntro: true,
  groupBy: 'theme',
  layout: 'cards',
  themeOrder: [],
  itemOrder: [],
  quoteMarks: true,
  fontFamily: '宋体',
  fontSize: 12,
  headingSize: 16,
  lineSpacing: 1.5,
  pageSize: 'A4',
  margin: 'normal',
  showPageNumbers: true,
  showDate: true,
  numbered: true,
};

export default function ExportEnglishPage() {
  const { toast } = useToast();
  const [selected, setSelected] = useState([]);
  const [q, setQ] = useState('');
  const [themeFilter, setThemeFilter] = useState('');
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [themeOrder, setThemeOrder] = useState([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { document.title = '导出佳句 · 拾穗 Study'; }, []);

  const query = buildQuery({ status: 'active', limit: 200, sort: 'newest' });
  const { data, loading, error } = useQuery(() => api.get(`/api/sentences${query}`), [query]);
  const items = data?.items || [];
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  useEffect(() => {
    if (items.length) setSelected((current) => (current.length ? current : items.map((item) => item.id)));
  }, [items]);

  const selectedItems = selected.map((id) => byId.get(id)).filter(Boolean);
  const themes = useMemo(() => [...new Set(items.map((item) => item.theme || '未分类'))], [items]);
  const filtered = useMemo(() => items.filter((item) => {
    if (themeFilter && (item.theme || '未分类') !== themeFilter) return false;
    if (q) {
      const haystack = `${item.content} ${item.translation} ${item.theme} ${item.summary} ${item.tags?.join(' ')}`.toLowerCase();
      if (!haystack.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [items, themeFilter, q]);

  const selectedThemes = useMemo(() => {
    const set = new Set(selectedItems.map((item) => item.theme || '未分类'));
    return [...set];
  }, [selectedItems]);

  useEffect(() => {
    if (!selectedThemes.length) {
      setThemeOrder((current) => (current.length ? [] : current));
      return;
    }
    setThemeOrder((current) => {
      const filteredCurrent = current.filter((theme) => selectedThemes.includes(theme));
      const missing = selectedThemes.filter((theme) => !filteredCurrent.includes(theme));
      const next = [...filteredCurrent, ...missing];
      return next.join('|') === current.join('|') ? current : next;
    });
  }, [selectedThemes]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((item) => selected.includes(item.id));
  const set = (patch) => setOptions((current) => ({ ...current, ...patch }));

  const toggleSelected = (id) => setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const moveItem = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= selected.length) return;
    const next = [...selected];
    [next[index], next[target]] = [next[target], next[index]];
    setSelected(next);
  };
  const moveTheme = (theme, delta) => {
    const index = themeOrder.indexOf(theme);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= themeOrder.length) return;
    const next = [...themeOrder];
    [next[index], next[target]] = [next[target], next[index]];
    setThemeOrder(next);
  };

  const exportDoc = async () => {
    if (!selectedItems.length) { toast('请先选择要导出的佳句', 'error'); return; }
    setExporting(true);
    try {
      const ids = selectedItems.map((item) => item.id);
      const { blob, filename } = await downloadFile('/api/export/english', {
        ids,
        options: { ...options, themeOrder, itemOrder: ids },
      }, '佳句拾遗.docx');
      triggerDownload(blob, filename);
      toast(`已生成 Word 文档（${selectedItems.length} 条佳句）`, 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="export-page english-export-page">
      <PageHeader
        back={{ to: '/english', label: '返回 English' }}
        eyebrow="EXPORT STUDIO"
        title="导出英语佳句"
        description="按主题分组、调整篇目顺序与版式，生成一份适合复习和背诵的佳句集。"
        actions={(
          <Button variant="primary" icon={Download} onClick={exportDoc} loading={exporting} disabled={!selectedItems.length}>
            生成 Word · {selectedItems.length} 条
          </Button>
        )}
      />

      {error ? <ErrorState message={error.message} /> : loading ? <LoadingBlock label="正在整理佳句…" /> : items.length === 0 ? (
        <EmptyState icon={Languages} title="还没有已收录的佳句" description="待审阅通过后的佳句才会出现在导出中。" />
      ) : (
        <div className="export-layout">
          <div className="export-select-column">
            <Card className="export-select-card">
              <div className="export-step-head">
                <span className="export-step">1</span>
                <div><h2>选择佳句</h2><p>已选 {selected.length} / {items.length} 条</p></div>
                <Badge tone="blue"><ListChecks size={12} /> 主题分类</Badge>
              </div>
              <div className="export-filters">
                <SearchInput value={q} onChange={setQ} placeholder="搜索句子、翻译、主题…" />
                <Select value={themeFilter} onChange={(event) => setThemeFilter(event.target.value)}>
                  <option value="">全部主题</option>
                  {themes.map((theme) => <option key={theme} value={theme}>{theme}</option>)}
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
                {filtered.map((item) => (
                  <label className={cx('export-item sent-item', selected.includes(item.id) && 'is-selected')} key={item.id}>
                    <Checkbox checked={selected.includes(item.id)} onChange={() => toggleSelected(item.id)} />
                    <div className="export-item-copy">
                      <p className="en">{stripMarkdown(item.content, 150)}</p>
                      <span>{stripMarkdown(item.translation, 90) || '暂无翻译'}</span>
                      <div className="row-wrap">
                        <Badge tone="blue">{item.theme || '未分类'}</Badge>
                        <span className="export-item-diff">{formatShortDate(item.createdAt)}</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </Card>

            <Card className="export-preview-card">
              <div className="export-preview-head"><LayoutTemplate size={15} /> 版式预览</div>
              <div className="page-mock">
                {options.includeCover && (
                  <div className="mock-cover english">
                    <span className="mock-eyebrow">ENGLISH NOTES</span>
                    <strong>{options.title || '佳句拾遗'}</strong>
                    <span>{options.subtitle}</span>
                    <i />
                  </div>
                )}
                <div className="mock-meta">{selectedItems.length} 条 · {options.groupBy === 'theme' ? '按主题分组' : options.groupBy === 'date' ? '按日期分组' : '不分组'} · {options.layout === 'cards' ? '卡片式' : '清单式'}</div>
                <div className="mock-sentence">
                  <span className="mock-number">{themeOrder[0] || '主题'}</span>
                  <p className="en">{selectedItems[0] ? `${options.quoteMarks ? '“' : ''}${stripMarkdown(selectedItems[0].content, 120)}${options.quoteMarks ? '”' : ''}` : '选择佳句后，这里会显示预览。'}</p>
                  {options.includeTranslation && <span className="mock-trans">{selectedItems[0]?.translation || '中文翻译'}</span>}
                  {options.includeUsage && <div className="mock-answer">用法与例句会以更小的字号跟随</div>}
                </div>
                <div className="mock-foot">第 1 页 {options.showPageNumbers ? '· 页码已开启' : ''}</div>
              </div>
            </Card>
          </div>

          <aside className="export-options-column">
            <Card className="export-options-card">
              <div className="export-step-head">
                <span className="export-step">2</span>
                <div><h2>分类与排版</h2><p>英语集可以完全按你的习惯调整</p></div>
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
                <h3>内容</h3>
                <div className="option-row">
                  <Toggle checked={options.includeTranslation} onChange={(value) => set({ includeTranslation: value })} label="中文翻译" />
                  <Toggle checked={options.includeUsage} onChange={(value) => set({ includeUsage: value })} label="用法说明" />
                </div>
                <div className="option-row">
                  <Toggle checked={options.includeExample} onChange={(value) => set({ includeExample: value })} label="新例句" />
                  <Toggle checked={options.includeExampleTranslation} onChange={(value) => set({ includeExampleTranslation: value })} label="例句翻译" />
                </div>
                <div className="option-row">
                  <Toggle checked={options.includeSummary} onChange={(value) => set({ includeSummary: value })} label="内容概要" />
                  <Toggle checked={options.includeTags} onChange={(value) => set({ includeTags: value })} label="标签" />
                </div>
                <div className="option-row">
                  <Toggle checked={options.includeSource} onChange={(value) => set({ includeSource: value })} label="来源" />
                  <Toggle checked={options.quoteMarks} onChange={(value) => set({ quoteMarks: value })} label="英文加引号" />
                </div>
              </div>

              <div className="option-group">
                <h3>分类与顺序</h3>
                <div className="form-grid form-grid-2">
                  <Field label="分组方式">
                    <Select value={options.groupBy} onChange={(event) => set({ groupBy: event.target.value })}>
                      <option value="theme">按主题</option>
                      <option value="date">按日期</option>
                      <option value="none">不分组</option>
                    </Select>
                  </Field>
                  <Field label="排版样式">
                    <Select value={options.layout} onChange={(event) => set({ layout: event.target.value })}>
                      <option value="cards">卡片式</option>
                      <option value="list">清单式</option>
                    </Select>
                  </Field>
                </div>
                <Toggle checked={options.includeThemeIntro} onChange={(value) => set({ includeThemeIntro: value })} label="主题下显示简短导语" />
                {options.groupBy === 'theme' && (
                  <div className="order-block">
                    <span className="order-label">主题顺序</span>
                    <div className="order-list">
                      {themeOrder.map((theme, index) => (
                        <div className="order-row" key={theme}>
                          <span>{index + 1}. {theme}</span>
                          <div className="order-buttons">
                            <button type="button" onClick={() => moveTheme(theme, -1)} disabled={index === 0} aria-label="主题上移"><ArrowUp size={13} /></button>
                            <button type="button" onClick={() => moveTheme(theme, 1)} disabled={index === themeOrder.length - 1} aria-label="主题下移"><ArrowDown size={13} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="order-block">
                  <span className="order-label">篇目顺序（已选 {selectedItems.length}）</span>
                  <div className="order-list order-list-tall">
                    {selectedItems.map((item, index) => (
                      <div className="order-row" key={item.id}>
                        <span className="en">{index + 1}. {stripMarkdown(item.content, 42)}</span>
                        <div className="order-buttons">
                          <button type="button" onClick={() => moveItem(selected.indexOf(item.id), -1)} disabled={index === 0} aria-label="上移"><ArrowUp size={13} /></button>
                          <button type="button" onClick={() => moveItem(selected.indexOf(item.id), 1)} disabled={index === selectedItems.length - 1} aria-label="下移"><ArrowDown size={13} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
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
                <div className="option-row">
                  <Toggle checked={options.showPageNumbers} onChange={(value) => set({ showPageNumbers: value })} label="页脚页码" />
                  <Toggle checked={options.numbered} onChange={(value) => set({ numbered: value })} label="篇目编号" />
                </div>
              </div>

              <div className="export-download-block">
                <div className="export-download-summary">
                  <FileText size={18} />
                  <div><strong>佳句拾遗.docx</strong><span>{selectedItems.length} 条 · {options.groupBy === 'theme' ? `${themeOrder.length} 个主题` : '不分组'} · {options.pageSize}</span></div>
                </div>
                <Button variant="primary" size="lg" icon={Download} className="btn-block" onClick={exportDoc} loading={exporting} disabled={!selectedItems.length}>
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
