import { useState } from 'react';
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
  { key: 'viewChannels', label: 'View Channels' },
  { key: 'sendMessages', label: 'Send Messages' },
  { key: 'readMessageHistory', label: 'Read Message History' },
  { key: 'manageMessages', label: 'Manage Messages' },
  { key: 'manageChannels', label: 'Manage Channels' },
  { key: 'manageRoles', label: 'Manage Roles' },
  { key: 'manageServer', label: 'Manage Server' },
  { key: 'kickMembers', label: 'Kick Members' },
  { key: 'banMembers', label: 'Ban Members' },
  { key: 'createInvites', label: 'Create Invites' },
  { key: 'administrator', label: 'Administrator', danger: true },
];

export default function ServerSettingsModal({ server, currentUser, isOwner, hasPermission, onClose, onServerUpdate, onLeave }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'overview', label: 'Overview', show: true },
    { id: 'roles', label: 'Roles', show: hasPermission('manageRoles') },
    { id: 'members', label: 'Members', show: hasPermission('kickMembers') || hasPermission('manageRoles') },
    { id: 'invites', label: 'Invites', show: isOwner },
    { id: 'danger', label: 'Danger Zone', show: true },
  ];

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.sidebar}>
          <div style={styles.sidebarTitle}>
            <span style={styles.sidebarServerName}>{server.name}</span>
            <span style={styles.sidebarSub}>SERVER SETTINGS</span>
          </div>
          {tabs.filter(t => t.show).map(t => (
            <button
              key={t.id}
              style={{
                ...styles.tabBtn,
                background: tab === t.id ? 'var(--bg-3)' : 'transparent',
                color: tab === t.id ? 'var(--text)' : t.id === 'danger' ? 'var(--danger)' : 'var(--text-3)',
                borderLeft: tab === t.id ? '2px solid var(--text)' : '2px solid transparent',
              }}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
          <button style={styles.closeBtn} onClick={onClose}>✕ Close</button>
        </div>
        <div style={styles.content}>
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

// ─── Overview Tab ──────────────────────────────────────────────────
function OverviewTab({ server, isOwner, hasPermission, onUpdate }: { server: ServerData; isOwner: boolean; hasPermission: (p: string) => boolean; onUpdate: () => void }) {
  const [name, setName] = useState(server.name);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const canEdit = isOwner || hasPermission('manageServer');

  async function save() {
    if (!name.trim() || name === server.name) return;
    setSaving(true);
    await fetch(`/api/servers/${server.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onUpdate();
  }

  return (
    <div style={styles.tabContent}>
      <h2 style={styles.tabTitle}>Overview</h2>
      <label style={styles.label}>SERVER NAME</label>
      <input
        style={{ ...styles.input, opacity: canEdit ? 1 : 0.5 }}
        value={name}
        onChange={e => setName(e.target.value)}
        disabled={!canEdit}
        maxLength={50}
      />
      {canEdit && (
        <button style={styles.saveBtn} onClick={save} disabled={saving || name === server.name}>
          {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save Changes'}
        </button>
      )}
      <div style={styles.infoGrid}>
        <div style={styles.infoItem}>
          <span style={styles.infoLabel}>MEMBERS</span>
          <span style={styles.infoValue}>{server.members.length}</span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.infoLabel}>CHANNELS</span>
          <span style={styles.infoValue}>{server.channels.length}</span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.infoLabel}>ROLES</span>
          <span style={styles.infoValue}>{server.roles.length}</span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.infoLabel}>CATEGORIES</span>
          <span style={styles.infoValue}>{server.categories.length}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Roles Tab ──────────────────────────────────────────────────────
function RolesTab({ server, onUpdate }: { server: ServerData; onUpdate: () => void }) {
  const [selectedRole, setSelectedRole] = useState<ServerRole | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#ffffff');
  const [showCreate, setShowCreate] = useState(false);
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [editColor, setEditColor] = useState('#ffffff');
  const [editName, setEditName] = useState('');

  function selectRole(role: ServerRole) {
    setSelectedRole(role);
    setPerms({ ...role.permissions });
    setEditColor(role.color);
    setEditName(role.name);
  }

  async function createRole() {
    if (!newRoleName.trim()) return;
    await fetch(`/api/servers/${server.id}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newRoleName, color: newRoleColor }),
    });
    setShowCreate(false);
    setNewRoleName('');
    setNewRoleColor('#ffffff');
    onUpdate();
  }

  async function saveRole() {
    if (!selectedRole) return;
    await fetch(`/api/servers/${server.id}/roles`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId: selectedRole.id, name: editName, color: editColor, permissions: perms }),
    });
    onUpdate();
    setSelectedRole(null);
  }

  async function deleteRole(roleId: string) {
    if (!confirm('Delete this role?')) return;
    await fetch(`/api/servers/${server.id}/roles?roleId=${roleId}`, { method: 'DELETE' });
    setSelectedRole(null);
    onUpdate();
  }

  return (
    <div style={styles.tabContent}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={styles.tabTitle}>Roles</h2>
        <button style={styles.createBtn} onClick={() => setShowCreate(true)}>+ New Role</button>
      </div>

      {showCreate && (
        <div style={styles.createRoleForm}>
          <label style={styles.label}>ROLE NAME</label>
          <input style={styles.input} value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="New Role" autoFocus />
          <label style={styles.label}>COLOR</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <input type="color" value={newRoleColor} onChange={e => setNewRoleColor(e.target.value)} style={{ width: 40, height: 32, border: 'none', background: 'none', cursor: 'pointer' }} />
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{newRoleColor}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={styles.cancelBtn} onClick={() => setShowCreate(false)}>Cancel</button>
            <button style={styles.saveBtn} onClick={createRole}>Create Role</button>
          </div>
        </div>
      )}

      <div style={styles.rolesList}>
        {server.roles.slice().sort((a, b) => b.position - a.position).map(role => (
          <button
            key={role.id}
            style={{
              ...styles.roleItem,
              background: selectedRole?.id === role.id ? 'var(--bg-3)' : 'transparent',
              borderLeft: selectedRole?.id === role.id ? `3px solid ${role.color}` : '3px solid transparent',
            }}
            onClick={() => selectRole(role)}
          >
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: role.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text-2)' }}>{role.name}</span>
            {role.isDefault && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>default</span>}
          </button>
        ))}
      </div>

      {selectedRole && (
        <div style={styles.roleEditor}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={styles.sectionTitle}>EDIT ROLE</span>
            <button style={styles.closeEditorBtn} onClick={() => setSelectedRole(null)}>✕</button>
          </div>

          {!selectedRole.isDefault && (
            <>
              <label style={styles.label}>NAME</label>
              <input style={styles.input} value={editName} onChange={e => setEditName(e.target.value)} />
            </>
          )}

          <label style={styles.label}>COLOR</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} style={{ width: 40, height: 32, border: 'none', background: 'none', cursor: 'pointer' }} />
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{editColor}</span>
          </div>

          <label style={styles.label}>PERMISSIONS</label>
          <div style={styles.permsList}>
            {PERMISSIONS.map(p => (
              <div key={p.key} style={styles.permRow}>
                <div>
                  <div style={{ fontSize: 12, color: p.danger ? 'var(--danger)' : 'var(--text-2)' }}>{p.label}</div>
                </div>
                <button
                  style={{
                    ...styles.toggleSwitch,
                    background: perms[p.key] ? (p.danger ? 'var(--danger)' : 'var(--success)') : 'var(--bg-4)',
                  }}
                  onClick={() => setPerms(prev => ({ ...prev, [p.key]: !prev[p.key] }))}
                >
                  <div style={{
                    ...styles.toggleThumb,
                    transform: perms[p.key] ? 'translateX(14px)' : 'translateX(0)',
                  }} />
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'space-between' }}>
            {!selectedRole.isDefault && (
              <button style={styles.dangerBtn} onClick={() => deleteRole(selectedRole.id)}>Delete Role</button>
            )}
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <button style={styles.cancelBtn} onClick={() => setSelectedRole(null)}>Cancel</button>
              <button style={styles.saveBtn} onClick={saveRole}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Members Tab ────────────────────────────────────────────────────
function MembersTab({ server, currentUserId, isOwner, hasPermission, onUpdate }: {
  server: ServerData; currentUserId: string; isOwner: boolean; hasPermission: (p: string) => boolean; onUpdate: () => void;
}) {
  const canKick = hasPermission('kickMembers');

  async function kickMember(userId: string, username: string) {
    if (!confirm(`Kick ${username}?`)) return;
    await fetch(`/api/servers/${server.id}/members/${userId}`, { method: 'DELETE' });
    onUpdate();
  }

  return (
    <div style={styles.tabContent}>
      <h2 style={styles.tabTitle}>Members ({server.members.length})</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {server.members.map(member => {
          const isMe = member.userId === currentUserId;
          const isMemberOwner = member.userId === server.ownerId;
          const hue = member.username.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
          return (
            <div key={member.userId} style={styles.memberRow}>
              <div style={{ ...styles.smallAvatar, background: `hsl(${hue}, 10%, 20%)`, color: `hsl(${hue}, 20%, 80%)` }}>
                {member.username.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  {member.username}
                  {isMemberOwner && <span style={{ marginLeft: 6, fontSize: 10, color: '#ffd700' }}>owner</span>}
                  {isMe && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--success)' }}>you</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  Joined {new Date(member.joinedAt).toLocaleDateString()}
                </div>
              </div>
              {!isMe && !isMemberOwner && canKick && (
                <button style={{ ...styles.dangerBtn, padding: '4px 10px', fontSize: 11 }} onClick={() => kickMember(member.userId, member.username)}>
                  Kick
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Invites Tab ────────────────────────────────────────────────────
function InvitesTab({ server }: { server: ServerData }) {
  const [invites, setInvites] = useState<{ code: string; uses: number; maxUses: number; expiresAt: string | null; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newInvite, setNewInvite] = useState('');

  async function load() {
    const r = await fetch(`/api/servers/${server.id}/invites`);
    if (r.ok) { const d = await r.json(); setInvites(d.invites); }
    setLoading(false);
  }

  useState(() => { load(); });

  async function create() {
    const r = await fetch(`/api/servers/${server.id}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 0 }),
    });
    const d = await r.json();
    if (d.code) {
      setNewInvite(`${window.location.origin}/invite/${d.code}`);
      load();
    }
  }

  return (
    <div style={styles.tabContent}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={styles.tabTitle}>Invites</h2>
        <button style={styles.createBtn} onClick={create}>+ Create Invite</button>
      </div>
      {newInvite && (
        <div style={styles.inviteBanner}>
          <span style={{ fontSize: 11, color: 'var(--success)' }}>New invite created:</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...styles.input, flex: 1 }} value={newInvite} readOnly />
            <button style={styles.createBtn} onClick={() => { navigator.clipboard.writeText(newInvite); }}>Copy</button>
          </div>
        </div>
      )}
      {loading ? <p style={{ color: 'var(--text-3)', fontSize: 12 }}>Loading...</p> : invites.length === 0 ? (
        <p style={{ color: 'var(--text-3)', fontSize: 12 }}>No invites yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {invites.map(inv => (
            <div key={inv.code} style={styles.inviteRow}>
              <code style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'monospace' }}>{inv.code}</code>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{inv.uses} use{inv.uses !== 1 ? 's' : ''}</span>
              {inv.expiresAt ? (
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Expires {new Date(inv.expiresAt).toLocaleDateString()}</span>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Never expires</span>
              )}
              <button style={styles.createBtn} onClick={() => navigator.clipboard.writeText(`${window.location.origin}/invite/${inv.code}`)}>Copy</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Danger Zone ────────────────────────────────────────────────────
function DangerTab({ server, isOwner, onLeave, onDelete }: { server: ServerData; isOwner: boolean; onLeave: () => void; onDelete: () => void }) {
  async function leaveServer() {
    if (!confirm('Leave this server?')) return;
    await fetch(`/api/servers/${server.id}/leave`, { method: 'POST' });
    onLeave();
  }

  async function deleteServer() {
    const confirm1 = confirm(`Delete "${server.name}"? This cannot be undone.`);
    if (!confirm1) return;
    const input = prompt(`Type the server name to confirm: ${server.name}`);
    if (input !== server.name) { alert('Name did not match.'); return; }
    await fetch(`/api/servers/${server.id}`, { method: 'DELETE' });
    onDelete();
  }

  return (
    <div style={styles.tabContent}>
      <h2 style={{ ...styles.tabTitle, color: 'var(--danger)' }}>Danger Zone</h2>
      {!isOwner && (
        <div style={styles.dangerCard}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Leave Server</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>You will lose access to all channels.</div>
          </div>
          <button style={styles.dangerBtn} onClick={leaveServer}>Leave</button>
        </div>
      )}
      {isOwner && (
        <div style={styles.dangerCard}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--danger)' }}>Delete Server</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Permanently delete this server and all its data. This cannot be undone.</div>
          </div>
          <button style={styles.dangerBtn} onClick={deleteServer}>Delete</button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 800 },
  modal: { background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 4, display: 'flex', width: '80vw', maxWidth: 800, height: '80vh', overflow: 'hidden' },
  sidebar: { width: 200, minWidth: 200, background: 'var(--bg-2)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '20px 0', overflow: 'hidden' },
  sidebarTitle: { padding: '0 16px 16px', borderBottom: '1px solid var(--border)', marginBottom: 8 },
  sidebarServerName: { display: 'block', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 2 },
  sidebarSub: { fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)' },
  tabBtn: { width: '100%', padding: '9px 16px', textAlign: 'left', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-mono)', transition: 'all var(--transition)', borderLeft: '2px solid transparent' },
  closeBtn: { marginTop: 'auto', padding: '10px 16px', color: 'var(--text-3)', cursor: 'pointer', border: 'none', background: 'transparent', textAlign: 'left', fontSize: 12 },
  content: { flex: 1, overflowY: 'auto', padding: '28px 32px' },
  tabContent: { display: 'flex', flexDirection: 'column', gap: 0, maxWidth: 520 },
  tabTitle: { fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 20 },
  label: { display: 'block', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 6, marginTop: 16 },
  input: { width: '100%', padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 13, outline: 'none' },
  saveBtn: { marginTop: 12, padding: '9px 20px', background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.06em' },
  createBtn: { padding: '7px 14px', background: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)' },
  cancelBtn: { padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12 },
  dangerBtn: { padding: '7px 14px', background: 'var(--danger-dim)', color: 'var(--danger)', border: '1px solid rgba(255,51,51,0.3)', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 24 },
  infoItem: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' },
  infoLabel: { display: 'block', fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 4 },
  infoValue: { fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text)' },
  rolesList: { display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 },
  roleItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius)', transition: 'all var(--transition)', width: '100%', textAlign: 'left' },
  roleEditor: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 20, marginTop: 8 },
  sectionTitle: { fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700 },
  closeEditorBtn: { border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 14 },
  permsList: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 },
  permRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-3)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' },
  toggleSwitch: { width: 32, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer', position: 'relative', padding: 0, transition: 'background 0.2s', flexShrink: 0 },
  toggleThumb: { position: 'absolute', top: 2, left: 2, width: 14, height: 14, borderRadius: '50%', background: 'white', transition: 'transform 0.2s' },
  memberRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' },
  smallAvatar: { width: 28, height: 28, borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, flexShrink: 0 },
  createRoleForm: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16 },
  dangerCard: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'var(--danger-dim)', border: '1px solid rgba(255,51,51,0.2)', borderRadius: 'var(--radius-md)', marginBottom: 12 },
  inviteRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' },
  inviteBanner: { padding: 12, background: 'var(--success-dim)', border: '1px solid rgba(51,255,153,0.2)', borderRadius: 'var(--radius-md)', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 },
};
