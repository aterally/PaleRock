import { useState, useEffect, useRef, useCallback } from 'react';
import type { User } from '@/pages/app';

interface ProfilePaneProps {
  user: User;
  onUserUpdate: (u: User) => void;
}

const PALETTE = [
  '#000000','#111111','#222222','#333333','#444444','#555555','#666666','#777777',
  '#888888','#999999','#aaaaaa','#bbbbbb','#cccccc','#dddddd','#eeeeee','#ffffff',
  '#ff0000','#ff4400','#ff8800','#ffcc00','#ffff00','#88ff00','#00ff00','#00ff88',
  '#00ffff','#0088ff','#0000ff','#8800ff','#ff00ff','#ff0088','#ff6688','#88ffcc',
  '#8b0000','#b34700','#b36200','#b38600','#6b6b00','#1f5c00','#004400','#005c33',
  '#004444','#003b8e','#000080','#33007a','#660066','#7a003d','#5c2233','#2a4a2a',
];
const GRID = 16;
const CELL = 20;

function makeEmptyGrid() {
  return Array.from({ length: GRID }, () => Array(GRID).fill('transparent'));
}

function PixelAvatarEditor({ initialPixels, onSave, onCancel }: {
  initialPixels: string[][] | null;
  onSave: (pixels: string[][]) => void;
  onCancel: () => void;
}) {
  const [pixels, setPixels] = useState<string[][]>(() => initialPixels ? initialPixels.map(r => [...r]) : makeEmptyGrid());
  const [selectedColor, setSelectedColor] = useState('#ffffff');
  const [eraser, setEraser] = useState(false);
  const [painting, setPainting] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  function paint(r: number, c: number) {
    setPixels(prev => {
      const next = prev.map(row => [...row]);
      next[r][c] = eraser ? 'transparent' : selectedColor;
      return next;
    });
  }

  function bucketFill(startR: number, startC: number) {
    const target = pixels[startR][startC];
    const replacement = eraser ? 'transparent' : selectedColor;
    if (target === replacement) return;
    const next = pixels.map(row => [...row]);
    const stack = [[startR, startC]];
    while (stack.length) {
      const [cr, cc] = stack.pop()!;
      if (cr < 0 || cr >= GRID || cc < 0 || cc >= GRID) continue;
      if (next[cr][cc] !== target) continue;
      next[cr][cc] = replacement;
      stack.push([cr+1,cc],[cr-1,cc],[cr,cc+1],[cr,cc-1]);
    }
    setPixels(next);
  }

  // Convert a clientX/clientY to grid cell coords
  function clientToCell(clientX: number, clientY: number): [number, number] | null {
    if (!gridRef.current) return null;
    const rect = gridRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const c = Math.floor(x / CELL);
    const r = Math.floor(y / CELL);
    if (r < 0 || r >= GRID || c < 0 || c >= GRID) return null;
    return [r, c];
  }

  // Pointer events work for both mouse and touch
  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setPainting(true);
    const cell = clientToCell(e.clientX, e.clientY);
    if (!cell) return;
    if (e.shiftKey) bucketFill(cell[0], cell[1]);
    else paint(cell[0], cell[1]);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!painting) return;
    e.preventDefault();
    const cell = clientToCell(e.clientX, e.clientY);
    if (cell) paint(cell[0], cell[1]);
  }

  function onPointerUp(e: React.PointerEvent) {
    e.preventDefault();
    setPainting(false);
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, overflowY: 'auto', padding: '16px 0' }}
      onClick={onCancel}
    >
      <div
        style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, width: 'min(560px, 96vw)', margin: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, letterSpacing: '0.1em', color: 'var(--text)' }}>DRAW YOUR AVATAR</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>16×16 pixel canvas</div>
        </div>

        {/* Responsive layout: row on desktop, column on mobile */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Canvas — uses pointer events for unified mouse+touch */}
          <div
            ref={gridRef}
            style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID}, ${CELL}px)`, border: '1px solid var(--border)', flexShrink: 0, userSelect: 'none', cursor: 'crosshair', touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            {pixels.map((row, r) =>
              row.map((color, c) => (
                <div
                  key={r * GRID + c}
                  style={{
                    width: CELL, height: CELL,
                    background: color === 'transparent' ? ((r + c) % 2 === 0 ? '#1a1a1a' : '#222222') : color,
                    boxSizing: 'border-box',
                    borderRight: c % 4 === 3 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    borderBottom: r % 4 === 3 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    pointerEvents: 'none',
                  }}
                />
              ))
            )}
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minWidth: 160 }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 6 }}>PREVIEW</div>
              <canvas
                key={JSON.stringify(pixels)}
                ref={el => {
                  if (!el) return;
                  const ctx = el.getContext('2d')!;
                  ctx.clearRect(0, 0, 48, 48);
                  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
                    if (pixels[r][c] !== 'transparent') {
                      ctx.fillStyle = pixels[r][c];
                      ctx.fillRect(c * 3, r * 3, 3, 3);
                    }
                  }
                }}
                width={48} height={48}
                style={{ borderRadius: 8, border: '1px solid var(--border)', imageRendering: 'pixelated', display: 'block' }}
              />
            </div>

            <div>
              <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 6 }}>CURRENT COLOR</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: 4, background: eraser ? 'transparent' : selectedColor, border: '1px solid var(--border)' }} />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{eraser ? 'eraser' : selectedColor}</span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 6 }}>PALETTE</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3, maxWidth: 192 }}>
                {PALETTE.map(c => (
                  <button key={c} onClick={() => { setSelectedColor(c); setEraser(false); }}
                    style={{ width: 20, height: 20, borderRadius: 3, background: c, border: (!eraser && selectedColor === c) ? '2px solid white' : '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', padding: 0 }} />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setEraser(false)}
                style={{ flex: 1, padding: '6px 0', border: '1px solid var(--border)', borderRadius: 4, background: !eraser ? 'var(--bg-3)' : 'transparent', color: !eraser ? 'var(--text)' : 'var(--text-3)', cursor: 'pointer', fontSize: 10, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                ✏ Draw
              </button>
              <button onClick={() => setEraser(true)}
                style={{ flex: 1, padding: '6px 0', border: '1px solid var(--border)', borderRadius: 4, background: eraser ? 'var(--bg-3)' : 'transparent', color: eraser ? 'var(--text)' : 'var(--text-3)', cursor: 'pointer', fontSize: 10, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                ◻ Erase
              </button>
            </div>

            <div style={{ fontSize: 9, color: 'var(--text-3)', lineHeight: 1.7 }}>
              <b>Touch/drag</b> to paint<br/>
              <b>Shift+tap</b> to bucket fill
            </div>

            <button onClick={() => setPixels(makeEmptyGrid())}
              style={{ padding: '6px 10px', border: '1px solid rgba(237,66,69,0.3)', borderRadius: 4, background: 'rgba(237,66,69,0.08)', color: '#ed4245', cursor: 'pointer', fontSize: 10, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              Clear All
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel}
            style={{ padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12 }}>
            Cancel
          </button>
          <button onClick={() => onSave(pixels)}
            style={{ padding: '8px 20px', border: 'none', borderRadius: 6, background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.06em' }}>
            Save Avatar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePane({ user, onUserUpdate }: ProfilePaneProps) {
  const [tab, setTab] = useState<'info' | 'avatar' | 'security'>('info');

  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio || '');
  const [pronouns, setPronouns] = useState((user as any).pronouns || '');
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [infoSuccess, setInfoSuccess] = useState('');

  const [showAvatarEditor, setShowAvatarEditor] = useState(false);
  const [avatarPixels, setAvatarPixels] = useState<string[][] | null>(() => {
    try { return (user as any).avatar ? JSON.parse((user as any).avatar) : null; } catch { return null; }
  });

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  useEffect(() => {
    setUsername(user.username);
    setBio(user.bio || '');
    setPronouns((user as any).pronouns || '');
    try { setAvatarPixels((user as any).avatar ? JSON.parse((user as any).avatar) : null); } catch {}
  }, [user]);

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    setInfoError(''); setInfoSuccess(''); setInfoLoading(true);
    try {
      const r = await fetch('/api/user/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), bio: bio.trim(), pronouns: pronouns.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { setInfoError(data.error); return; }
      onUserUpdate({ ...user, username: data.user.username, bio: data.user.bio } as any);
      setInfoSuccess('Profile updated successfully');
    } finally { setInfoLoading(false); }
  }

  async function saveAvatar(pixels: string[][]) {
    const r = await fetch('/api/user/profile', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar: JSON.stringify(pixels) }),
    });
    if (r.ok) {
      setAvatarPixels(pixels);
      onUserUpdate({ ...user } as any);
    }
    setShowAvatarEditor(false);
  }

  async function removeAvatar() {
    if (!confirm('Remove your pixel avatar? Your initials will be shown instead.')) return;
    await fetch('/api/user/profile', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar: null }),
    });
    setAvatarPixels(null);
    onUserUpdate({ ...user } as any);
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(''); setPwSuccess('');
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return; }
    setPwLoading(true);
    try {
      const r = await fetch('/api/user/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await r.json();
      if (!r.ok) { setPwError(data.error); return; }
      setPwSuccess('Password changed successfully');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } finally { setPwLoading(false); }
  }

  const registered = user.registeredAt
    ? new Date(user.registeredAt).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  const hue = user.username.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

  return (
    <div style={styles.pane}>
      <div style={styles.header}>
        <h1 style={styles.title}>PROFILE</h1>
      </div>

      <div style={styles.content}>
        <div style={styles.avatarSection}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {avatarPixels ? (
              <canvas
                key={JSON.stringify(avatarPixels)}
                ref={el => {
                  if (!el) return;
                  const ctx = el.getContext('2d')!;
                  ctx.clearRect(0, 0, 64, 64);
                  for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
                    if (avatarPixels[r][c] !== 'transparent') {
                      ctx.fillStyle = avatarPixels[r][c];
                      ctx.fillRect(c * 4, r * 4, 4, 4);
                    }
                  }
                }}
                width={64} height={64}
                style={{ borderRadius: 12, imageRendering: 'pixelated', display: 'block', border: '2px solid var(--border)' }}
              />
            ) : (
              <div style={{ width: 64, height: 64, borderRadius: 12, background: `hsl(${hue},10%,18%)`, color: `hsl(${hue},20%,75%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, border: '2px solid var(--border)' }}>
                {user.username.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <div style={styles.displayName}>{user.username}</div>
            {pronouns && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, fontStyle: 'italic' }}>{pronouns}</div>}
            <div style={styles.email}>{user.email}</div>
            <div style={styles.regDate}>Member since {registered}</div>
          </div>
        </div>

        <div style={styles.tabs}>
          {(['info', 'avatar', 'security'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ ...styles.tabBtn, ...(tab === t ? styles.tabActive : styles.tabInactive) }}>
              {t === 'info' ? 'PROFILE INFO' : t === 'avatar' ? 'AVATAR' : 'SECURITY'}
            </button>
          ))}
        </div>

        {tab === 'info' && (
          <form onSubmit={saveInfo} style={styles.form}>
            <ProfileField label="USERNAME" value={username} onChange={setUsername} maxLength={20} hint="Letters, numbers, underscores. 3–20 chars." />
            <ProfileField label="PRONOUNS" value={pronouns} onChange={setPronouns} maxLength={40} hint="e.g. they/them · she/her · he/him" />
            <div>
              <label style={styles.fieldLabel}>BIO</label>
              <textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={160} rows={3} placeholder="Tell people a little about yourself…" style={styles.textarea} />
              <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{bio.length}/160</div>
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
            <button type="submit" disabled={infoLoading} style={{ ...styles.submitBtn, opacity: infoLoading ? 0.6 : 1 }}>
              {infoLoading ? 'SAVING…' : 'SAVE CHANGES'}
            </button>
          </form>
        )}

        {tab === 'avatar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
              Draw your profile picture on a 16×16 pixel grid. Your avatar will appear next to your messages, in member lists, and on your profile card.
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
              <div>
                <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 8 }}>CURRENT AVATAR</div>
                {avatarPixels ? (
                  <canvas
                    key={JSON.stringify(avatarPixels)}
                    ref={el => {
                      if (!el) return;
                      const ctx = el.getContext('2d')!;
                      ctx.clearRect(0, 0, 96, 96);
                      for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
                        if (avatarPixels[r][c] !== 'transparent') {
                          ctx.fillStyle = avatarPixels[r][c];
                          ctx.fillRect(c * 6, r * 6, 6, 6);
                        }
                      }
                    }}
                    width={96} height={96}
                    style={{ borderRadius: 12, imageRendering: 'pixelated', display: 'block', border: '2px solid var(--border)' }}
                  />
                ) : (
                  <div style={{ width: 96, height: 96, borderRadius: 12, background: `hsl(${hue},10%,18%)`, color: `hsl(${hue},20%,75%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32, border: '2px solid var(--border)' }}>
                    {user.username.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 24 }}>
                <button onClick={() => setShowAvatarEditor(true)}
                  style={{ padding: '10px 20px', border: 'none', borderRadius: 6, background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.06em' }}>
                  {avatarPixels ? '✏ Edit Avatar' : '+ Draw Avatar'}
                </button>
                {avatarPixels && (
                  <button onClick={removeAvatar}
                    style={{ padding: '8px 16px', border: '1px solid rgba(237,66,69,0.3)', borderRadius: 6, background: 'rgba(237,66,69,0.08)', color: '#ed4245', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                    Remove Avatar
                  </button>
                )}
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.7, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
              <strong style={{ color: 'var(--text-2)' }}>Tips:</strong> Hold mouse button to paint continuously. Use Shift+click inside the editor for bucket fill. The checkerboard pattern represents transparent pixels.
            </div>
          </div>
        )}

        {tab === 'security' && (
          <form onSubmit={savePassword} style={styles.form}>
            <ProfileField label="CURRENT PASSWORD" value={currentPw} onChange={setCurrentPw} type="password" />
            <ProfileField label="NEW PASSWORD" value={newPw} onChange={setNewPw} type="password" hint="Minimum 6 characters" />
            <ProfileField label="CONFIRM NEW PASSWORD" value={confirmPw} onChange={setConfirmPw} type="password" />
            {pwError && <StatusMsg text={pwError} type="error" />}
            {pwSuccess && <StatusMsg text={pwSuccess} type="success" />}
            <button type="submit" disabled={pwLoading || !currentPw || !newPw || !confirmPw}
              style={{ ...styles.submitBtn, opacity: pwLoading || !currentPw || !newPw || !confirmPw ? 0.5 : 1 }}>
              {pwLoading ? 'SAVING…' : 'CHANGE PASSWORD'}
            </button>
          </form>
        )}
      </div>

      {showAvatarEditor && (
        <PixelAvatarEditor
          initialPixels={avatarPixels}
          onSave={saveAvatar}
          onCancel={() => setShowAvatarEditor(false)}
        />
      )}
    </div>
  );
}

function ProfileField({ label, value, onChange, type = 'text', hint, maxLength }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; hint?: string; maxLength?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={styles.fieldLabel}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} maxLength={maxLength}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ ...styles.input, borderColor: focused ? 'var(--text)' : 'var(--border)' }} />
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
      borderRadius: 'var(--radius)', fontSize: 11,
      color: type === 'error' ? 'var(--danger)' : 'var(--success)',
      fontFamily: 'var(--font-mono)',
    }}>
      {type === 'error' ? '✕' : '✓'} {text}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pane: { flex: 1, display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: 'var(--bg)' },
  header: { padding: '0 32px', height: 60, borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', flexShrink: 0, display: 'flex', alignItems: 'center' },
  title: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, letterSpacing: '0.15em' },
  content: { flex: 1, overflowY: 'auto', padding: '28px 32px', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 24 },
  avatarSection: { display: 'flex', alignItems: 'center', gap: 20, padding: '20px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' },
  displayName: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, letterSpacing: '0.08em', color: 'var(--text)' },
  email: { fontSize: 12, color: 'var(--text-3)', marginTop: 4, fontFamily: 'var(--font-mono)' },
  regDate: { fontSize: 11, color: 'var(--text-3)', marginTop: 3, fontFamily: 'var(--font-mono)' },
  tabs: { display: 'flex', borderBottom: '1px solid var(--border)' },
  tabBtn: { padding: '9px 16px', fontSize: 11, letterSpacing: '0.08em', fontFamily: 'var(--font-display)', fontWeight: 700, cursor: 'pointer', border: 'none', background: 'transparent', borderBottom: '2px solid transparent', transition: 'color var(--transition), border-color var(--transition)' },
  tabActive: { color: 'var(--text)', borderBottom: '2px solid var(--text)' },
  tabInactive: { color: 'var(--text-3)' },
  form: { display: 'flex', flexDirection: 'column', gap: 18 },
  fieldLabel: { fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700, display: 'block', marginBottom: 6 },
  input: { width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', color: 'var(--text)', outline: 'none', fontSize: 13, fontFamily: 'var(--font-mono)', transition: 'border-color var(--transition)', boxSizing: 'border-box' },
  textarea: { width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', color: 'var(--text)', outline: 'none', fontSize: 13, fontFamily: 'var(--font-mono)', resize: 'vertical', lineHeight: 1.5, transition: 'border-color var(--transition)', boxSizing: 'border-box' },
  readonlyField: { display: 'flex', flexDirection: 'column', gap: 6 },
  readonlyValue: { padding: '10px 12px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' },
  submitBtn: { padding: '11px', background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 'var(--radius)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '0.1em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'flex-start', minWidth: 160, transition: 'opacity var(--transition)', marginTop: 4 },
};
