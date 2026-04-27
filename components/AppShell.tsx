import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Sidebar, { ServerStub } from '@/components/Sidebar';
import type { User, Channel } from '@/pages/app';

interface Props {
  user: User;
  channels: Channel[];
  activeChannelId?: string;
  onChannelsUpdate: () => void;
  children: React.ReactNode;
}

export default function AppShell({ user, channels, activeChannelId, onChannelsUpdate, children }: Props) {
  const router = useRouter();
  const [servers, setServers] = useState<ServerStub[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [newServerName, setNewServerName] = useState('');

  const fetchServers = useCallback(async () => {
    const r = await fetch('/api/servers');
    if (r.ok) { const d = await r.json(); setServers(d.servers || []); }
  }, []);

  const fetchPendingCount = useCallback(async () => {
    const r = await fetch('/api/friends/pending-count');
    if (r.ok) { const d = await r.json(); setPendingCount(d.count); }
  }, []);

  useEffect(() => {
    fetchServers();
    fetchPendingCount();
    const iv = setInterval(() => { onChannelsUpdate(); fetchPendingCount(); }, 8000);
    return () => clearInterval(iv);
  }, [fetchServers, fetchPendingCount, onChannelsUpdate]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  }

  async function createServer() {
    if (!newServerName.trim()) return;
    const r = await fetch('/api/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newServerName }),
    });
    const data = await r.json();
    if (data.server) {
      setShowCreateServer(false);
      setNewServerName('');
      await fetchServers();
      router.push(`/servers/${data.server.id}/${data.server.defaultChannelId}`);
    }
  }

  // Determine active view from route
  const path = router.pathname;
  const activeView = path.startsWith('/messages') ? 'chat'
    : path.startsWith('/friends') ? 'friends'
    : path === '/profile' ? 'profile'
    : 'friends';

  return (
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden', background: 'var(--bg)' }}>
      <Sidebar
        user={user}
        channels={channels}
        servers={servers}
        activeView={activeView}
        activeChannelId={activeChannelId || null}
        pendingCount={pendingCount}
        onViewChange={(v) => {
          if (v === 'friends') router.push('/friends/all');
          else if (v === 'profile') router.push('/profile');
          else if (v === 'chat' && channels.length > 0) router.push(`/messages/${channels[0].id}`);
        }}
        onChannelSelect={(id) => router.push(`/messages/${id}`)}
        onLogout={logout}
        onCreateServer={() => setShowCreateServer(true)}
        onServerUpdate={fetchServers}
      />
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {children}
      </main>

      {showCreateServer && (
        <div style={styles.overlay} onClick={() => setShowCreateServer(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>CREATE A SERVER</span>
              <button onClick={() => setShowCreateServer(false)} style={styles.closeBtn}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>
              Your server is where you and your friends hang out.
            </p>
            <label style={styles.label}>SERVER NAME</label>
            <input
              style={styles.input}
              placeholder={`${user.username}'s server`}
              value={newServerName}
              onChange={e => setNewServerName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createServer()}
              autoFocus
              maxLength={50}
            />
            <div style={styles.modalActions}>
              <button style={styles.cancelBtn} onClick={() => setShowCreateServer(false)}>Back</button>
              <button style={styles.confirmBtn} onClick={createServer} disabled={!newServerName.trim()}>
                Create Server
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 },
  modal: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 32, minWidth: 380, maxWidth: 460, width: '100%' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, letterSpacing: '0.08em', color: 'var(--text)' },
  closeBtn: { color: 'var(--text-3)', cursor: 'pointer', fontSize: 14, padding: 4, border: 'none', background: 'transparent' },
  label: { display: 'block', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 6 },
  input: { width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 13, outline: 'none' },
  modalActions: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 },
  cancelBtn: { padding: '9px 18px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12 },
  confirmBtn: { padding: '9px 22px', border: 'none', borderRadius: 'var(--radius)', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.08em' },
};
