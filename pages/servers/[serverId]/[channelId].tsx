import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import ServerSidebar from '@/components/server/ServerSidebar';
import ServerChatPane from '@/components/server/ServerChatPane';
import MemberListPane from '@/components/server/MemberListPane';
import ServerSettingsModal from '@/components/server/ServerSettingsModal';

export interface ServerRole {
  id: string;
  name: string;
  color: string;
  permissions: Record<string, boolean>;
  position: number;
  isDefault: boolean;
}

export interface ServerCategory {
  id: string;
  name: string;
  position: number;
}

export interface ServerChannel {
  id: string;
  name: string;
  topic: string;
  type: string;
  categoryId: string | null;
  position: number;
  isPrivate: boolean;
  allowedRoles: string[];
  allowedMembers: string[];
}

export interface ServerMember {
  userId: string;
  username: string;
  nickname: string | null;
  roles: string[];
  joinedAt: string;
  bio: string;
  pronouns: string;
  avatar: string | null;
  mutedUntil: string | null;
  lastOnline: string | null;
}

export interface ServerData {
  id: string;
  name: string;
  icon: string | null;
  ownerId: string;
  roles: ServerRole[];
  categories: ServerCategory[];
  channels: ServerChannel[];
  members: ServerMember[];
  bannedUsers: string[];
}

export interface CurrentUser {
  id: string;
  username: string;
  email: string;
  bio: string;
  registeredAt: string;
}

export default function ServerPage() {
  const router = useRouter();
  const { serverId, channelId } = router.query;

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [server, setServer] = useState<ServerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showMembers, setShowMembers] = useState(true);

  // Auth check
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => { if (!r.ok) { router.replace('/'); return null; } return r.json(); })
      .then(data => { if (data) setUser(data.user); })
      .catch(() => router.replace('/'));
  }, [router]);

  const fetchServer = useCallback(async () => {
    if (!serverId) return;
    const r = await fetch(`/api/servers/${serverId}`);
    if (!r.ok) { router.replace('/friends/all'); return; }
    const data = await r.json();
    setServer(data.server);
    setLoading(false);
  }, [serverId, router]);

  useEffect(() => {
    if (user && serverId) fetchServer();
  }, [user, serverId, fetchServer]);

  // If no channelId in URL, redirect to first channel
  useEffect(() => {
    if (!server || channelId) return;
    const firstChannel = server.channels[0];
    if (firstChannel) {
      router.replace(`/servers/${server.id}/${firstChannel.id}`, undefined, { shallow: false });
    }
  }, [server, channelId, router]);

  const activeChannel = server?.channels.find(c => c.id === channelId) || null;

  const myMember = server && user ? server.members.find(m => m.userId === user.id) : null;
  const isOwner = server && user ? server.ownerId === user.id : false;

  function hasPermission(perm: string) {
    if (isOwner) return true;
    if (!myMember || !server) return false;
    // Check both assigned roles AND the @everyone role (isDefault)
    return server.roles.some(role => {
      const applies = role.isDefault || myMember.roles.includes(role.id);
      return applies && (role.permissions?.[perm] || role.permissions?.administrator);
    });
  }

  function navigateToChannel(chId: string) {
    router.push(`/servers/${serverId}/${chId}`, undefined, { shallow: true });
  }

  if (loading || !user) {
    return (
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div className="spinner" style={{ width: 24, height: 24 }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.15em', color: 'var(--text-3)' }}>
            LOADING
          </span>
        </div>
      </div>
    );
  }

  if (!server) return null;

  return (
    <>
      <Head><title>{server.name} — PALEROCK</title></Head>
      <div style={styles.layout}>
        <ServerSidebar
          server={server}
          activeChannelId={channelId as string || null}
          currentUser={user}
          isOwner={isOwner}
          hasPermission={hasPermission}
          onChannelSelect={navigateToChannel}
          onOpenSettings={() => setShowSettings(true)}
          onServerUpdate={fetchServer}
        />
        <div style={styles.content}>
          {activeChannel ? (
            <ServerChatPane
              server={server}
              channel={activeChannel}
              currentUser={user}
              myMember={myMember}
              isOwner={isOwner}
              hasPermission={hasPermission}
              showMembers={showMembers}
              onToggleMembers={() => setShowMembers(v => !v)}
            />
          ) : (
            <div style={styles.empty}>
              <span>SELECT A CHANNEL</span>
            </div>
          )}
        </div>
        {showMembers && activeChannel && (
          <MemberListPane
            server={server}
            currentUserId={user.id}
            isOwner={isOwner}
            hasPermission={hasPermission}
            onServerUpdate={fetchServer}
          />
        )}
        {showSettings && (
          <ServerSettingsModal
            server={server}
            currentUser={user}
            isOwner={isOwner}
            hasPermission={hasPermission}
            onClose={() => setShowSettings(false)}
            onServerUpdate={fetchServer}
            onLeave={() => router.replace('/friends/all')}
          />
        )}
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    height: '100dvh',
    display: 'flex',
    overflow: 'hidden',
    background: 'var(--bg)',
  },
  content: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-3)',
    fontFamily: 'var(--font-display)',
    letterSpacing: '0.12em',
    fontSize: 12,
  },
};
