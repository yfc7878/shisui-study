import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight, BookOpenText, CalendarDays, ChevronRight, CircleHelp, FileDown,
  Home, Inbox, Languages, LogOut, Moon, NotebookPen, Plus, Settings, Shapes,
  Sparkles, Sun, Trash2,
} from 'lucide-react';
import { BrandMark } from './Brand.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { api } from '../lib/api.js';
import { hasApiKey } from '../lib/settings.js';
import { todayLabel } from '../lib/format.js';
import { IconButton } from './ui.jsx';

const PRIMARY_NAV = [
  { to: '/', label: '总览', icon: Home, end: true },
  { to: '/mistakes', label: '错题本', icon: NotebookPen },
  { to: '/english', label: 'English', icon: Languages },
  { to: '/review', label: '待审阅', icon: Inbox, badge: true },
  { to: '/tools', label: '工具箱', icon: Shapes },
];

const SECONDARY_NAV = [
  { to: '/export/mistakes', label: '导出中心', icon: FileDown },
  { to: '/trash', label: '回收站', icon: Trash2 },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);
  const [aiReady, setAiReady] = useState(hasApiKey());

  useEffect(() => {
    let alive = true;
    api.get('/api/review/counts', { timeout: 25_000 })
      .then((data) => { if (alive) setPendingCount(data.counts?.all || 0); })
      .catch(() => { /* 静默处理，避免打断页面 */ });
    return () => { alive = false; };
  }, [location.pathname]);

  useEffect(() => {
    const update = () => {
      api.get('/api/review/counts', { timeout: 25_000 })
        .then((data) => setPendingCount(data.counts?.all || 0))
        .catch(() => {});
    };
    const settingsHandler = () => setAiReady(hasApiKey());
    window.addEventListener('shisui:review-changed', update);
    window.addEventListener('shisui:settings', settingsHandler);
    return () => {
      window.removeEventListener('shisui:review-changed', update);
      window.removeEventListener('shisui:settings', settingsHandler);
    };
  }, []);

  const navItems = (items) => items.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
    >
      <item.icon size={18} strokeWidth={1.9} />
      <span>{item.label}</span>
      {item.badge && pendingCount > 0 && <span className="nav-badge">{pendingCount > 99 ? '99+' : pendingCount}</span>}
    </NavLink>
  ));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand" aria-label="拾穗 Study 首页">
          <BrandMark />
          <span className="brand-name">
            <strong>拾穗</strong>
            <span>Study Atelier</span>
          </span>
        </NavLink>

        <nav className="side-nav" aria-label="主导航">
          <div className="nav-section-label">学习</div>
          {navItems(PRIMARY_NAV)}
          <div className="nav-section-label">整理</div>
          {navItems(SECONDARY_NAV)}
        </nav>

        <div className="sidebar-footer">
          <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Settings size={18} strokeWidth={1.9} />
            <span>设置</span>
            {!aiReady && <span className="nav-hint">配置 AI</span>}
          </NavLink>
          <div className="sidebar-user">
            <div className="avatar">{user?.name?.slice(0, 1) || '同'}</div>
            <div className="sidebar-user-copy">
              <strong>{user?.name || '同学'}</strong>
              <span>{aiReady ? 'AI 已就绪' : '等待配置 API'}</span>
            </div>
            <div className="sidebar-user-actions">
              <IconButton
                icon={theme === 'dark' ? Sun : Moon}
                label={theme === 'dark' ? '切换浅色' : '切换深色'}
                size="sm"
                onClick={toggleTheme}
              />
              <IconButton icon={LogOut} label="退出登录" size="sm" onClick={async () => { await logout(); navigate('/login'); }} />
            </div>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <NavLink to="/" className="mobile-brand" aria-label="拾穗 Study 首页">
            <BrandMark size={34} />
            <strong>拾穗</strong>
          </NavLink>
          <div className="topbar-date">
            <CalendarDays size={15} />
            <span>{todayLabel()}</span>
          </div>
          <div className="topbar-actions">
            <NavLink to="/review" className="topbar-ai-chip" title="待审阅">
              <Sparkles size={14} />
              <span>{pendingCount ? `${pendingCount} 项待审` : '审阅已清'}</span>
            </NavLink>
            <NavLink to="/mistakes/new" className="btn btn-primary btn-sm topbar-new-btn">
              <Plus size={15} />
              <span>新建错题</span>
            </NavLink>
            <div className="topbar-divider" />
            <IconButton
              icon={theme === 'dark' ? Sun : Moon}
              label={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
              onClick={toggleTheme}
            />
            <IconButton icon={Settings} label="设置" onClick={() => navigate('/settings')} />
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>

        <nav className="mobile-nav" aria-label="移动端导航">
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
            >
              <item.icon size={20} strokeWidth={1.9} />
              <span>{item.label === 'English' ? 'English' : item.label}</span>
              {item.badge && pendingCount > 0 && <span className="nav-badge">{pendingCount > 9 ? '9+' : pendingCount}</span>}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
