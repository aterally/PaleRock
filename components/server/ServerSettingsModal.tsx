import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import type { ServerData, ServerRole, CurrentUser } from '@/pages/servers/[serverId]/[channelId]';

interface Props {
  server: ServerData;
  currentUser: CurrentUser;
  isOwner: boolean;
  hasPermission: (perm: string) => boolean;
  onClose: () => void;
  onServerUpdate: () => void;
  onLeave: () => void;
}

type Tab = 'overview' | 'roles' | 'members' | 'invites' | 'danger';

const PERMISSIONS = [
  { key: 'viewChannels', label: 'View Channels', desc: 'See channels in this server' },
  { key: 'sendMessages', label: 'Send Messages', desc: 'Post messages in channels' },
  { key: 'readMessageHistory', label: 'Read Message History', desc: 'Access past messages' },
  { key: 'manageMessages', label: 'Manage Messages', desc: 'Delete or pin messages' },
  { key: 'manageChannels', label: 'Manage Channels', desc: 'Create, edit, and delete channels' },
  { key: 'manageRoles', label: 'Manage Roles', desc: 'Create and assign roles' },
  { key: 'manageServer', label: 'Manage Server', desc: 'Edit server settings' },
  { key: 'kickMembers', label: 'Kick Members', desc: 'Remove members from the server' },
  { key: 'banMembers', label: 'Ban Members', desc: 'Permanently ban members' },
  { key: 'muteMembers', label: 'Mute Members', desc: 'Temporarily silence members' },
  { key: 'createInvites', label: 'Create Invites', desc: 'Generate invite links' },
  { key: 'administrator', label: 'Administrator', desc: 'All permissions — use with caution', danger: true },
];

export default function ServerSettingsModal({ server, currentUser, isOwner, hasPermission, onClose, onServerUpdate, onLeave }: Props) {
  const [tab, setTab] = useState<Tab>('overview');

  const tabs: { id: Tab; label: string; icon: string; show: boolean }[] = [
    { id: 'overview', label: 'Overview', icon: '⊡', show: true },
    { id: 'roles', label: 'Roles', icon: '◈', show: hasPermission('manageRoles') },
    { id: 'members', label: 'Members', icon: '◎', show: hasPermission('kickMembers') || hasPermission('manageRoles') || hasPermission('banMembers') || hasPermission('muteMembers') },
    { id: 'invites', label: 'Invites', icon: '⊕', show: isOwner || hasPermission('manageServer') },
    { id: 'danger', label: 'Danger Zone', icon: '⚠', show: true },
  ];

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        {/* Left sidebar */}
        <div style={s.sidebar}>
          <div style={s.sidebarHeader}>
            <div style={s.serverBadge}>{server.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <div style={s.serverName}>{server.name}</div>
              <div style={s.serverSubtitle}>Server Settings</div>
            </div>
          </div>
          <div style={s.tabList}>
            {tabs.filter(t => t.show).map(t => (
              <button
                key={t.id}
                style={{
                  ...s.tabBtn,
                  ...(tab === t.id ? s.tabBtnActive : {}),
                  ...(t.id === 'danger' ? { color: tab === t.id ? '#ff4444' : 'rgba(255,68,68,0.6)', marginTop: 'auto' } : {}),
                }}
                onClick={() => setTab(t.id)}
              >
                <span style={s.tabIcon}>{t.icon}</span>
                {t.label}
                {tab === t.id && <span style={s.tabActiveDot} />}
              </button>
            ))}
          </div>
          <button style={s.closeBtn} onClick={onClose}>
            <span>✕</span> Close
          </button>
        </div>

        {/* Main content */}
        <div style={s.content}>
          {tab === 'overview' && <OverviewTab server={server} isOwner={isOwner} hasPermission={hasPermission} onUpdate={onServerUpdate} />}
          {tab === 'roles' && <RolesTab server={server} onUpdate={onServerUpdate} />}
          {tab === 'members' && <MembersTab server={server} currentUserId={currentUser.id} isOwner={isOwner} hasPermission={hasPermission} onUpdate={onServerUpdate} />}
          {tab === 'invites' && <InvitesTab server={server} />}
          {tab === 'danger' && <DangerTab server={server} isOwner={isOwner} onLeave={onLeave} onDelete={onLeave} />}
        </div>
      </div>
    </div>
  );
}

// ─── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ server, isOwner, hasPermission, onUpdate }: { server: ServerData; isOwner: boolean; hasPermission: (p: string) => boolean; onUpdate: () => void }) {
  const [name, setName] = useState(server.name);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const canEdit = isOwner || hasPermission('manageServer');

  async function save() {
    if (!name.trim() || name === server.name) return;
    setSaving(true);
    await fetch(`/api/servers/${server.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onUpdate();
  }

  return (
    <div style={s.tabContent}>
      <SectionHeader title="Overview" subtitle="Manage your server's general settings" />
      <div style={s.card}>
        <label style={s.label}>SERVER NAME</label>
        <input
          style={{ ...s.input, opacity: canEdit ? 1 : 0.5 }}
          value={name} onChange={e => setName(e.target.value)}
          disabled={!canEdit} maxLength={50}
          onKeyDown={e => e.key === 'Enter' && canEdit && save()}
        />
        {canEdit && (
          <div style={s.actionRow}>
            <button style={{ ...s.btn, ...s.btnSecondary, opacity: name === server.name ? 0.4 : 1 }} onClick={() => setName(server.name)} disabled={name === server.name}>
              Reset
            </button>
            <button style={{ ...s.btn, ...s.btnPrimary, opacity: (saving || name === server.name) ? 0.5 : 1 }} onClick={save} disabled={saving || name === server.name}>
              {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
      <div style={s.statsGrid}>
        {[
          { label: 'Members', value: server.members.length, icon: '◎' },
          { label: 'Channels', value: server.channels.length, icon: '#' },
          { label: 'Roles', value: server.roles.length, icon: '◈' },
          { label: 'Categories', value: server.categories.length, icon: '▤' },
        ].map(stat => (
          <div key={stat.label} style={s.statCard}>
            <div style={s.statIcon}>{stat.icon}</div>
            <div style={s.statValue}>{stat.value}</div>
            <div style={s.statLabel}>{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Roles Tab ──────────────────────────────────────────────────────────────────
function RolesTab({ server, onUpdate }: { server: ServerData; onUpdate: () => void }) {
  // Store only the ID so selectedRole always reflects live server data
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [editColor, setEditColor] = useState('#ffffff');
  const [editName, setEditName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#5865f2');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Derive from live server prop — never stale after onUpdate()
  const selectedRole = selectedRoleId ? (server.roles.find(r => r.id === selectedRoleId) ?? null) : null;

  function selectRole(role: ServerRole) {
    setSelectedRoleId(role.id);
    setPerms({ ...role.permissions });
    setEditColor(role.color || '#ffffff');
    setEditName(role.name);
    setSaved(false);
  }

  async function createRole() {
    if (!newRoleName.trim()) return;
    await fetch(`/api/servers/${server.id}/roles`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newRoleName, color: newRoleColor }),
    });
    setShowCreate(false); setNewRoleName(''); setNewRoleColor('#5865f2');
    onUpdate();
  }

  async function saveRole() {
    if (!selectedRole) return;
    setSaving(true);
    const r = await fetch(`/api/servers/${server.id}/roles`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId: selectedRole.id, name: editName, color: editColor, permissions: perms }),
    });
    setSaving(false);
    if (r.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      // onUpdate refreshes server prop; selectedRole re-derives from the new data automatically
      onUpdate();
    }
  }

  async function deleteRole(roleId: string) {
    if (!confirm('Delete this role? Members with this role will lose its permissions.')) return;
    await fetch(`/api/servers/${server.id}/roles?roleId=${roleId}`, { method: 'DELETE' });
    setSelectedRoleId(null); onUpdate();
  }

  const sortedRoles = server.roles.slice().sort((a, b) => b.position - a.position);

  return (
    <div style={{ ...s.tabContent, maxWidth: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <SectionHeader title="Roles" subtitle={`${server.roles.length} role${server.roles.length !== 1 ? 's' : ''} — click a role to edit`} />
        <button style={{ ...s.btn, ...s.btnPrimary, marginTop: 4 }} onClick={() => { setShowCreate(true); setSelectedRoleId(null); }}>
          + New Role
        </button>
      </div>

      {showCreate && (
        <div style={{ ...s.card, marginBottom: 16 }}>
          <div style={s.cardTitle}>Create New Role</div>
          <label style={s.label}>ROLE NAME</label>
          <input style={s.input} value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="New Role" autoFocus onKeyDown={e => e.key === 'Enter' && createRole()} />
          <label style={{ ...s.label, marginTop: 12 }}>ROLE COLOR</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
            <div style={{ position: 'relative' }}>
              <input type="color" value={newRoleColor} onChange={e => setNewRoleColor(e.target.value)} style={s.colorPicker} />
              <div style={{ ...s.colorSwatch, background: newRoleColor }} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{newRoleColor}</span>
            <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
              {['#5865f2','#57f287','#faa61a','#ed4245','#eb459e','#ff7043','#00bcd4'].map(c => (
                <button key={c} onClick={() => setNewRoleColor(c)} style={{ width: 18, height: 18, borderRadius: '50%', background: c, border: newRoleColor === c ? '2px solid white' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
              ))}
            </div>
          </div>
          <div style={{ ...s.actionRow, marginTop: 16 }}>
            <button style={{ ...s.btn, ...s.btnSecondary }} onClick={() => setShowCreate(false)}>Cancel</button>
            <button style={{ ...s.btn, ...s.btnPrimary, opacity: !newRoleName.trim() ? 0.5 : 1 }} onClick={createRole} disabled={!newRoleName.trim()}>Create Role</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16 }}>
        {/* Role list */}
        <div style={{ width: 200, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {sortedRoles.map(role => (
            <button key={role.id} style={{ ...s.roleItem, ...(selectedRole?.id === role.id ? s.roleItemActive : {}) }} onClick={() => selectRole(role)}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: role.color || '#99aab5', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, color: selectedRole?.id === role.id ? 'var(--text)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {role.name}
              </span>
              {role.isDefault && <span style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>default</span>}
              <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>›</span>
            </button>
          ))}
        </div>

        {/* Role editor */}
        {selectedRole ? (
          <div style={{ flex: 1, ...s.card }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: editColor }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{editName}</span>
              </div>
              <button style={s.iconBtn} onClick={() => setSelectedRoleId(null)}>✕</button>
            </div>

            {!selectedRole.isDefault && (
              <>
                <label style={s.label}>NAME</label>
                <input style={s.input} value={editName} onChange={e => setEditName(e.target.value)} />
              </>
            )}

            <label style={{ ...s.label, marginTop: 14 }}>COLOR</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
              <div style={{ position: 'relative' }}>
                <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} style={s.colorPicker} />
                <div style={{ ...s.colorSwatch, background: editColor }} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{editColor}</span>
              <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
                {['#5865f2','#57f287','#faa61a','#ed4245','#eb459e','#ff7043','#00bcd4','#ffffff','#99aab5'].map(c => (
                  <button key={c} onClick={() => setEditColor(c)} style={{ width: 16, height: 16, borderRadius: '50%', background: c, border: editColor === c ? '2px solid white' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
                ))}
              </div>
            </div>

            <label style={{ ...s.label, marginTop: 14 }}>PERMISSIONS</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
              {PERMISSIONS.map(p => (
                <div key={p.key} style={{ ...s.permRow, ...(p.danger ? s.permRowDanger : {}) }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: p.danger ? '#ff6b6b' : 'var(--text)', fontWeight: 500 }}>{p.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{p.desc}</div>
                  </div>
                  <button
                    style={{ ...s.toggle, background: perms[p.key] ? (p.danger ? '#ff4444' : 'var(--success, #23a55a)') : 'var(--bg-4, #1e1f22)' }}
                    onClick={() => setPerms(prev => ({ ...prev, [p.key]: !prev[p.key] }))}
                    aria-label={`${p.label}: ${perms[p.key] ? 'enabled' : 'disabled'}`}
                  >
                    <div style={{ ...s.toggleThumb, transform: perms[p.key] ? 'translateX(14px)' : 'translateX(0)' }} />
                  </button>
                </div>
              ))}
            </div>

            <div style={{ ...s.actionRow, marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              {!selectedRole.isDefault && (
                <button style={{ ...s.btn, ...s.btnDanger }} onClick={() => deleteRole(selectedRole.id)}>
                  Delete Role
                </button>
              )}
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <button style={{ ...s.btn, ...s.btnSecondary }} onClick={() => setSelectedRoleId(null)}>Cancel</button>
                <button style={{ ...s.btn, ...s.btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={saveRole} disabled={saving}>
                  {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            Select a role to edit its permissions
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Members Tab ──────────────────────────────────────────────────────────────
function MembersTab({ server, currentUserId, isOwner, hasPermission, onUpdate }: {
  server: ServerData; currentUserId: string; isOwner: boolean; hasPermission: (p: string) => boolean; onUpdate: () => void;
}) {
  const [search, setSearch] = useState('');
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [muteModal, setMuteModal] = useState<{ userId: string; username: string } | null>(null);
  const [muteDuration, setMuteDuration] = useState('10');

  const canKick = hasPermission('kickMembers');
  const canBan = hasPermission('banMembers');
  const canMute = hasPermission('muteMembers');
  const canManageRoles = hasPermission('manageRoles');

  const filtered = server.members.filter(m => m.username.toLowerCase().includes(search.toLowerCase()));

  async function kickMember(userId: string, username: string) {
    if (!confirm(`Kick ${username} from ${server.name}?`)) return;
    await fetch(`/api/servers/${server.id}/members/${userId}`, { method: 'DELETE' });
    onUpdate();
  }

  async function banMember(userId: string, username: string) {
    if (!confirm(`Ban ${username} from ${server.name}? They will be unable to rejoin via invite.`)) return;
    await fetch(`/api/servers/${server.id}/members/${userId}?action=ban`, { method: 'DELETE' });
    onUpdate();
  }

  async function muteMember(userId: string) {
    const mins = parseInt(muteDuration);
    if (isNaN(mins) || mins <= 0) return;
    await fetch(`/api/servers/${server.id}/members/${userId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mute: true, muteDuration: mins }),
    });
    setMuteModal(null);
    onUpdate();
  }

  async function toggleRole(userId: string, roleId: string, hasRole: boolean) {
    await fetch(`/api/servers/${server.id}/members/${userId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hasRole ? { removeRoles: [roleId] } : { addRoles: [roleId] }),
    });
    onUpdate();
  }

  const nonDefaultRoles = server.roles.filter(r => !r.isDefault);

  return (
    <div style={s.tabContent}>
      <SectionHeader title="Members" subtitle={`${server.members.length} member${server.members.length !== 1 ? 's' : ''}`} />

      <div style={{ marginBottom: 12 }}>
        <input style={s.input} placeholder="Search members…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {filtered.map(member => {
          const isMe = member.userId === currentUserId;
          const isMemberOwner = member.userId === server.ownerId;
          const hue = member.username.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
          const isExpanded = expandedMember === member.userId;
          const memberRoles = server.roles.filter(r => !r.isDefault && member.roles.includes(r.id));

          return (
            <div key={member.userId} style={{ ...s.memberCard, ...(isExpanded ? s.memberCardExpanded : {}) }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ ...s.avatar, background: `hsl(${hue},25%,18%)`, color: `hsl(${hue},30%,75%)` }}>
                  {member.username.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
                      {member.username}
                    </span>
                    {isMemberOwner && <span style={s.badge}>owner</span>}
                    {isMe && <span style={{ ...s.badge, background: 'rgba(35,165,90,0.15)', color: '#23a55a', borderColor: 'rgba(35,165,90,0.3)' }}>you</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    {memberRoles.slice(0, 3).map(role => (
                      <span key={role.id} style={{ fontSize: 10, color: role.color, background: `${role.color}18`, border: `1px solid ${role.color}33`, borderRadius: 3, padding: '1px 5px' }}>
                        {role.name}
                      </span>
                    ))}
                    {memberRoles.length > 3 && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>+{memberRoles.length - 3}</span>}
                  </div>
                </div>

                {!isMe && !isMemberOwner && (canKick || canBan || canMute || canManageRoles) && (
                  <button
                    style={{ ...s.iconBtn, fontSize: 10 }}
                    onClick={() => setExpandedMember(isExpanded ? null : member.userId)}
                  >
                    {isExpanded ? '▲' : '▼'}
                  </button>
                )}
              </div>

              {isExpanded && !isMe && !isMemberOwner && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  {canManageRoles && nonDefaultRoles.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={s.label}>ROLES</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                        {nonDefaultRoles.map(role => {
                          const hasRole = member.roles.includes(role.id);
                          return (
                            <button
                              key={role.id}
                              onClick={() => toggleRole(member.userId, role.id, hasRole)}
                              style={{
                                fontSize: 11, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                                border: `1px solid ${role.color}44`,
                                background: hasRole ? `${role.color}22` : 'var(--bg)',
                                color: hasRole ? role.color : 'var(--text-3)',
                                transition: 'all 0.15s',
                              }}
                            >
                              {hasRole ? '✓ ' : '+ '}{role.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {canMute && (
                      <button style={{ ...s.btn, ...s.btnSecondary, fontSize: 11, padding: '5px 12px' }} onClick={() => setMuteModal({ userId: member.userId, username: member.username })}>
                        🔇 Mute
                      </button>
                    )}
                    {canKick && (
                      <button style={{ ...s.btn, fontSize: 11, padding: '5px 12px', background: 'rgba(255,160,0,0.1)', color: '#ffa000', border: '1px solid rgba(255,160,0,0.25)' }} onClick={() => kickMember(member.userId, member.username)}>
                        Kick
                      </button>
                    )}
                    {canBan && (
                      <button style={{ ...s.btn, ...s.btnDanger, fontSize: 11, padding: '5px 12px' }} onClick={() => banMember(member.userId, member.username)}>
                        Ban
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: '32px 0' }}>No members found</div>
        )}
      </div>

      {/* Mute duration modal */}
      {muteModal && (
        <div style={s.miniOverlay} onClick={() => setMuteModal(null)}>
          <div style={s.miniModal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>
              Mute {muteModal.username}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>
              Select how long to mute this member
            </div>
            <label style={s.label}>DURATION (MINUTES)</label>
            <input style={s.input} type="number" min="1" max="10080" value={muteDuration} onChange={e => setMuteDuration(e.target.value)} />
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {[['5m', '5'], ['15m', '15'], ['30m', '30'], ['1h', '60'], ['6h', '360'], ['24h', '1440']].map(([label, val]) => (
                <button key={label} onClick={() => setMuteDuration(val)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', background: muteDuration === val ? 'var(--bg-3)' : 'transparent', color: muteDuration === val ? 'var(--text)' : 'var(--text-3)', cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ ...s.actionRow, marginTop: 16 }}>
              <button style={{ ...s.btn, ...s.btnSecondary }} onClick={() => setMuteModal(null)}>Cancel</button>
              <button style={{ ...s.btn, ...s.btnPrimary }} onClick={() => muteMember(muteModal.userId)}>Mute</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Invites Tab ──────────────────────────────────────────────────────────────
function InvitesTab({ server }: { server: ServerData }) {
  const [invites, setInvites] = useState<{ code: string; uses: number; maxUses: number; expiresAt: string | null; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newInvite, setNewInvite] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/servers/${server.id}/invites`);
    if (r.ok) { const d = await r.json(); setInvites(d.invites); }
    setLoading(false);
  }, [server.id]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    const r = await fetch(`/api/servers/${server.id}/invites`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 0 }),
    });
    const d = await r.json();
    if (d.code) { setNewInvite(`${window.location.origin}/invite/${d.code}`); load(); }
  }

  async function deleteInvite(code: string) {
    if (!confirm(`Delete invite ${code}? This link will stop working.`)) return;
    await fetch(`/api/servers/${server.id}/invites?code=${code}`, { method: 'DELETE' });
    load();
  }

  function copyLink(url: string, code: string) {
    navigator.clipboard.writeText(url);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div style={s.tabContent}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <SectionHeader title="Invite Links" subtitle="Manage who can join your server" />
        <button style={{ ...s.btn, ...s.btnPrimary, marginTop: 4 }} onClick={create}>+ Create Invite</button>
      </div>

      {newInvite && (
        <div style={{ ...s.card, background: 'rgba(35,165,90,0.06)', border: '1px solid rgba(35,165,90,0.2)', marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#23a55a', fontWeight: 600, marginBottom: 8 }}>✓ New invite created</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...s.input, flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12 }} value={newInvite} readOnly />
            <button style={{ ...s.btn, ...s.btnPrimary, flexShrink: 0 }} onClick={() => copyLink(newInvite, 'new')}>
              {copied === 'new' ? '✓' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: '32px 0' }}>Loading…</div>
      ) : invites.length === 0 ? (
        <div style={{ ...s.card, textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⊕</div>
          <div style={{ color: 'var(--text-3)', fontSize: 13 }}>No active invite links</div>
          <div style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 4 }}>Create one to share your server</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {invites.map(inv => {
            const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${inv.code}`;
            const isExpired = inv.expiresAt && new Date(inv.expiresAt) < new Date();
            return (
              <div key={inv.code} style={{ ...s.card, ...(isExpired ? { opacity: 0.5 } : {}) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <code style={{ flex: 1, fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {inv.code}
                  </code>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
                    {inv.uses}{inv.maxUses > 0 ? `/${inv.maxUses}` : ''} use{inv.uses !== 1 ? 's' : ''}
                  </span>
                  <span style={{ fontSize: 11, color: isExpired ? '#ff4444' : 'var(--text-3)', flexShrink: 0 }}>
                    {inv.expiresAt ? (isExpired ? 'Expired' : `Expires ${new Date(inv.expiresAt).toLocaleDateString()}`) : 'Never expires'}
                  </span>
                  <button style={{ ...s.btn, ...s.btnSecondary, fontSize: 11, padding: '4px 10px', flexShrink: 0 }} onClick={() => copyLink(url, inv.code)}>
                    {copied === inv.code ? '✓ Copied' : 'Copy'}
                  </button>
                  <button style={{ ...s.iconBtn, color: 'var(--danger, #ed4245)', flexShrink: 0 }} onClick={() => deleteInvite(inv.code)} title="Delete invite">
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Danger Zone ──────────────────────────────────────────────────────────────
function DangerTab({ server, isOwner, onLeave, onDelete }: { server: ServerData; isOwner: boolean; onLeave: () => void; onDelete: () => void }) {
  async function leaveServer() {
    if (!confirm('Leave this server? You will lose access to all channels.')) return;
    await fetch(`/api/servers/${server.id}/leave`, { method: 'POST' });
    onLeave();
  }

  async function deleteServer() {
    if (!confirm(`Delete "${server.name}"? This cannot be undone.`)) return;
    const input = prompt(`Type the server name to confirm deletion:\n${server.name}`);
    if (input !== server.name) { alert('Name did not match. Server not deleted.'); return; }
    await fetch(`/api/servers/${server.id}`, { method: 'DELETE' });
    onDelete();
  }

  return (
    <div style={s.tabContent}>
      <SectionHeader title="Danger Zone" subtitle="Irreversible actions — proceed with caution" danger />
      {!isOwner && (
        <div style={{ ...s.card, ...s.dangerCard }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Leave Server</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>You will lose access to all channels and messages.</div>
          </div>
          <button style={{ ...s.btn, ...s.btnDanger, flexShrink: 0 }} onClick={leaveServer}>Leave Server</button>
        </div>
      )}
      {isOwner && (
        <div style={{ ...s.card, ...s.dangerCard }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#ff4444' }}>Delete Server</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>Permanently deletes this server, all channels, and all messages. Cannot be undone.</div>
          </div>
          <button style={{ ...s.btn, ...s.btnDanger, flexShrink: 0 }} onClick={deleteServer}>Delete Server</button>
        </div>
      )}
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle, danger }: { title: string; subtitle?: string; danger?: boolean }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: danger ? '#ff4444' : 'var(--text)', margin: 0 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0', lineHeight: 1.4 }}>{subtitle}</p>}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 800, backdropFilter: 'blur(4px)' },
  modal: { background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', width: 'min(94vw, 1060px)', height: 'min(90vh, 800px)', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' },

  // Sidebar
  sidebar: { width: 220, minWidth: 220, background: 'var(--bg-2)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  sidebarHeader: { padding: '20px 16px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 },
  serverBadge: { width: 36, height: 36, borderRadius: 8, background: 'var(--bg-3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, color: 'var(--text)', flexShrink: 0 },
  serverName: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--text)', lineHeight: 1.2, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  serverSubtitle: { fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', marginTop: 2 },

  tabList: { flex: 1, padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' },
  tabBtn: { width: '100%', padding: '8px 12px', textAlign: 'left', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 500, color: 'var(--text-3)', background: 'transparent', borderRadius: 6, transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 8, position: 'relative' },
  tabBtnActive: { background: 'var(--bg-3)', color: 'var(--text)' },
  tabIcon: { fontSize: 12, width: 14, textAlign: 'center', flexShrink: 0 },
  tabActiveDot: { width: 4, height: 4, borderRadius: '50%', background: 'var(--text)', marginLeft: 'auto', flexShrink: 0 },
  closeBtn: { padding: '12px 16px', border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)', transition: 'color 0.15s' },

  // Content
  content: { flex: 1, overflowY: 'auto', padding: '28px 28px' },
  tabContent: { display: 'flex', flexDirection: 'column', maxWidth: 580, gap: 0 },

  // Cards
  card: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px', boxSizing: 'border-box' as const },
  cardTitle: { fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 12 },
  dangerCard: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, background: 'rgba(237,66,69,0.04)', border: '1px solid rgba(237,66,69,0.2)', marginBottom: 10 },

  // Stats
  statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16, width: '100%' },
  statCard: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 2 },
  statIcon: { fontSize: 14, color: 'var(--text-3)', marginBottom: 4 },
  statValue: { fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text)', lineHeight: 1 },
  statLabel: { fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700, marginTop: 2 },

  // Form elements
  label: { display: 'block', fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 6 },
  input: { width: '100%', padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },

  // Buttons
  btn: { padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '0.04em', border: 'none', transition: 'opacity 0.15s', flexShrink: 0 },
  btnPrimary: { background: 'var(--text)', color: 'var(--bg)' },
  btnSecondary: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)' },
  btnDanger: { background: 'rgba(237,66,69,0.12)', color: '#ed4245', border: '1px solid rgba(237,66,69,0.25)' },
  iconBtn: { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 13, padding: '4px 6px', borderRadius: 4, transition: 'color 0.15s', flexShrink: 0 },
  actionRow: { display: 'flex', gap: 8, alignItems: 'center' },

  // Roles
  roleItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid transparent', cursor: 'pointer', borderRadius: 6, transition: 'all 0.15s', width: '100%', textAlign: 'left', background: 'transparent' },
  roleItemActive: { background: 'var(--bg-2)', border: '1px solid var(--border)' },

  // Permissions
  permRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)' },
  permRowDanger: { background: 'rgba(237,66,69,0.04)', border: '1px solid rgba(237,66,69,0.2)' },
  toggle: { width: 32, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer', position: 'relative', padding: 0, transition: 'background 0.2s', flexShrink: 0 },
  toggleThumb: { position: 'absolute', top: 2, left: 2, width: 14, height: 14, borderRadius: '50%', background: 'white', transition: 'transform 0.2s' },

  // Color picker
  colorPicker: { position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0 },
  colorSwatch: { width: 32, height: 32, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', pointerEvents: 'none' },

  // Members
  memberCard: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', transition: 'border-color 0.15s' },
  memberCardExpanded: { border: '1px solid rgba(255,255,255,0.15)' },
  avatar: { width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, flexShrink: 0 },
  badge: { fontSize: 9, letterSpacing: '0.08em', padding: '1px 5px', borderRadius: 3, background: 'rgba(255,215,0,0.1)', color: '#ffd700', border: '1px solid rgba(255,215,0,0.25)', fontFamily: 'var(--font-display)', fontWeight: 700 },

  // Mini modal
  miniOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900 },
  miniModal: { background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, width: 320, boxShadow: '0 16px 40px rgba(0,0,0,0.4)' },
};

