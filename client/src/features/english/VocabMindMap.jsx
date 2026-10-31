import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeftRight, BookOpen, ChevronDown, ChevronUp, Compass,
  GraduationCap, Layers, Lightbulb, Link2, MousePointerClick, Network, Quote, Repeat,
} from 'lucide-react';
import { Button, EmptyState, Markdown, cx } from '../../components/ui.jsx';
import { excerpt } from './helpers.js';
import { ThemeBadge } from './shared.jsx';

function DefinitionList({ definitions = [] }) {
  return (
    <ul className="eng-mm-defs">
      {definitions.map((definition, index) => (
        <li key={`${definition.pos || ''}-${index}`}>
          {definition.pos ? <span className="eng-def-pos">{definition.pos}</span> : null}
          <div className="eng-mm-def-copy">
            {definition.zh ? <p>{definition.zh}</p> : null}
            {definition.en ? <p className="eng-def-en">{definition.en}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function WordList({ rows = [], withRelation = false }) {
  return (
    <ul className="eng-wordchips">
      {rows.map((row, index) => (
        <li key={`${row.word || ''}-${index}`}>
          <strong>{row.word || row.phrase}</strong>
          {withRelation && row.relation ? <em>{row.relation}</em> : null}
          {row.zh ? <span>{row.zh}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function PairList({ rows = [] }) {
  return (
    <ul className="eng-mm-pairs">
      {rows.map((row, index) => (
        <li key={`${row.phrase || ''}-${index}`}>
          <span className="eng-mm-pair-en">{row.phrase}</span>
          {row.zh ? <span className="eng-mm-pair-zh">{row.zh}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function ExampleList({ rows = [] }) {
  return (
    <ul className="eng-mm-examples">
      {rows.map((row, index) => (
        <li key={index}>
          <span className="eng-mm-example-index">{String(index + 1).padStart(2, '0')}</span>
          <div>
            <p className="eng-mm-example-en">{row.en}</p>
            {row.zh ? <p className="eng-mm-example-zh">{row.zh}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function BranchNode({ branch, open, side, onToggle }) {
  const Icon = branch.icon;
  return (
    <div className={cx('eng-mm-item', `is-${side}`)}>
      {side === 'right' && <span className="eng-mm-wire" aria-hidden="true" />}
      <div
        className={cx('eng-mm-node', open && 'is-active')}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`${branch.label}${branch.count ? `，共 ${branch.count} 条` : ''}`}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
          }
        }}
      >
        <div className="eng-mm-node-head">
          <span className={cx('eng-mm-ico', `tone-${branch.tone}`)}><Icon size={15} /></span>
          <span className="eng-mm-label">{branch.label}</span>
          {branch.count ? <span className="eng-mm-count">{branch.count}</span> : null}
          <ChevronDown size={13} className={cx('eng-mm-chev', open && 'is-open')} />
        </div>
        {open ? (
          <div className="eng-mm-body" onClick={(event) => event.stopPropagation()}>
            {branch.render()}
          </div>
        ) : branch.brief ? (
          <p className="eng-mm-brief">{branch.brief}</p>
        ) : null}
      </div>
      {side === 'left' && <span className="eng-mm-wire" aria-hidden="true" />}
    </div>
  );
}

export default function VocabMindMap({ item }) {
  const data = item?.data || {};
  const [openKeys, setOpenKeys] = useState(() => new Set());

  useEffect(() => {
    setOpenKeys(new Set());
  }, [item?.id]);

  const branches = useMemo(() => {
    const definitions = Array.isArray(data.definitions) ? data.definitions : [];
    const examples = Array.isArray(data.examples) ? data.examples : [];
    const collocations = Array.isArray(data.collocations) ? data.collocations : [];
    const synonyms = Array.isArray(data.synonyms) ? data.synonyms : [];
    const antonyms = Array.isArray(data.antonyms) ? data.antonyms : [];
    const extensions = Array.isArray(data.extensions) ? data.extensions : [];
    const related = Array.isArray(data.related) ? data.related : [];

    const list = [];

    if (data.coreTranslation || definitions.length) {
      list.push({
        key: 'core',
        label: '核心释义',
        icon: BookOpen,
        tone: 'green',
        count: definitions.length || null,
        brief: excerpt(data.coreTranslation || definitions[0]?.zh, 62),
        render: () => (
          <>
            {data.coreTranslation ? <p className="eng-mm-lead">{data.coreTranslation}</p> : null}
            {definitions.length ? <DefinitionList definitions={definitions} /> : null}
          </>
        ),
      });
    }
    if (data.usage) {
      list.push({
        key: 'usage',
        label: '用法',
        icon: Compass,
        tone: 'blue',
        brief: excerpt(data.usage, 72),
        render: () => <Markdown className="markdown-compact">{data.usage}</Markdown>,
      });
    }
    if (collocations.length) {
      list.push({
        key: 'collocations',
        label: '搭配',
        icon: Link2,
        tone: 'gold',
        count: collocations.length,
        brief: collocations.slice(0, 3).map((row) => row.phrase).filter(Boolean).join(' · '),
        render: () => <PairList rows={collocations} />,
      });
    }
    if (synonyms.length) {
      list.push({
        key: 'synonyms',
        label: '同义词',
        icon: ArrowLeftRight,
        tone: 'violet',
        count: synonyms.length,
        brief: synonyms.slice(0, 4).map((row) => row.word).filter(Boolean).join(' · '),
        render: () => <WordList rows={synonyms} />,
      });
    }
    if (antonyms.length) {
      list.push({
        key: 'antonyms',
        label: '反义词',
        icon: Repeat,
        tone: 'coral',
        count: antonyms.length,
        brief: antonyms.slice(0, 4).map((row) => row.word).filter(Boolean).join(' · '),
        render: () => <WordList rows={antonyms} />,
      });
    }
    if (data.confusions) {
      list.push({
        key: 'confusions',
        label: '易混辨析',
        icon: AlertTriangle,
        tone: 'amber',
        brief: excerpt(data.confusions, 72),
        render: () => <Markdown className="markdown-compact">{data.confusions}</Markdown>,
      });
    }
    if (examples.length) {
      list.push({
        key: 'examples',
        label: '例句',
        icon: Quote,
        tone: 'green',
        count: examples.length,
        brief: excerpt(examples[0]?.en, 72),
        render: () => <ExampleList rows={examples} />,
      });
    }
    if (data.memoryTip) {
      list.push({
        key: 'memoryTip',
        label: '记忆法',
        icon: Lightbulb,
        tone: 'gold',
        brief: excerpt(data.memoryTip, 72),
        render: () => <Markdown className="markdown-compact">{data.memoryTip}</Markdown>,
      });
    }
    if (data.examTips) {
      list.push({
        key: 'examTips',
        label: '考试提醒',
        icon: GraduationCap,
        tone: 'coral',
        brief: excerpt(data.examTips, 72),
        render: () => <Markdown className="markdown-compact">{data.examTips}</Markdown>,
      });
    }
    extensions.forEach((extension, index) => {
      if (!extension?.label && !extension?.content) return;
      list.push({
        key: `ext-${index}`,
        label: extension.label || `延伸 ${index + 1}`,
        icon: Layers,
        tone: 'blue',
        brief: excerpt(extension.content, 72),
        render: () => <Markdown className="markdown-compact">{extension.content || ''}</Markdown>,
      });
    });
    if (related.length) {
      list.push({
        key: 'related',
        label: '相关词',
        icon: Network,
        tone: 'violet',
        count: related.length,
        brief: related.slice(0, 4).map((row) => row.word).filter(Boolean).join(' · '),
        render: () => <WordList rows={related} withRelation />,
      });
    }
    return list;
  }, [data]);

  const allOpen = branches.length > 0 && branches.every((branch) => openKeys.has(branch.key));
  const half = Math.ceil(branches.length / 2);
  const left = branches.slice(0, half);
  const right = branches.slice(half);
  const pos = Array.isArray(data.partOfSpeech) ? data.partOfSpeech.filter(Boolean) : [];

  const toggle = (key) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!branches.length) {
    return (
      <EmptyState
        icon={BookOpen}
        title="这条词还没有结构化内容"
        description="切换到「编辑」，补上释义、搭配或例句，思维导图就会长出来。"
        compact
      />
    );
  }

  return (
    <section className="eng-map" aria-label="词条思维导图">
      <header className="eng-map-head">
        <span className="eng-map-hint">
          <MousePointerClick size={13} />
          {branches.length} 个分支 · 点击节点展开或收起
        </span>
        <Button
          size="sm"
          variant="ghost"
          icon={allOpen ? ChevronUp : ChevronDown}
          onClick={() => setOpenKeys(allOpen ? new Set() : new Set(branches.map((branch) => branch.key)))}
        >
          {allOpen ? '收起全部' : '展开全部'}
        </Button>
      </header>

      <div className="eng-mm">
        <div className="eng-mm-col is-left">
          {left.map((branch) => (
            <BranchNode
              key={branch.key}
              branch={branch}
              side="left"
              open={openKeys.has(branch.key)}
              onToggle={() => toggle(branch.key)}
            />
          ))}
        </div>

        <div className="eng-mm-center">
          <div className="eng-mm-center-inner">
            <span className="eng-mm-kicker">{item?.entryType === 'phrase' ? 'PHRASE' : 'WORD'}</span>
            <h2 className="eng-mm-term">{item?.term}</h2>
            {data.phonetic ? <p className="eng-mm-phonetic">{data.phonetic}</p> : null}
            {pos.length > 0 && (
              <div className="eng-pos-row is-center">
                {pos.map((entry) => <span className="eng-pos" key={entry}>{entry}</span>)}
              </div>
            )}
            <p className="eng-mm-core">{data.coreTranslation || '点击两侧分支查看细节'}</p>
            <div className="eng-mm-center-foot">
              <ThemeBadge theme={item?.theme} />
            </div>
          </div>
        </div>

        <div className="eng-mm-col is-right">
          {right.map((branch) => (
            <BranchNode
              key={branch.key}
              branch={branch}
              side="right"
              open={openKeys.has(branch.key)}
              onToggle={() => toggle(branch.key)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
