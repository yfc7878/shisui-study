import { useEffect, useState } from 'react';
import { Calculator as CalculatorGlyph, LineChart, Timer } from 'lucide-react';
import { PageHeader, Segmented } from '../../components/ui.jsx';
import Pomodoro from './Pomodoro.jsx';
import Calculator from './Calculator.jsx';
import FunctionGraph from './FunctionGraph.jsx';
import './tools.css';

const BASE_TITLE = '工具箱 · 拾穗 Study';

const TOOL_TABS = [
  { value: 'focus', label: '番茄钟', icon: Timer },
  { value: 'calculator', label: '计算器', icon: CalculatorGlyph },
  { value: 'graph', label: '函数图像', icon: LineChart },
];

const TAB_HINTS = {
  focus: [
    { key: '空格', label: '开始 / 暂停' },
    { key: '设置', label: '调整时长' },
  ],
  calculator: [
    { key: 'Enter', label: '计算' },
    { key: 'Esc', label: '清空' },
    { key: 'Ans', label: '上次结果' },
  ],
  graph: [
    { key: '拖动', label: '平移' },
    { key: '滚轮', label: '缩放' },
    { key: '点击', label: '描点' },
  ],
};

export default function ToolsPage() {
  const [tab, setTab] = useState('focus');

  useEffect(() => {
    document.title = BASE_TITLE;
    return () => { document.title = '拾穗 Study'; };
  }, []);

  useEffect(() => {
    if (tab !== 'focus') document.title = BASE_TITLE;
  }, [tab]);

  const hints = TAB_HINTS[tab] || [];

  return (
    <div className="tools-page">
      <PageHeader
        eyebrow="QUIET UTENSILS"
        title="工具箱"
        description="专注、计算与函数图像，安静地放在手边。"
        actions={(
          <div className="tool-header-hints" aria-label="快捷操作提示">
            {hints.map((hint) => (
              <span className="tool-header-hint" key={hint.key}>
                <kbd className="tool-kbd">{hint.key}</kbd>
                {hint.label}
              </span>
            ))}
          </div>
        )}
      />

      <div className="tool-tab-bar">
        <Segmented
          options={TOOL_TABS}
          value={tab}
          onChange={setTab}
          ariaLabel="选择工具"
          className="tool-tab-segmented"
        />
        <span className="tool-tab-note">
          {tab === 'focus' ? '一次只做一件事' : tab === 'calculator' ? '表达式安全求值，不执行代码' : '纸面网格上的函数曲线'}
        </span>
      </div>

      <div className="tool-panels">
        <section
          className="tool-panel"
          role="tabpanel"
          aria-label="番茄钟"
          hidden={tab !== 'focus'}
        >
          <Pomodoro active={tab === 'focus'} />
        </section>

        <section
          className="tool-panel"
          role="tabpanel"
          aria-label="计算器"
          hidden={tab !== 'calculator'}
        >
          <Calculator active={tab === 'calculator'} />
        </section>

        <section
          className="tool-panel"
          role="tabpanel"
          aria-label="函数图像"
          hidden={tab !== 'graph'}
        >
          <FunctionGraph />
        </section>
      </div>

      <p className="tool-footer-note">
        专注设置、计算历史与可视化都留在本机；函数图像只是数学的素描，不替代严谨推导。
      </p>
    </div>
  );
}
