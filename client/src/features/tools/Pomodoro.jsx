import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell, BellOff, Coffee, Pause, Play, RefreshCw, RotateCcw, Settings2, Sparkles,
  Timer, Volume2,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api.js';
import { loadSettings, saveSettings } from '../../lib/settings.js';
import { formatMinutes, formatSeconds } from '../../lib/format.js';
import { useQuery } from '../../hooks/useQuery.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import {
  Badge, Button, Card, IconButton, Segmented, Toggle, cx,
} from '../../components/ui.jsx';
import './tools.css';

const BASE_TITLE = '工具箱 · 拾穗 Study';

const MODE_META = [
  { value: 'focus', label: '专注', settingKey: 'focusMinutes', name: '专注' },
  { value: 'short', label: '短休息', settingKey: 'breakMinutes', name: '短休息' },
  { value: 'long', label: '长休息', settingKey: 'longBreakMinutes', name: '长休息' },
];

const MODE_BY_VALUE = Object.fromEntries(MODE_META.map((item) => [item.value, item]));

const DURATION_RANGE = {
  focusMinutes: [1, 180],
  breakMinutes: [1, 60],
  longBreakMinutes: [1, 120],
};

const DURATION_LABEL = {
  focusMinutes: '专注',
  breakMinutes: '短休息',
  longBreakMinutes: '长休息',
};

const PROMPTS = {
  focus: {
    idle: '把注意力收回来，先做这一件。',
    running: '此刻只做这一件事，其他稍后再说。',
    paused: '停一下也没关系，呼吸，再继续。',
    done: '这一小段，稳稳收下。',
  },
  short: {
    idle: '给眼睛和肩膀，五分钟的空白。',
    running: '起身走两步，看看远处。',
    paused: '休息也可以慢慢来。',
    done: '短休息结束，可以回来了。',
  },
  long: {
    idle: '一段更长的留白，值得好好用。',
    running: '喝口水，活动一下，不必想题目。',
    paused: '休息暂停了，准备好再继续。',
    done: '长休息结束，重新坐回桌前。',
  },
};

function clampMinutes(value, key) {
  const [min, max] = DURATION_RANGE[key];
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function readPreferences() {
  const focus = loadSettings().focus || {};
  const durations = {
    focusMinutes: clampMinutes(focus.focusMinutes, 'focusMinutes') ?? 25,
    breakMinutes: clampMinutes(focus.breakMinutes, 'breakMinutes') ?? 5,
    longBreakMinutes: clampMinutes(focus.longBreakMinutes, 'longBreakMinutes') ?? 15,
  };
  return {
    durations,
    autoStart: Boolean(focus.autoStart),
    soundOn: focus.soundOn !== false,
  };
}

function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (seconds < 3600) return formatSeconds(seconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function formatStatMinutes(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  if (value < 60) return `${value} 分钟`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours}小时${rest}分` : `${hours}小时`;
}

function chartLabel(date) {
  if (typeof date !== 'string' || date.length < 10) return '';
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

function readNotificationPermission() {
  try {
    return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  } catch {
    return 'unsupported';
  }
}

export default function Pomodoro({ active = true }) {
  const { toast } = useToast();
  const { data: summary, loading: summaryLoading, error: summaryError, refresh } = useQuery(
    () => api.get('/api/focus/summary'),
    [],
  );

  const [prefs, setPrefs] = useState(readPreferences);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const { durations } = prefs;

  const [mode, setMode] = useState('focus');
  const [status, setStatus] = useState('idle');
  const [nextMode, setNextMode] = useState('short');
  const [totalSec, setTotalSec] = useState(() => prefs.durations.focusMinutes * 60);
  const [remainingSec, setRemainingSec] = useState(() => prefs.durations.focusMinutes * 60);
  const [endAt, setEndAt] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [durationDraft, setDurationDraft] = useState(() => ({
    focusMinutes: String(prefs.durations.focusMinutes),
    breakMinutes: String(prefs.durations.breakMinutes),
    longBreakMinutes: String(prefs.durations.longBreakMinutes),
  }));
  const [notifyPermission, setNotifyPermission] = useState(readNotificationPermission);

  const remainingMsRef = useRef(prefs.durations.focusMinutes * 60 * 1000);
  const startedAtRef = useRef(null);
  const roundRef = useRef(0);
  const audioRef = useRef(null);
  const autoStartTimerRef = useRef(null);
  const finishRef = useRef(null);
  const beginRef = useRef(null);
  const primaryRef = useRef(null);

  const secondsForMode = useCallback((value) => {
    const meta = MODE_BY_VALUE[value] || MODE_BY_VALUE.focus;
    return (prefsRef.current.durations[meta.settingKey] ?? 25) * 60;
  }, []);

  const commitPrefs = useCallback((patch) => {
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    setPrefs(next);
    saveSettings({
      focus: {
        ...next.durations,
        autoStart: next.autoStart,
        soundOn: next.soundOn,
      },
    });
  }, []);

  /* ---------------- 声音 ---------------- */

  const ensureAudio = useCallback(() => {
    if (typeof window === 'undefined') return null;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    try {
      if (!audioRef.current) audioRef.current = new AudioCtor();
      if (audioRef.current.state === 'suspended') {
        audioRef.current.resume().catch(() => {});
      }
      return audioRef.current;
    } catch {
      return null;
    }
  }, []);

  const playChime = useCallback(() => {
    const context = ensureAudio();
    if (!context) return;
    try {
      const start = context.currentTime + 0.03;
      const notes = [
        { frequency: 587.33, offset: 0, duration: 0.9 },
        { frequency: 880, offset: 0.26, duration: 1.1 },
      ];
      for (const note of notes) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(note.frequency, start + note.offset);
        gain.gain.setValueAtTime(0, start + note.offset);
        gain.gain.linearRampToValueAtTime(0.07, start + note.offset + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + note.offset + note.duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start + note.offset);
        oscillator.stop(start + note.offset + note.duration + 0.05);
      }
    } catch {
      /* 提示音失败不影响计时 */
    }
  }, [ensureAudio]);

  /* ---------------- 通知 ---------------- */

  const notify = useCallback((completedMode) => {
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const isFocus = completedMode === 'focus';
      new Notification(isFocus ? '专注完成' : '休息结束', {
        body: isFocus ? '这一轮收下了，起来走一走。' : '慢慢回到桌前，开始下一段。',
        tag: 'shisui-focus',
        silent: true,
      });
    } catch {
      /* 静默失败 */
    }
  }, []);

  const requestNotifications = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      toast('当前浏览器不支持桌面通知', 'info');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotifyPermission(permission);
      if (permission === 'granted') toast('已开启专注结束通知', 'success');
      else if (permission === 'denied') toast('通知权限被拒绝，可在浏览器设置中重新开启', 'info');
    } catch {
      /* 静默失败 */
    }
  }, [toast]);

  useEffect(() => {
    const update = () => setNotifyPermission(readNotificationPermission());
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  /* ---------------- 保存专注记录 ---------------- */

  const saveSession = useCallback(async ({ completedMode, durationSec, startedAt, endedAt }) => {
    const isFocus = completedMode === 'focus';
    try {
      await api.post('/api/focus/sessions', {
        durationSec,
        mode: isFocus ? 'focus' : 'break',
        label: isFocus ? '专注' : completedMode === 'long' ? '长休息' : '短休息',
        completed: true,
        startedAt,
        endedAt,
      });
      if (isFocus) refresh();
    } catch (error) {
      toast(`专注记录未保存：${errorMessage(error)}`, 'error');
    }
  }, [refresh, toast]);

  /* ---------------- 计时状态机 ---------------- */

  const beginSession = useCallback((nextModeValue, durationMs) => {
    window.clearTimeout(autoStartTimerRef.current);
    const safeMs = Math.max(1000, durationMs);
    startedAtRef.current = new Date().toISOString();
    remainingMsRef.current = safeMs;
    ensureAudio();
    setMode(nextModeValue);
    setStatus('running');
    setTotalSec(Math.round(safeMs / 1000));
    setRemainingSec(Math.ceil(safeMs / 1000));
    setEndAt(Date.now() + safeMs);
    setShowSettings(false);
  }, [ensureAudio]);

  const handleFinish = useCallback((completedMode) => {
    const durationSec = secondsForMode(completedMode);
    const endedAt = new Date().toISOString();
    const startedAt = startedAtRef.current || new Date(Date.now() - durationSec * 1000).toISOString();
    startedAtRef.current = null;
    remainingMsRef.current = 0;
    setRemainingSec(0);
    setEndAt(null);
    setStatus('done');

    if (prefsRef.current.soundOn) playChime();
    notify(completedMode);

    let upcoming = 'focus';
    if (completedMode === 'focus') {
      roundRef.current += 1;
      upcoming = roundRef.current % 4 === 0 ? 'long' : 'short';
      toast(
        `专注完成 · ${formatMinutes(durationSec / 60)}。${upcoming === 'long' ? '这一组结束，好好休息一会儿。' : '起来走一走。'}`,
        'success',
      );
    } else {
      toast('休息结束，慢慢回到桌前。', 'info');
    }
    setNextMode(upcoming);

    saveSession({ completedMode, durationSec, startedAt, endedAt });

    if (prefsRef.current.autoStart) {
      autoStartTimerRef.current = window.setTimeout(() => {
        beginRef.current?.(upcoming, secondsForMode(upcoming) * 1000);
      }, 1600);
    }
  }, [notify, playChime, saveSession, secondsForMode, toast]);

  finishRef.current = handleFinish;
  beginRef.current = beginSession;

  const pause = useCallback(() => {
    if (status !== 'running' || !endAt) return;
    const left = endAt - Date.now();
    if (left <= 0) {
      finishRef.current?.(mode);
      return;
    }
    remainingMsRef.current = left;
    setRemainingSec(Math.ceil(left / 1000));
    setEndAt(null);
    setStatus('paused');
  }, [endAt, mode, status]);

  const resume = useCallback(() => {
    const left = remainingMsRef.current;
    if (left <= 0) return;
    setEndAt(Date.now() + left);
    setStatus('running');
    ensureAudio();
  }, [ensureAudio]);

  const resetTimer = useCallback(() => {
    window.clearTimeout(autoStartTimerRef.current);
    startedAtRef.current = null;
    const total = secondsForMode(mode);
    remainingMsRef.current = total * 1000;
    setRemainingSec(total);
    setTotalSec(total);
    setEndAt(null);
    setStatus('idle');
  }, [mode, secondsForMode]);

  const primaryAction = useCallback(() => {
    if (status === 'running') {
      pause();
      return;
    }
    if (status === 'paused') {
      resume();
      return;
    }
    const target = status === 'done' ? nextMode : mode;
    beginSession(target, secondsForMode(target) * 1000);
  }, [beginSession, mode, nextMode, pause, resume, secondsForMode, status]);

  primaryRef.current = primaryAction;

  const changeMode = useCallback((nextValue) => {
    if (nextValue === mode && status !== 'done') return;
    window.clearTimeout(autoStartTimerRef.current);
    if (status === 'running' || status === 'paused') {
      toast('已切换时长，本轮计时未记录', 'info');
    }
    startedAtRef.current = null;
    const total = secondsForMode(nextValue);
    remainingMsRef.current = total * 1000;
    setMode(nextValue);
    setStatus('idle');
    setEndAt(null);
    setRemainingSec(total);
    setTotalSec(total);
  }, [mode, secondsForMode, status, toast]);

  /* ---------------- 每秒 tick（基于目标时间戳） ---------------- */

  useEffect(() => {
    if (status !== 'running' || !endAt) return undefined;
    let finished = false;

    const tick = () => {
      const left = endAt - Date.now();
      if (left <= 0) {
        if (finished) return;
        finished = true;
        remainingMsRef.current = 0;
        setRemainingSec(0);
        finishRef.current?.(mode);
        return;
      }
      remainingMsRef.current = left;
      const seconds = Math.ceil(left / 1000);
      setRemainingSec((previous) => (previous === seconds ? previous : seconds));
    };

    tick();
    const interval = window.setInterval(tick, 250);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
    };
  }, [endAt, mode, status]);

  /* 空闲时保持显示与当前时长一致 */
  useEffect(() => {
    if (status !== 'idle') return;
    const total = secondsForMode(mode);
    remainingMsRef.current = total * 1000;
    setRemainingSec(total);
    setTotalSec(total);
  }, [durations.focusMinutes, durations.breakMinutes, durations.longBreakMinutes, mode, secondsForMode, status]);

  /* 页面标题倒计时 */
  useEffect(() => {
    if (!active) return undefined;
    const time = formatClock(remainingSec);
    const label = status === 'running' ? (mode === 'focus' ? '专注中' : '休息中') : status === 'paused' ? '已暂停' : null;
    document.title = label ? `${time} ${label} · 拾穗 Study` : BASE_TITLE;
    return () => { document.title = BASE_TITLE; };
  }, [active, mode, remainingSec, status]);

  /* 空格开始 / 暂停，输入框聚焦时不触发 */
  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.code !== 'Space' && event.key !== ' ') return;
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select, button, a, [contenteditable="true"]')) {
        return;
      }
      event.preventDefault();
      primaryRef.current?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);

  useEffect(() => () => {
    window.clearTimeout(autoStartTimerRef.current);
    try { audioRef.current?.close(); } catch { /* ignore */ }
  }, []);

  /* ---------------- 设置 ---------------- */

  const commitDuration = (key, raw) => {
    const value = clampMinutes(raw, key);
    const fallback = prefsRef.current.durations[key];
    const nextValue = value ?? fallback;
    setDurationDraft((previous) => ({ ...previous, [key]: String(nextValue) }));
    if (nextValue === fallback) return;
    commitPrefs({ durations: { ...prefsRef.current.durations, [key]: nextValue } });
  };

  const statusLabel = {
    idle: '准备',
    running: mode === 'focus' ? '专注中' : '休息中',
    paused: '暂停',
    done: '完成',
  }[status];

  const safeTotal = Math.max(1, totalSec);
  const progress = status === 'done'
    ? 1
    : Math.min(1, Math.max(0, (safeTotal - remainingSec) / safeTotal));
  const ringRadius = 126;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const modeName = MODE_BY_VALUE[mode]?.name || '专注';
  const prompt = PROMPTS[mode]?.[status] || PROMPTS.focus.idle;

  const primaryLabel = status === 'running'
    ? '暂停'
    : status === 'paused'
      ? '继续'
      : status === 'done'
        ? (nextMode === 'focus' ? '开始专注' : `开始${MODE_BY_VALUE[nextMode]?.name || '休息'}`)
        : (mode === 'focus' ? '开始专注' : '开始休息');

  const modeOptions = MODE_META.map((item) => ({
    value: item.value,
    label: item.label,
    count: `${durations[item.settingKey]}′`,
  }));

  const daily = Array.isArray(summary?.daily) ? summary.daily : [];
  const todayMinutes = daily.length ? daily[daily.length - 1].minutes : 0;
  const todaySessions = daily.length ? daily[daily.length - 1].sessions : 0;
  const weekMinutes = daily.slice(-7).reduce((sum, day) => sum + (Number(day.minutes) || 0), 0);
  const maxDaily = Math.max(1, ...daily.map((day) => Number(day.minutes) || 0));
  const totalMinutes = Number(summary?.totalMinutes) || 0;
  const totalSessions = Number(summary?.totalSessions) || 0;
  const resetDisabled = status === 'idle' && remainingSec === totalSec;
  const autoStartPending = status === 'done' && prefs.autoStart;

  return (
    <div className="tool-focus-grid">
      <Card className="tool-timer-card">
        <div className="tool-timer-top">
          <Segmented
            options={modeOptions}
            value={mode}
            onChange={changeMode}
            ariaLabel="番茄钟模式"
            className="tool-mode-segmented"
          />
          <IconButton
            icon={Settings2}
            label={showSettings ? '收起设置' : '打开设置'}
            onClick={() => setShowSettings((value) => !value)}
            className={cx('tool-settings-toggle', showSettings && 'is-active')}
          />
        </div>

        <div className={cx('tool-ring', mode !== 'focus' && 'is-break', status === 'done' && 'is-done')}>
          <svg viewBox="0 0 300 300" aria-hidden="true">
            <circle className="tool-ring-track" cx="150" cy="150" r={ringRadius} strokeWidth="11" fill="none" />
            <circle
              className="tool-ring-value"
              cx="150"
              cy="150"
              r={ringRadius}
              strokeWidth="11"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringCircumference * (1 - progress)}
            />
            <circle className="tool-ring-halo" cx="150" cy="150" r="104" fill="none" />
          </svg>
          <div className="tool-ring-inner">
            <span className={cx('tool-ring-status', status === 'running' && 'is-live')}>
              <span className="tool-status-dot" />
              {statusLabel}
            </span>
            <strong className="tool-ring-time" aria-live="off">{formatClock(remainingSec)}</strong>
            <p className="tool-ring-prompt">{prompt}</p>
            <span className="tool-ring-mode">{modeName}</span>
          </div>
        </div>

        <div className="tool-timer-actions">
          <Button
            variant="primary"
            size="lg"
            icon={status === 'running' ? Pause : Play}
            onClick={primaryAction}
            aria-label={primaryLabel}
            className="tool-timer-primary"
          >
            {primaryLabel}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            icon={RotateCcw}
            onClick={resetTimer}
            disabled={resetDisabled}
            aria-label="重置计时"
          >
            重置
          </Button>
        </div>

        <p className="tool-timer-hint">
          {status === 'running'
            ? <>按 <kbd className="tool-kbd">空格</kbd> 暂停 · 切换标签页也会准确计时</>
            : status === 'done'
              ? (autoStartPending ? '下一段将在几秒后自动开始…' : '准备好时，开始下一段。')
              : <>按 <kbd className="tool-kbd">空格</kbd> 开始 · 一次只做一件事</>}
        </p>

        {status === 'done' && (
          <div className="tool-done-note" role="status">
            <Sparkles size={16} />
            <div>
              <strong>{mode === 'focus' ? '专注完成' : '休息完成'}</strong>
              <span>
                接下来：{MODE_BY_VALUE[nextMode]?.name}
                {' '}· {durations[MODE_BY_VALUE[nextMode]?.settingKey]} 分钟
                {autoStartPending ? '（即将自动开始）' : ''}
              </span>
            </div>
          </div>
        )}

        {showSettings && (
          <div className="tool-settings">
            <div className="tool-settings-head">
              <strong>计时设置</strong>
              <span className="tiny muted">保存到本机</span>
            </div>
            <div className="tool-duration-grid">
              {MODE_META.map((item) => {
                const [min, max] = DURATION_RANGE[item.settingKey];
                return (
                  <label className="field" key={item.settingKey}>
                    <span className="field-label">{DURATION_LABEL[item.settingKey]}</span>
                    <span className="tool-duration-input-wrap">
                      <input
                        className="input input-sm tool-duration-input"
                        type="number"
                        min={min}
                        max={max}
                        inputMode="numeric"
                        value={durationDraft[item.settingKey]}
                        onChange={(event) => setDurationDraft((previous) => ({
                          ...previous,
                          [item.settingKey]: event.target.value,
                        }))}
                        onBlur={(event) => commitDuration(item.settingKey, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                          if (event.key === 'Escape') {
                            setDurationDraft((previous) => ({
                              ...previous,
                              [item.settingKey]: String(prefsRef.current.durations[item.settingKey]),
                            }));
                            event.currentTarget.blur();
                          }
                        }}
                        aria-label={`${DURATION_LABEL[item.settingKey]}时长，单位分钟`}
                      />
                      <span className="tool-duration-unit">分</span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="tool-settings-toggles">
              <Toggle
                checked={prefs.autoStart}
                onChange={(value) => commitPrefs({ autoStart: value })}
                label="自动开始下一段"
                description="专注结束自动进入休息，休息结束自动回到专注"
              />
              <Toggle
                checked={prefs.soundOn}
                onChange={(value) => commitPrefs({ soundOn: value })}
                label="完成提示音"
                description="轻柔的双音提示，无需音频文件"
              />
            </div>

            <div className="tool-settings-row">
              <div className="tool-settings-copy">
                <span className="field-label">桌面通知</span>
                <span className="field-hint">切到别的标签页时，也能收到结束提醒。</span>
              </div>
              {notifyPermission === 'granted' ? (
                <Badge tone="green" dot>已开启</Badge>
              ) : notifyPermission === 'unsupported' ? (
                <Badge tone="neutral">浏览器不支持</Badge>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={notifyPermission === 'denied' ? BellOff : Bell}
                  onClick={requestNotifications}
                >
                  {notifyPermission === 'denied' ? '重新申请' : '开启通知'}
                </Button>
              )}
            </div>

            <div className="tool-settings-row">
              <div className="tool-settings-copy">
                <span className="field-label">试听提示音</span>
                <span className="field-hint">点击后播放一声很轻的双音。</span>
              </div>
              <Button variant="ghost" size="sm" icon={Volume2} onClick={playChime} disabled={!prefs.soundOn}>
                试听
              </Button>
            </div>

            <p className="tool-settings-foot">
              时长修改会自动保存；正在进行的计时会在重置后使用新时长。
            </p>
          </div>
        )}
      </Card>

      <aside className="tool-focus-side">
        <Card className="tool-focus-stats-card">
          <div className="tool-card-head">
            <div>
              <h2 className="tool-card-title">专注统计</h2>
              <p className="tool-card-sub">每一次坐下来，都算数。</p>
            </div>
            <IconButton
              icon={RefreshCw}
              size="sm"
              label="刷新专注统计"
              onClick={refresh}
              disabled={summaryLoading}
              className={summaryLoading ? 'is-spinning' : undefined}
            />
          </div>

          {summaryError ? (
            <div className="tool-inline-note" role="alert">
              <span>统计暂时不可用，计时不受影响。</span>
              <button type="button" className="btn btn-link" onClick={refresh}>重试</button>
            </div>
          ) : (
            <>
              <div className="tool-focus-stats">
                <div className="tool-focus-stat">
                  <span>今日</span>
                  <strong>{formatStatMinutes(todayMinutes)}</strong>
                  <em>{todaySessions} 段专注</em>
                </div>
                <div className="tool-focus-stat">
                  <span>本周</span>
                  <strong>{formatStatMinutes(weekMinutes)}</strong>
                  <em>近 7 天累计</em>
                </div>
                <div className="tool-focus-stat">
                  <span>累计</span>
                  <strong>{formatStatMinutes(totalMinutes)}</strong>
                  <em>{totalSessions} 段完成</em>
                </div>
              </div>

              <div className="tool-chart-head">
                <span className="tool-chart-title">近 14 天</span>
                <span className="tool-chart-note">分钟 / 天</span>
              </div>
              <div className="tool-focus-chart" aria-label="近 14 天专注时长柱状图">
                {daily.map((day, index) => {
                  const minutes = Number(day.minutes) || 0;
                  const isToday = index === daily.length - 1;
                  return (
                    <div
                      className={cx('tool-chart-col', isToday && 'is-today', minutes === 0 && 'is-empty')}
                      key={day.date}
                      title={`${day.date} · ${minutes} 分钟 · ${day.sessions} 段`}
                    >
                      <span
                        className="tool-chart-bar"
                        style={{ height: `${Math.max(minutes ? 8 : 3, (minutes / maxDaily) * 100)}%` }}
                      >
                        {minutes > 0 && <i>{minutes}</i>}
                      </span>
                      <span className="tool-chart-label">
                        {(index % 2 === 0 || isToday) ? chartLabel(day.date) : ''}
                      </span>
                    </div>
                  );
                })}
                {!daily.length && (
                  <div className="tool-chart-empty">
                    {summaryLoading ? '正在读取…' : '开始第一段专注吧'}
                  </div>
                )}
              </div>
              <p className="tool-chart-foot">
                今天 {todayMinutes} 分钟 · 本周 {weekMinutes} 分钟
              </p>
            </>
          )}
        </Card>

        <Card className="tool-focus-guide">
          <div className="tool-guide-icon"><Coffee size={18} /></div>
          <div>
            <strong>一小段就好</strong>
            <p>
              25 分钟专注、5 分钟休息。完成四段后，给自己一段长休息。
              不用追赶，把节奏放稳。
            </p>
          </div>
          <Timer size={16} className="tool-guide-mark" aria-hidden="true" />
        </Card>
      </aside>
    </div>
  );
}
