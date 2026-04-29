import { useState, useRef } from 'react';
import { useRouter } from 'next/router';
import type { ServerData, ServerChannel, ServerCategory, CurrentUser } from '@/pages/servers/[serverId]/[channelId]';

interface Props {
  server: ServerData;
  activeChannelId: string | null;
  currentUser: CurrentUser;
  isOwner: boolean;
  hasPermission: (perm: string) => boolean;
  onChannelSelect: (id: string) => void;
  onOpenSettings: () => void;
  onServerUpdate: () => void;
}

export default function ServerSidebar({
  server, activeChannelId, currentUser, isOwner, hasPermission,
  onChannelSelect, onOpenSettings, onServerUpdate
}: Props) {
  const router = useRouter();
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [createChannelStep, setCreateChannelStep] = useState<1 | 2>(1);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelCategory, setNewChannelCategory] = useState('');
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);
  const [newChannelAllowedRoles, setNewChannelAllowedRoles] = useState<string[]>([]);
  const [newChannelAllowedMembers, setNewChannelAllowedMembers] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'channel' | 'category'; id: string } | null>(null);

  // Optimistic drag state
  const [dragging, setDragging] = useState<{ type: 'channel' | 'category'; id: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  // Optimistic ordered lists (null = use server data)
  const [optimisticChannels, setOptimisticChannels] = useState<ServerChannel[] | null>(null);
  const [optimisticCategories, setOptimisticCategories] = useState<ServerCategory[] | null>(null);

  const channels = optimisticChannels ?? server.channels;
  const categories = optimisticCategories ?? server.categories;

  function openCreateChannel() {
    setNewChannelName(''); setNewChannelCategory(''); setNewChannelPrivate(false);
    setNewChannelAllowedRoles([]); setNewChannelAllowedMembers([]);
    setCreateChannelStep(1); setShowCreateChannel(true);
  }

  function closeCreateChannel() {
    setShowCreateChannel(false); setCreateChannelStep(1);
  }

  async function createChannel() {
    if (!newChannelName.trim()) return;
    const r = await fetch(`/api/servers/${server.id}/channels`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newChannelName,
        categoryId: newChannelCategory || null,
        isPrivate: newChannelPrivate,
        allowedRoles: newChannelAllowedRoles,
        allowedMembers: newChannelAllowedMembers,
      }),
    });
    if (r.ok) {
      const data = await r.json();
      closeCreateChannel();
      onServerUpdate(); onChannelSelect(data.channel.id);
    }
  }

  async function createCategory() {
    if (!newCategoryName.trim()) return;
    await fetch(`/api/servers/${server.id}/categories`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCategoryName }),
    });
    setShowCreateCategory(false); setNewCategoryName('');
    onServerUpdate();
  }

  async function createInvite() {
    const r = await fetch(`/api/servers/${server.id}/invites`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 24 }),
    });
    const data = await r.json();
    if (data.code) {
      setInviteCode(`${window.location.origin}/invite/${data.code}`);
      setShowInviteModal(true);
    }
  }

  async function deleteChannel(channelId: string) {
    await fetch(`/api/servers/${server.id}/channel/${channelId}`, { method: 'DELETE' });
    setContextMenu(null); onServerUpdate();
    if (activeChannelId === channelId) {
      const next = server.channels.find(c => c.id !== channelId);
      if (next) onChannelSelect(next.id);
    }
  }

  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

  async function _deleteCategoryConfirmed(categoryId: string) {
    await fetch(`/api/servers/${server.id}/categories?categoryId=${categoryId}`, { method: 'DELETE' });
    setContextMenu(null); onServerUpdate();
  }

  async function deleteCategory(categoryId: string) {
    setContextMenu(null);
    setConfirmDialog({ message: 'Delete this category? Channels will become uncategorized.', onConfirm: () => _deleteCategoryConfirmed(categoryId) });
  }

  async function moveChannelToCategory(channelId: string, targetCategoryId: string | null) {
    await fetch(`/api/servers/${server.id}/channel/${channelId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: targetCategoryId }),
    });
    onServerUpdate();
  }

  async function reorderChannels(draggedId: string, targetId: string) {
    const sorted = [...channels].sort((a, b) => a.position - b.position);
    const dragIdx = sorted.findIndex(c => c.id === draggedId);
    const targetIdx = sorted.findIndex(c => c.id === targetId);
    if (dragIdx === -1 || targetIdx === -1 || dragIdx === targetIdx) return;
    const moved = sorted.splice(dragIdx, 1)[0];
    sorted.splice(targetIdx, 0, moved);
    const reindexed = sorted.map((ch, i) => ({ ...ch, position: i }));
    // Optimistic update
    setOptimisticChannels(reindexed);
    try {
      const r = await fetch(`/api/servers/${server.id}/channels`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: reindexed.map((ch, i) => ({ id: ch.id, position: i })) }),
      });
      if (!r.ok) throw new Error('Failed');
      onServerUpdate();
    } catch {
      // Revert on failure
      setOptimisticChannels(null);
    }
  }

  async function reorderCategories(draggedId: string, targetId: string) {
    const sorted = [...categories].sort((a, b) => a.position - b.position);
    const dragIdx = sorted.findIndex(c => c.id === draggedId);
    const targetIdx = sorted.findIndex(c => c.id === targetId);
    if (dragIdx === -1 || targetIdx === -1 || dragIdx === targetIdx) return;
    const moved = sorted.splice(dragIdx, 1)[0];
    sorted.splice(targetIdx, 0, moved);
    const reindexed = sorted.map((cat, i) => ({ ...cat, position: i }));
    // Optimistic update
    setOptimisticCategories(reindexed);
    try {
      const r = await fetch(`/api/servers/${server.id}/categories`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: reindexed.map((cat, i) => ({ id: cat.id, position: i })) }),
      });
      if (!r.ok) throw new Error('Failed');
      onServerUpdate();
    } catch {
      // Revert on failure
      setOptimisticCategories(null);
    }
  }

  const canManageChannels = hasPermission('manageChannels');
  const canInvite = hasPermission('createInvites');

  const uncategorized = channels.filter(c => !c.categoryId).sort((a, b) => a.position - b.position);
  const byCategory = categories
    .slice().sort((a, b) => a.position - b.position)
    .map(cat => ({
      category: cat,
      channels: channels.filter(c => c.categoryId === cat.id).sort((a, b) => a.position - b.position),
    }));

  return (
    <aside style={styles.sidebar} onClick={() => setContextMenu(null)}>
      {/* Server header */}
      <div style={styles.header}>
        <button onClick={() => router.push('/app')} style={styles.backBtn} title="Back to DMs">
          <IconBack />
        </button>
        <div style={styles.serverName}>{server.name}</div>
        {(isOwner || hasPermission('manageServer')) && (
          <button onClick={onOpenSettings} style={styles.settingsBtn} title="Server Settings">
            <IconSettings />
          </button>
        )}
      </div>

      {/* Quick actions */}
      <div style={styles.quickActions}>
        {canInvite && (
          <button style={styles.actionBtn} onClick={createInvite}>
            <IconInvite />
            <span>Invite People</span>
          </button>
        )}
      </div>

      {/* Channel list */}
      <div style={styles.channelList}>
        {/* Uncategorized channels */}
        {uncategorized.length > 0 && (
          <div style={styles.section}>
            {uncategorized.map(ch => (
              <ChannelItem
                key={ch.id}
                channel={ch}
                active={activeChannelId === ch.id}
                canManage={canManageChannels}
                isDragOver={dragOver === ch.id}
                isDragging={dragging?.type === 'channel' && dragging.id === ch.id}
                onClick={() => onChannelSelect(ch.id)}
                onContextMenu={canManageChannels ? (e) => {
                  e.preventDefault(); e.stopPropagation();
                  setContextMenu({ x: e.clientX, y: e.clientY, type: 'channel', id: ch.id });
                } : undefined}
                onDragStart={() => setDragging({ type: 'channel', id: ch.id })}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(ch.id); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => {
                  e.stopPropagation();
                  setDragOver(null);
                  if (dragging?.type === 'channel') {
                    if (dragging.id !== ch.id) reorderChannels(dragging.id, ch.id);
                    const draggedCh = server.channels.find(c => c.id === dragging.id);
                    if (draggedCh && draggedCh.categoryId !== null) {
                      moveChannelToCategory(dragging.id, null);
                    }
                  }
                  setDragging(null);
                }}
                onDragEnd={() => { setDragging(null); setDragOver(null); }}
              />
            ))}
          </div>
        )}

        {/* Categorized channels */}
        {byCategory.map(({ category, channels }) => (
          <CategorySection
            key={category.id}
            category={category}
            channels={channels}
            activeChannelId={activeChannelId}
            canManage={canManageChannels}
            dragging={dragging}
            dragOver={dragOver}
            setDragOver={setDragOver}
            setDragging={setDragging}
            onChannelSelect={onChannelSelect}
            onChannelContextMenu={(e, chId) => {
              e.preventDefault(); e.stopPropagation();
              setContextMenu({ x: e.clientX, y: e.clientY, type: 'channel', id: chId });
            }}
            onCategoryContextMenu={canManageChannels ? (e) => {
              e.preventDefault(); e.stopPropagation();
              setContextMenu({ x: e.clientX, y: e.clientY, type: 'category', id: category.id });
            } : undefined}
            onCategoryDragStart={() => setDragging({ type: 'category', id: category.id })}
            onCategoryDragOver={(e) => { e.preventDefault(); setDragOver('cat:' + category.id); }}
            onCategoryDragLeave={() => setDragOver(null)}
            onCategoryDrop={() => {
              setDragOver(null);
              if (dragging?.type === 'category' && dragging.id !== category.id) reorderCategories(dragging.id, category.id);
              setDragging(null);
            }}
            onCategoryDragEnd={() => { setDragging(null); setDragOver(null); }}
            isCategoryDragOver={dragOver === 'cat:' + category.id}
            onChannelDrop={(chId, catId) => {
              setDragOver(null);
              if (dragging?.type === 'channel') {
                if (dragging.id !== chId) reorderChannels(dragging.id, chId);
                // If channel is from different category, move it
                const draggedCh = server.channels.find(c => c.id === dragging.id);
                if (draggedCh && draggedCh.categoryId !== catId) {
                  moveChannelToCategory(dragging.id, catId);
                }
              }
              setDragging(null);
            }}
          />
        ))}

        {/* Add channel / category buttons */}
        {canManageChannels && (
          <div style={styles.addRow}>
            <button style={styles.addBtn} onClick={openCreateChannel}>
              <IconPlus /> <span>Add Channel</span>
            </button>
            <button style={styles.addBtn} onClick={() => setShowCreateCategory(true)}>
              <IconFolder /> <span>Add Category</span>
            </button>
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div style={{ ...styles.contextMenu, top: contextMenu.y, left: contextMenu.x }}>
          {contextMenu.type === 'channel' && (() => {
            const ch = server.channels.find(c => c.id === contextMenu.id);
            return (
              <>
                <button style={styles.contextItem} onClick={async () => {
                  await fetch(`/api/servers/${server.id}/channel/${contextMenu.id}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isPrivate: !ch?.isPrivate, allowedRoles: ch?.allowedRoles || [] }),
                  });
                  setContextMenu(null); onServerUpdate();
                }}>
                  {ch?.isPrivate ? 'Make Public' : 'Make Private'}
                </button>
                <button style={{ ...styles.contextItem, color: 'var(--danger)' }} onClick={() => deleteChannel(contextMenu.id)}>
                  Delete Channel
                </button>
              </>
            );
          })()}
          {contextMenu.type === 'category' && (
            <button style={{ ...styles.contextItem, color: 'var(--danger)' }} onClick={() => deleteCategory(contextMenu.id)}>
              Delete Category
            </button>
          )}
        </div>
      )}

      {/* Create channel modal — 2 steps */}
      {showCreateChannel && (
        <Modal
          title={createChannelStep === 1 ? 'CREATE CHANNEL' : 'SET PERMISSIONS'}
          onClose={closeCreateChannel}
        >
          {createChannelStep === 1 ? (
            <>
              {/* Step 1: name, category, private toggle */}
              <label style={styles.label}>CHANNEL NAME</label>
              <input
                style={styles.input} placeholder="general"
                value={newChannelName}
                onChange={e => setNewChannelName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { if (newChannelPrivate) setCreateChannelStep(2); else createChannel(); }}}
                autoFocus
              />
              <label style={styles.label}>CATEGORY (optional)</label>
              <select style={styles.input} value={newChannelCategory} onChange={e => setNewChannelCategory(e.target.value)}>
                <option value="">No category</option>
                {server.categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
              <label style={{ ...styles.label, marginTop: 14 }}>CHANNEL TYPE</label>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer' }}
                onClick={() => setNewChannelPrivate(v => !v)}
              >
                <div style={{
                  width: 36, height: 20, borderRadius: 10,
                  background: newChannelPrivate ? 'var(--text)' : 'var(--bg-3)',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}>
                  <div style={{
                    position: 'absolute', top: 2, left: newChannelPrivate ? 18 : 2,
                    width: 16, height: 16, borderRadius: '50%',
                    background: newChannelPrivate ? 'var(--bg)' : 'var(--text-3)',
                    transition: 'left 0.2s',
                  }} />
                </div>
                <div>
                  <span style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-display)', display: 'block' }}>
                    {newChannelPrivate ? 'Private' : '# Public'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>
                    {newChannelPrivate ? 'Only selected roles & members can view' : 'Visible to all server members'}
                  </span>
                </div>
              </div>
              <div style={styles.modalActions}>
                <button style={styles.cancelBtn} onClick={closeCreateChannel}>Cancel</button>
                {newChannelPrivate ? (
                  <button style={styles.confirmBtn} onClick={() => { if (newChannelName.trim()) setCreateChannelStep(2); }}>
                    Next →
                  </button>
                ) : (
                  <button style={styles.confirmBtn} onClick={createChannel}>Create</button>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Step 2: roles + members selection */}
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em', margin: 0 }}>
                  Choose who can access <strong style={{ color: 'var(--text-2)' }}>#{newChannelName}</strong>. Admins always have access.
                </p>
              </div>

              {/* Roles section */}
              {server.roles.filter(r => !r.isDefault).length > 0 && (
                <>
                  <label style={styles.label}>ROLES</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                    {server.roles.filter(r => !r.isDefault).map(role => {
                      const checked = newChannelAllowedRoles.includes(role.id);
                      return (
                        <div
                          key={role.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                            background: checked ? `${role.color}14` : 'var(--bg)',
                            border: `1px solid ${checked ? role.color + '55' : 'var(--border)'}`,
                            borderRadius: 'var(--radius)', cursor: 'pointer', transition: 'all 0.15s',
                          }}
                          onClick={() => setNewChannelAllowedRoles(prev =>
                            prev.includes(role.id) ? prev.filter(id => id !== role.id) : [...prev, role.id]
                          )}
                        >
                          <div style={{
                            width: 14, height: 14, borderRadius: 3, border: `2px solid ${role.color}`,
                            background: checked ? role.color : 'transparent', flexShrink: 0, transition: 'background 0.15s',
                          }} />
                          <span style={{ fontSize: 13, color: role.color, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                            {role.name}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-display)', marginLeft: 'auto' }}>
                            role
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Members section */}
              <label style={styles.label}>MEMBERS</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                {server.members
                  .filter(m => m.userId !== server.ownerId) // owner always has access
                  .map(m => {
                    const checked = newChannelAllowedMembers.includes(m.userId);
                    return (
                      <div
                        key={m.userId}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                          background: checked ? 'rgba(255,255,255,0.06)' : 'var(--bg)',
                          border: `1px solid ${checked ? 'rgba(255,255,255,0.2)' : 'var(--border)'}`,
                          borderRadius: 'var(--radius)', cursor: 'pointer', transition: 'all 0.15s',
                        }}
                        onClick={() => setNewChannelAllowedMembers(prev =>
                          prev.includes(m.userId) ? prev.filter(id => id !== m.userId) : [...prev, m.userId]
                        )}
                      >
                        <div style={{
                          width: 14, height: 14, borderRadius: 3, border: '2px solid var(--text-3)',
                          background: checked ? 'var(--text)' : 'transparent', flexShrink: 0, transition: 'background 0.15s',
                        }} />
                        <span style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-display)', fontWeight: 500 }}>
                          {m.nickname || m.username}
                        </span>
                        {m.nickname && (
                          <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>
                            {m.username}
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-display)', marginLeft: 'auto' }}>
                          member
                        </span>
                      </div>
                    );
                  })}
              </div>

              <div style={{ ...styles.modalActions, marginTop: 18 }}>
                <button style={styles.cancelBtn} onClick={() => setCreateChannelStep(1)}>← Back</button>
                <button style={styles.confirmBtn} onClick={createChannel}>Create Channel</button>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* Create category modal */}
      {showCreateCategory && (
        <Modal title="CREATE CATEGORY" onClose={() => setShowCreateCategory(false)}>
          <label style={styles.label}>CATEGORY NAME</label>
          <input style={styles.input} placeholder="TEXT CHANNELS" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createCategory()} autoFocus />
          <div style={styles.modalActions}>
            <button style={styles.cancelBtn} onClick={() => setShowCreateCategory(false)}>Cancel</button>
            <button style={styles.confirmBtn} onClick={createCategory}>Create</button>
          </div>
        </Modal>
      )}

      {/* Invite modal */}
      {showInviteModal && (
        <Modal title="INVITE PEOPLE" onClose={() => { setShowInviteModal(false); setInviteCode(''); }}>
          <p style={{ color: 'var(--text-2)', fontSize: 12, marginBottom: 8 }}>
            Share this link to invite others to <strong>{server.name}</strong>
          </p>
          <div style={styles.inviteRow}>
            <input style={{ ...styles.input, flex: 1 }} value={inviteCode} readOnly />
            <button style={styles.copyBtn} onClick={() => navigator.clipboard.writeText(inviteCode)}>Copy</button>
          </div>
          <p style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 8 }}>Expires in 24 hours</p>
        </Modal>
      )}
      {/* Confirm dialog */}
      {confirmDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={() => setConfirmDialog(null)}>
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '24px 28px', minWidth: 280, maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 14, color: 'var(--text-2)', fontFamily: 'var(--font-display)', marginBottom: 20, lineHeight: 1.5 }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDialog(null)} style={{ padding: '7px 16px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)' }}>Cancel</button>
              <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} style={{ padding: '7px 16px', border: 'none', borderRadius: 'var(--radius)', background: 'var(--danger)', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function CategorySection({ category, channels, activeChannelId, canManage, dragging, dragOver, setDragOver, setDragging, onChannelSelect, onChannelContextMenu, onCategoryContextMenu, onCategoryDragStart, onCategoryDragOver, onCategoryDragLeave, onCategoryDrop, onCategoryDragEnd, isCategoryDragOver, onChannelDrop }: {
  category: ServerCategory;
  channels: ServerChannel[];
  activeChannelId: string | null;
  canManage: boolean;
  dragging: { type: string; id: string } | null;
  dragOver: string | null;
  setDragOver: (v: string | null) => void;
  setDragging: (v: any) => void;
  onChannelSelect: (id: string) => void;
  onChannelContextMenu: (e: React.MouseEvent, chId: string) => void;
  onCategoryContextMenu?: (e: React.MouseEvent) => void;
  onCategoryDragStart: () => void;
  onCategoryDragOver: (e: React.DragEvent) => void;
  onCategoryDragLeave: () => void;
  onCategoryDrop: () => void;
  onCategoryDragEnd: () => void;
  isCategoryDragOver: boolean;
  onChannelDrop: (chId: string, catId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const isCatDragging = dragging?.type === 'category' && dragging.id === category.id;
  return (
    <div
      style={{ ...styles.section, ...(isCategoryDragOver ? { background: 'rgba(255,255,255,0.03)', borderRadius: 6 } : {}), opacity: isCatDragging ? 0.4 : 1, transition: 'opacity 0.15s' }}
      onDragOver={canManage ? onCategoryDragOver : undefined}
      onDragLeave={canManage ? onCategoryDragLeave : undefined}
      onDrop={canManage ? onCategoryDrop : undefined}
    >
      <button
        style={{ ...styles.categoryHeader, cursor: 'pointer' }}
        onClick={() => setCollapsed(v => !v)}
        onContextMenu={onCategoryContextMenu}
        draggable={canManage}
        onDragStart={canManage ? onCategoryDragStart : undefined}
        onDragEnd={canManage ? onCategoryDragEnd : undefined}
      >
        {canManage && <span style={{ fontSize: 9, color: 'var(--text-3)', opacity: 0.5, marginRight: 2 }}>⠿</span>}
        <span style={styles.categoryArrow}>{collapsed ? '›' : '⌄'}</span>
        <span style={styles.categoryName}>{category.name}</span>
      </button>
      {!collapsed && channels.map(ch => (
        <ChannelItem
          key={ch.id}
          channel={ch}
          active={activeChannelId === ch.id}
          canManage={canManage}
          isDragOver={dragOver === ch.id}
          isDragging={dragging?.type === 'channel' && dragging.id === ch.id}
          onClick={() => onChannelSelect(ch.id)}
          onContextMenu={canManage ? (e) => onChannelContextMenu(e, ch.id) : undefined}
          onDragStart={() => setDragging({ type: 'channel', id: ch.id })}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(ch.id); }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => { e.stopPropagation(); onChannelDrop(ch.id, category.id); }}
          onDragEnd={() => { setDragging(null); setDragOver(null); }}
        />
      ))}
    </div>
  );
}

function ChannelItem({ channel, active, onClick, onContextMenu, canManage, isDragOver, isDragging, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }: {
  channel: ServerChannel;
  active: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  canManage?: boolean;
  isDragOver?: boolean;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  return (
    <button
      draggable={canManage}
      style={{
        ...styles.channelItem,
        background: isDragOver ? 'var(--bg-3)' : active ? 'var(--bg-3)' : 'transparent',
        color: active ? '#ffffff' : '#e0e0e0',
        borderLeft: active ? '2px solid var(--text)' : isDragOver ? '2px solid rgba(255,255,255,0.4)' : '2px solid transparent',
        cursor: 'pointer',
        opacity: isDragging ? 0.4 : 1,
        transform: isDragOver ? 'translateY(-1px)' : 'none',
        transition: 'all var(--transition)',
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {canManage && <span style={{ fontSize: 8, color: 'var(--text-3)', opacity: 0.4, flexShrink: 0 }}>⠿</span>}
      <span style={styles.channelHash}>{channel.isPrivate ? <IconLock /> : '#'}</span>
      <span style={styles.channelName}>{channel.name}</span>
    </button>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>{title}</span>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const IconLock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const IconBack = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const IconSettings = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
const IconInvite = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
  </svg>
);
const IconPlus = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const IconFolder = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const styles: Record<string, React.CSSProperties> = {
  sidebar: { width: 455, minWidth: 455, height: '100dvh', background: 'var(--bg-1)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' },
  header: { padding: '0 16px', height: 72, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  backBtn: { color: 'var(--text-3)', padding: 4, borderRadius: 'var(--radius)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'color var(--transition)', flexShrink: 0 },
  serverName: { flex: 1, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, letterSpacing: '0.06em', color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  settingsBtn: { color: 'var(--text-3)', padding: 4, borderRadius: 'var(--radius)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'color var(--transition)', flexShrink: 0 },
  quickActions: { padding: '10px 10px 0' },
  actionBtn: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '11px 14px', borderRadius: 'var(--radius-md)', color: '#f0f0f0', fontSize: 15, cursor: 'pointer', border: '1px dashed var(--border-bright)', transition: 'all var(--transition)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em', marginBottom: 4 },
  channelList: { flex: 1, overflowY: 'auto', padding: '10px 6px' },
  section: { marginBottom: 4 },
  categoryHeader: { display: 'flex', alignItems: 'center', gap: 4, width: '100%', padding: '10px 12px', cursor: 'pointer', color: 'var(--text-3)', border: 'none', background: 'transparent', textAlign: 'left' },
  categoryArrow: { fontSize: 13, color: '#f0f0f0', width: 16, display: 'inline-block' },
  categoryName: { fontSize: 13, letterSpacing: '0.12em', fontFamily: 'var(--font-display)', fontWeight: 700, color: '#f0f0f0' },
  channelItem: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '13px 16px', cursor: 'pointer', border: 'none', borderRadius: 'var(--radius-md)', textAlign: 'left', transition: 'all var(--transition)' },
  channelHash: { color: '#d4d4d4', fontSize: 20, fontWeight: 400, flexShrink: 0 },
  channelName: { fontSize: 18, fontFamily: 'var(--font-display)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.02em' },
  addRow: { padding: '10px 6px 0', display: 'flex', flexDirection: 'column', gap: 4 },
  addBtn: { display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '10px 14px', borderRadius: 'var(--radius)', color: '#f0f0f0', fontSize: 14, cursor: 'pointer', border: 'none', background: 'transparent', transition: 'color var(--transition)', letterSpacing: '0.04em', fontFamily: 'var(--font-display)' },
  contextMenu: { position: 'fixed', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 4, zIndex: 1000, minWidth: 180, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' },
  contextItem: { display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', borderRadius: 'var(--radius)', letterSpacing: '0.02em' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 },
  modal: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 28, minWidth: 360, maxWidth: 480, width: '100%' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  modalTitle: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, letterSpacing: '0.1em', color: 'var(--text)' },
  closeBtn: { color: 'var(--text-3)', cursor: 'pointer', fontSize: 16, padding: 4, border: 'none', background: 'transparent', fontFamily: 'var(--font-display)' },
  label: { display: 'block', fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 7, marginTop: 14 },
  input: { width: '100%', padding: '10px 13px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'var(--font-display)' },
  modalActions: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 22 },
  cancelBtn: { padding: '9px 18px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)' },
  confirmBtn: { padding: '9px 22px', border: 'none', borderRadius: 'var(--radius)', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.06em' },
  inviteRow: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 },
  copyBtn: { padding: '10px 16px', background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 700, flexShrink: 0 },
};
