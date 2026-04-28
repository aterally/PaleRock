import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import AppShell from '@/components/AppShell';
import ChatPane from '@/components/ChatPane';
import type { User, Channel } from '@/pages/app';

export default function MessagePage() {
  const router = useRouter();
  const { channelId } = router.query;
  const [user, setUser] = useState<User | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => { if (!r.ok) { router.replace('/'); return null; } return r.json(); })
      .then(data => { if (data) { setUser(data.user); setLoading(false); } })
      .catch(() => router.replace('/'));
  }, [router]);

  const fetchChannels = useCallback(async () => {
    const r = await fetch('/api/channels');
    if (r.ok) { const d = await r.json(); setChannels(d.channels); }
  }, []);

  useEffect(() => { if (user) fetchChannels(); }, [user, fetchChannels]);

  const activeChannel = channels.find(c => c.id === channelId) || null;

  if (loading || !user) return <LoadingScreen />;

  return (
    <>
      <Head>
        <title>{activeChannel?.otherUser?.username ? `${activeChannel.otherUser.username} — PALEROCK` : 'Messages — PALEROCK'}</title>
      </Head>
      <AppShell user={user} channels={channels} activeChannelId={channelId as string} onChannelsUpdate={fetchChannels}>
        <ChatPane
          key={channelId as string}
          channelId={channelId as string}
          channel={activeChannel}
          currentUser={user}
        />
      </AppShell>
    </>
  );
}

function LoadingScreen() {
  return (
    <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div className="spinner" style={{ width: 24, height: 24 }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.15em', color: 'var(--text-3)' }}>LOADING</span>
      </div>
    </div>
  );
}
