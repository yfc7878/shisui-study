import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { setServerAiReady } from '../lib/settings.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [defaultPassword, setDefaultPassword] = useState(false);
  const [loading, setLoading] = useState(true);

  const syncAiInfo = useCallback(async () => {
    try {
      const info = await api.get('/api/ai/info', { timeout: 20_000 });
      setServerAiReady(Boolean(info.serverKeyConfigured));
    } catch {
      /* AI 信息不影响登录状态 */
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/api/auth/me', { timeout: 20_000 });
      await syncAiInfo();
      setUser(data.user);
      setDefaultPassword(Boolean(data.defaultPassword));
      return data;
    } catch (error) {
      if (error.status === 401) setUser(null);
      return null;
    }
  }, [syncAiInfo]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get('/api/auth/me', { timeout: 20_000 }),
      api.get('/api/ai/info', { timeout: 20_000 }).catch(() => null),
    ])
      .then(([data, info]) => {
        if (!alive) return;
        setServerAiReady(Boolean(info?.serverKeyConfigured));
        setUser(data.user);
        setDefaultPassword(Boolean(data.defaultPassword));
      })
      .catch(() => { if (alive) setUser(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const handler = () => setUser(null);
    window.addEventListener('shisui:unauthorized', handler);
    return () => window.removeEventListener('shisui:unauthorized', handler);
  }, []);

  const login = useCallback(async (password, remember = true) => {
    const data = await api.post('/api/auth/login', { password, remember }, { timeout: 20_000 });
    await syncAiInfo();
    setUser(data.user);
    setDefaultPassword(Boolean(data.defaultPassword));
    return data;
  }, [syncAiInfo]);

  const logout = useCallback(async () => {
    try { await api.post('/api/auth/logout', {}); } catch { /* ignore */ }
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    user, loading, login, logout, refresh, defaultPassword, setDefaultPassword,
  }), [user, loading, login, logout, refresh, defaultPassword]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
