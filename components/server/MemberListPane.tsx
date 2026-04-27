import { useState } from 'react';
import type { ServerData, ServerRole } from '@/pages/servers/[serverId]/[channelId]';

interface Props {
  server: ServerData;
  currentUserId: string;
  isOwner: boolean;
  hasPermission: (perm: string) => boolean;
  onServerUpdate: () => void;
}

export default function MemberListPane({ server, currentUserId, isOwner, hasPermission, onServerUpdate }: Props) {
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [showRoleModal, setShowRoleModal] = useState<string | null>(null); // userId

  const canKick = hasPermission('kickMembers');
  const canManageRoles = hasPermission('manageRoles');

  async function kickMember(userId: string) {
    if (!confirm('Kick this member?')) return;
    await fetch(`/api/servers/${server.id}/members/${userId}`, { method: 'DELETE' });
    onServerUpdate();
  }

  // Group members by highest role
  const roleOrder = new Map(server.roles.map((r, i) => [r.id, server.roles.length - i]));

  const getHighestRole = (roles: string[]): ServerRole | null => {
    let highest: ServerRole | null = null;
    let highestPos = -1;
    for (const roleId of roles) {
      const role = server.roles.find(r => r.id === roleId);
      if (role && role.position > highestPos) {
        highestPos = role.position;
        highest = role;
      }
    }
    return highest;
  };

  const ownerMember = server.members.find(m => m.userId === server.ownerId);
  const otherMembers = server.members.filter(m => m.userId !== server.ownerId);

  // Sort others by highest role
  otherMembers.sort((a, b) => {
    const aRole = getHighestRole(a.roles);
    const bRole = getHighestRole(b.roles);
    return (bRole?.position || 0) - (aRole?.position || 0);
  });

  const allMembers = ownerMember ? [ownerMember, ...otherMembers] : otherMembers;

  return (
    <aside style={styles.pane}>
      <div style={styles.header}>
        <span style={styles.title}>MEMBERS — {server.members.length}</span>
      </div>
      <div style={styles.list}>
        {allMembers.map(member => {
          const isMe = member.userId === currentUserId;
          const isMemberOwner = member.userId === server.ownerId;
          const highestRole = getHighestRole(member.roles);
          const color = highestRole?.color || 'var(--text-2)';
          const hue = member.username.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
          const initials = member.username.slice(0, 2).toUpperCase();

          return (
            <div key={member.userId} style={styles.memberItem}>
              <div style={{
                ...styles.avatar,
                background: `hsl(${hue}, 10%, 20%)`,
                border: `1px solid hsl(${hue}, 10%, 30%)`,
                color: `hsl(${hue}, 20%, 80%)`,
              }}>
                {initials}
              </div>
              <div style={styles.memberInfo}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ ...styles.memberName, color }}>
                    {member.nickname || member.username}
                  </span>
                  {isMemberOwner && <span style={styles.ownerBadge}>owner</span>}
                </div>
                {member.roles.filter(rId => {
                  const r = server.roles.find(ro => ro.id === rId);
                  return r && !r.isDefault;
                }).slice(0, 2).map(roleId => {
                  const role = server.roles.find(r => r.id === roleId);
                  if (!role) return null;
                  return (
                    <span key={roleId} style={{ ...styles.roleBadge, borderColor: role.color, color: role.color }}>
                      {role.name}
                    </span>
                  );
                })}
              </div>
              {!isMe && !isMemberOwner && (canKick || canManageRoles) && (
                <div style={styles.memberActions}>
                  {canManageRoles && (
                    <button style={styles.actionBtn} onClick={() => setShowRoleModal(member.userId)} title="Manage roles">
                      <IconRole />
                    </button>
                  )}
                  {canKick && (
                    <button style={{ ...styles.actionBtn, color: 'var(--danger)' }} onClick={() => kickMember(member.userId)} title="Kick member">
                      <IconKick />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showRoleModal && (
        <RoleAssignModal
          server={server}
          userId={showRoleModal}
          onClose={() => setShowRoleModal(null)}
          onUpdate={onServerUpdate}
        />
      )}
    </aside>
  );
}

function RoleAssignModal({ server, userId, onClose, onUpdate }: {
  server: ServerData;
  userId: string;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const member = server.members.find(m => m.userId === userId);
  if (!member) return null;

  const nonDefaultRoles = server.roles.filter(r => !r.isDefault);

  async function toggleRole(roleId: string, has: boolean) {
    await fetch(`/api/servers/${server.id}/members/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(has ? { removeRoles: [roleId] } : { addRoles: [roleId] }),
    });
    onUpdate();
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>MANAGE ROLES — {member.username}</span>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {nonDefaultRoles.map(role => {
            const has = member.roles.includes(role.id);
            return (
              <div key={role.id} style={styles.roleRow}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: role.color }} />
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{role.name}</span>
                </div>
                <button
                  style={{ ...styles.toggleBtn, background: has ? 'var(--text)' : 'var(--bg-3)', color: has ? 'var(--bg)' : 'var(--text-3)' }}
                  onClick={() => toggleRole(role.id, has)}
                >
                  {has ? 'Remove' : 'Add'}
                </button>
              </div>
            );
          })}
          {nonDefaultRoles.length === 0 && (
            <p style={{ color: 'var(--text-3)', fontSize: 12 }}>No roles created yet. Add roles in Server Settings.</p>
          )}
        </div>
      </div>
    </div>
  );
}

const IconRole = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);
const IconKick = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const styles: Record<string, React.CSSProperties> = {
  pane: {
    width: 220,
    minWidth: 220,
    height: '100vh',
    background: 'var(--bg-1)',
    borderLeft: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '14px 14px 10px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  title: {
    fontSize: 10,
    letterSpacing: '0.14em',
    color: 'var(--text-3)',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  memberItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 6px',
    borderRadius: 'var(--radius-md)',
    transition: 'background var(--transition)',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 'var(--radius)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: 11,
    flexShrink: 0,
    letterSpacing: 0.5,
    userSelect: 'none',
  },
  memberInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  memberName: {
    fontSize: 12,
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  ownerBadge: {
    fontSize: 9,
    color: '#ffd700',
    letterSpacing: '0.06em',
    fontFamily: 'var(--font-mono)',
  },
  roleBadge: {
    fontSize: 9,
    padding: '1px 5px',
    border: '1px solid',
    borderRadius: 2,
    letterSpacing: '0.04em',
    display: 'inline-block',
    width: 'fit-content',
  },
  memberActions: {
    display: 'flex',
    gap: 2,
    flexShrink: 0,
  },
  actionBtn: {
    padding: 4,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: 'var(--text-3)',
    display: 'flex',
    alignItems: 'center',
    borderRadius: 'var(--radius)',
    transition: 'color var(--transition)',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 500,
  },
  modal: {
    background: 'var(--bg-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: 24,
    minWidth: 340,
    maxWidth: 440,
    width: '100%',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: '0.1em',
    color: 'var(--text)',
  },
  closeBtn: {
    color: 'var(--text-3)',
    cursor: 'pointer',
    fontSize: 14,
    padding: 4,
    border: 'none',
    background: 'transparent',
  },
  roleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    background: 'var(--bg-3)',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
  },
  toggleBtn: {
    padding: '4px 12px',
    border: 'none',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    letterSpacing: '0.06em',
  },
};
