import { useEffect } from 'react';
import { useRouter } from 'next/router';

// /app now redirects to the new URL structure
export default function AppRedirect() {
  const router = useRouter();
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => { if (!r.ok) { router.replace('/'); return null; } return r.json(); })
      .then(data => { if (data) router.replace('/friends/all'); })
      .catch(() => router.replace('/'));
  }, [router]);
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      <div className="spinner" style={{ width: 24, height: 24 }} />
    </div>
  );
}

// Re-export types that other files import from here
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

export type ActiveView = 'chat' | 'friends' | 'profile' | 'server';
