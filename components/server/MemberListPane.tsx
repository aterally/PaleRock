import { useState, useEffect, useRef } from 'react';
import type { ServerData, ServerRole } from '@/pages/servers/[serverId]/[channelId]';

interface Props {
  server: ServerData;
  currentUserId: string;
  isOwner: boolean;
  hasPermission: (perm: string) => boolean;
  onServerUpdate: () => void;
}

interface CtxMenu { x: number; y: number; userId: string; username: string; }
interface ProfileCard { userId: string; x: number; y: number; }

export default function MemberListPane({ server, currentUserId, isOwner, hasPermission, onServerUpdate }: Props) {
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [profile, setProfile] = useState<ProfileCard | null>(null);
  const [muteModal, setMuteModal] = useState<{ userId: string; username: string } | null>(null);
  const [muteDuration, setMuteDuration] = useState('10');
  const [showRoleModal, setShowRoleModal] = useState<string | null>(null);

  const canKick = isOwner || hasPermission('kickMembers');
  const canBan = isOwner || hasPermission('banMembers');
  const canMute = isOwner || hasPermission('muteMembers');
  const canManageRoles = isOwner || hasPermission('manageRoles');

  useEffect(() => {
    function close(e: MouseEvent) {
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
    if (!(canKick || canBan || canMute || canManageRoles)) return;
    setProfile(null);
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 260);
    setCtxMenu({ x, y, userId: m.userId, username: m.username });
  }

  function openProfile(e: React.MouseEvent, m: typeof allMembers[0]) {
    e.stopPropagation();
    setCtxMenu(null);
    const rect = (e.currentTarget as HTMLElement).closest('[data-member-row]')?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(8, rect.left - 268);
    const y = Math.max(8, Math.min(rect.top, window.innerHeight - 300));
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

  const profileMember = profile ? server.members.find(m => m.userId === profile.userId) : null;
  const profileRoles = profileMember ? server.roles.filter(r => !r.isDefault && profileMember.roles.includes(r.id)) : [];

  return (
    <aside style={st.pane} onClick={() => { setCtxMenu(null); setProfile(null); }}>
      <div style={st.header}>
        <span style={st.title}>MEMBERS — {server.members.length}</span>
      </div>

      <div style={st.list}>
        {allMembers.map(member => {
          const isMe = member.userId === currentUserId;
          const isMemberOwner = member.userId === server.ownerId;
          const highestRole = getHighestRole(member.roles);
          const nameColor = highestRole?.color || 'var(--text-2)';
          const hue = member.username.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0) % 360;
          const isMuted = member.mutedUntil && new Date(member.mutedUntil).getTime() > Date.now();
          const avatarPixels = member.avatar ? (() => { try { return JSON.parse(member.avatar!); } catch { return null; } })() : null;

          return (
            <div
              key={member.userId}
              data-member-row="1"
              style={st.memberItem}
              onContextMenu={(e) => openCtx(e, member)}
            >
              <div
                style={{ ...st.avatar, background: `hsl(${hue},10%,20%)`, border: `1px solid hsl(${hue},10%,30%)`, color: `hsl(${hue},20%,80%)`, cursor: 'pointer', overflow: 'hidden', padding: 0 }}
                onClick={(e) => openProfile(e, member)}
                title="View profile"
              >
                {avatarPixels ? (
                  <canvas
                    ref={el => {
                      if (!el) return;
                      const ctx = el.getContext('2d')!;
                      for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
                        ctx.fillStyle = avatarPixels[r][c];
                        ctx.fillRect(c * 2, r * 2, 2, 2);
                      }
                    }}
                    width={34} height={34}
                    style={{ width: '100%', height: '100%', imageRendering: 'pixelated', display: 'block' }}
                  />
                ) : member.username.slice(0, 2).toUpperCase()}
              </div>

              <div style={st.memberInfo}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                  <span
                    style={{ ...st.memberName, color: nameColor, cursor: 'pointer' }}
                    onClick={(e) => openProfile(e, member)}
                    title="View profile"
                  >
                    {member.nickname || member.username}
                  </span>
                  {isMemberOwner && <span style={st.ownerBadge}>owner</span>}
                  {isMe && <span style={{ ...st.ownerBadge, color: '#23a55a' }}>you</span>}
                  {isMuted && <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: 'rgba(237,66,69,0.12)', color: '#ed4245', border: '1px solid rgba(237,66,69,0.3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>muted</span>}
                </div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' as const }}>
                  {server.roles.filter(r => !r.isDefault && member.roles.includes(r.id)).slice(0, 2).map(role => (
                    <span key={role.id} style={{ ...st.roleBadge, borderColor: role.color + '55', color: role.color }}>
                      {role.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Right-click context menu */}
      {ctxMenu && (
        <div data-ctx="1" style={{ ...st.ctxMenu, top: ctxMenu.y, left: ctxMenu.x }}>
          <div style={st.ctxHeader}>{ctxMenu.username}</div>
          {canManageRoles && (
            <button style={st.ctxItem} onClick={() => { setCtxMenu(null); setShowRoleModal(ctxMenu.userId); }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              Manage Roles
            </button>
          )}
          {canMute && (
            <button style={st.ctxItem} onClick={() => { setCtxMenu(null); setMuteModal({ userId: ctxMenu.userId, username: ctxMenu.username }); }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              Mute
            </button>
          )}
          {(canKick || canBan) && <div style={st.ctxDivider} />}
          {canKick && (
            <button style={{ ...st.ctxItem, color: '#ffa000' }} onClick={() => kick(ctxMenu.userId, ctxMenu.username)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1"/></svg>
              Kick Member
            </button>
          )}
          {canBan && (
            <button style={{ ...st.ctxItem, color: '#ed4245' }} onClick={() => ban(ctxMenu.userId, ctxMenu.username)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              Ban Member
            </button>
          )}
        </div>
      )}

      {/* Profile popup */}
      {profile && profileMember && (() => {
        const hue = profileMember.username.split('').reduce((a:number,c:string)=>a+c.charCodeAt(0),0)%360;
        const isMuted = profileMember.mutedUntil && new Date(profileMember.mutedUntil).getTime() > Date.now();
        const avatarPixels = profileMember.avatar ? (() => { try { return JSON.parse(profileMember.avatar!); } catch { return null; } })() : null;
        return (
          <div
            data-profile="1"
            style={{ ...st.profileCard, top: profile.y, left: profile.x }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ ...st.profileBanner, background: `hsl(${hue},20%,14%)` }} />
            <div style={st.profileBody}>
              <div style={st.profileAvatarWrap}>
                {avatarPixels ? (
                  <canvas
                    ref={el => {
                      if (!el) return;
                      const ctx = el.getContext('2d')!;
                      for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
                        ctx.fillStyle = avatarPixels[r][c];
                        ctx.fillRect(c * 3, r * 3, 3, 3);
                      }
                    }}
                    width={48} height={48}
                    style={{ borderRadius: 10, border: '3px solid var(--bg-2)', imageRendering: 'pixelated', display: 'block' }}
                  />
                ) : (
                  <div style={{
                    ...st.profileAvatar,
                    background: `hsl(${hue},10%,20%)`,
                    color: `hsl(${hue},20%,80%)`,
                  }}>
                    {profileMember.username.slice(0,2).toUpperCase()}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <div style={st.profileName}>{profileMember.nickname || profileMember.username}</div>
                {isMuted && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(237,66,69,0.12)', color: '#ed4245', border: '1px solid rgba(237,66,69,0.3)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>MUTED</span>}
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
              </div>
            </div>
          </div>
        );
      })()}

      {/* Mute modal */}
      {muteModal && (
        <div style={st.overlay} onClick={() => setMuteModal(null)}>
          <div style={st.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>Mute {muteModal.username}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>Select how long to mute this member</div>
            <label style={st.label}>DURATION (MINUTES)</label>
            <input style={st.input} type="number" min="1" max="10080" value={muteDuration} onChange={e => setMuteDuration(e.target.value)} />
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
        </div>
      )}

      {showRoleModal && (
        <RoleAssignModal server={server} userId={showRoleModal} onClose={() => setShowRoleModal(null)} onUpdate={onServerUpdate} />
      )}
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

const st: Record<string, React.CSSProperties> = {
  pane: { width: 260, minWidth: 260, height: '100vh', background: 'var(--bg-1)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' },
  header: { padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  title: { fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700 },
  list: { flex: 1, overflowY: 'auto', padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 2 },
  memberItem: { display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px', borderRadius: 'var(--radius-md)', transition: 'background var(--transition)', cursor: 'default' },
  avatar: { width: 34, height: 34, borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, flexShrink: 0, letterSpacing: 0.5, userSelect: 'none' },
  memberInfo: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  memberName: { fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  ownerBadge: { fontSize: 9, color: '#ffd700', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)', flexShrink: 0 },
  roleBadge: { fontSize: 9, padding: '1px 5px', border: '1px solid', borderRadius: 2, letterSpacing: '0.04em', display: 'inline-block', width: 'fit-content' },
  ctxMenu: { position: 'fixed', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px', zIndex: 1000, minWidth: 180, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' },
  ctxHeader: { padding: '6px 10px', fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700, borderBottom: '1px solid var(--border)', marginBottom: 4 },
  ctxItem: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, borderRadius: 4, color: 'var(--text-2)', fontFamily: 'var(--font-display)' },
  ctxDivider: { height: 1, background: 'var(--border)', margin: '3px 0' },
  profileCard: { position: 'fixed', width: 256, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', zIndex: 1000, boxShadow: '0 12px 40px rgba(0,0,0,0.6)' },
  profileBanner: { height: 56, width: '100%' },
  profileBody: { padding: '0 16px 16px' },
  profileAvatarWrap: { marginTop: -24, marginBottom: 8 },
  profileAvatar: { width: 48, height: 48, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, border: '3px solid var(--bg-2)', userSelect: 'none' },
  profileName: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text)', letterSpacing: '0.02em' },
  profileUsername: { fontSize: 11, color: 'var(--text-3)', marginTop: 1, fontFamily: 'var(--font-mono)' },
  profileBio: { fontSize: 12, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.5 },
  profileSectionLabel: { fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700 },
  profileDate: { fontSize: 12, color: 'var(--text-2)', marginTop: 2 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 },
  modal: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, minWidth: 340, maxWidth: 440, width: '100%' },
  label: { display: 'block', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 6 },
  input: { width: '100%', padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' },
};
