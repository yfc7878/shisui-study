import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BookOpenText, CalendarCheck2, CheckCircle2, ChevronRight, Flame,
  Inbox, Languages, NotebookPen, Plus, Sparkles, Timer, TrendingUp,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useQuery } from '../hooks/useQuery.js';
import { greeting, todayLabel, formatMinutes, relativeTime, stripMarkdown } from '../lib/format.js';
import { SENTENCE_THEMES, subjectColor } from '../lib/constants.js';
import {
  Badge, Button, Card, EmptyState, ErrorState, LinkButton, PageHeader, Skeleton, StatCard,
  SubjectBadge, cx,
} from '../components/ui.jsx';

function useTitle(title) {
  useEffect(() => { document.title = `${title} · 拾穗 Study`; }, [title]);
}

export default function DashboardPage() {
  useTitle('总览');
  const { data, loading, error, refresh } = useQuery(() => api.get('/api/dashboard'), []);

  if (error) return <ErrorState message={error.message} onRetry={refresh} />;
  if (loading || !data) return <DashboardSkeleton />;

  const maxWeekly = Math.max(1, ...data.weekly.map((day) => day.total));
  const topSubjects = data.subjects.slice(0, 6);
  const maxSubject = Math.max(1, ...topSubjects.map((row) => row.count));
  const pending = data.pendingTotal;

  return (
    <div className="dashboard">
      <PageHeader
        eyebrow="TODAY'S DESK"
        title={`${greeting()}，同学`}
        description={`${todayLabel()} · 今天也留一点时间给真正重要的事。`}
        actions={(
          <>
            <LinkButton to="/mistakes/new" icon={Plus} variant="primary">收一道错题</LinkButton>
            <LinkButton to="/english?new=1" icon={Sparkles}>积累佳句</LinkButton>
          </>
        )}
      >
        {data.streak > 0 && (
          <span className="streak-chip"><Flame size={14} /> 连续记录 {data.streak} 天</span>
        )}
      </PageHeader>

      <section className="dash-hero">
        <div className="dash-hero-copy">
          <span className="dash-hero-kicker">拾穗 · 今日</span>
          <h2>把每一次出错，<br />变成下一次的底气。</h2>
          <p>错题不是失败的证据，而是下一次答对的线索。整理、理解、重做——慢慢来，会比较快。</p>
          <div className="dash-hero-actions">
            <LinkButton to="/review" icon={Inbox} variant="accent">
              待审阅 {pending > 0 ? `· ${pending}` : ''}
            </LinkButton>
            <LinkButton to="/tools" icon={Timer} variant="ghost" className="on-dark">开始专注</LinkButton>
          </div>
        </div>
        <div className="dash-hero-card">
          <div className="hero-card-head"><span>本周节奏</span><CalendarCheck2 size={16} /></div>
          <div className="hero-ring-row">
            <div className="hero-number">{data.focus.weekMinutes}<span>分钟</span></div>
            <div className="hero-card-meta">
              <span>专注时长</span>
              <strong>{data.focus.totalSessions} 次</strong>
            </div>
          </div>
          <div className="hero-mini-bars">
            {data.weekly.map((day) => (
              <div key={day.date} className="hero-mini-bar" title={`${day.label} · ${day.focusMinutes} 分钟专注`}>
                <span style={{ height: `${Math.max(6, Math.min(100, (day.focusMinutes / 120) * 100))}%` }} />
              </div>
            ))}
          </div>
          <div className="hero-card-foot">
            <span>今天已专注 {data.focus.todayMinutes} 分钟</span>
            <Link to="/tools">去专注 <ArrowRight size={12} /></Link>
          </div>
        </div>
        <div className="dash-hero-mark" aria-hidden="true">穗</div>
      </section>

      <div className="stat-grid section-gap">
        <StatCard icon={NotebookPen} label="已收录错题" value={data.totals.mistakes} meta="值得再看一遍的题" tone="green" to="/mistakes" />
        <StatCard icon={Languages} label="英文佳句" value={data.totals.sentences} meta="你的写作素材库" tone="blue" to="/english" />
        <StatCard icon={BookOpenText} label="词汇解析" value={data.totals.vocab} meta="单词与词组" tone="violet" to="/english?tab=vocab" />
        <StatCard icon={Inbox} label="待审阅" value={pending} meta={pending ? '等待你确认后归档' : '今天已清空'} tone="coral" to="/review" />
      </div>

      <div className="dash-columns">
        <div className="dash-main">
          <Card className="chart-card">
            <div className="card-head-row">
              <div>
                <h3 className="card-title">本周拾穗</h3>
                <p className="card-subtitle">错题、佳句与词汇的每日收录</p>
              </div>
              <Badge tone="green"><TrendingUp size={12} /> 近 7 天</Badge>
            </div>
            <div className="week-chart">
              {data.weekly.map((day, index) => (
                <div className={cx('week-col', index === data.weekly.length - 1 && 'is-today')} key={day.date}>
                  <div className="week-bar-track">
                    <div
                      className="week-bar"
                      style={{ height: `${Math.max(day.total ? 9 : 2, (day.total / maxWeekly) * 100)}%` }}
                      title={`${day.label}：错题 ${day.mistakes} · 佳句 ${day.sentences} · 词汇 ${day.vocab}`}
                    >
                      {day.total > 0 && <span className="week-bar-value">{day.total}</span>}
                    </div>
                  </div>
                  <span className="week-label">{index === data.weekly.length - 1 ? '今天' : day.label}</span>
                </div>
              ))}
            </div>
            <div className="chart-legend">
              <span><i className="legend-dot green" /> 收录量</span>
              <span className="chart-footnote">总计 {data.weekly.reduce((sum, day) => sum + day.total, 0)} 条 · {formatMinutes(data.focus.weekMinutes)}专注</span>
            </div>
          </Card>

          <Card className="recent-card">
            <div className="card-head-row">
              <div>
                <h3 className="card-title">最近收录</h3>
                <p className="card-subtitle">刚刚被你拾起的知识</p>
              </div>
              <Link to="/mistakes" className="section-link">全部错题 <ChevronRight size={14} /></Link>
            </div>
            {data.recent.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="书桌还是空的"
                description="从一张题目照片，或一句喜欢的英文开始。"
                action={<LinkButton to="/mistakes/new" variant="primary" icon={Plus}>收第一道错题</LinkButton>}
                compact
              />
            ) : (
              <div className="recent-list">
                {data.recent.map((item) => (
                  <Link
                    key={`${item.type}-${item.id}`}
                    className="recent-item"
                    to={item.type === 'mistake' ? `/mistakes/${item.id}` : item.type === 'sentence' ? '/english' : `/english?tab=vocab&id=${item.id}`}
                  >
                    <span className={cx('recent-type', `type-${item.type}`)}>
                      {item.type === 'mistake' ? <NotebookPen size={16} /> : item.type === 'sentence' ? <Languages size={16} /> : <BookOpenText size={16} />}
                    </span>
                    <div className="recent-copy">
                      <strong className={item.type === 'sentence' ? 'en' : ''}>{stripMarkdown(item.title, 72)}</strong>
                      <span>{[item.subtitle, relativeTime(item.createdAt)].filter(Boolean).join(' · ')}</span>
                    </div>
                    {item.status === 'pending' && <Badge tone="amber">待审</Badge>}
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        <aside className="dash-aside">
          <Card className="review-mini-card">
            <div className="card-head-row">
              <div>
                <h3 className="card-title">待审阅</h3>
                <p className="card-subtitle">确认后才会正式归档</p>
              </div>
              <span className="mini-count">{pending}</span>
            </div>
            {pending === 0 ? (
              <div className="all-clear">
                <CheckCircle2 size={25} />
                <strong>都整理好了</strong>
                <span>新的 AI 结果会出现在这里</span>
              </div>
            ) : (
              <>
                <div className="review-mini-items">
                  {data.recent.filter((item) => item.status === 'pending').slice(0, 3).map((item) => (
                    <Link to="/review" key={`pending-${item.type}-${item.id}`} className="review-mini-item">
                      <span className={`dot-type type-${item.type}`} />
                      <span className="truncate">{stripMarkdown(item.title, 44)}</span>
                      <ChevronRight size={14} />
                    </Link>
                  ))}
                </div>
                <LinkButton to="/review" variant="soft" icon={Inbox} className="btn-block">去审阅 {pending} 项</LinkButton>
              </>
            )}
          </Card>

          <Card>
            <div className="card-head-row">
              <div>
                <h3 className="card-title">科目分布</h3>
                <p className="card-subtitle">主动复习，补上短板</p>
              </div>
            </div>
            {topSubjects.length === 0 ? (
              <p className="muted small" style={{ padding: '12px 0' }}>收录错题后，这里会显示你的科目分布。</p>
            ) : (
              <div className="subject-bars">
                {topSubjects.map((row) => (
                  <div className="subject-bar-row" key={row.subject}>
                    <div className="subject-bar-label">
                      <SubjectBadge subject={row.subject} />
                      <span>{row.count}</span>
                    </div>
                    <div className="subject-bar-track">
                      <span
                        style={{
                          width: `${(row.count / maxSubject) * 100}%`,
                          background: subjectColor(row.subject),
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="quote-card">
            <div className="quote-card-label">今日一句</div>
            <p className="en">“The secret of getting ahead is getting started.”</p>
            <span>先开始，再慢慢变好。</span>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dashboard">
      <div className="stack" style={{ gap: 18 }}>
        <Skeleton width={130} height={14} />
        <Skeleton width="48%" height={38} />
        <Skeleton width="32%" height={16} />
      </div>
      <Skeleton height={250} radius={26} className="section-gap" />
      <div className="stat-grid section-gap">
        {[1, 2, 3, 4].map((key) => <Skeleton key={key} height={100} radius={20} />)}
      </div>
      <div className="dash-columns section-gap">
        <Skeleton height={380} radius={20} />
        <Skeleton height={380} radius={20} />
      </div>
    </div>
  );
}
