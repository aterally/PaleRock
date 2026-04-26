import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Sidebar from '@/components/Sidebar';
import ChatPane from '@/components/ChatPane';
import FriendsPane from '@/components/FriendsPane';
import ProfilePane from '@/components/ProfilePane';

export interface User {
  id: string;
  username: string;
  email: string;
  bio: string;
  registeredAt: string;
  status?: string;
}

export interface Channel {
  id: string;
  type: string;
  updatedAt: string;
  lastMessage: { content: string; senderId: string; createdAt: string } | null;
  otherUser: { id: string; username: string; bio: string } | null;
}

export type ActiveView = 'chat' | 'friends' | 'profile';

export default function AppPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeView, setActiveView] = useState<ActiveView>('friends');
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => {
        if (!r.ok) { router.replace('/'); return null; }
        return r.json();
      })
      .then(data => {
        if (data) { setUser(data.user); setLoading(false); }
      })
      .catch(() => router.replace('/'));
  }, [router]);

  const fetchChannels = useCallback(async () => {
    const r = await fetch('/api/channels');
    if (r.ok) {
      const data = await r.json();
      setChannels(data.channels);
    }
  }, []);

  const fetchPendingCount = useCallback(async () => {
    const r = await fetch('/api/friends/pending-count');
    if (r.ok) {
      const data = await r.json();
      setPendingCount(data.count);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchChannels();
    fetchPendingCount();

    const interval = setInterval(() => {
      fetchChannels();
      fetchPendingCount();
    }, 8000);
    return () => clearInterval(interval);
  }, [user, fetchChannels, fetchPendingCount]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  }

  function openChannel(channelId: string) {
    setActiveChannelId(channelId);
    setActiveView('chat');
  }

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div className="spinner" style={{ width: 24, height: 24 }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.15em', color: 'var(--text-3)' }}>
          LOADING
        </span>
      </div>
    </div>
  );

  if (!user) return null;

  const activeChannel = channels.find(c => c.id === activeChannelId) || null;

  return (
    <div style={styles.layout}>
      <Sidebar
        user={user}
        channels={channels}
        activeView={activeView}
        activeChannelId={activeChannelId}
        pendingCount={pendingCount}
        onViewChange={(v) => { setActiveView(v); if (v !== 'chat') setActiveChannelId(null); }}
        onChannelSelect={openChannel}
        onLogout={logout}
      />
      <main style={styles.main}>
        {activeView === 'chat' && activeChannelId ? (
          <ChatPane
            key={activeChannelId}
            channelId={activeChannelId}
            channel={activeChannel}
            currentUser={user}
          />
        ) : activeView === 'friends' ? (
          <FriendsPane
            currentUser={user}
            onRequestAccepted={fetchChannels}
            onPendingCountChange={fetchPendingCount}
          />
        ) : activeView === 'profile' ? (
          <ProfilePane user={user} onUserUpdate={setUser} />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.1em', fontSize: 12 }}>
        SELECT A CONVERSATION
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    height: '100vh',
    display: 'flex',
    overflow: 'hidden',
    background: 'var(--bg)',
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    position: 'relative',
  },
};
