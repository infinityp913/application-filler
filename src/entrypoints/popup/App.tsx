import React, { useEffect, useRef, useState } from 'react';
import type { FillMode, StoredSettings } from '../../types';

type Tab = 'fill' | 'profile' | 'settings';

// ── Styles ─────────────────────────────────────────────────────────────────

const s = {
  root: { width: 340, minHeight: 200, display: 'flex', flexDirection: 'column' as const },
  tabs: { display: 'flex', borderBottom: '1px solid #e5e7eb' },
  tab: (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 0', background: 'none', border: 'none',
    borderBottom: active ? '2px solid #6366f1' : '2px solid transparent',
    color: active ? '#6366f1' : '#6b7280', fontWeight: active ? 600 : 400,
    cursor: 'pointer', fontSize: 13,
  }),
  body: { padding: 16, display: 'flex', flexDirection: 'column' as const, gap: 12 },
  label: { fontSize: 12, color: '#6b7280', marginBottom: 4, display: 'block', fontWeight: 500 },
  modeRow: { display: 'flex', gap: 8 },
  modeBtn: (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid',
    borderColor: active ? '#6366f1' : '#d1d5db',
    background: active ? '#eef2ff' : '#fff',
    color: active ? '#4338ca' : '#374151',
    fontWeight: active ? 600 : 400, cursor: 'pointer', fontSize: 13,
  }),
  fillBtn: (disabled: boolean): React.CSSProperties => ({
    padding: '10px 0', borderRadius: 8, border: 'none',
    background: disabled ? '#e5e7eb' : '#6366f1',
    color: disabled ? '#9ca3af' : '#fff',
    fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 14,
  }),
  status: { fontSize: 12, color: '#6b7280', textAlign: 'center' as const, minHeight: 18 },
  textarea: (h: number): React.CSSProperties => ({
    width: '100%', minHeight: h, padding: 10, borderRadius: 6,
    border: '1px solid #d1d5db', fontSize: 13, resize: 'vertical' as const,
    fontFamily: 'inherit', lineHeight: 1.5,
  }),
  input: {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    border: '1px solid #d1d5db', fontSize: 13,
  },
  saved: { fontSize: 11, color: '#22c55e' },
  error: { fontSize: 12, color: '#ef4444' },
  sectionLabel: {
    fontSize: 11, fontWeight: 600, color: '#9ca3af',
    textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4,
  },
};

// ── Fill tab ───────────────────────────────────────────────────────────────

function FillTab() {
  const [mode, setMode] = useState<FillMode>('job');
  const [filling, setFilling] = useState(false);
  const [status, setStatus] = useState('');
  const [hasApiKey, setHasApiKey] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  function startPolling() {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const state = await browser.runtime.sendMessage({ type: 'GET_FILL_STATUS' }) as
        { filling: boolean; current: number; total: number; filled: number; skipped: number };
      if (state.total > 0) {
        setStatus(`Filling field ${state.current} of ${state.total}…`);
      }
      if (!state.filling) {
        clearInterval(pollRef.current);
        if (state.total === 0) {
          setStatus('No fillable fields found — the form may be inside an iframe.');
        } else {
          const { filled, skipped, total } = state;
          setStatus(`Done — ${filled} filled, ${skipped} skipped of ${total} fields`);
        }
        setFilling(false);
      }
    }, 800);
  }

  function handleSetMode(m: FillMode) {
    setMode(m);
    browser.storage.local.set({ fillMode: m });
  }

  // On mount: restore mode + restore in-progress fill if popup was closed mid-fill
  useEffect(() => {
    browser.storage.local.get({ apiKey: '', fillMode: 'job' }).then(r => {
      const stored = r as StoredSettings & { fillMode: FillMode };
      setHasApiKey(!!stored.apiKey);
      setMode(stored.fillMode ?? 'job');
    });

    browser.runtime.sendMessage({ type: 'GET_FILL_STATUS' }).then((state: unknown) => {
      const s = state as { filling: boolean; current: number; total: number; filled: number; skipped: number };
      if (s?.filling) {
        setFilling(true);
        setStatus(`Filling field ${s.current} of ${s.total}…`);
        startPolling();
      }
    });

    return () => clearInterval(pollRef.current);
  }, []);

  async function handleFill() {
    if (filling) return;
    setFilling(true);
    setStatus('Detecting fields…');
    browser.runtime.sendMessage({ type: 'FILL_PAGE', mode });
    // Small delay so background has time to start before first poll
    await new Promise(r => setTimeout(r, 400));
    startPolling();
  }

  if (!hasApiKey) {
    return (
      <div style={s.body}>
        <p style={s.error}>No API key set — add it in Settings.</p>
      </div>
    );
  }

  return (
    <div style={s.body}>
      <div>
        <span style={s.label}>Mode</span>
        <div style={s.modeRow}>
          <button style={s.modeBtn(mode === 'job')} onClick={() => handleSetMode('job')}>Job</button>
          <button style={s.modeBtn(mode === 'accelerator')} onClick={() => handleSetMode('accelerator')}>Accelerator</button>
        </div>
      </div>
      <button style={s.fillBtn(filling)} onClick={handleFill} disabled={filling}>
        {filling ? 'Filling…' : 'Fill Page'}
      </button>
      {status && <p style={s.status}>{status}</p>}
    </div>
  );
}

// ── Profile tab ────────────────────────────────────────────────────────────

function useStorageField(key: string, defaultValue: string) {
  const [value, setValue] = useState(defaultValue);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    browser.storage.local.get({ [key]: defaultValue }).then(r => {
      setValue((r as Record<string, string>)[key] ?? defaultValue);
    });
  }, [key]);

  function onChange(val: string) {
    setValue(val);
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await browser.storage.local.set({ [key]: val });
      setSaved(true);
    }, 600);
  }

  return { value, onChange, saved };
}

function ProfileTab() {
  const personal = useStorageField('personal', '');
  const startup = useStorageField('startup', '');

  return (
    <div style={s.body}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={s.sectionLabel}>Personal Profile</span>
          {personal.saved && <span style={s.saved}>Saved</span>}
        </div>
        <textarea
          style={s.textarea(160)}
          value={personal.value}
          onChange={e => personal.onChange(e.target.value)}
          placeholder="Your background, skills, experience, education..."
          spellCheck
        />
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={s.sectionLabel}>Startup Profile</span>
          {startup.saved && <span style={s.saved}>Saved</span>}
        </div>
        <textarea
          style={s.textarea(160)}
          value={startup.value}
          onChange={e => startup.onChange(e.target.value)}
          placeholder="Company name, what you build, who it's for, traction, why now..."
          spellCheck
        />
      </div>
    </div>
  );
}

// ── Settings tab ───────────────────────────────────────────────────────────

function SettingsTab() {
  const { value: apiKey, onChange, saved } = useStorageField('apiKey', '');

  return (
    <div style={s.body}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={s.label}>Anthropic API key</span>
          {saved && <span style={s.saved}>Saved</span>}
        </div>
        <input
          type="password"
          style={s.input}
          value={apiKey}
          onChange={e => onChange(e.target.value)}
          placeholder="sk-ant-..."
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <p style={{ fontSize: 11, color: '#9ca3af' }}>
        Stored locally. Only sent to the Anthropic API when filling.
      </p>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<Tab>('fill');

  return (
    <div style={s.root}>
      <div style={s.tabs}>
        {(['fill', 'profile', 'settings'] as Tab[]).map(t => (
          <button key={t} style={s.tab(tab === t)} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === 'fill' && <FillTab />}
      {tab === 'profile' && <ProfileTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}
