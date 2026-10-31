import {
  AlertTriangle, ArrowLeftRight, BookOpen, Compass, GraduationCap, Layers,
  Lightbulb, Link2, Network, Quote, Repeat,
} from 'lucide-react';
import { EmptyState, Markdown, cx } from '../../components/ui.jsx';

function Section({ icon: Icon, title, count, children, className = '' }) {
  return (
    <section className={cx('eng-sec', className)}>
      <header className="eng-sec-head">
        <span className="eng-sec-icon"><Icon size={16} /></span>
        <h3 className="eng-sec-title">{title}</h3>
        {count ? <span className="eng-sec-count">{count}</span> : null}
      </header>
      <div className="eng-sec-body">{children}</div>
    </section>
  );
}

function WordChips({ rows = [], withRelation = false }) {
  return (
    <ul className="eng-wordchips">
      {rows.map((row, index) => (
        <li key={`${row.word || ''}-${index}`}>
          <strong>{row.word}</strong>
          {withRelation && row.relation ? <em>{row.relation}</em> : null}
          {row.zh ? <span>{row.zh}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export default function VocabTextView({ item }) {
  const data = item?.data || {};
  const definitions = Array.isArray(data.definitions) ? data.definitions : [];
  const extensions = Array.isArray(data.extensions) ? data.extensions : [];
  const collocations = Array.isArray(data.collocations) ? data.collocations : [];
  const synonyms = Array.isArray(data.synonyms) ? data.synonyms : [];
  const antonyms = Array.isArray(data.antonyms) ? data.antonyms : [];
  const examples = Array.isArray(data.examples) ? data.examples : [];
  const related = Array.isArray(data.related) ? data.related : [];

  const hasCore = Boolean(data.coreTranslation) || definitions.length > 0;
  const empty = !hasCore && !data.usage && !extensions.length && !collocations.length
    && !synonyms.length && !antonyms.length && !data.confusions && !examples.length
    && !data.memoryTip && !data.examTips && !related.length;

  if (empty) {
    return (
      <EmptyState
        icon={BookOpen}
        title="还没有可阅读的内容"
        description="这条词只有词条信息。切换到「编辑」补充释义、用法或例句后再回来。"
        compact
      />
    );
  }

  return (
    <div className="eng-reading">
      {hasCore && (
        <Section icon={BookOpen} title="核心释义" count={definitions.length || null}>
          {data.coreTranslation ? <p className="eng-reading-lead">{data.coreTranslation}</p> : null}
          {definitions.length > 0 && (
            <ul className="eng-def-list">
              {definitions.map((definition, index) => (
                <li className="eng-def" key={`${definition.pos || ''}-${index}`}>
                  {definition.pos ? <span className="eng-def-pos">{definition.pos}</span> : null}
                  <div>
                    {definition.zh ? <p className="eng-def-zh">{definition.zh}</p> : null}
                    {definition.en ? <p className="eng-def-en">{definition.en}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {data.usage && (
        <Section icon={Compass} title="用法">
          <Markdown className="markdown-compact">{data.usage}</Markdown>
        </Section>
      )}

      {extensions.length > 0 && (
        <Section icon={Layers} title="延伸与辨析" count={extensions.length}>
          <div className="eng-ext-list">
            {extensions.map((extension, index) => (
              <div className="eng-ext" key={`${extension.label || ''}-${index}`}>
                {extension.label ? <h4 className="eng-ext-label">{extension.label}</h4> : null}
                {extension.content ? <Markdown className="markdown-compact">{extension.content}</Markdown> : null}
              </div>
            ))}
          </div>
        </Section>
      )}

      {collocations.length > 0 && (
        <Section icon={Link2} title="常用搭配" count={collocations.length}>
          <div className="eng-pair-list">
            {collocations.map((row, index) => (
              <div className="eng-pair" key={`${row.phrase || ''}-${index}`}>
                <span className="eng-pair-en">{row.phrase}</span>
                {row.zh ? <span className="eng-pair-zh">{row.zh}</span> : null}
              </div>
            ))}
          </div>
        </Section>
      )}

      {(synonyms.length > 0 || antonyms.length > 0) && (
        <Section icon={ArrowLeftRight} title="近义与反义">
          <div className="eng-stack-2">
            {synonyms.length > 0 && (
              <div>
                <p className="eng-mini-label">同义词</p>
                <WordChips rows={synonyms} />
              </div>
            )}
            {antonyms.length > 0 && (
              <div>
                <p className="eng-mini-label">反义词</p>
                <div className="eng-antonyms">
                  <Repeat size={14} aria-hidden="true" />
                  <WordChips rows={antonyms} />
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {data.confusions && (
        <Section icon={AlertTriangle} title="易混辨析">
          <Markdown className="markdown-compact">{data.confusions}</Markdown>
        </Section>
      )}

      {examples.length > 0 && (
        <Section icon={Quote} title="例句" count={examples.length}>
          <ul className="eng-example-list">
            {examples.map((example, index) => (
              <li className="eng-example" key={index}>
                <span className="eng-example-index">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <p className="eng-example-en">{example.en}</p>
                  {example.zh ? <p className="eng-example-zh">{example.zh}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.memoryTip && (
        <Section icon={Lightbulb} title="记忆法">
          <Markdown className="markdown-compact">{data.memoryTip}</Markdown>
        </Section>
      )}

      {data.examTips && (
        <Section icon={GraduationCap} title="考试提醒">
          <Markdown className="markdown-compact">{data.examTips}</Markdown>
        </Section>
      )}

      {related.length > 0 && (
        <Section icon={Network} title="相关词" count={related.length}>
          <WordChips rows={related} withRelation />
        </Section>
      )}
    </div>
  );
}
