import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { BrandMark } from '../components/Brand.jsx';
import { Button, Checkbox, Field } from '../components/ui.jsx';
import { errorMessage } from '../lib/api.js';

export default function LoginPage() {
  const { user, login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (event) => {
    event.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      const data = await login(password, remember);
      toast('欢迎回来，同学', 'success');
      if (data.defaultPassword) {
        setTimeout(() => toast('你仍在使用初始密码，建议现在去设置中修改', 'info', {
          duration: 7000,
          action: { label: '去设置', onClick: () => navigate('/settings') },
        }), 400);
      }
      const from = location.state?.from?.pathname;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-art" aria-hidden="true">
        <div className="login-art-top">
          <div className="login-brand">
            <BrandMark size={46} />
            <div>
              <strong>拾穗</strong>
              <span>Study Atelier</span>
            </div>
          </div>
          <span className="login-edition">高 中 · 学 习 工 作 台</span>
        </div>

        <div className="login-quote">
          <div className="quote-glyph">“</div>
          <p className="quote-cn">不积跬步，无以至千里；<br />不积小流，无以成江海。</p>
          <p className="quote-en">Small steps, repeated with care, become the distance.</p>
        </div>

        <div className="login-features">
          <div className="login-feature">
            <span className="login-feature-index">01</span>
            <div>
              <strong>错题，不再只是抄一遍</strong>
              <p>拍照识别、题干配图裁剪、AI 解析，审阅后归入你的错题本。</p>
            </div>
          </div>
          <div className="login-feature">
            <span className="login-feature-index">02</span>
            <div>
              <strong>佳句与词汇，长成自己的体系</strong>
              <p>主题化收集佳句，单词解析以思维导图呈现，随时调整。</p>
            </div>
          </div>
          <div className="login-feature">
            <span className="login-feature-index">03</span>
            <div>
              <strong>一处记录，处处可用</strong>
              <p>数据保存在你自己的服务器，手机、平板、电脑同步，随时导出 Word。</p>
            </div>
          </div>
        </div>

        <div className="login-art-footer">
          <span>拾取每一次疏漏，也拾取每一句好英文。</span>
          <span className="login-year">© {new Date().getFullYear()}</span>
        </div>
        <div className="login-orbit orbit-one" />
        <div className="login-orbit orbit-two" />
      </section>

      <section className="login-panel">
        <div className="login-form-wrap">
          <div className="login-form-head">
            <div className="login-eyebrow"><LockKeyhole size={13} /> PRIVATE STUDY SPACE</div>
            <h1>回到你的书桌</h1>
            <p>这是一个只属于你的学习空间。输入密码，继续今天的整理。</p>
          </div>

          <form className="login-form" onSubmit={submit}>
            <Field label="访问密码" htmlFor="password" error={error}>
              <div className="login-password-field">
                <KeyRound size={17} />
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  className="input"
                  placeholder="请输入访问密码"
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); setError(''); }}
                  autoComplete="current-password"
                  autoFocus
                  disabled={loading}
                />
                <button type="button" className="login-eye" onClick={() => setShow((value) => !value)} aria-label={show ? '隐藏密码' : '显示密码'}>
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </Field>

            <div className="login-options">
              <Checkbox checked={remember} onChange={setRemember} label="在这台设备上保持登录" />
              <span className="login-secure"><ShieldCheck size={13} /> 仅本人使用</span>
            </div>

            <Button type="submit" size="lg" className="login-submit" loading={loading} disabled={!password}>
              {loading ? '正在验证…' : <>进入书桌 <ArrowRight size={17} /></>}
            </Button>
          </form>

          <div className="login-note">
            <Sparkles size={15} />
            <p>首次部署的初始密码见 <code>README</code> 或服务器启动日志；登录后请立即在「设置 → 账号」中修改。</p>
          </div>
          <p className="login-help">
            忘记密码？在服务器运行 <code>npm run reset-password</code> 重置。
          </p>
          <div className="login-footer">
            <span>拾穗 Study v1.0</span>
            <span>单用户 · 私有部署</span>
          </div>
        </div>
      </section>
    </div>
  );
}
