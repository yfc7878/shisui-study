const STORAGE_KEY = 'shisui.settings.v1';

// 由 AuthContext 在登录后从 /api/ai/info 同步：允许部署者通过环境变量提供 Key。
let serverAiReady = false;
export function setServerAiReady(value) {
  serverAiReady = Boolean(value);
}

export const DEFAULT_SETTINGS = {
  ai: {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    visionModel: 'deepseek-flash',
    thinkDefault: false,
  },
  prompts: {
    mistake: '',
    sentences: '',
    vocab: '',
  },
  ui: {
    theme: localStorage.getItem('shisui.theme') || 'light',
  },
  focus: {
    focusMinutes: 25,
    breakMinutes: 5,
    longBreakMinutes: 15,
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function loadSettings() {
  const defaults = clone(DEFAULT_SETTINGS);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw);
    return {
      ...defaults,
      ...saved,
      ai: { ...defaults.ai, ...(saved.ai || {}) },
      prompts: { ...defaults.prompts, ...(saved.prompts || {}) },
      ui: { ...defaults.ui, ...(saved.ui || {}) },
      focus: { ...defaults.focus, ...(saved.focus || {}) },
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(next) {
  const merged = {
    ...loadSettings(),
    ...next,
    ai: { ...loadSettings().ai, ...(next.ai || {}) },
    prompts: { ...loadSettings().prompts, ...(next.prompts || {}) },
    ui: { ...loadSettings().ui, ...(next.ui || {}) },
    focus: { ...loadSettings().focus, ...(next.focus || {}) },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent('shisui:settings', { detail: merged }));
  return merged;
}

export function getAiConfig() {
  const settings = loadSettings();
  return {
    apiKey: settings.ai.apiKey.trim(),
    baseUrl: settings.ai.baseUrl.trim() || 'https://api.deepseek.com',
    model: settings.ai.model.trim() || 'deepseek-flash',
    visionModel: settings.ai.visionModel.trim() || settings.ai.model.trim() || 'deepseek-flash',
  };
}

export function hasApiKey() {
  return Boolean(loadSettings().ai.apiKey.trim()) || serverAiReady;
}

export function getPromptExtras() {
  return loadSettings().prompts;
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  localStorage.setItem('shisui.theme', theme);
  saveSettings({ ui: { theme } });
}
