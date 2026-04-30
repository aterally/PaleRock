import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';
import type { User, Channel, ActiveView } from '@/pages/app';

export interface ServerStub {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
}

interface SidebarProps {
  user: User;
  channels: Channel[];
  servers: ServerStub[];
  activeView: ActiveView;
  activeChannelId: string | null;
  pendingCount: number;
  onViewChange: (v: ActiveView) => void;
  onChannelSelect: (id: string) => void;
  onLogout: () => void;
  onCreateServer: () => void;
  onServerUpdate: () => void;
}

export default function Sidebar({
  user, channels, servers, activeView, activeChannelId, pendingCount,
  onViewChange, onChannelSelect, onLogout, onCreateServer, onServerUpdate
}: SidebarProps) {
  const router = useRouter();
  const [logoError, setLogoError] = useState(false);

  return (
    <div style={styles.outerWrapper}>
      {/* Server rail */}
      <div data-server-rail="1" style={styles.serverRail}>
        {/* Home button */}
        <button
          style={{
            ...styles.serverIcon,
            background: activeView !== 'server' ? 'var(--bg-3)' : 'var(--bg-2)',
            borderColor: activeView !== 'server' ? 'var(--border-bright)' : 'var(--border)',
          }}
          onClick={() => router.push('/friends/all')}
          title="Direct Messages"
        >
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>P</span>
        </button>

        <div style={styles.railDivider} />

        {/* Server list */}
        {servers.map(srv => {
          const initials = srv.name.slice(0, 2).toUpperCase();
          const hue = srv.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
          const isActive = router.pathname.startsWith('/servers') && router.query.serverId === srv.id;
          return (
            <button
              key={srv.id}
              style={{
                ...styles.serverIcon,
                background: `hsl(${hue}, 8%, 15%)`,
                borderColor: isActive ? `hsl(${hue}, 20%, 40%)` : 'transparent',
                color: `hsl(${hue}, 20%, 75%)`,
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 14,
                outline: isActive ? `2px solid hsl(${hue}, 20%, 40%)` : 'none',
                outlineOffset: 2,
              }}
              title={srv.name}
              onClick={() => router.push(`/servers/${srv.id}`)}
            >
              {initials}
            </button>
          );
        })}

        {/* Create server */}
        <button
          style={{ ...styles.serverIcon, background: 'transparent', borderColor: 'var(--border)', color: 'var(--text-3)', fontSize: 20, fontWeight: 300 }}
          title="Create Server"
          onClick={onCreateServer}
        >
          +
        </button>
      </div>

      {/* Main sidebar - only show when not in server view */}
      <aside style={styles.sidebar}>
      {/* Logo */}
      <div style={styles.logoArea}>
        <div style={styles.logoMark}>
          {!logoError ? (
            <Image
              src="/assets/PALEROCK.png"
              alt="Palerock"
              width={28}
              height={28}
              style={{ objectFit: 'contain' }}
              onError={() => setLogoError(true)}
            />
          ) : (
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, letterSpacing: 2 }}>P</span>
          )}
        </div>
        <span style={styles.logoText}>PALEROCK</span>
      </div>

      {/* Nav */}
      <nav style={styles.nav}>
        <NavItem
          label="MESSAGES"
          active={activeView === 'chat'}
          onClick={() => channels.length > 0 ? router.push(`/messages/${channels[0].id}`) : router.push('/messages')}
          icon={<IconMessages />}
        />
        <NavItem
          label="FRIENDS"
          active={activeView === 'friends'}
          onClick={() => router.push('/friends/all')}
          icon={<IconFriends />}
          badge={pendingCount > 0 ? pendingCount : undefined}
        />
      </nav>

      <div style={styles.divider} />

      {/* DM List */}
      <div style={styles.dmSection}>
        <span style={styles.sectionLabel}>DIRECT MESSAGES</span>
        <div style={styles.dmList}>
          {channels.length === 0 ? (
            <p style={styles.emptyDm}>No conversations yet.<br />Add a friend to start.</p>
          ) : (
            channels.map(ch => (
              <DmItem
                key={ch.id}
                channel={ch}
                active={activeChannelId === ch.id}
                onClick={() => router.push(`/messages/${ch.id}`)}
              />
            ))
          )}
        </div>
      </div>

      {/* User footer */}
      <div style={styles.userFooter}>
        <button onClick={() => router.push('/profile')} style={{
          ...styles.userBtn,
          background: activeView === 'profile' ? 'var(--bg-3)' : 'transparent',
        }}>
          <Avatar username={user.username} avatar={(user as any).avatar} size={32} />
          <div style={styles.userInfo}>
            <span style={styles.userName}>{user.username}</span>
            {(user as any).isAdmin && (
              <span style={{ fontSize: 10, color: '#ff3b30', fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.08em' }}>ADMIN</span>
            )}
            {!(user as any).isAdmin && <span style={styles.userStatus}>online</span>}
          </div>
        </button>
        {(user as any).isAdmin && (
          <button
            onClick={() => router.push('/admin')}
            style={{ ...styles.logoutBtn, color: '#ff3b30' }}
            title="Admin Panel"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </button>
        )}
        <button onClick={onLogout} style={styles.logoutBtn} title="Sign out">
          <IconLogout />
        </button>
      </div>
    </aside>
    </div>
  );
}

function NavItem({ label, active, onClick, icon, badge }: {
  label: string; active: boolean; onClick: () => void;
  icon: React.ReactNode; badge?: number;
}) {
  return (
    <button onClick={onClick} style={{
      ...styles.navItem,
      background: active ? 'var(--bg-3)' : 'transparent',
      color: active ? '#ffffff' : '#d4d4d4',
      borderLeft: active ? '2px solid var(--text)' : '2px solid transparent',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {icon}
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, letterSpacing: '0.06em' }}>
          {label}
        </span>
      </span>
      {badge !== undefined && (
        <span style={styles.badge}>{badge > 9 ? '9+' : badge}</span>
      )}
    </button>
  );
}

function DmItem({ channel, active, onClick }: { channel: Channel; active: boolean; onClick: () => void }) {
  const other = channel.otherUser;
  if (!other) return null;
  const isOnline = other.lastOnline && (Date.now() - new Date(other.lastOnline).getTime()) < 5 * 60 * 1000;
  return (
    <button onClick={onClick} style={{
      ...styles.dmItem,
      background: active ? 'var(--bg-3)' : 'transparent',
      color: active ? '#ffffff' : '#e8e8e8',
    }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Avatar username={other.username} avatar={(other as any).avatar} size={24} />
        <span style={{
          position: 'absolute', bottom: -1, right: -1,
          width: 8, height: 8, borderRadius: '50%',
          background: isOnline ? '#23a55a' : 'var(--bg-3)',
          border: '2px solid var(--bg-1)',
        }} />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', textAlign: 'left' }}>
        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {other.username}
        </div>
        {channel.lastMessage ? (
          <div style={{ fontSize: 13, color: '#c8c8c8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {channel.lastMessage.content.slice(0, 30)}{channel.lastMessage.content.length > 30 ? '…' : ''}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: isOnline ? '#23a55a' : '#aaaaaa' }}>
            {isOnline ? 'Online' : other.lastOnline ? (() => {
              const diff = Date.now() - new Date(other.lastOnline!).getTime();
              const mins = Math.floor(diff / 60000);
              if (mins < 60) return `${mins}m ago`;
              const hrs = Math.floor(mins / 60);
              if (hrs < 24) return `${hrs}h ago`;
              return `${Math.floor(hrs / 24)}d ago`;
            })() : 'Offline'}
          </div>
        )}
      </div>
    </button>
  );
}

export function Avatar({ username, avatar, size = 32 }: { username: string; avatar?: string | null; size?: number }) {
  const initials = username.slice(0, 2).toUpperCase();
  const hue = username.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const avatarPixels: string[][] | null = (() => {
    if (!avatar) return null;
    try { return JSON.parse(avatar); } catch { return null; }
  })();

  if (avatarPixels) {
    return (
      <canvas
        ref={el => {
          if (!el) return;
          const ctx = el.getContext('2d')!;
          ctx.clearRect(0, 0, size, size);
          const cellSize = size / 16;
          for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
            if (avatarPixels[r][c] !== 'transparent') {
              ctx.fillStyle = avatarPixels[r][c];
              ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
            }
          }
        }}
        width={size}
        height={size}
        style={{
          width: size, height: size,
          borderRadius: 'var(--radius)',
          imageRendering: 'pixelated',
          display: 'block',
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: 'var(--radius)',
      background: `hsl(${hue}, 10%, 20%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-display)', fontWeight: 800,
      fontSize: size * 0.38, color: `hsl(${hue}, 20%, 80%)`,
      flexShrink: 0, letterSpacing: 1,
      userSelect: 'none',
    }}>
      {initials}
    </div>
  );
}

// Icons
const IconMessages = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const IconFriends = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconLogout = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const styles: Record<string, React.CSSProperties> = {
  outerWrapper: {
    display: 'flex',
    height: '100dvh',
    flexShrink: 0,
  },
  serverRail: {
    width: 56,
    minWidth: 56,
    height: '100dvh',
    background: 'var(--bg-1)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '10px 0',
    gap: 6,
    overflowY: 'auto',
  },
  serverIcon: {
    width: 36,
    height: 36,
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    border: '1px solid transparent',
    transition: 'all var(--transition)',
    flexShrink: 0,
    color: 'var(--text-2)',
  },
  railDivider: {
    width: 24,
    height: 1,
    background: 'var(--border)',
    margin: '2px 0',
    flexShrink: 0,
  },
  sidebar: {
    width: 'var(--sidebar-width)',
    minWidth: 'var(--sidebar-width)',
    height: '100dvh',
    background: 'var(--bg-1)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  logoArea: {
    padding: '0 16px',
    height: 60,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  logoMark: {
    width: 28, height: 28,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  logoText: {
    fontFamily: 'var(--font-display)', fontWeight: 800,
    fontSize: 13, letterSpacing: '0.16em', color: '#ffffff',
  },
  nav: {
    padding: '12px 0',
  },
  navItem: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '11px 18px',
    cursor: 'pointer',
    transition: 'background var(--transition), color var(--transition)',
    border: 'none',
  },
  badge: {
    background: 'var(--text)',
    color: 'var(--bg)',
    borderRadius: 2,
    padding: '1px 5px',
    fontSize: 9,
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    letterSpacing: '0.05em',
  },
  divider: {
    height: 1, background: 'var(--border)', margin: 0,
  },
  dmSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: '14px 0 10px',
  },
  sectionLabel: {
    padding: '0 16px 8px',
    fontSize: 13,
    letterSpacing: '0.14em',
    color: '#d4d4d4',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
  },
  dmList: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    padding: '0 4px',
  },
  dmItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    border: 'none',
    width: '100%',
    transition: 'background var(--transition), color var(--transition)',
  },
  emptyDm: {
    padding: '16px',
    fontSize: 11,
    color: '#d4d4d4',
    lineHeight: 1.8,
    textAlign: 'center',
  },
  userFooter: {
    borderTop: '1px solid var(--border)',
    padding: '12px 10px',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  userBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    border: 'none',
    transition: 'background var(--transition)',
    textAlign: 'left',
  },
  userInfo: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  userName: {
    fontSize: 15,
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  userStatus: {
    fontSize: 13,
    color: 'var(--success)',
    fontFamily: 'var(--font-display)',
  },
  logoutBtn: {
    padding: '8px',
    borderRadius: 'var(--radius)',
    color: '#d4d4d4',
    cursor: 'pointer',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    transition: 'color var(--transition), background var(--transition)',
    flexShrink: 0,
  },
};
