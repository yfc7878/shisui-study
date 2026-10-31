import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot, Check, CheckCircle2, Database, Download, Eye, EyeOff, FileDown, Info, KeyRound,
  Laptop, Moon, Palette, ShieldCheck, Sparkles, Sun, TestTube2, Trash2, UserRound,
  Wifi, WifiOff,
} from 'lucide-react';
import { api, downloadFile, errorMessage, triggerDownload } from '../lib/api.js';
import { loadSettings, saveSettings, getAiConfig, hasApiKey } from '../lib/settings.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import {
  Badge, Button, Card, Field, Input, PageHeader, Segmented, Textarea, Toggle, cx,
} from '../components/ui.jsx';

const TABS = [
  { value: 'ai', label: 'AI 与提示词' },
  { value: 'account', label: '账号' },
  { value: 'appearance', label: '外观' },
  { value: 'data', label: '数据' },
  { value: 'about', label: '关于' },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { defaultPassword, refresh: refreshAuth } = useAuth();
  const [tab, setTab] = useState('ai');
  const [settings, setSettings] = useState(() => loadSettings());
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState({ current: '', next: '', confirm: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);

  useEffect(() => { document.title = '设置 · 拾穗 Study'; }, []);

  const update = (section, patch) => setSettings((current) => ({
    ...current,
    [section]: { ...current[section], ...patch },
  }));

  const save = async () => {
    setSaving(true);
    try {
      const next = saveSettings({
        ...settings,
        ai: { ...settings.ai, apiKey: settings.ai.apiKey.trim(), baseUrl: settings.ai.baseUrl.trim() },
      });
      setSettings(next);
      toast('设置已保存到当前浏览器', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.post('/api/ai/test', {
        ai: {
          apiKey: settings.ai.apiKey,
          baseUrl: settings.ai.baseUrl,
          model: settings.ai.model,
        },
      }, { timeout: 35_000 });
      setTestResult({ ok: true, models: result.models || [] });
      toast('连接成功，API 可以使用', 'success');
    } catch (err) {
      setTestResult({ ok: false, message: errorMessage(err) });
      toast(errorMessage(err), 'error');
    } finally {
      setTesting(false);
    }
  };

  const changePassword = async () => {
    if (password.next.length < 6) { toast('新密码至少需要 6 个字符', 'error'); return; }
    if (password.next !== password.confirm) { toast('两次输入的新密码不一致', 'error'); return; }
    setPasswordSaving(true);
    try {
      await api.post('/api/auth/password', { currentPassword: password.current, newPassword: password.next });
      setPassword({ current: '', next: '', confirm: '' });
      await refreshAuth();
      toast('密码已更新，下次请使用新密码登录', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setPasswordSaving(false);
    }
  };

  const downloadBackup = async () => {
    setBackupLoading(true);
    try {
      const response = await fetch('/api/backup', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('备份下载失败');
      const blob = await response.blob();
      triggerDownload(blob, `shisui-backup-${new Date().toISOString().slice(0, 10)}.json`);
      toast('文字数据备份已开始下载', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBackupLoading(false);
    }
  };

  return (
    <div className="settings-page">
      <PageHeader
        eyebrow="PREFERENCES"
        title="设置"
        description="API、提示词、账号与数据，都只有你能看到。"
        actions={<Badge tone="neutral">单用户 · 私有部署</Badge>}
      />

      <div className="settings-layout">
        <aside className="settings-nav">
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={cx('settings-nav-item', tab === item.value && 'is-active')}
              onClick={() => setTab(item.value)}
            >
              {item.value === 'ai' ? <Bot size={17} /> : item.value === 'account' ? <UserRound size={17} /> : item.value === 'appearance' ? <Palette size={17} /> : item.value === 'data' ? <Database size={17} /> : <Info size={17} />}
              {item.label}
            </button>
          ))}
        </aside>

        <div className="settings-main">
          {tab === 'ai' && (
            <>
              <Card className="settings-card">
                <div className="settings-card-head">
                  <div>
                    <h2>DeepSeek API</h2>
                    <p>所有 AI 功能都通过这里配置的 Key 调用。Key 只保存在当前浏览器，请求时经服务器转发，不写入服务器数据库。</p>
                  </div>
                  <Badge tone={hasApiKey() ? 'green' : 'amber'} dot>{hasApiKey() ? '已配置' : '未配置'}</Badge>
                </div>

                <div className="settings-form">
                  <Field label="API Key" hint="在 platform.deepseek.com 创建；建议不要共用或公开。">
                    <div className="secret-input">
                      <Input
                        type={showKey ? 'text' : 'password'}
                        value={settings.ai.apiKey}
                        onChange={(event) => update('ai', { apiKey: event.target.value })}
                        placeholder="sk-..."
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button type="button" className="secret-toggle" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}>
                        {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </Field>

                  <div className="form-grid form-grid-2">
                    <Field label="Base URL" hint="使用官方地址或兼容 OpenAI 格式的代理地址。">
                      <Input
                        value={settings.ai.baseUrl}
                        onChange={(event) => update('ai', { baseUrl: event.target.value })}
                        placeholder="https://api.deepseek.com"
                        spellCheck={false}
                      />
                    </Field>
                    <Field label="文本模型" hint="思维链与文本任务会使用它。">
                      <Input
                        list="model-suggestions"
                        value={settings.ai.model}
                        onChange={(event) => update('ai', { model: event.target.value })}
                        placeholder="deepseek-flash"
                        spellCheck={false}
                      />
                      <datalist id="model-suggestions">
                        <option value="deepseek-flash" />
                        <option value="deepseek-v4-pro" />
                      </datalist>
                    </Field>
                  </div>

                  <Field label="视觉模型" hint="题目图片识别需要使用支持图像理解的模型，默认 deepseek-flash。">
                    <Input
                      value={settings.ai.visionModel}
                      onChange={(event) => update('ai', { visionModel: event.target.value })}
                      placeholder="deepseek-flash"
                      spellCheck={false}
                    />
                  </Field>

                  <div className="settings-toggle-box">
                    <Toggle
                      checked={Boolean(settings.ai.thinkDefault)}
                      onChange={(value) => update('ai', { thinkDefault: value })}
                      label="默认开启深度思考"
                      description="新建错题、生成佳句时默认打开思考模式；每次任务仍可单独切换。会消耗更多 token，也更慢。"
                    />
                  </div>

                  <div className="settings-actions">
                    <Button variant="secondary" icon={TestTube2} onClick={testConnection} loading={testing}>测试连接</Button>
                    <Button variant="primary" icon={Check} onClick={save} loading={saving}>保存设置</Button>
                    <a className="settings-link" href="https://platform.deepseek.com/" target="_blank" rel="noreferrer">
                      <KeyRound size={13} /> 获取 API Key
                    </a>
                  </div>

                  {testResult && (
                    <div className={cx('connection-result', testResult.ok ? 'is-ok' : 'is-error')}>
                      {testResult.ok ? <Wifi size={17} /> : <WifiOff size={17} />}
                      <div>
                        <strong>{testResult.ok ? '连接成功' : '连接失败'}</strong>
                        <p>{testResult.ok ? `可用模型 ${testResult.models.length} 个${testResult.models.length ? `：${testResult.models.slice(0, 5).join('、')}` : ''}` : testResult.message}</p>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              <Card className="settings-card">
                <div className="settings-card-head">
                  <div>
                    <h2>自定义提示词</h2>
                    <p>在每个 AI 任务的系统提示词后追加你的偏好。留空则使用内置的专业提示词。</p>
                  </div>
                  <Badge tone="neutral"><Sparkles size={12} /> 进阶</Badge>
                </div>
                <div className="settings-form">
                  <Field label="错题提取 · 额外要求" hint="例如：解析尽量简短；答案保留根号形式；按新高考题型标注。">
                    <Textarea
                      rows={3}
                      value={settings.prompts.mistake}
                      onChange={(event) => update('prompts', { mistake: event.target.value })}
                      placeholder="写给 AI 的额外要求…"
                    />
                  </Field>
                  <Field label="English 佳句 · 额外要求" hint="例如：优先高考真题表达；例句放在校园生活语境。">
                    <Textarea
                      rows={3}
                      value={settings.prompts.sentences}
                      onChange={(event) => update('prompts', { sentences: event.target.value })}
                      placeholder="写给 AI 的额外要求…"
                    />
                  </Field>
                  <Field label="词汇解析 · 额外要求" hint="例如：多写易混词辨析；音标使用英式发音。">
                    <Textarea
                      rows={3}
                      value={settings.prompts.vocab}
                      onChange={(event) => update('prompts', { vocab: event.target.value })}
                      placeholder="写给 AI 的额外要求…"
                    />
                  </Field>
                  <div className="settings-actions">
                    <Button variant="primary" icon={Check} onClick={save} loading={saving}>保存提示词</Button>
                  </div>
                </div>
              </Card>
            </>
          )}

          {tab === 'account' && (
            <>
              {defaultPassword && (
                <div className="settings-warning">
                  <ShieldCheck size={20} />
                  <div>
                    <strong>你仍在使用初始密码</strong>
                    <p>如果这台服务器已经对公网开放，请立即修改密码。初始密码写在部署文档与启动日志中。</p>
                  </div>
                </div>
              )}
              <Card className="settings-card">
                <div className="settings-card-head">
                  <div>
                    <h2>修改访问密码</h2>
                    <p>单用户账号。修改后，其他设备上的登录会话仍然有效，但下次登录需使用新密码。</p>
                  </div>
                  <div className="avatar"><UserRound size={18} /></div>
                </div>
                <div className="settings-form settings-form-narrow">
                  <Field label="当前密码">
                    <Input type="password" value={password.current} onChange={(event) => setPassword({ ...password, current: event.target.value })} autoComplete="current-password" />
                  </Field>
                  <div className="form-grid form-grid-2">
                    <Field label="新密码" hint="至少 6 个字符">
                      <Input type="password" value={password.next} onChange={(event) => setPassword({ ...password, next: event.target.value })} autoComplete="new-password" />
                    </Field>
                    <Field label="确认新密码">
                      <Input type="password" value={password.confirm} onChange={(event) => setPassword({ ...password, confirm: event.target.value })} autoComplete="new-password" />
                    </Field>
                  </div>
                  <div className="settings-actions">
                    <Button variant="primary" icon={ShieldCheck} onClick={changePassword} loading={passwordSaving} disabled={!password.current || !password.next}>更新密码</Button>
                  </div>
                </div>
              </Card>
            </>
          )}

          {tab === 'appearance' && (
            <Card className="settings-card">
              <div className="settings-card-head">
                <div>
                  <h2>外观</h2>
                  <p>主题会保存在这台设备上。纸张与墨色都经过对比度检查。</p>
                </div>
              </div>
              <div className="theme-picker">
                <button type="button" className={cx('theme-option', theme === 'light' && 'is-active')} onClick={() => setTheme('light')}>
                  <div className="theme-swatch theme-light">
                    <span className="swatch-sidebar" />
                    <span className="swatch-card" />
                    <span className="swatch-card small" />
                  </div>
                  <span className="theme-option-label"><Sun size={15} /> 暖纸浅色 {theme === 'light' && <Check size={14} />}</span>
                </button>
                <button type="button" className={cx('theme-option', theme === 'dark' && 'is-active')} onClick={() => setTheme('dark')}>
                  <div className="theme-swatch theme-dark">
                    <span className="swatch-sidebar" />
                    <span className="swatch-card" />
                    <span className="swatch-card small" />
                  </div>
                  <span className="theme-option-label"><Moon size={15} /> 松墨深色 {theme === 'dark' && <Check size={14} />}</span>
                </button>
              </div>
              <p className="settings-footnote"><Laptop size={14} /> 移动端与桌面端使用同一套组件与间距比例。</p>
            </Card>
          )}

          {tab === 'data' && (
            <>
              <Card className="settings-card">
                <div className="settings-card-head">
                  <div>
                    <h2>数据备份</h2>
                    <p>文字数据保存在服务器的 SQLite 数据库；题目原图与配图保存在 data/uploads 目录。</p>
                  </div>
                  <Database size={22} className="settings-head-icon" />
                </div>
                <div className="data-actions">
                  <Button variant="primary" icon={Download} onClick={downloadBackup} loading={backupLoading}>下载 JSON 备份</Button>
                  <Link className="btn btn-secondary" to="/export/mistakes"><FileDown size={16} /> 导出错题 Word</Link>
                  <Link className="btn btn-secondary" to="/export/english"><FileDown size={16} /> 导出英语 Word</Link>
                </div>
                <div className="data-note">
                  <Info size={16} />
                  <p>JSON 备份包含全部文字内容与图片索引，不含图片文件本身。完整备份请复制整个 <code>data</code> 目录（Docker 部署时即数据卷）。</p>
                </div>
              </Card>

              <Card className="settings-card">
                <h2 className="settings-card-title">跨设备同步</h2>
                <p className="settings-paragraph">所有设备访问同一个服务器地址，登录同一个密码，数据就会实时一致。无需额外的云盘或同步账号。</p>
                <div className="data-flow">
                  <span className="data-device">手机</span>
                  <span className="data-arrow">↔</span>
                  <span className="data-server">你的服务器 · SQLite</span>
                  <span className="data-arrow">↔</span>
                  <span className="data-device">电脑</span>
                </div>
              </Card>
            </>
          )}

          {tab === 'about' && (
            <Card className="settings-card about-card">
              <div className="about-brand">
                <div className="about-mark">拾</div>
                <div>
                  <h2>拾穗 Study</h2>
                  <p>高中学习工作台 · v1.0.0</p>
                </div>
              </div>
              <p className="about-intro">错题、佳句、词汇、待审阅、Word 导出与专注工具，组合成一张属于自己的书桌。数据只属于你。</p>
              <div className="about-grid">
                <div><span>前端</span><strong>React + Vite</strong></div>
                <div><span>后端</span><strong>Node.js + Express</strong></div>
                <div><span>数据</span><strong>SQLite（单文件）</strong></div>
                <div><span>AI</span><strong>DeepSeek API</strong></div>
                <div><span>图片识别</span><strong>deepseek-flash 视觉</strong></div>
                <div><span>部署</span><strong>Docker / Node</strong></div>
              </div>
              <div className="about-note">
                <ShieldCheck size={16} />
                <p>这是一个单用户、自托管的项目。没有第三方统计脚本，没有广告，也不会把你的错题上传到除 DeepSeek API 之外的服务。</p>
              </div>
              <div className="about-links">
                <a href="https://api-docs.deepseek.com/zh-cn/" target="_blank" rel="noreferrer">DeepSeek 文档</a>
                <a href="https://platform.deepseek.com/" target="_blank" rel="noreferrer">API 控制台</a>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
