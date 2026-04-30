import { useState, useEffect, useCallback } from 'react';
import type { User } from '@/pages/app';
import { Avatar } from '@/components/Sidebar';

interface FriendRequest {
  id: string;
  toUser?: { id: string; username: string; bio: string };
  fromUser?: { id: string; username: string; bio: string };
  createdAt: string;
}

interface FriendsPaneProps {
  currentUser: User;
  onRequestAccepted: () => void;
  onPendingCountChange: () => void;
}

export default function FriendsPane({ onRequestAccepted, onPendingCountChange }: FriendsPaneProps) {
  const [tab, setTab] = useState<'received' | 'sent'>('received');
  const [sent, setSent] = useState<FriendRequest[]>([]);
  const [received, setReceived] = useState<FriendRequest[]>([]);
  const [addUsername, setAddUsername] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    const r = await fetch('/api/friends/requests');
    if (r.ok) {
      const data = await r.json();
      setSent(data.sent);
      setReceived(data.received);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 5000);
    return () => clearInterval(interval);
  }, [fetchRequests]);

  async function sendRequest(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    setAddSuccess('');
    if (!addUsername.trim()) return;
    setAddLoading(true);
    try {
      const r = await fetch('/api/friends/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: addUsername.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { setAddError(data.error); return; }
      setAddSuccess(`Friend request sent to ${addUsername.trim()}`);
      setAddUsername('');
      fetchRequests();
    } finally {
      setAddLoading(false);
    }
  }

  async function respond(requestId: string, action: 'accept' | 'decline' | 'cancel') {
    setActionLoading(requestId);
    try {
      const r = await fetch('/api/friends/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action }),
      });
      if (r.ok) {
        fetchRequests();
        onPendingCountChange();
        if (action === 'accept') onRequestAccepted();
      }
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div style={styles.pane}>
      <div style={styles.header}>
        <h1 style={styles.title}>FRIENDS</h1>
      </div>

      <div style={styles.content}>
        {/* Add friend */}
        <div style={styles.addSection}>
          <p style={styles.sectionLabel}>ADD FRIEND</p>
          <form onSubmit={sendRequest} style={styles.addForm}>
            <input
              value={addUsername}
              onChange={e => { setAddUsername(e.target.value); setAddError(''); setAddSuccess(''); }}
              placeholder="Enter username…"
              style={styles.addInput}
            />
            <button type="submit" disabled={addLoading || !addUsername.trim()} style={{
              ...styles.addBtn,
              opacity: addLoading || !addUsername.trim() ? 0.5 : 1,
            }}>
              {addLoading ? <span className="spinner spinner--sm spinner--dark" /> : 'SEND'}
            </button>
          </form>
          {addError && (
            <p style={{ fontSize: 11, color: 'var(--danger)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
              ✕ {addError}
            </p>
          )}
          {addSuccess && (
            <p style={{ fontSize: 11, color: 'var(--success)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
              ✓ {addSuccess}
            </p>
          )}
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            onClick={() => setTab('received')}
            style={{ ...styles.tabBtn, ...(tab === 'received' ? styles.tabActive : styles.tabInactive) }}
          >
            INCOMING
            {received.length > 0 && (
              <span style={styles.tabBadge}>{received.length}</span>
            )}
          </button>
          <button
            onClick={() => setTab('sent')}
            style={{ ...styles.tabBtn, ...(tab === 'sent' ? styles.tabActive : styles.tabInactive) }}
          >
            SENT
            {sent.length > 0 && (
              <span style={{ ...styles.tabBadge, background: 'var(--bg-4)', color: 'var(--text-2)' }}>{sent.length}</span>
            )}
          </button>
        </div>

        {/* Request list */}
        <div style={styles.list}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <span className="spinner" />
            </div>
          ) : tab === 'received' ? (
            received.length === 0 ? (
              <Empty text="No incoming friend requests" />
            ) : (
              received.map(req => (
                <RequestCard
                  key={req.id}
                  username={req.fromUser!.username}
                  bio={req.fromUser!.bio}
                  avatar={(req.fromUser as any).avatar}
                  date={req.createdAt}
                  loading={actionLoading === req.id}
                  actions={
                    <>
                      <ActionBtn
                        label="ACCEPT"
                        variant="primary"
                        onClick={() => respond(req.id, 'accept')}
                        disabled={actionLoading === req.id}
                      />
                      <ActionBtn
                        label="DECLINE"
                        variant="danger"
                        onClick={() => respond(req.id, 'decline')}
                        disabled={actionLoading === req.id}
                      />
                    </>
                  }
                />
              ))
            )
          ) : (
            sent.length === 0 ? (
              <Empty text="No pending outgoing requests" />
            ) : (
              sent.map(req => (
                <RequestCard
                  key={req.id}
                  username={req.toUser!.username}
                  bio={req.toUser!.bio}
                  avatar={(req.toUser as any).avatar}
                  date={req.createdAt}
                  loading={actionLoading === req.id}
                  actions={
                    <ActionBtn
                      label="CANCEL"
                      variant="ghost"
                      onClick={() => respond(req.id, 'cancel')}
                      disabled={actionLoading === req.id}
                    />
                  }
                />
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
}

function RequestCard({ username, bio, date, actions, loading, avatar }: {
  username: string; bio: string; date: string; avatar?: string | null;
  actions: React.ReactNode; loading: boolean;
}) {
  return (
    <div style={{ ...styles.card, opacity: loading ? 0.6 : 1 }} className="animate-fade-in">
      <Avatar username={username} avatar={avatar} size={36} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={styles.cardName}>{username}</div>
        {bio && <div style={styles.cardBio}>{bio}</div>}
        <div style={styles.cardDate}>{new Date(date).toLocaleDateString()}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
        {loading ? <span className="spinner" /> : actions}
      </div>
    </div>
  );
}

function ActionBtn({ label, variant, onClick, disabled }: {
  label: string; variant: 'primary' | 'danger' | 'ghost';
  onClick: () => void; disabled: boolean;
}) {
  const variantStyles: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--text)', color: 'var(--bg)', border: 'none' },
    danger: { background: 'var(--danger-dim)', color: 'var(--danger)', border: '1px solid rgba(255,51,51,0.3)' },
    ghost: { background: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '5px 12px',
        fontSize: 10,
        letterSpacing: '0.08em',
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        transition: 'opacity var(--transition)',
        opacity: disabled ? 0.5 : 1,
        ...variantStyles[variant],
      }}
    >
      {label}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}>
      {text}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    overflow: 'hidden',
    background: 'var(--bg)',
  },
  header: {
    padding: '0 32px',
    height: 60,
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-1)',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
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
    padding: '24px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: '0.14em',
    color: 'var(--text-3)',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    marginBottom: 10,
  },
  addSection: {
    background: 'var(--bg-1)',
    border: '1px solid var(--border)',
    padding: '20px',
    borderRadius: 'var(--radius-md)',
  },
  addForm: {
    display: 'flex',
    gap: 8,
  },
  addInput: {
    flex: 1,
    background: 'var(--bg-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '9px 12px',
    color: 'var(--text)',
    outline: 'none',
    fontSize: 13,
    fontFamily: 'var(--font-mono)',
    transition: 'border-color var(--transition)',
  },
  addBtn: {
    padding: '9px 18px',
    background: 'var(--text)',
    color: 'var(--bg)',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: '0.08em',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexShrink: 0,
    transition: 'opacity var(--transition)',
  },
  tabs: {
    display: 'flex',
    gap: 1,
    borderBottom: '1px solid var(--border)',
  },
  tabBtn: {
    padding: '8px 16px',
    fontSize: 11,
    letterSpacing: '0.08em',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    cursor: 'pointer',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    transition: 'color var(--transition), border-color var(--transition)',
    borderBottom: '2px solid transparent',
  },
  tabActive: {
    color: 'var(--text)',
    background: 'transparent',
    borderBottom: '2px solid var(--text)',
  },
  tabInactive: {
    color: 'var(--text-3)',
    background: 'transparent',
  },
  tabBadge: {
    background: 'var(--text)',
    color: 'var(--bg)',
    borderRadius: 2,
    padding: '1px 5px',
    fontSize: 9,
    fontWeight: 800,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  card: {
    background: 'var(--bg-1)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '14px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    transition: 'opacity var(--transition)',
  },
  cardName: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 13,
    color: 'var(--text)',
  },
  cardBio: {
    fontSize: 11,
    color: 'var(--text-3)',
    marginTop: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cardDate: {
    fontSize: 10,
    color: 'var(--text-3)',
    marginTop: 3,
    fontFamily: 'var(--font-mono)',
  },
};
