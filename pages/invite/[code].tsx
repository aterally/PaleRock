import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function InvitePage() {
  const router = useRouter();
  const { code } = router.query;
  const [invite, setInvite] = useState<{ serverName: string; memberCount: number; expiresAt: string | null } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/invite/info/${code}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setInvite(data.invite);
        setLoading(false);
      })
      .catch(() => { setError('Failed to load invite'); setLoading(false); });
  }, [code]);

  async function handleJoin() {
    setJoining(true);
    const r = await fetch(`/api/invite/${code}`, { method: 'POST' });
    const data = await r.json();
    if (data.error) {
      if (r.status === 401) {
        router.push(`/?redirect=/invite/${code}`);
        return;
      }
      setError(data.error);
      setJoining(false);
      return;
    }
    router.push(`/servers/${data.serverId}/${data.channelId}`);
  }

  return (
    <>
      <Head><title>Invite — PALEROCK</title></Head>
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.logoRow}>
            <span style={styles.logo}>PALEROCK</span>
          </div>
          {loading ? (
            <p style={styles.sub}>Loading invite...</p>
          ) : error ? (
            <>
              <p style={styles.errorText}>{error}</p>
              <button style={styles.btn} onClick={() => router.push('/')}>Go Home</button>
            </>
          ) : invite ? (
            <>
              <div style={styles.serverIcon}>
                {invite.serverName.slice(0, 2).toUpperCase()}
              </div>
              <p style={styles.sub}>You've been invited to join</p>
              <h2 style={styles.serverName}>{invite.serverName}</h2>
              <p style={styles.meta}>{invite.memberCount} member{invite.memberCount !== 1 ? 's' : ''}</p>
              <button style={styles.btn} onClick={handleJoin} disabled={joining}>
                {joining ? 'Joining...' : 'Accept Invite'}
              </button>
              <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={() => router.push('/')}>
                Decline
              </button>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    height: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#000',
    fontFamily: "'Times New Roman', Times, serif",
  },
  card: {
    background: '#0a0a0a',
    border: '1px solid #2a2a2a',
    borderRadius: 4,
    padding: '48px 40px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    minWidth: 320,
    maxWidth: 400,
    width: '100%',
  },
  logoRow: {
    marginBottom: 8,
  },
  logo: {
    fontFamily: "'Times New Roman', Times, serif",
    fontWeight: 800,
    fontSize: 18,
    letterSpacing: '0.2em',
    color: '#fff',
  },
  serverIcon: {
    width: 64,
    height: 64,
    borderRadius: 4,
    background: '#1a1a1a',
    border: '1px solid #3a3a3a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Times New Roman', Times, serif",
    fontWeight: 800,
    fontSize: 24,
    color: '#fff',
  },
  sub: {
    color: '#666',
    fontSize: 12,
    letterSpacing: '0.05em',
  },
  serverName: {
    fontFamily: "'Times New Roman', Times, serif",
    fontSize: 24,
    fontWeight: 600,
    color: '#fff',
    textAlign: 'center',
  },
  meta: {
    fontSize: 11,
    color: '#33ff99',
    letterSpacing: '0.08em',
  },
  btn: {
    width: '100%',
    padding: '11px 0',
    background: '#fff',
    color: '#000',
    border: 'none',
    borderRadius: 2,
    fontSize: 12,
    fontFamily: "'Times New Roman', Times, serif",
    fontWeight: 700,
    letterSpacing: '0.1em',
    cursor: 'pointer',
    marginTop: 4,
  },
  btnSecondary: {
    background: 'transparent',
    color: '#666',
    border: '1px solid #2a2a2a',
  },
  errorText: {
    color: '#ff3333',
    fontSize: 13,
    textAlign: 'center',
  },
};
