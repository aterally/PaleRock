import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ServerData, ServerRole } from '@/pages/servers/[serverId]/[channelId]';
import { Avatar } from '@/components/Sidebar';
import MemberPanel from '@/components/server/MemberPanel';

// Long-press hook for touch devices
function useLongPress(callback: (e: React.TouchEvent) => void, ms = 500) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const movedRef = useRef(false);

  const start = useCallback((e: React.TouchEvent) => {
    movedRef.current = false;
    timerRef.current = setTimeout(() => {
      if (!movedRef.current) callback(e);
    }, ms);
  }, [callback, ms]);

  const cancel = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const move = useCallback(() => { movedRef.current = true; cancel(); }, [cancel]);

  return { onTouchStart: start, onTouchEnd: cancel, onTouchMove: move, onTouchCancel: cancel };
}

interface Props {
  server: ServerData;
  currentUserId: string;
  isOwner: boolean;
  isAdmin?: boolean;
  hasPermission: (perm: string) => boolean;
  onServerUpdate: () => void;
}

interface CtxMenu { x: number; y: number; userId: string; username: string; }
interface ProfileCard { userId: string; x: number; y: number; }

export default function MemberListPane({ server, currentUserId, isOwner, isAdmin, hasPermission, onServerUpdate }: Props) {
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [profile, setProfile] = useState<ProfileCard | null>(null);
  const [panelMemberId, setPanelMemberId] = useState<string | null>(null);
  const [muteModal, setMuteModal] = useState<{ userId: string; username: string } | null>(null);
  const [muteDuration, setMuteDuration] = useState('10');
  const [showRoleModal, setShowRoleModal] = useState<string | null>(null);

  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/user/block').then(r => r.ok ? r.json() : null).then(data => {
      if (data) setBlockedUsers(new Set(data.blocked.map((u: { id: string }) => u.id)));
    });
  }, []);

  async function blockUser(userId: string) {
    await fetch('/api/user/block', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    setBlockedUsers(prev => new Set([...prev, userId]));
    setCtxMenu(null);
  }

  async function unblockUser(userId: string) {
    await fetch('/api/user/block', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    setBlockedUsers(prev => { const next = new Set(prev); next.delete(userId); return next; });
    setCtxMenu(null);
  }

  const canKick = isOwner || hasPermission('kickMembers');
  const canBan = isOwner || hasPermission('banMembers');
  const canMute = isOwner || hasPermission('muteMembers');
  const canManageRoles = isOwner || hasPermission('manageRoles');

  useEffect(() => {
    function close(e: MouseEvent) {
      if (e.button !== 0) return; // ignore right-click mousedown
      const t = e.target as HTMLElement;
      if (!t.closest('[data-ctx]')) setCtxMenu(null);
      if (!t.closest('[data-profile]')) setProfile(null);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const getHighestRole = (roles: string[]): ServerRole | null => {
    let best: ServerRole | null = null;
    for (const id of roles) {
      const r = server.roles.find(ro => ro.id === id);
      if (r && (!best || r.position > best.position)) best = r;
    }
    return best;
  };

  const ownerMember = server.members.find(m => m.userId === server.ownerId);
  const others = server.members
    .filter(m => m.userId !== server.ownerId)
    .sort((a, b) => (getHighestRole(b.roles)?.position || 0) - (getHighestRole(a.roles)?.position || 0));
  const allMembers = ownerMember ? [ownerMember, ...others] : others;

  function openCtx(e: React.MouseEvent, m: typeof allMembers[0]) {
    e.preventDefault(); e.stopPropagation();
    if (m.userId === currentUserId) return;
    setProfile(null);
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 300);
    setCtxMenu({ x, y, userId: m.userId, username: m.username });
  }

  function openCtxTouch(m: typeof allMembers[0]) {
    if (m.userId === currentUserId) {
      // Still show panel for yourself (info-only)
      setPanelMemberId(m.userId);
      return;
    }
    setProfile(null);
    setCtxMenu(null);
    setPanelMemberId(m.userId);
  }

  function openProfile(e: React.MouseEvent, m: typeof allMembers[0]) {
    e.stopPropagation();
    setCtxMenu(null);
    const rect = (e.currentTarget as HTMLElement).closest('[data-member-row]')?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(8, rect.left - 328);
    const y = Math.max(8, Math.min(rect.top, window.innerHeight - 380));
    setProfile({ userId: m.userId, x, y });
  }

  async function kick(userId: string, username: string) {
    setCtxMenu(null);
    if (!confirm(`Kick ${username}?`)) return;
    await fetch(`/api/servers/${server.id}/members/${userId}`, { method: 'DELETE' });
    onServerUpdate();
  }

  async function ban(userId: string, username: string) {
    setCtxMenu(null);
    if (!confirm(`Ban ${username}? They won't be able to rejoin.`)) return;
    await fetch(`/api/servers/${server.id}/members/${userId}?action=ban`, { method: 'DELETE' });
    onServerUpdate();
  }

  async function mute(userId: string) {
    const mins = parseInt(muteDuration);
    if (isNaN(mins) || mins <= 0) return;
    await fetch(`/api/servers/${server.id}/members/${userId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mute: true, muteDuration: mins }),
    });
    setMuteModal(null); onServerUpdate();
  }

  async function unmute(userId: string) {
    setCtxMenu(null);
    await fetch(`/api/servers/${server.id}/members/${userId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mute: false, muteDuration: 0 }),
    });
    onServerUpdate();
  }

  const profileMember = profile ? server.members.find(m => m.userId === profile.userId) : null;
  const profileRoles = profileMember ? server.roles.filter(r => !r.isDefault && profileMember.roles.includes(r.id)) : [];

  return (
    <aside data-member-list="1" className="palerock-member-list pr-member-pane" onClick={(e) => { if (!(e.target as HTMLElement).closest('[data-ctx]') && !(e.target as HTMLElement).closest('[data-profile]')) { setCtxMenu(null); setProfile(null); } }}>
      <div className="pr-member-header">
        <span className="pr-member-title">MEMBERS — {server.members.length}</span>
        <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginLeft: 'auto', display: 'none' }} className="touch-hint">hold to manage</span>
      </div>

      <div className="pr-member-list">
        {allMembers.map(member => (
          <MemberRow
            key={member.userId}
            member={member}
            currentUserId={currentUserId}
            ownerId={server.ownerId}
            roles={server.roles}
            st={st}
            onCtx={openCtx}
            onCtxTouch={openCtxTouch}
            onProfile={openProfile}
            getHighestRole={getHighestRole}
          />
        ))}
      </div>

      {/* Right-click context menu — portaled so it escapes overflow:hidden */}
      {ctxMenu && typeof window !== 'undefined' && createPortal(
        <div data-ctx="1" className="pr-member-ctx" style={{ top: ctxMenu.y, left: ctxMenu.x }}>
          <div className="pr-member-ctx-header">{ctxMenu.username}</div>
          {/* Open full slide panel */}
          <button className="pr-member-ctx-item" onClick={() => { setCtxMenu(null); setPanelMemberId(ctxMenu.userId); }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            View / Manage Member
          </button>
          <div className="pr-ctx-divider" />
          {canMute && (() => {
            const ctxMember = ctxMenu ? server.members.find(m => m.userId === ctxMenu.userId) : null;
            const ctxIsMuted = ctxMember?.mutedUntil && new Date(ctxMember.mutedUntil).getTime() > Date.now();
            return ctxIsMuted ? (
              <button className="pr-member-ctx-item pr-member-ctx-item--unmute" onClick={() => unmute(ctxMenu!.userId)}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                Unmute
              </button>
            ) : (
              <button className="pr-member-ctx-item" onClick={() => { setCtxMenu(null); setMuteModal({ userId: ctxMenu!.userId, username: ctxMenu!.username }); }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                Mute
              </button>
            );
          })()}
          {(canKick || canBan) && <div className="pr-ctx-divider" />}
          {canKick && (
            <button className="pr-member-ctx-item pr-member-ctx-item--kick" onClick={() => kick(ctxMenu.userId, ctxMenu.username)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1"/></svg>
              Kick Member
            </button>
          )}
          {canBan && (
            <button className="pr-member-ctx-item pr-member-ctx-item--ban" onClick={() => ban(ctxMenu.userId, ctxMenu.username)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              Ban Member
            </button>
          )}
          <div className="pr-ctx-divider" />
          {blockedUsers.has(ctxMenu.userId) ? (
            <button className="pr-member-ctx-item pr-member-ctx-item--unblock" onClick={() => unblockUser(ctxMenu.userId)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
              Unblock User
            </button>
          ) : (
            <button className="pr-member-ctx-item pr-member-ctx-item--block" onClick={() => blockUser(ctxMenu.userId)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              Block User
            </button>
          )}
        </div>,
        document.body
      )}

      {/* Profile popup — portaled */}
      {profile && profileMember && typeof window !== 'undefined' && (() => {
        const hue = profileMember.username.split('').reduce((a:number,c:string)=>a+c.charCodeAt(0),0)%360;
        const isMuted = profileMember.mutedUntil && new Date(profileMember.mutedUntil).getTime() > Date.now();
        const mutedTimeLabel = isMuted ? (() => {
          const msLeft = new Date(profileMember.mutedUntil!).getTime() - Date.now();
          const totalMins = Math.ceil(msLeft / 60000);
          if (totalMins < 60) return `MUTED ${totalMins}m`;
          if (totalMins < 1440) return `MUTED ${Math.ceil(totalMins / 60)}h`;
          return `MUTED ${Math.ceil(totalMins / 1440)}d`;
        })() : null;
        const card = (
          <div
            data-profile="1"
            className="pr-profile-card"
            style={{ top: profile.y, left: profile.x }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ ...st.profileBanner, background: `hsl(${hue},20%,14%)` }} />
            <div style={st.profileBody}>
              <div style={st.profileAvatarWrap}>
                <Avatar username={profileMember.username} avatar={profileMember.avatar} size={64} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <div style={st.profileName}>{profileMember.nickname || profileMember.username}</div>
                {mutedTimeLabel && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(237,66,69,0.12)', color: '#ed4245', border: '1px solid rgba(237,66,69,0.3)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>{mutedTimeLabel}</span>}
              </div>
              {profileMember.nickname && <div style={st.profileUsername}>{profileMember.username}</div>}
              {profileMember.pronouns && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, fontStyle: 'italic' }}>{profileMember.pronouns}</div>}
              {profileMember.bio && <div style={st.profileBio}>{profileMember.bio}</div>}
              {profileRoles.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={st.profileSectionLabel}>ROLES</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4, marginTop: 4 }}>
                    {profileRoles.map(r => (
                      <span key={r.id} style={{ ...st.roleBadge, borderColor: r.color + '55', color: r.color }}>{r.name}</span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <div style={st.profileSectionLabel}>JOINED SERVER</div>
                <div style={st.profileDate}>{new Date(profileMember.joinedAt).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                {profileMember.lastOnline && (() => {
                  const online = (Date.now() - new Date(profileMember.lastOnline!).getTime()) < 5 * 60 * 1000;
                  return (
                    <div style={{ marginTop: 10 }}>
                      <div style={st.profileSectionLabel}>LAST ONLINE</div>
                      <div style={{ ...st.profileDate, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: online ? '#23a55a' : 'var(--text-3)', display: 'inline-block', flexShrink: 0 }} />
                        {online ? 'Online now' : `${Math.floor((Date.now() - new Date(profileMember.lastOnline!).getTime()) / 60000) < 60
                          ? `${Math.floor((Date.now() - new Date(profileMember.lastOnline!).getTime()) / 60000)}m ago`
                          : Math.floor((Date.now() - new Date(profileMember.lastOnline!).getTime()) / 3600000) < 24
                            ? `${Math.floor((Date.now() - new Date(profileMember.lastOnline!).getTime()) / 3600000)}h ago`
                            : new Date(profileMember.lastOnline!).toLocaleDateString([], { month: 'short', day: 'numeric' })
                        }`}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        );
        return createPortal(card, document.body);
      })()}

      {/* Mute modal */}
      {muteModal && typeof window !== 'undefined' && createPortal(
        <div style={st.overlay} onClick={() => setMuteModal(null)}>
          <div style={st.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>Mute {muteModal.username}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>Select how long to mute this member</div>
            <label style={st.label}>DURATION (MINUTES)</label>
            <input style={st.input} type="text" inputMode="numeric" pattern="[0-9]*" min="1" max="10080" value={muteDuration} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setMuteDuration(v); }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' as const }}>
              {([['5m','5'],['15m','15'],['30m','30'],['1h','60'],['6h','360'],['24h','1440']] as [string,string][]).map(([label, val]) => (
                <button key={label} onClick={() => setMuteDuration(val)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', background: muteDuration === val ? 'var(--bg-3)' : 'transparent', color: muteDuration === val ? 'var(--text)' : 'var(--text-3)', cursor: 'pointer' }}>{label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button style={{ padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12 }} onClick={() => setMuteModal(null)}>Cancel</button>
              <button style={{ padding: '7px 14px', border: 'none', borderRadius: 6, background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }} onClick={() => mute(muteModal.userId)}>Mute</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showRoleModal && typeof window !== 'undefined' && createPortal(
        <RoleAssignModal server={server} userId={showRoleModal} onClose={() => setShowRoleModal(null)} onUpdate={onServerUpdate} />,
        document.body
      )}

      {/* Slide-up member panel (long-press on touch) */}
      {panelMemberId && typeof window !== 'undefined' && (() => {
        const panelMember = server.members.find(m => m.userId === panelMemberId);
        if (!panelMember) return null;
        return createPortal(
          <MemberPanel
            member={panelMember}
            server={server}
            currentUserId={currentUserId}
            isOwner={isOwner}
            isAdmin={isAdmin}
            hasPermission={hasPermission}
            onClose={() => setPanelMemberId(null)}
            onServerUpdate={onServerUpdate}
            blockedUsers={blockedUsers}
            onBlock={blockUser}
            onUnblock={unblockUser}
          />,
          document.body
        );
      })()}
    </aside>
  );
}

function RoleAssignModal({ server, userId, onClose, onUpdate }: { server: ServerData; userId: string; onClose: () => void; onUpdate: () => void; }) {
  const member = server.members.find(m => m.userId === userId);
  if (!member) return null;
  const nonDefaultRoles = server.roles.filter(r => !r.isDefault);
  const [loadingRoles, setLoadingRoles] = useState<Set<string>>(new Set());

  async function toggleRole(roleId: string, has: boolean) {
    setLoadingRoles(prev => new Set(prev).add(roleId));
    await fetch(`/api/servers/${server.id}/members/${userId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(has ? { removeRoles: [roleId] } : { addRoles: [roleId] }),
    });
    setLoadingRoles(prev => { const s = new Set(prev); s.delete(roleId); return s; });
    onUpdate();
  }

  return (
    <div style={st.overlay} onClick={onClose}>
      <div style={st.modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', color: 'var(--text)' }}>MANAGE ROLES — {member.username}</span>
          <button onClick={onClose} style={{ color: 'var(--text-3)', cursor: 'pointer', fontSize: 14, padding: 4, border: 'none', background: 'transparent' }}>✕</button>
        </div>
        <style>{`@keyframes pr-spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {nonDefaultRoles.map(role => {
            const has = member.roles.includes(role.id);
            const isLoading = loadingRoles.has(role.id);
            return (
              <div key={role.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--bg-3)', borderRadius: 6, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: role.color }} />
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{role.name}</span>
                </div>
                <button
                  style={{ padding: '4px 12px', border: 'none', borderRadius: 4, cursor: isLoading ? 'not-allowed' : 'pointer', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, background: has ? 'var(--text)' : 'var(--bg-3)', color: has ? 'var(--bg)' : 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 5, minWidth: 64, justifyContent: 'center', opacity: isLoading ? 0.7 : 1, transition: 'opacity 0.15s' }}
                  onClick={() => !isLoading && toggleRole(role.id, has)}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'pr-spin 0.7s linear infinite', flexShrink: 0 }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                  ) : (has ? 'Remove' : 'Add')}
                </button>
              </div>
            );
          })}
          {nonDefaultRoles.length === 0 && <p style={{ color: 'var(--text-3)', fontSize: 12 }}>No roles yet.</p>}
        </div>
      </div>
    </div>
  );
}

// ── MemberRow ────────────────────────────────────────────────────────────────
// Extracted so useLongPress hook is called at component level (not inside .map)
function MemberRow({ member, currentUserId, ownerId, roles, st, onCtx, onCtxTouch, onProfile, getHighestRole }: {
  member: any;
  currentUserId: string;
  ownerId: string;
  roles: ServerRole[];
  st: Record<string, React.CSSProperties>;
  onCtx: (e: React.MouseEvent, m: any) => void;
  onCtxTouch: (m: any) => void;
  onProfile: (e: React.MouseEvent, m: any) => void;
  getHighestRole: (roleIds: string[]) => ServerRole | null;
}) {
  const longPress = useLongPress(() => onCtxTouch(member));
  const isMe = member.userId === currentUserId;
  const isMemberOwner = member.userId === ownerId;
  const highestRole = getHighestRole(member.roles);
  const nameColor = highestRole?.color || 'var(--text-2)';
  const isMuted = member.mutedUntil && new Date(member.mutedUntil).getTime() > Date.now();

  // Online status: within last 5 minutes = online, otherwise show last seen
  const isOnline = member.lastOnline && (Date.now() - new Date(member.lastOnline).getTime()) < 5 * 60 * 1000;

  function lastSeenLabel(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function mutedLabel(mutedUntil: string) {
    const msLeft = new Date(mutedUntil).getTime() - Date.now();
    const totalMins = Math.ceil(msLeft / 60000);
    if (totalMins < 60) return `muted ${totalMins}m`;
    if (totalMins < 1440) return `muted ${Math.ceil(totalMins / 60)}h`;
    return `muted ${Math.ceil(totalMins / 1440)}d`;
  }

  return (
    <div
      data-member-row="1"
      className="pr-member-item"
      onContextMenu={(e) => onCtx(e, member)}
      {...longPress}
    >
      <div
        style={{ cursor: 'pointer', flexShrink: 0, position: 'relative' }}
        onClick={(e) => onProfile(e, member)}
        title="View profile"
      >
        <Avatar username={member.username} avatar={member.avatar} size={34} />
        <span style={{
          position: 'absolute', bottom: 0, right: 0,
          width: 10, height: 10, borderRadius: '50%',
          background: isOnline ? '#23a55a' : 'var(--bg-3)',
          border: '2px solid var(--bg-1)',
        }} title={isOnline ? 'Online' : member.lastOnline ? `Last seen ${lastSeenLabel(member.lastOnline)}` : 'Offline'} />
      </div>
      <div className="pr-member-info">
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <span
            className="pr-member-name"
            style={{ color: nameColor, cursor: 'pointer' }}
            onClick={(e) => onProfile(e, member)}
            title="View profile"
          >
            {member.nickname || member.username}
          </span>
          {isMemberOwner && <span className="pr-owner-badge">owner</span>}
          {isMe && <span className="pr-owner-badge" style={{ color: '#23a55a' }}>you</span>}
          {isMuted && (
            <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: 'rgba(237,66,69,0.12)', color: '#ed4245', border: '1px solid rgba(237,66,69,0.3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
              {mutedLabel(member.mutedUntil!)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' as const }}>
          {roles.filter(r => !r.isDefault && member.roles.includes(r.id)).slice(0, 2).map((role: ServerRole) => (
            <span key={role.id} className="pr-role-badge" style={{ borderColor: role.color + '55', color: role.color }}>
              {role.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  pane: { width: 300, minWidth: 300, height: '100dvh', background: 'var(--bg-1)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' },
  header: { padding: '0 18px', height: 72, borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center' },
  title: { fontSize: 11, letterSpacing: '0.14em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700 },
  list: { flex: 1, overflowY: 'auto', padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 2 },
  memberItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 'var(--radius-md)', transition: 'background var(--transition)', cursor: 'default' },
  avatar: { width: 38, height: 38, borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, flexShrink: 0, letterSpacing: 0.5, userSelect: 'none' },
  memberInfo: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  memberName: { fontSize: 14, fontFamily: 'var(--font-display)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.02em' },
  ownerBadge: { fontSize: 10, color: '#ffd700', letterSpacing: '0.06em', fontFamily: 'var(--font-display)', flexShrink: 0 },
  roleBadge: { fontSize: 10, padding: '1px 6px', border: '1px solid', borderRadius: 2, letterSpacing: '0.04em', display: 'inline-block', width: 'fit-content', fontFamily: 'var(--font-display)' },
  ctxMenu: { position: 'fixed', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px', zIndex: 1000, minWidth: 210, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' },
  ctxHeader: { padding: '10px 14px', fontSize: 11, letterSpacing: '0.1em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700, borderBottom: '1px solid var(--border)', marginBottom: 4 },
  ctxItem: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '11px 14px', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, borderRadius: 4, color: 'var(--text-2)', fontFamily: 'var(--font-display)', minHeight: 42 },
  ctxDivider: { height: 1, background: 'var(--border)', margin: '3px 0' },
  profileCard: { position: 'fixed', width: 320, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', zIndex: 1000, boxShadow: '0 16px 48px rgba(0,0,0,0.7)' },
  profileBanner: { height: 80, width: '100%' },
  profileBody: { padding: '0 20px 20px' },
  profileAvatarWrap: { marginTop: -32, marginBottom: 10 },
  profileAvatar: { width: 64, height: 64, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, border: '3px solid var(--bg-2)', userSelect: 'none' },
  profileName: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text)', letterSpacing: '0.02em' },
  profileUsername: { fontSize: 12, color: 'var(--text-3)', marginTop: 1, fontFamily: 'var(--font-display)' },
  profileBio: { fontSize: 13, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.5, fontFamily: 'var(--font-display)' },
  profileSectionLabel: { fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700 },
  profileDate: { fontSize: 13, color: 'var(--text-2)', marginTop: 2, fontFamily: 'var(--font-display)' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 },
  modal: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 22, minWidth: 360, maxWidth: 460, width: '100%' },
  label: { display: 'block', fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 7 },
  input: { width: '100%', padding: '10px 13px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-display)' },
};
