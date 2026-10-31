import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from './contexts/AuthContext.jsx';
import AppShell from './components/AppShell.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { BrandMark } from './components/Brand.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import MistakesPage from './pages/MistakesPage.jsx';
import NewMistakePage from './pages/NewMistakePage.jsx';
import MistakeDetailPage from './pages/MistakeDetailPage.jsx';
import ReviewPage from './pages/ReviewPage.jsx';
import TrashPage from './pages/TrashPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import ExportMistakesPage from './pages/ExportMistakesPage.jsx';
import ExportEnglishPage from './pages/ExportEnglishPage.jsx';
import EnglishPage from './features/english/EnglishPage.jsx';
import VocabDetailPage from './features/english/VocabDetailPage.jsx';
import ToolsPage from './features/tools/ToolsPage.jsx';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }, [pathname]);
  return null;
}

function Splash() {
  return (
    <div className="loading-splash">
      <div className="splash-inner">
        <BrandMark size={54} />
        <p>SHISUI STUDY</p>
      </div>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="not-found">
      <div className="not-found-code">404</div>
      <h1>这一页还没有被拾起</h1>
      <p>地址可能写错了，或者内容已被移动。</p>
      <a className="btn btn-primary" href="/">回到总览</a>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Splash />;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  if (location.pathname === '/login') return <Navigate to="/" replace />;

  return (
    <>
      <ScrollToTop />
      <ErrorBoundary key={location.pathname}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/mistakes" element={<MistakesPage />} />
          <Route path="/mistakes/new" element={<NewMistakePage />} />
          <Route path="/mistakes/:id" element={<MistakeDetailPage />} />
          <Route path="/english" element={<EnglishPage />} />
          <Route path="/english/vocab/:id" element={<VocabDetailPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/trash" element={<TrashPage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/export/mistakes" element={<ExportMistakesPage />} />
          <Route path="/export/english" element={<ExportEnglishPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      </ErrorBoundary>
    </>
  );
}
