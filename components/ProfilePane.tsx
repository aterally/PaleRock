import { useState, useEffect } from 'react';
import type { User } from '@/pages/app';
import { Avatar } from '@/components/Sidebar';

interface ProfilePaneProps {
  user: User;
  onUserUpdate: (u: User) => void;
}

export default function ProfilePane({ user, onUserUpdate }: ProfilePaneProps) {
  const [tab, setTab] = useState<'info' | 'security'>('info');

  // Info form
  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio || '');
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [infoSuccess, setInfoSuccess] = useState('');

  // Password form
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  useEffect(() => {
    setUsername(user.username);
    setBio(user.bio || '');
  }, [user]);

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    setInfoError('');
    setInfoSuccess('');
    setInfoLoading(true);
    try {
      const r = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), bio: bio.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { setInfoError(data.error); return; }
      onUserUpdate({ ...user, username: data.user.username, bio: data.user.bio });
      setInfoSuccess('Profile updated successfully');
    } finally {
      setInfoLoading(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return; }
    setPwLoading(true);
    try {
      const r = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await r.json();
      if (!r.ok) { setPwError(data.error); return; }
      setPwSuccess('Password changed successfully');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } finally {
      setPwLoading(false);
    }
  }

  const registered = user.registeredAt
    ? new Date(user.registeredAt).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  return (
    <div style={styles.pane}>
      <div style={styles.header}>
        <h1 style={styles.title}>PROFILE</h1>
      </div>

      <div style={styles.content}>
        {/* Avatar display */}
        <div style={styles.avatarSection}>
          <Avatar username={user.username} size={64} />
          <div>
            <div style={styles.displayName}>{user.username}</div>
            <div style={styles.email}>{user.email}</div>
            <div style={styles.regDate}>Member since {registered}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {(['info', 'security'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              ...styles.tabBtn,
              ...(tab === t ? styles.tabActive : styles.tabInactive),
            }}>
              {t === 'info' ? 'PROFILE INFO' : 'SECURITY'}
            </button>
          ))}
        </div>

        {tab === 'info' ? (
          <form onSubmit={saveInfo} style={styles.form}>
            <ProfileField
              label="USERNAME"
              value={username}
              onChange={setUsername}
              maxLength={20}
              hint="Letters, numbers, underscores. 3–20 chars."
            />
            <div>
              <label style={styles.fieldLabel}>BIO</label>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                maxLength={160}
                rows={3}
                placeholder="Tell people a little about yourself…"
                style={styles.textarea}
              />
              <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                {bio.length}/160
              </div>
            </div>

            <div style={styles.readonlyField}>
              <span style={styles.fieldLabel}>EMAIL</span>
              <span style={styles.readonlyValue}>{user.email}</span>
            </div>
            <div style={styles.readonlyField}>
              <span style={styles.fieldLabel}>REGISTERED</span>
              <span style={styles.readonlyValue}>{registered}</span>
            </div>

            {infoError && <StatusMsg text={infoError} type="error" />}
            {infoSuccess && <StatusMsg text={infoSuccess} type="success" />}

            <button type="submit" disabled={infoLoading} style={{
              ...styles.submitBtn,
              opacity: infoLoading ? 0.6 : 1,
            }}>
              {infoLoading ? <span className="spinner" style={{ width: 14, height: 14, borderTopColor: '#000' }} /> : 'SAVE CHANGES'}
            </button>
          </form>
        ) : (
          <form onSubmit={savePassword} style={styles.form}>
            <ProfileField
              label="CURRENT PASSWORD"
              value={currentPw}
              onChange={setCurrentPw}
              type="password"
            />
            <ProfileField
              label="NEW PASSWORD"
              value={newPw}
              onChange={setNewPw}
              type="password"
              hint="Minimum 6 characters"
            />
            <ProfileField
              label="CONFIRM NEW PASSWORD"
              value={confirmPw}
              onChange={setConfirmPw}
              type="password"
            />

            {pwError && <StatusMsg text={pwError} type="error" />}
            {pwSuccess && <StatusMsg text={pwSuccess} type="success" />}

            <button type="submit" disabled={pwLoading || !currentPw || !newPw || !confirmPw} style={{
              ...styles.submitBtn,
              opacity: pwLoading || !currentPw || !newPw || !confirmPw ? 0.5 : 1,
            }}>
              {pwLoading ? <span className="spinner" style={{ width: 14, height: 14, borderTopColor: '#000' }} /> : 'CHANGE PASSWORD'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function ProfileField({ label, value, onChange, type = 'text', hint, maxLength }: {
  label: string; value: string;
  onChange: (v: string) => void;
  type?: string; hint?: string; maxLength?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={styles.fieldLabel}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        maxLength={maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          ...styles.input,
          borderColor: focused ? 'var(--text)' : 'var(--border)',
        }}
      />
      {hint && <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{hint}</span>}
    </div>
  );
}

function StatusMsg({ text, type }: { text: string; type: 'error' | 'success' }) {
  return (
    <div style={{
      padding: '10px 12px',
      background: type === 'error' ? 'var(--danger-dim)' : 'var(--success-dim)',
      border: `1px solid ${type === 'error' ? 'rgba(255,51,51,0.2)' : 'rgba(51,255,153,0.2)'}`,
      borderRadius: 'var(--radius)',
      fontSize: 11,
      color: type === 'error' ? 'var(--danger)' : 'var(--success)',
      fontFamily: 'var(--font-mono)',
    }} className="animate-fade-in">
      {type === 'error' ? '✕' : '✓'} {text}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    background: 'var(--bg)',
  },
  header: {
    padding: '20px 32px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-1)',
    flexShrink: 0,
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: 18,
    letterSpacing: '0.15em',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '28px 32px',
    maxWidth: 560,
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  avatarSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    padding: '20px',
    background: 'var(--bg-1)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
  },
  displayName: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: 20,
    letterSpacing: '0.08em',
    color: 'var(--text)',
  },
  email: {
    fontSize: 12,
    color: 'var(--text-3)',
    marginTop: 4,
    fontFamily: 'var(--font-mono)',
  },
  regDate: {
    fontSize: 11,
    color: 'var(--text-3)',
    marginTop: 3,
    fontFamily: 'var(--font-mono)',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid var(--border)',
  },
  tabBtn: {
    padding: '9px 16px',
    fontSize: 11,
    letterSpacing: '0.08em',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    borderBottom: '2px solid transparent',
    transition: 'color var(--transition), border-color var(--transition)',
  },
  tabActive: { color: 'var(--text)', borderBottom: '2px solid var(--text)' },
  tabInactive: { color: 'var(--text-3)' },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  fieldLabel: {
    fontSize: 10,
    letterSpacing: '0.12em',
    color: 'var(--text-3)',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    display: 'block',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    background: 'var(--bg-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '10px 12px',
    color: 'var(--text)',
    outline: 'none',
    fontSize: 13,
    fontFamily: 'var(--font-mono)',
    transition: 'border-color var(--transition)',
  },
  textarea: {
    width: '100%',
    background: 'var(--bg-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '10px 12px',
    color: 'var(--text)',
    outline: 'none',
    fontSize: 13,
    fontFamily: 'var(--font-mono)',
    resize: 'vertical',
    lineHeight: 1.5,
    transition: 'border-color var(--transition)',
  },
  readonlyField: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  readonlyValue: {
    padding: '10px 12px',
    background: 'var(--bg-1)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    fontSize: 13,
    color: 'var(--text-3)',
    fontFamily: 'var(--font-mono)',
  },
  submitBtn: {
    padding: '11px',
    background: 'var(--text)',
    color: 'var(--bg)',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: '0.1em',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    minWidth: 160,
    transition: 'opacity var(--transition)',
    marginTop: 4,
  },
};
