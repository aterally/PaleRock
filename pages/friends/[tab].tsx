import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import AppShell from '@/components/AppShell';
import type { User, Channel } from '@/pages/app';
import { Avatar } from '@/components/Sidebar';

export interface Friend {
  userId: string;
  username: string;
  bio: string;
  avatar?: string | null;
  channelId: string;
  since: string;
}
export interface FriendRequest {
  id: string;
  fromUser?: { id: string; username: string; bio: string; avatar?: string | null };
  toUser?: { id: string; username: string; bio: string; avatar?: string | null };
  createdAt: string;
}

interface FriendsData {
  friends: Friend[];
  received: FriendRequest[];
  sent: FriendRequest[];
}

type Tab = 'all' | 'received' | 'sent';

export default function FriendsPage() {
  const router = useRouter();
  const tab = (router.query.tab as Tab) || 'all';

  const [user, setUser] = useState<User | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [data, setData] = useState<FriendsData>({ friends: [], received: [], sent: [] });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [addUsername, setAddUsername] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => { if (!r.ok) { router.replace('/'); return null; } return r.json(); })
      .then(d => { if (d) setUser(d.user); })
      .catch(() => router.replace('/'));
  }, [router]);

  const fetchAll = useCallback(async () => {
    const [channelsRes, friendsRes] = await Promise.all([
      fetch('/api/channels'),
      fetch('/api/friends/list'),
    ]);
    if (channelsRes.ok) { const d = await channelsRes.json(); setChannels(d.channels); }
    if (friendsRes.ok) { const d = await friendsRes.json(); setData(d); }
    setLoading(false);
  }, []);

  useEffect(() => { if (user) { fetchAll(); const iv = setInterval(fetchAll, 6000); return () => clearInterval(iv); } }, [user, fetchAll]);

  async function sendRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!addUsername.trim()) return;
    setAddError(''); setAddSuccess(''); setAddLoading(true);
    try {
      const r = await fetch('/api/friends/requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: addUsername.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setAddError(d.error); return; }
      setAddSuccess(`Friend request sent to ${addUsername.trim()}`);
      setAddUsername('');
      fetchAll();
    } finally { setAddLoading(false); }
  }

  async function respond(requestId: string, action: 'accept' | 'decline' | 'cancel') {
    setActionLoading(requestId);
    try {
      const r = await fetch('/api/friends/respond', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action }),
      });
      if (r.ok) fetchAll();
    } finally { setActionLoading(null); }
  }

  const tabCounts = { all: data.friends.length, received: data.received.length, sent: data.sent.length };

  if (!user) return <LoadingScreen />;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'all', label: 'All Friends' },
    { id: 'received', label: 'Pending' },
    { id: 'sent', label: 'Sent' },
  ];

  return (
    <>
      <Head><title>Friends — PALEROCK</title></Head>
      <AppShell user={user} channels={channels} onChannelsUpdate={fetchAll}>
        <div style={styles.pane}>
          {/* Header */}
          <div style={styles.header}>
            <div style={styles.headerLeft}>
              <span style={styles.headerIcon}><IconFriends /></span>
              <h1 style={styles.title}>FRIENDS</h1>
            </div>
            {/* Tabs */}
            <div style={styles.tabs}>
              {TABS.map(t => (
                <button
                  key={t.id}
                  style={{
                    ...styles.tabBtn,
                    color: tab === t.id ? 'var(--text)' : 'var(--text-3)',
                    borderBottom: tab === t.id ? '2px solid var(--text)' : '2px solid transparent',
                  }}
                  onClick={() => router.push(`/friends/${t.id}`)}
                >
                  {t.label}
                  {tabCounts[t.id] > 0 && (
                    <span style={{
                      ...styles.badge,
                      background: t.id === 'received' && tabCounts.received > 0 ? 'var(--text)' : 'var(--bg-4)',
                      color: t.id === 'received' && tabCounts.received > 0 ? 'var(--bg)' : 'var(--text-3)',
                    }}>
                      {tabCounts[t.id]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.body}>
            {/* Add friend bar */}
            <div style={styles.addBar}>
              <form onSubmit={sendRequest} style={styles.addForm}>
                <span style={styles.addLabel}>ADD FRIEND</span>
                <input
                  style={styles.addInput}
                  placeholder="Enter a username…"
                  value={addUsername}
                  onChange={e => { setAddUsername(e.target.value); setAddError(''); setAddSuccess(''); }}
                />
                <button type="submit" disabled={addLoading || !addUsername.trim()} style={styles.addBtn}>
                  {addLoading ? <span className="spinner" style={{ width: 12, height: 12, borderTopColor: '#000' }} /> : 'Send Request'}
                </button>
              </form>
              {addError && <p style={styles.errorMsg}>✕ {addError}</p>}
              {addSuccess && <p style={styles.successMsg}>✓ {addSuccess}</p>}
            </div>

            {/* Content */}
            <div style={styles.list}>
              {loading ? (
                <div style={styles.centred}><span className="spinner" /></div>
              ) : tab === 'all' ? (
                data.friends.length === 0
                  ? <Empty icon="👥" text="No friends yet" sub="Send a friend request to get started" />
                  : data.friends.map(f => (
                    <FriendRow key={f.userId} friend={f} onMessage={() => router.push(`/messages/${f.channelId}`)} />
                  ))
              ) : tab === 'received' ? (
                data.received.length === 0
                  ? <Empty icon="📭" text="No incoming requests" sub="When someone adds you, it'll appear here" />
                  : data.received.map(req => (
                    <RequestRow
                      key={req.id}
                      user={req.fromUser!}
                      type="received"
                      date={req.createdAt}
                      loading={actionLoading === req.id}
                      onAccept={() => respond(req.id, 'accept')}
                      onDecline={() => respond(req.id, 'decline')}
                    />
                  ))
              ) : (
                data.sent.length === 0
                  ? <Empty icon="📤" text="No outgoing requests" sub="Requests you've sent will appear here" />
                  : data.sent.map(req => (
                    <RequestRow
                      key={req.id}
                      user={req.toUser!}
                      type="sent"
                      date={req.createdAt}
                      loading={actionLoading === req.id}
                      onCancel={() => respond(req.id, 'cancel')}
                    />
                  ))
              )}
            </div>
          </div>
        </div>
      </AppShell>
    </>
  );
}

function FriendRow({ friend, onMessage }: { friend: Friend; onMessage: () => void }) {
  return (
    <div style={styles.row}>
      <Avatar username={friend.username} avatar={friend.avatar} size={38} />
      <div style={styles.rowInfo}>
        <span style={styles.rowName}>{friend.username}</span>
        {friend.bio && <span style={styles.rowSub}>{friend.bio}</span>}
      </div>
      <button style={styles.msgBtn} onClick={onMessage} title="Send Message">
        <IconMessage /> <span>Message</span>
      </button>
    </div>
  );
}

function RequestRow({ user, type, date, loading, onAccept, onDecline, onCancel }: {
  user: { id: string; username: string; bio: string; avatar?: string | null };
  type: 'received' | 'sent';
  date: string;
  loading: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
}) {
  return (
    <div style={{ ...styles.row, opacity: loading ? 0.6 : 1 }}>
      <Avatar username={user.username} avatar={user.avatar} size={38} />
      <div style={styles.rowInfo}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={styles.rowName}>{user.username}</span>
          <span style={styles.rowTag}>{type === 'received' ? 'Incoming Request' : 'Outgoing Request'}</span>
        </div>
        {user.bio && <span style={styles.rowSub}>{user.bio}</span>}
        <span style={styles.rowDate}>{new Date(date).toLocaleDateString()}</span>
      </div>
      <div style={styles.rowActions}>
        {loading ? <span className="spinner" /> : type === 'received' ? (
          <>
            <button style={styles.acceptBtn} onClick={onAccept}>Accept</button>
            <button style={styles.declineBtn} onClick={onDecline}>Decline</button>
          </>
        ) : (
          <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        )}
      </div>
    </div>
  );
}

function Empty({ icon, text, sub }: { icon: string; text: string; sub: string }) {
  return (
    <div style={styles.empty}>
      <span style={{ fontSize: 40, marginBottom: 12 }}>{icon}</span>
      <p style={styles.emptyTitle}>{text}</p>
      <p style={styles.emptySub}>{sub}</p>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      <div className="spinner" style={{ width: 24, height: 24 }} />
    </div>
  );
}

const IconFriends = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconMessage = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const styles: Record<string, React.CSSProperties> = {
  pane: { flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg)' },
  header: { padding: '0 28px', height: 49, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'var(--bg-1)', gap: 24 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  headerIcon: { color: 'var(--text-3)', display: 'flex', alignItems: 'center' },
  title: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, letterSpacing: '0.12em', color: 'var(--text)' },
  tabs: { display: 'flex', gap: 0, height: '100%', alignItems: 'stretch' },
  tabBtn: { padding: '0 16px', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', gap: 7, transition: 'color var(--transition)', height: '100%' },
  badge: { fontSize: 10, padding: '1px 6px', borderRadius: 2, fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '0.04em' },
  body: { flex: 1, overflowY: 'auto', padding: '0' },
  addBar: { padding: '16px 28px', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', flexShrink: 0 },
  addForm: { display: 'flex', alignItems: 'center', gap: 10 },
  addLabel: { fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' },
  addInput: { flex: 1, maxWidth: 360, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' },
  addBtn: { padding: '8px 18px', background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 'var(--radius)', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer', flexShrink: 0 },
  errorMsg: { fontSize: 11, color: 'var(--danger)', marginTop: 7 },
  successMsg: { fontSize: 11, color: 'var(--success)', marginTop: 7 },
  list: { padding: '8px 20px', display: 'flex', flexDirection: 'column' },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', borderBottom: '1px solid var(--border)', transition: 'background var(--transition)' },
  avatar: { width: 38, height: 38, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, flexShrink: 0, userSelect: 'none' },
  rowInfo: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  rowName: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--text)' },
  rowSub: { fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowTag: { fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)' },
  rowDate: { fontSize: 10, color: 'var(--text-3)' },
  rowActions: { display: 'flex', gap: 6, flexShrink: 0 },
  msgBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer', transition: 'all var(--transition)' },
  acceptBtn: { padding: '6px 14px', background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 'var(--radius)', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer' },
  declineBtn: { padding: '6px 14px', background: 'var(--danger-dim)', color: 'var(--danger)', border: '1px solid rgba(255,51,51,0.3)', borderRadius: 'var(--radius)', fontSize: 11, cursor: 'pointer' },
  cancelBtn: { padding: '6px 14px', background: 'var(--bg-3)', color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 11, cursor: 'pointer' },
  centred: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center' },
  emptyTitle: { fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 },
  emptySub: { fontSize: 12, color: 'var(--text-3)' },
};
