import { useState, useEffect } from 'react';
import type { ServerData, ServerRole } from '@/pages/servers/[serverId]/[channelId]';
import { Avatar } from '@/components/Sidebar';

interface Member {
  userId: string;
  username: string;
  nickname?: string | null;
  bio?: string;
  pronouns?: string;
  avatar?: string | null;
  roles: string[];
  joinedAt: string;
  mutedUntil?: string | null;
  lastOnline?: string | null;
}

interface Props {
  member: Member;
  server: ServerData;
  currentUserId: string;
  isOwner: boolean;
  isAdmin?: boolean;
  hasPermission: (perm: string) => boolean;
  onClose: () => void;
  onServerUpdate: () => void;
  blockedUsers: Set<string>;
  onBlock: (userId: string) => void;
  onUnblock: (userId: string) => void;
}

export default function MemberPanel({
  member, server, currentUserId, isOwner, isAdmin,
  hasPermission, onClose, onServerUpdate, blockedUsers, onBlock, onUnblock
}: Props): JSX.Element {
  const [tab, setTab] = useState<'info' | 'roles' | 'actions'>('info');
  const [muteMinutes, setMuteMinutes] = useState('10');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [loadingRoles, setLoadingRoles] = useState<Set<string>>(new Set());

  const canKick = isOwner || hasPermission('kickMembers');
  const canBan = isOwner || hasPermission('banMembers');
  const canMute = isOwner || hasPermission('muteMembers');
  const canManageRoles = isOwner || hasPermission('manageRoles');
  const isMe = member.userId === currentUserId;
  const isMemberOwner = member.userId === server.ownerId;
  const isMuted = member.mutedUntil && new Date(member.mutedUntil).getTime() > Date.now();
  const isBlocked = blockedUsers.has(member.userId);

  const memberRoles = server.roles.filter(r => !r.isDefault && member.roles.includes(r.id));
  const nonDefaultRoles = server.roles.filter(r => !r.isDefault);

  const hue = member.username.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const isOnline = member.lastOnline && (Date.now() - new Date(member.lastOnline).getTime()) < 5 * 60 * 1000;

  function mutedLabel() {
    if (!member.mutedUntil) return '';
    const msLeft = new Date(member.mutedUntil).getTime() - Date.now();
    const totalMins = Math.ceil(msLeft / 60000);
    if (totalMins < 60) return `Muted ${totalMins}m`;
    if (totalMins < 1440) return `Muted ${Math.ceil(totalMins / 60)}h`;
    return `Muted ${Math.ceil(totalMins / 1440)}d`;
  }

  function lastSeenLabel(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  async function doAction(action: string, fn: () => Promise<void>) {
    setLoadingAction(action);
    try { await fn(); } finally { setLoadingAction(null); }
  }

  async function kick() {
    if (!confirm(`Kick ${member.username}?`)) return;
    await doAction('kick', async () => {
      await fetch(`/api/servers/${server.id}/members/${member.userId}`, { method: 'DELETE' });
      onServerUpdate(); onClose();
    });
  }

  async function ban() {
    if (!confirm(`Ban ${member.username}? They won't be able to rejoin.`)) return;
    await doAction('ban', async () => {
      await fetch(`/api/servers/${server.id}/members/${member.userId}?action=ban`, { method: 'DELETE' });
      onServerUpdate(); onClose();
    });
  }

  async function mute() {
    const mins = parseInt(muteMinutes);
    if (isNaN(mins) || mins <= 0) return;
    await doAction('mute', async () => {
      await fetch(`/api/servers/${server.id}/members/${member.userId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mute: true, muteDuration: mins }),
      });
      onServerUpdate();
    });
  }

  async function unmute() {
    await doAction('unmute', async () => {
      await fetch(`/api/servers/${server.id}/members/${member.userId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mute: false, muteDuration: 0 }),
      });
      onServerUpdate();
    });
  }

  async function adminSiteBanUser() {
    if (!confirm(`SITE-BAN ${member.username}? They will not be able to log in anywhere.`)) return;
    await doAction('adminBan', async () => {
      await fetch(`/api/admin/users?userId=${member.userId}&action=ban`, { method: 'POST' });
      onServerUpdate();
    });
  }

  async function adminDeleteUser() {
    if (!confirm(`Permanently DELETE user "${member.username}"? This cannot be undone.`)) return;
    if (!confirm(`Are you absolutely sure? All data for this user will be gone.`)) return;
    await doAction('adminDelete', async () => {
      await fetch(`/api/admin/users?userId=${member.userId}&action=delete`, { method: 'POST' });
      onClose();
      onServerUpdate();
    });
  }


  async function toggleRole(roleId: string, has: boolean) {
    setLoadingRoles(prev => new Set(prev).add(roleId));
    await fetch(`/api/servers/${server.id}/members/${member.userId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(has ? { removeRoles: [roleId] } : { addRoles: [roleId] }),
    });
    setLoadingRoles(prev => { const s = new Set(prev); s.delete(roleId); return s; });
    onServerUpdate();
  }

  // Detect desktop vs mobile: desktop = viewport width >= 768px
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          zIndex: 9990, backdropFilter: 'blur(2px)',
        }}
        onClick={onClose}
      />

      {/* Panel — centered popup on desktop, slides up from bottom on mobile */}
      <div className="member-panel" style={isDesktop ? {
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 480, maxWidth: 'calc(100vw - 32px)',
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 16,
        zIndex: 9991, maxHeight: '85dvh', display: 'flex', flexDirection: 'column',
        animation: 'memberPopupIn 0.22s cubic-bezier(0.34,1.1,0.64,1) forwards',
        boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
      } : {
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--bg-2)', borderTop: '1px solid var(--border)',
        borderRadius: '20px 20px 0 0',
        zIndex: 9991, maxHeight: '90dvh', display: 'flex', flexDirection: 'column',
        animation: 'memberPanelIn 0.28s cubic-bezier(0.34,1.1,0.64,1) forwards',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
      }}>
        <style>{`
          @keyframes memberPanelIn {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          @keyframes memberPopupIn {
            from { transform: translate(-50%, -48%) scale(0.96); opacity: 0; }
            to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          }
          .member-panel-tab { padding: 8px 16px; border: none; background: transparent; cursor: pointer; font-family: var(--font-display); font-weight: 700; font-size: 11px; letter-spacing: 0.1em; color: var(--text-3); border-bottom: 2px solid transparent; transition: all 0.15s; }
          .member-panel-tab.active { color: var(--text); border-bottom-color: var(--text); }
          .member-panel-action { display: flex; align-items: center; gap: 12px; padding: 14px 20px; border: none; background: transparent; cursor: pointer; font-family: var(--font-display); font-size: 14px; font-weight: 600; width: 100%; text-align: left; border-radius: 8px; transition: background 0.12s; }
          .member-panel-action:hover { background: var(--bg-3); }
          .member-panel-action:disabled { opacity: 0.5; cursor: not-allowed; }
          .role-toggle-btn { padding: 4px 12px; border: none; border-radius: 4px; cursor: pointer; font-family: var(--font-display); font-weight: 700; font-size: 11px; transition: all 0.12s; }
        `}</style>

        {/* Drag handle — only on mobile */}
        {!isDesktop && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--bg-3)' }} />
          </div>
        )}

        {/* Header: avatar + name */}
        <div style={{ padding: isDesktop ? '20px 20px 0' : '12px 20px 0', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Avatar username={member.username} avatar={member.avatar} size={52} />
            <span style={{
              position: 'absolute', bottom: 0, right: 0, width: 13, height: 13,
              borderRadius: '50%', background: isOnline ? '#23a55a' : 'var(--bg-3)',
              border: '2px solid var(--bg-2)',
            }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--text)', letterSpacing: '0.02em' }}>
                {member.nickname || member.username}
              </span>
              {isMemberOwner && <span style={{ fontSize: 10, color: '#ffd700', fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.08em' }}>OWNER</span>}
              {isMe && <span style={{ fontSize: 10, color: '#23a55a', fontFamily: 'var(--font-display)', fontWeight: 700 }}>YOU</span>}
              {isMuted && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(237,66,69,0.12)', color: '#ed4245', border: '1px solid rgba(237,66,69,0.3)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>{mutedLabel()}</span>}
            </div>
            {member.nickname && <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>@{member.username}</div>}
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? '#23a55a' : 'var(--bg-3)', display: 'inline-block', flexShrink: 0 }} />
              {isOnline ? 'Online' : member.lastOnline ? lastSeenLabel(member.lastOnline) : 'Offline'}
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-3)', background: 'var(--bg-3)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '12px 16px 0', borderBottom: '1px solid var(--border)' }}>
          {(['info', 'roles', 'actions'] as const).map(t => (
            <button key={t} className={`member-panel-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 32px' }}>

          {/* INFO TAB */}
          {tab === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {member.bio && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>ABOUT ME</div>
                  <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>{member.bio}</div>
                </div>
              )}
              {member.pronouns && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>PRONOUNS</div>
                  <div style={{ fontSize: 14, color: 'var(--text-2)', fontStyle: 'italic' }}>{member.pronouns}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>JOINED SERVER</div>
                <div style={{ fontSize: 14, color: 'var(--text-2)' }}>{new Date(member.joinedAt).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}</div>
              </div>
              {memberRoles.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', marginBottom: 8 }}>ROLES</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {memberRoles.map(r => (
                      <span key={r.id} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 4, border: `1px solid ${r.color}55`, color: r.color, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                        {r.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ROLES TAB */}
          {tab === 'roles' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!canManageRoles && !isMe && (
                <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '12px 0' }}>You don't have permission to manage roles.</div>
              )}
              {nonDefaultRoles.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '12px 0' }}>No roles in this server yet.</div>
              )}
              {nonDefaultRoles.map(role => {
                const has = member.roles.includes(role.id);
                const isLoading = loadingRoles.has(role.id);
                return (
                  <div key={role.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--bg-3)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: role.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 14, color: 'var(--text-2)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>{role.name}</span>
                    </div>
                    {canManageRoles && !isMe && (
                      <button
                        className="role-toggle-btn"
                        style={{ background: has ? 'var(--text)' : 'var(--bg)', color: has ? 'var(--bg)' : 'var(--text-3)', border: '1px solid var(--border)', opacity: isLoading ? 0.6 : 1 }}
                        onClick={() => !isLoading && toggleRole(role.id, has)}
                        disabled={isLoading}
                      >
                        {isLoading ? '...' : has ? 'Remove' : 'Add'}
                      </button>
                    )}
                    {has && (isMe || !canManageRoles) && (
                      <span style={{ fontSize: 10, color: role.color, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.06em' }}>ASSIGNED</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ACTIONS TAB */}
          {tab === 'actions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {!isMe && !isMemberOwner && canMute && (
                <>
                  {isMuted ? (
                    <button className="member-panel-action" style={{ color: '#23a55a' }} onClick={unmute} disabled={loadingAction === 'unmute'}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                      {loadingAction === 'unmute' ? 'Unmuting...' : 'Unmute Member'}
                    </button>
                  ) : (
                    <>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em', fontFamily: 'var(--font-display)', fontWeight: 700, padding: '8px 20px 4px' }}>MUTE DURATION</div>
                      <div style={{ display: 'flex', gap: 6, padding: '4px 20px 8px', flexWrap: 'wrap' }}>
                        {([['5m','5'],['15m','15'],['30m','30'],['1h','60'],['6h','360'],['24h','1440']] as [string,string][]).map(([label, val]) => (
                          <button key={label} onClick={() => setMuteMinutes(val)} style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: muteMinutes === val ? 'var(--text)' : 'var(--bg-3)', color: muteMinutes === val ? 'var(--bg)' : 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600 }}>{label}</button>
                        ))}
                      </div>
                      <button className="member-panel-action" style={{ color: 'var(--text-2)' }} onClick={mute} disabled={loadingAction === 'mute'}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
                        {loadingAction === 'mute' ? 'Muting...' : `Mute ${muteMinutes}m`}
                      </button>
                      <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                    </>
                  )}
                </>
              )}

              {!isMe && !isMemberOwner && canKick && (
                <button className="member-panel-action" style={{ color: '#ffa000' }} onClick={kick} disabled={loadingAction === 'kick'}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1"/></svg>
                  {loadingAction === 'kick' ? 'Kicking...' : 'Kick from Server'}
                </button>
              )}

              {!isMe && !isMemberOwner && canBan && (
                <button className="member-panel-action" style={{ color: '#ed4245' }} onClick={ban} disabled={loadingAction === 'ban'}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                  {loadingAction === 'ban' ? 'Banning...' : 'Ban from Server'}
                </button>
              )}

              {!isMe && (
                <>
                  <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                  {isBlocked ? (
                    <button className="member-panel-action" style={{ color: '#23a55a' }} onClick={() => { onUnblock(member.userId); onClose(); }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      Unblock User
                    </button>
                  ) : (
                    <button className="member-panel-action" style={{ color: '#ed4245' }} onClick={() => { onBlock(member.userId); onClose(); }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                      Block User
                    </button>
                  )}
                </>
              )}

              {isMe && (
                <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '12px 0' }}>No actions available for yourself.</div>
              )}
              {isMemberOwner && !isMe && (
                <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '12px 0' }}>The server owner cannot be moderated.</div>
              )}

              {/* ADMIN ACTIONS */}
              {isAdmin && !isMe && (
                <>
                  <div style={{ height: 1, background: 'var(--border)', margin: '12px 0 8px' }} />
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#ff3b30', fontFamily: 'var(--font-display)', padding: '0 20px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    ADMIN TOOLS
                  </div>
                  <button className="member-panel-action" style={{ color: '#ff3b30' }} onClick={adminSiteBanUser} disabled={loadingAction === 'adminBan'}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                    {loadingAction === 'adminBan' ? 'Banning...' : 'Site-Ban User'}
                  </button>
                  <button className="member-panel-action" style={{ color: '#ff3b30' }} onClick={adminDeleteUser} disabled={loadingAction === 'adminDelete'}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    {loadingAction === 'adminDelete' ? 'Deleting...' : 'Delete User Account'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
