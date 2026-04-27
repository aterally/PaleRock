import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import AppShell from '@/components/AppShell';
import ProfilePane from '@/components/ProfilePane';
import type { User, Channel } from '@/pages/app';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => { if (!r.ok) { router.replace('/'); return null; } return r.json(); })
      .then(d => { if (d) setUser(d.user); })
      .catch(() => router.replace('/'));
  }, [router]);

  const fetchChannels = useCallback(async () => {
    const r = await fetch('/api/channels');
    if (r.ok) { const d = await r.json(); setChannels(d.channels); }
  }, []);

  useEffect(() => { if (user) fetchChannels(); }, [user, fetchChannels]);

  if (!user) return null;

  return (
    <>
      <Head><title>Profile — PALEROCK</title></Head>
      <AppShell user={user} channels={channels} onChannelsUpdate={fetchChannels}>
        <ProfilePane user={user} onUserUpdate={setUser} />
      </AppShell>
    </>
  );
}
