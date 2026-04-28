import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';

type AuthMode = 'login' | 'register';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [form, setForm] = useState({ login: '', username: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me').then(r => {
      if (r.ok) router.replace('/friends/all');
      else setChecking(false);
    }).catch(() => setChecking(false));
  }, [router]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (mode === 'register' && form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const body = mode === 'login'
        ? { login: form.login, password: form.password }
        : { username: form.username, email: form.email, password: form.password };

      const r = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Something went wrong'); return; }
      router.push('/friends/all');
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  if (checking) return (
    <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      <div className="spinner" />
    </div>
  );

  return (
    <div style={styles.page}>
      <div style={styles.noise} />
      <div style={styles.grid} />

      <div style={styles.container} className="animate-scale-in">
        {/* Logo */}
        <div style={styles.logoWrap}>
          <div style={styles.logoImg}>
            <Image src="/assets/PALEROCK.png" alt="Palerock" width={40} height={40} style={{ objectFit: 'contain' }} onError={() => {}} />
          </div>
          <span style={styles.logoText}>PALEROCK</span>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {(['login', 'register'] as AuthMode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }} style={{
              ...styles.tab,
              ...(mode === m ? styles.tabActive : styles.tabInactive)
            }}>
              {m === 'login' ? 'SIGN IN' : 'REGISTER'}
            </button>
          ))}
          <div style={{ ...styles.tabIndicator, left: mode === 'login' ? 0 : '50%' }} />
        </div>

        {/* Form */}
        <form onSubmit={submit} style={styles.form}>
          {mode === 'register' && (
            <Field label="USERNAME" type="text" value={form.username} onChange={set('username')} placeholder="your_handle" autoComplete="username" />
          )}
          {mode === 'login' && (
            <Field label="USERNAME OR EMAIL" type="text" value={form.login} onChange={set('login')} placeholder="username or email" autoComplete="username" />
          )}
          {mode === 'register' && (
            <Field label="EMAIL" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" autoComplete="email" />
          )}
          <Field label="PASSWORD" type="password" value={form.password} onChange={set('password')} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          {mode === 'register' && (
            <Field label="CONFIRM PASSWORD" type="password" value={form.confirm} onChange={set('confirm')} placeholder="••••••••" autoComplete="new-password" />
          )}

          {error && (
            <div style={styles.error} className="animate-fade-in">
              <span style={{ color: 'var(--danger)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                ✕ {error}
              </span>
            </div>
          )}

          <button type="submit" disabled={loading} style={{ ...styles.submit, opacity: loading ? 0.6 : 1 }}>
            {loading ? <span className="spinner" /> : (mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT')}
          </button>
        </form>

        <p style={styles.footer}>
          {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} style={styles.footerLink}>
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}

function Field({ label, type, value, onChange, placeholder, autoComplete }: {
  label: string; type: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string; autoComplete?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          background: 'var(--bg-2)',
          border: `1px solid ${focused ? 'var(--text)' : 'var(--border)'}`,
          borderRadius: 'var(--radius)',
          padding: '10px 12px',
          color: 'var(--text)',
          outline: 'none',
          fontSize: 13,
          transition: 'border-color var(--transition)',
          fontFamily: 'var(--font-mono)',
        }}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    background: 'var(--bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  noise: {
    position: 'absolute', inset: 0,
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`,
    pointerEvents: 'none',
  },
  grid: {
    position: 'absolute', inset: 0,
    backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
    backgroundSize: '40px 40px',
    opacity: 0.3,
    pointerEvents: 'none',
  },
  container: {
    width: '100%', maxWidth: 400,
    background: 'var(--bg-1)',
    border: '1px solid var(--border)',
    padding: '40px 36px',
    position: 'relative',
    zIndex: 1,
  },
  logoWrap: {
    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 36,
  },
  logoImg: {
    width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  logoText: {
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, letterSpacing: '0.15em',
    color: 'var(--text)',
  },
  tabs: {
    display: 'flex', position: 'relative',
    borderBottom: '1px solid var(--border)', marginBottom: 28,
  },
  tab: {
    flex: 1, padding: '10px 0', fontSize: 11, letterSpacing: '0.1em',
    fontFamily: 'var(--font-display)', fontWeight: 700,
    background: 'none', border: 'none', cursor: 'pointer',
    transition: 'color var(--transition)',
  },
  tabActive: { color: 'var(--text)' },
  tabInactive: { color: 'var(--text-3)' },
  tabIndicator: {
    position: 'absolute', bottom: -1, width: '50%', height: 2,
    background: 'var(--text)', transition: 'left 0.2s cubic-bezier(0.4,0,0.2,1)',
  },
  form: { display: 'flex', flexDirection: 'column', gap: 18 },
  error: {
    padding: '10px 12px',
    background: 'var(--danger-dim)',
    border: '1px solid rgba(255,51,51,0.2)',
    borderRadius: 'var(--radius)',
  },
  submit: {
    marginTop: 4,
    padding: '12px',
    background: 'var(--text)',
    color: 'var(--bg)',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
    letterSpacing: '0.1em',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'opacity var(--transition)',
  },
  footer: {
    marginTop: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 12,
  },
  footerLink: {
    color: 'var(--text-2)', textDecoration: 'underline', background: 'none',
    border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-mono)',
  },
};
