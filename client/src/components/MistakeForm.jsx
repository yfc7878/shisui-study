import { useState } from 'react';
import { Eraser, ImageIcon, Lightbulb, Tag } from 'lucide-react';
import { uploadBlob } from '../lib/api.js';
import {
  DIFFICULTY_LABELS, ERROR_REASONS, SOURCES, SUBJECTS,
} from '../lib/constants.js';
import {
  Badge, Card, Field, Lightbox, Markdown, Select, TagInput, Textarea, cx,
} from './ui.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import MarkdownField from './MarkdownField.jsx';
import FigureEditor from './FigureEditor.jsx';
import HandwritingCleaner from './HandwritingCleaner.jsx';

export default function MistakeForm({ value, onChange, readOnly = false }) {
  const { toast } = useToast();
  const [lightbox, setLightbox] = useState(null);
  const [cleanTarget, setCleanTarget] = useState(null);
  const set = (patch) => onChange?.({ ...value, ...patch });

  return (
    <div className="mistake-form">
      <Card className="form-section">
        <div className="form-section-head">
          <div>
            <h3>题目档案</h3>
            <p>这些信息会用于筛选、统计与 Word 导出。</p>
          </div>
          <Badge tone="neutral"><Tag size={12} /> 归档信息</Badge>
        </div>
        <div className="form-grid form-grid-3">
          <Field label="科目">
            <Select
              value={value.subject || ''}
              onChange={(event) => set({ subject: event.target.value })}
              disabled={readOnly}
            >
              <option value="">选择科目</option>
              {SUBJECTS.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
            </Select>
          </Field>
          <Field label="来源" hint="试卷、练习册或考试名称">
            <input
              className="input"
              list="source-suggestions"
              value={value.source || ''}
              onChange={(event) => set({ source: event.target.value })}
              placeholder="如：高一上第一次月考"
              disabled={readOnly}
            />
            <datalist id="source-suggestions">
              {SOURCES.map((source) => <option key={source} value={source} />)}
            </datalist>
          </Field>
          <Field label="章节 / 知识点范围">
            <input
              className="input"
              value={value.chapter || ''}
              onChange={(event) => set({ chapter: event.target.value })}
              placeholder="如：函数与导数"
              disabled={readOnly}
            />
          </Field>
        </div>
        <div className="form-grid form-grid-2" style={{ marginTop: 14 }}>
          <Field label="错因" hint="可在审阅时选择，也可以自己填写">
            <input
              className="input"
              list="error-reason-suggestions"
              value={value.errorReason || ''}
              onChange={(event) => set({ errorReason: event.target.value })}
              placeholder="如：审题不清 / 公式记错"
              disabled={readOnly}
            />
            <datalist id="error-reason-suggestions">
              {ERROR_REASONS.map((reason) => <option key={reason} value={reason} />)}
            </datalist>
          </Field>
          <Field label="难度">
            <div className="difficulty-picker" role="radiogroup" aria-label="难度">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  type="button"
                  className={cx('difficulty-option', Number(value.difficulty) === level && 'is-active')}
                  onClick={() => set({ difficulty: level })}
                  disabled={readOnly}
                  aria-label={`难度 ${level}：${DIFFICULTY_LABELS[level]}`}
                  aria-checked={Number(value.difficulty) === level}
                  role="radio"
                >
                  {level}
                </button>
              ))}
              <span className="difficulty-picker-label">{DIFFICULTY_LABELS[Number(value.difficulty) || 3]}</span>
            </div>
          </Field>
        </div>
        <div className="form-grid form-grid-2" style={{ marginTop: 14 }}>
          <Field label="知识点标签">
            <TagInput
              value={value.knowledgePoints || []}
              onChange={(tags) => set({ knowledgePoints: tags })}
              suggestions={['函数与导数', '三角函数', '牛顿运动定律', '化学方程式', '文言实词']}
              placeholder="输入知识点后回车"
            />
          </Field>
          <Field label="自定义标签">
            <TagInput
              value={value.tags || []}
              onChange={(tags) => set({ tags })}
              suggestions={['易错', '压轴', '一题多解', '需重做']}
              placeholder="输入标签后回车"
            />
          </Field>
        </div>
      </Card>

      <Card className="form-section">
        <div className="form-section-head">
          <div>
            <h3>题目</h3>
            <p>公式使用 $...$，独立公式使用 $$...$$。</p>
          </div>
          <Badge tone="green"><Lightbulb size={12} /> Markdown + LaTeX</Badge>
        </div>
        <MarkdownField
          label="题干"
          value={value.questionText || ''}
          onChange={(text) => set({ questionText: text })}
          readOnly={readOnly}
          rows={12}
          placeholder="题目内容…"
        />

        <div className="image-strip">
          {(value.images || []).map((image, index) => (
            <div className="image-strip-wrap" key={image.id || index}>
              <button
                type="button"
                className="image-strip-item"
                onClick={() => setLightbox({ src: image.url, alt: `原图 ${index + 1}` })}
              >
                <img src={image.url} alt={`题目原图 ${index + 1}`} loading="lazy" />
                <span>原图 {index + 1}</span>
              </button>
              {!readOnly && (
                <button
                  type="button"
                  className="image-clean-btn"
                  onClick={() => setCleanTarget({ src: image.url, index })}
                  title="去除这张图片上的手写笔迹"
                >
                  <Eraser size={12} /> 去笔迹
                </button>
              )}
            </div>
          ))}
          {(value.images || []).length === 0 && (
            <div className="image-strip-empty"><ImageIcon size={15} /> 没有上传原图</div>
          )}
        </div>

        <div className="section-divider" />
        <FigureEditor
          images={value.images || []}
          figures={value.figures || []}
          hints={value.figureHints || []}
          onChange={(figures) => set({ figures })}
        />

        <div className="section-divider" />
        <Field label="个人备注" hint="记录当时的卡点、老师提醒或下次重做时的提醒">
          <Textarea
            rows={3}
            value={value.note || ''}
            onChange={(event) => set({ note: event.target.value })}
            placeholder="例如：不要忘记讨论 a=0 的情况。"
            disabled={readOnly}
          />
        </Field>
      </Card>

      <Card className="form-section">
        <div className="form-section-head">
          <div>
            <h3>答案与解析</h3>
            <p>在导出 Word 时，可以选择题目 / 答案的排版顺序与是否留空重做。</p>
          </div>
        </div>
        <MarkdownField
          label="答案"
          value={value.answerText || ''}
          onChange={(text) => set({ answerText: text })}
          readOnly={readOnly}
          rows={8}
          placeholder="最终答案或关键结论…"
        />
        <MarkdownField
          label="解析"
          value={value.analysisText || ''}
          onChange={(text) => set({ analysisText: text })}
          readOnly={readOnly}
          rows={10}
          placeholder="关键步骤、思路与易错点…"
          className="mt-14"
        />
      </Card>

      <Lightbox open={Boolean(lightbox)} src={lightbox?.src} alt={lightbox?.alt} onClose={() => setLightbox(null)} />

      <HandwritingCleaner
        open={Boolean(cleanTarget)}
        src={cleanTarget?.src}
        title="去除题目图片笔迹"
        onClose={() => setCleanTarget(null)}
        onApply={async (blob) => {
          const uploaded = await uploadBlob(blob, `cleaned-question-${Date.now()}.jpg`);
          if (!uploaded) throw new Error('清理后的图片上传失败');
          const nextImages = (value.images || []).map((image, index) => (
            index === cleanTarget.index
              ? { ...uploaded, name: image.name || '', cleanedFrom: image.id }
              : image
          ));
          set({ images: nextImages });
          toast('笔迹已去除；保存后这张图片会被替换', 'success');
        }}
      />
    </div>
  );
}
