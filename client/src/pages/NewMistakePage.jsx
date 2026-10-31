import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, ChevronUp, ChevronDown, Crop, Eraser, FileText, ImagePlus,
  Loader2, Plus, ScanLine, Settings2, Sparkles, Trash2, Wand2,
} from 'lucide-react';
import { api, errorMessage, uploadImages } from '../lib/api.js';
import { compressImageFile, loadImage } from '../lib/image.js';
import { getAiConfig, getPromptExtras, hasApiKey, loadSettings } from '../lib/settings.js';
import { ERROR_REASONS, SOURCES, SUBJECTS } from '../lib/constants.js';
import { formatDateTime } from '../lib/format.js';
import {
  Badge, Button, Card, Checkbox, Field, LinkButton, Modal, PageHeader, Select, Textarea,
  Toggle, cx,
} from '../components/ui.jsx';
import ImageCropper from '../components/ImageCropper.jsx';
import HandwritingCleaner from '../components/HandwritingCleaner.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

const STEPS = [
  '正在读取题目图片…',
  '识别题干与选项…',
  '逐题推导答案与解析…',
  '标记题目中的图像区域…',
  '整理知识点与难度…',
];

let entryKey = 0;

export default function NewMistakePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const inputRef = useRef(null);
  const entriesRef = useRef([]);
  const [entries, setEntries] = useState([]);
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [cropEntry, setCropEntry] = useState(null);
  const [cleanEntry, setCleanEntry] = useState(null);
  const [subjectHint, setSubjectHint] = useState('');
  const [think, setThink] = useState(Boolean(loadSettings().ai.thinkDefault));
  const [advanced, setAdvanced] = useState(false);
  const [extraInstructions, setExtraInstructions] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({
    subject: '', source: '', difficulty: 3, errorReason: '', questionText: '', answerText: '', analysisText: '',
  });
  const [manualSaving, setManualSaving] = useState(false);
  const aiReady = hasApiKey();
  const ai = getAiConfig();

  useEffect(() => { document.title = '收一道错题 · 拾穗 Study'; }, []);
  useEffect(() => { entriesRef.current = entries; }, [entries]);
  useEffect(() => () => { entriesRef.current.forEach((entry) => URL.revokeObjectURL(entry.url)); }, []);

  useEffect(() => {
    if (!extracting) return undefined;
    const timer = setInterval(() => setStepIndex((index) => (index + 1) % STEPS.length), 5200);
    return () => clearInterval(timer);
  }, [extracting]);

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    const room = 12 - entries.length;
    if (room <= 0) {
      toast('一次最多使用 12 张图片', 'error');
      return;
    }
    setBusy(true);
    const added = [];
    for (const file of files.slice(0, room)) {
      try {
        const compressed = await compressImageFile(file, { maxSize: 2200, quality: 0.9 });
        const url = URL.createObjectURL(compressed);
        const image = await loadImage(url);
        entryKey += 1;
        added.push({
          key: `entry-${entryKey}`,
          file: compressed,
          url,
          width: image.naturalWidth,
          height: image.naturalHeight,
          use: true,
          name: file.name,
        });
      } catch (err) {
        toast(`「${file.name}」处理失败：${err.message}`, 'error');
      }
    }
    setEntries((list) => [...list, ...added]);
    setBusy(false);
    if (added.length) toast(`已添加 ${added.length} 张图片`, 'success');
  };

  const replaceEntry = (key, file, url, width, height) => {
    const old = entriesRef.current.find((entry) => entry.key === key);
    if (old) URL.revokeObjectURL(old.url);
    setEntries((list) => list.map((entry) => (
      entry.key === key ? { ...entry, file, url, width, height } : entry
    )));
  };

  const removeEntry = (key) => {
    const target = entriesRef.current.find((entry) => entry.key === key);
    if (target) URL.revokeObjectURL(target.url);
    setEntries((list) => list.filter((entry) => entry.key !== key));
  };

  const moveEntry = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= entries.length) return;
    const next = [...entries];
    [next[index], next[target]] = [next[target], next[index]];
    setEntries(next);
  };

  const startExtract = async () => {
    const used = entries.filter((entry) => entry.use);
    if (!used.length) return;
    if (!aiReady) {
      toast('请先在设置中填写 DeepSeek API Key', 'info', {
        action: { label: '去设置', onClick: () => navigate('/settings') },
      });
      return;
    }
    setError('');
    setProgress(4);
    setExtracting(true);
    setStepIndex(0);
    try {
      const uploaded = await uploadImages(used.map((entry) => entry.file), setProgress);
      setProgress(28);
      const result = await api.post('/api/ai/extract-mistake', {
        imageIds: uploaded.map((file) => file.id),
        think,
        subjectHint,
        extraInstructions: [getPromptExtras().mistake, extraInstructions].filter(Boolean).join('\n'),
        ai,
      }, { timeout: 300_000 });
      setProgress(100);
      const first = result.items?.[0];
      toast(`AI 已整理 ${result.items.length} 道题，先放入待审阅`, 'success', {
        action: { label: '立即审阅', onClick: () => navigate('/review?type=mistake') },
      });
      window.dispatchEvent(new Event('shisui:review-changed'));
      if (first) navigate(`/review?type=mistake&id=${first.id}`);
      else navigate('/review?type=mistake');
    } catch (err) {
      setError(errorMessage(err));
      setExtracting(false);
      toast(errorMessage(err), 'error');
    }
  };

  const saveManual = async () => {
    if (!manual.questionText.trim()) {
      toast('请填写题目内容，或上传图片使用 AI 识别', 'error');
      return;
    }
    setManualSaving(true);
    try {
      const result = await api.post('/api/mistakes', { ...manual, status: 'active' });
      toast('错题已手动收录', 'success');
      navigate(`/mistakes/${result.item.id}`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setManualSaving(false);
    }
  };

  return (
    <div className="new-mistake-page">
      <PageHeader
        back={{ to: '/mistakes', label: '返回错题本' }}
        eyebrow="NEW ENTRY"
        title="收一道错题"
        description="上传题目图片（可多张），AI 会提取题干、答案与解析，并把结果放入待审阅。"
        actions={(
          <Button variant="secondary" icon={FileText} onClick={() => setManualOpen(true)}>手动录入</Button>
        )}
      />

      <div className="new-mistake-layout">
        <div className="new-mistake-main">
          <Card className="upload-card">
            <div
              className={cx('dropzone', entries.length > 0 && 'has-files')}
              onDragOver={(event) => { event.preventDefault(); event.currentTarget.classList.add('is-dragover'); }}
              onDragLeave={(event) => event.currentTarget.classList.remove('is-dragover')}
              onDrop={(event) => {
                event.preventDefault();
                event.currentTarget.classList.remove('is-dragover');
                addFiles(event.dataTransfer.files);
              }}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click(); }}
            >
              <div className="dropzone-icon">
                {entries.length ? <ImagePlus size={26} /> : <ScanLine size={26} />}
              </div>
              <h3>{entries.length ? '继续添加题目图片' : '把题目图片放在这里'}</h3>
              <p>点击选择，或直接拖拽图片 · 支持 JPG / PNG / WebP · 最多 12 张</p>
              <span className="dropzone-hint">同一道题的多页、多张照片可以一起上传，AI 会合并识别。</span>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }}
              />
            </div>

            {busy && (
              <div className="inline-loading"><Loader2 size={16} className="spin" /> 正在压缩图片…</div>
            )}

            {entries.length > 0 && (
              <>
                <div className="upload-list-head">
                  <div>
                    <strong>{entries.length} 张图片</strong>
                    <span>可逐张裁剪、去除笔迹、排序或取消使用</span>
                  </div>
                  <Button variant="ghost" size="sm" icon={Plus} onClick={() => inputRef.current?.click()}>添加更多</Button>
                </div>
                <div className="upload-grid">
                  {entries.map((entry, index) => (
                    <div className={cx('upload-item', !entry.use && 'is-skipped')} key={entry.key}>
                      <button type="button" className="upload-preview" onClick={() => setCropEntry(entry)}>
                        <img src={entry.url} alt={`题目图 ${index + 1}`} />
                        {!entry.use && <span className="upload-skipped-label">已跳过</span>}
                        <span className="upload-crop-hint"><Crop size={14} /> 点击裁剪</span>
                      </button>
                      <div className="upload-item-info">
                        <span>图 {index + 1}</span>
                        <span>{entry.width} × {entry.height}</span>
                      </div>
                      <div className="upload-item-actions">
                        <button type="button" className="upload-clean" onClick={() => setCleanEntry(entry)} title="去除手写笔迹" aria-label="去除手写笔迹">
                          <Eraser size={14} />
                        </button>
                        <Checkbox
                          checked={entry.use}
                          onChange={(checked) => setEntries((list) => list.map((item) => (item.key === entry.key ? { ...item, use: checked } : item)))}
                          label="使用"
                        />
                        <div className="upload-order">
                          <button type="button" onClick={() => moveEntry(index, -1)} disabled={index === 0} aria-label="前移"><ChevronUp size={13} /></button>
                          <button type="button" onClick={() => moveEntry(index, 1)} disabled={index === entries.length - 1} aria-label="后移"><ChevronDown size={13} /></button>
                        </div>
                        <button type="button" className="upload-remove" onClick={() => removeEntry(entry.key)} aria-label="移除图片"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {error && (
            <div className="ai-error-card">
              <Wand2 size={20} />
              <div>
                <strong>这次没有整理成功</strong>
                <p>{error}</p>
              </div>
            </div>
          )}
        </div>

        <aside className="new-mistake-side">
          <Card className="ai-config-card">
            <div className="ai-config-head">
              <span className={cx('ai-orb', aiReady && 'ready')}><Sparkles size={18} /></span>
              <div>
                <strong>AI 识别</strong>
                <span>{aiReady ? `模型 ${ai.model}` : '尚未配置 API'}</span>
              </div>
              {aiReady ? <Badge tone="green" dot>已就绪</Badge> : <Badge tone="amber">待配置</Badge>}
            </div>
            {!aiReady && (
              <div className="ai-config-missing">
                <p>填写 DeepSeek API Key 后，才能调用视觉识别。Key 只保存在当前浏览器。</p>
                <LinkButton to="/settings" variant="soft" size="sm" icon={Settings2}>去配置</LinkButton>
              </div>
            )}

            <div className="side-field">
              <Field label="科目提示" hint="可选，帮助 AI 更准确地识别">
                <Select value={subjectHint} onChange={(event) => setSubjectHint(event.target.value)}>
                  <option value="">自动判断</option>
                  {SUBJECTS.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                </Select>
              </Field>
            </div>

            <div className="side-toggle">
              <Toggle
                checked={think}
                onChange={setThink}
                label="深度思考模式"
                description="更准确地推导压轴题，但会慢一些、消耗更多 token。"
              />
            </div>

            <button type="button" className="advanced-toggle" onClick={() => setAdvanced((value) => !value)}>
              <Settings2 size={14} /> 额外提示词
              <ChevronDown size={14} className={advanced ? 'rotate' : ''} />
            </button>
            {advanced && (
              <Textarea
                rows={4}
                value={extraInstructions}
                onChange={(event) => setExtraInstructions(event.target.value)}
                placeholder="例如：请重点解释第二问；答案保留根号形式。"
              />
            )}

            <Button
              variant="primary"
              size="lg"
              className="btn-block extract-btn"
              icon={Sparkles}
              onClick={startExtract}
              disabled={!entries.some((entry) => entry.use) || busy || extracting}
              loading={extracting}
            >
              {extracting ? 'AI 正在整理…' : `开始 AI 识别${entries.some((entry) => entry.use) ? `（${entries.filter((entry) => entry.use).length} 张）` : ''}`}
            </Button>
            <p className="ai-policy">识别结果不会直接归档，而是进入「待审阅」，由你确认后再正式加入错题本。</p>
          </Card>

          <Card className="tips-card">
            <h4><CheckCircle2 size={15} /> 拍题小建议</h4>
            <ul>
              <li>尽量正对拍摄，题干完整、字迹清晰。</li>
              <li>同一题的多页可以都上传，AI 会合并。</li>
              <li>试卷边缘的无关内容可以先用裁剪去掉；有手写答案时点「去笔迹」。</li>
              <li>含函数图、几何图时，审阅页可以再单独裁剪配图。</li>
            </ul>
          </Card>
        </aside>
      </div>

      <ImageCropper
        open={Boolean(cropEntry)}
        src={cropEntry?.url}
        title="裁剪题目图片"
        hint="裁掉试卷边缘、无关题或空白；如果整张都需要，直接点「全图」后应用。"
        onClose={() => setCropEntry(null)}
        onSkip={() => setCropEntry(null)}
        onApply={async (blob) => {
          const file = new File([blob], `question-${Date.now()}.jpg`, { type: 'image/jpeg' });
          const url = URL.createObjectURL(blob);
          const image = await loadImage(url);
          replaceEntry(cropEntry.key, file, url, image.naturalWidth, image.naturalHeight);
          toast('裁剪已应用', 'success');
        }}
      />

      <HandwritingCleaner
        open={Boolean(cleanEntry)}
        src={cleanEntry?.url}
        onClose={() => setCleanEntry(null)}
        onApply={async (blob) => {
          const file = new File([blob], `cleaned-${Date.now()}.jpg`, { type: 'image/jpeg' });
          const url = URL.createObjectURL(blob);
          const image = await loadImage(url);
          replaceEntry(cleanEntry.key, file, url, image.naturalWidth, image.naturalHeight);
          toast('笔迹已去除，图片已更新', 'success');
        }}
      />

      <Modal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="手动录入错题"
        description="不经过 AI，直接写下题目和答案。适合文字题或补录旧错题。"
        size="lg"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setManualOpen(false)}>取消</Button>
            <Button variant="primary" onClick={saveManual} loading={manualSaving} icon={Plus}>收录到错题本</Button>
          </>
        )}
      >
        <div className="form-grid form-grid-2">
          <Field label="科目">
            <Select value={manual.subject} onChange={(event) => setManual({ ...manual, subject: event.target.value })}>
              <option value="">选择科目</option>
              {SUBJECTS.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
            </Select>
          </Field>
          <Field label="来源">
            <input className="input" list="manual-sources" value={manual.source} onChange={(event) => setManual({ ...manual, source: event.target.value })} placeholder="如：月考 / 练习册" />
            <datalist id="manual-sources">{SOURCES.map((item) => <option key={item} value={item} />)}</datalist>
          </Field>
        </div>
        <Field label="题目" required className="mt-14">
          <Textarea rows={6} value={manual.questionText} onChange={(event) => setManual({ ...manual, questionText: event.target.value })} placeholder="输入题干，支持 Markdown 和 LaTeX…" />
        </Field>
        <div className="form-grid form-grid-2 mt-14">
          <Field label="答案">
            <Textarea rows={4} value={manual.answerText} onChange={(event) => setManual({ ...manual, answerText: event.target.value })} />
          </Field>
          <Field label="解析">
            <Textarea rows={4} value={manual.analysisText} onChange={(event) => setManual({ ...manual, analysisText: event.target.value })} />
          </Field>
        </div>
        <div className="form-grid form-grid-2 mt-14">
          <Field label="错因">
            <input className="input" list="manual-reasons" value={manual.errorReason} onChange={(event) => setManual({ ...manual, errorReason: event.target.value })} />
            <datalist id="manual-reasons">{ERROR_REASONS.map((item) => <option key={item} value={item} />)}</datalist>
          </Field>
          <Field label="难度">
            <Select value={manual.difficulty} onChange={(event) => setManual({ ...manual, difficulty: Number(event.target.value) })}>
              {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>{level} 级</option>)}
            </Select>
          </Field>
        </div>
      </Modal>

      {extracting && (
        <div className="ai-overlay" role="status" aria-live="polite">
          <div className="ai-overlay-card">
            <div className="ai-orbit">
              <span className="ai-orbit-ring" />
              <span className="ai-orbit-ring second" />
              <Sparkles size={26} />
            </div>
            <h2>AI 正在读题</h2>
            <p>{STEPS[stepIndex]}</p>
            <div className="ai-progress"><span style={{ width: `${Math.max(8, progress)}%` }} /></div>
            <span className="ai-overlay-note">思考模式可能需要 1-3 分钟，请不要关闭页面。</span>
          </div>
        </div>
      )}
    </div>
  );
}
