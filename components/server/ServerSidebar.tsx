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
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);

  // Optimistic drag state
  const [dragging, setDragging] = useState<{ type: 'channel' | 'category'; id: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
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
    setOptimisticChannels(reindexed);
    try {
      const r = await fetch(`/api/servers/${server.id}/channels`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: reindexed.map((ch, i) => ({ id: ch.id, position: i })) }),
      });
      if (!r.ok) throw new Error('Failed');
      onServerUpdate();
    } catch {
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
    setOptimisticCategories(reindexed);
    try {
      const r = await fetch(`/api/servers/${server.id}/categories`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: reindexed.map((cat, i) => ({ id: cat.id, position: i })) }),
      });
      if (!r.ok) throw new Error('Failed');
      onServerUpdate();
    } catch {
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

  const selectedCategoryLabel = newChannelCategory
    ? server.categories.find(c => c.id === newChannelCategory)?.name ?? 'No category'
    : 'No category';

  return (
    <aside className="pr-server-sidebar" onClick={() => setContextMenu(null)}>
      {/* Server header */}
      <div className="pr-sidebar-header">
        <button onClick={() => router.push('/app')} className="pr-back-btn" title="Back to DMs">
          <IconBack />
        </button>
        <div className="pr-server-name">{server.name}</div>
        {(isOwner || hasPermission('manageServer')) && (
          <button onClick={onOpenSettings} className="pr-settings-btn" title="Server Settings">
            <IconSettings />
          </button>
        )}
      </div>

      {/* Quick actions */}
      <div className="pr-quick-actions">
        {canInvite && (
          <button className="pr-action-btn" onClick={createInvite}>
            <IconInvite />
            <span>Invite People</span>
          </button>
        )}
      </div>

      {/* Channel list */}
      <div className="pr-channel-list">
        {/* Uncategorized channels */}
        {uncategorized.length > 0 && (
          <div className="pr-section">
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
                    if (draggedCh && draggedCh.categoryId !== null) moveChannelToCategory(dragging.id, null);
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
                const draggedCh = server.channels.find(c => c.id === dragging.id);
                if (draggedCh && draggedCh.categoryId !== catId) moveChannelToCategory(dragging.id, catId);
              }
              setDragging(null);
            }}
          />
        ))}

        {/* Add channel / category buttons */}
        {canManageChannels && (
          <div className="pr-add-row">
            <button className="pr-add-btn" onClick={openCreateChannel}>
              <IconPlus /> <span>Add Channel</span>
            </button>
            <button className="pr-add-btn" onClick={() => setShowCreateCategory(true)}>
              <IconFolder /> <span>Add Category</span>
            </button>
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div className="pr-context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          {contextMenu.type === 'channel' && (() => {
            const ch = server.channels.find(c => c.id === contextMenu.id);
            return (
              <>
                <button className="pr-context-item" onClick={async () => {
                  await fetch(`/api/servers/${server.id}/channel/${contextMenu.id}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isPrivate: !ch?.isPrivate, allowedRoles: ch?.allowedRoles || [] }),
                  });
                  setContextMenu(null); onServerUpdate();
                }}>
                  {ch?.isPrivate ? 'Make Public' : 'Make Private'}
                </button>
                <button className="pr-context-item pr-context-item--danger" onClick={() => deleteChannel(contextMenu.id)}>
                  Delete Channel
                </button>
              </>
            );
          })()}
          {contextMenu.type === 'category' && (
            <button className="pr-context-item pr-context-item--danger" onClick={() => deleteCategory(contextMenu.id)}>
              Delete Category
            </button>
          )}
        </div>
      )}

      {/* Create channel modal — 2 steps */}
      {showCreateChannel && (
        <Modal title={createChannelStep === 1 ? 'CREATE CHANNEL' : 'SET PERMISSIONS'} onClose={closeCreateChannel}>
          {createChannelStep === 1 ? (
            <>
              <label className="pr-label">CHANNEL NAME</label>
              <input
                className="pr-input" placeholder="general"
                value={newChannelName}
                onChange={e => setNewChannelName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { if (newChannelPrivate) setCreateChannelStep(2); else createChannel(); }}}
                autoFocus
              />
              <label className="pr-label">CATEGORY (optional)</label>
              {/* Custom dropdown — replaces native <select> */}
              <div className="pr-custom-select" onClick={e => e.stopPropagation()}>
                <button
                  type="button"
                  className="pr-custom-select__trigger"
                  onClick={() => setCategoryDropdownOpen(v => !v)}
                >
                  <span>{selectedCategoryLabel}</span>
                  <svg width="10" height="6" viewBox="0 0 10 6" style={{ transition: 'transform 0.18s', transform: categoryDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    <path d="M1 1l4 4 4-4" stroke="#666" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                  </svg>
                </button>
                {categoryDropdownOpen && (
                  <div className="pr-custom-select__dropdown">
                    <button
                      type="button"
                      className={`pr-custom-select__option${newChannelCategory === '' ? ' pr-custom-select__option--selected' : ''}`}
                      onClick={() => { setNewChannelCategory(''); setCategoryDropdownOpen(false); }}
                    >No category</button>
                    {server.categories.map(cat => (
                      <button
                        type="button"
                        key={cat.id}
                        className={`pr-custom-select__option${newChannelCategory === cat.id ? ' pr-custom-select__option--selected' : ''}`}
                        onClick={() => { setNewChannelCategory(cat.id); setCategoryDropdownOpen(false); }}
                      >{cat.name}</button>
                    ))}
                  </div>
                )}
              </div>
              <label className="pr-label" style={{ marginTop: 14 }}>CHANNEL TYPE</label>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer' }}
                onClick={() => setNewChannelPrivate(v => !v)}
              >
                <div style={{ width: 36, height: 20, borderRadius: 10, background: newChannelPrivate ? 'var(--text)' : 'var(--bg-3)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 2, left: newChannelPrivate ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: newChannelPrivate ? 'var(--bg)' : 'var(--text-3)', transition: 'left 0.2s' }} />
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
              <div className="pr-modal-actions">
                <button className="pr-cancel-btn" onClick={closeCreateChannel}>Cancel</button>
                {newChannelPrivate ? (
                  <button className="pr-confirm-btn" onClick={() => { if (newChannelName.trim()) setCreateChannelStep(2); }}>Next →</button>
                ) : (
                  <button className="pr-confirm-btn" onClick={createChannel}>Create</button>
                )}
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em', margin: 0 }}>
                  Choose who can access <strong style={{ color: 'var(--text-2)' }}>#{newChannelName}</strong>. Admins always have access.
                </p>
              </div>
              {server.roles.filter(r => !r.isDefault).length > 0 && (
                <>
                  <label className="pr-label">ROLES</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                    {server.roles.filter(r => !r.isDefault).map(role => {
                      const checked = newChannelAllowedRoles.includes(role.id);
                      return (
                        <div key={role.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: checked ? `${role.color}14` : 'var(--bg)', border: `1px solid ${checked ? role.color + '55' : 'var(--border)'}`, borderRadius: 'var(--radius)', cursor: 'pointer', transition: 'all 0.15s' }}
                          onClick={() => setNewChannelAllowedRoles(prev => prev.includes(role.id) ? prev.filter(id => id !== role.id) : [...prev, role.id])}>
                          <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${role.color}`, background: checked ? role.color : 'transparent', flexShrink: 0, transition: 'background 0.15s' }} />
                          <span style={{ fontSize: 13, color: role.color, fontFamily: 'var(--font-display)', fontWeight: 600 }}>{role.name}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-display)', marginLeft: 'auto' }}>role</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              <label className="pr-label">MEMBERS</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                {server.members.filter(m => m.userId !== server.ownerId).map(m => {
                  const checked = newChannelAllowedMembers.includes(m.userId);
                  return (
                    <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: checked ? 'rgba(255,255,255,0.06)' : 'var(--bg)', border: `1px solid ${checked ? 'rgba(255,255,255,0.2)' : 'var(--border)'}`, borderRadius: 'var(--radius)', cursor: 'pointer', transition: 'all 0.15s' }}
                      onClick={() => setNewChannelAllowedMembers(prev => prev.includes(m.userId) ? prev.filter(id => id !== m.userId) : [...prev, m.userId])}>
                      <div style={{ width: 14, height: 14, borderRadius: 3, border: '2px solid var(--text-3)', background: checked ? 'var(--text)' : 'transparent', flexShrink: 0, transition: 'background 0.15s' }} />
                      <span style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-display)', fontWeight: 500 }}>{m.nickname || m.username}</span>
                      {m.nickname && <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-display)' }}>{m.username}</span>}
                      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-display)', marginLeft: 'auto' }}>member</span>
                    </div>
                  );
                })}
              </div>
              <div className="pr-modal-actions" style={{ marginTop: 18 }}>
                <button className="pr-cancel-btn" onClick={() => setCreateChannelStep(1)}>← Back</button>
                <button className="pr-confirm-btn" onClick={createChannel}>Create Channel</button>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* Create category modal */}
      {showCreateCategory && (
        <Modal title="CREATE CATEGORY" onClose={() => setShowCreateCategory(false)}>
          <label className="pr-label">CATEGORY NAME</label>
          <input className="pr-input" placeholder="TEXT CHANNELS" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createCategory()} autoFocus />
          <div className="pr-modal-actions">
            <button className="pr-cancel-btn" onClick={() => setShowCreateCategory(false)}>Cancel</button>
            <button className="pr-confirm-btn" onClick={createCategory}>Create</button>
          </div>
        </Modal>
      )}

      {/* Invite modal */}
      {showInviteModal && (
        <Modal title="INVITE PEOPLE" onClose={() => { setShowInviteModal(false); setInviteCode(''); }}>
          <p style={{ color: 'var(--text-2)', fontSize: 12, marginBottom: 8 }}>
            Share this link to invite others to <strong>{server.name}</strong>
          </p>
          <div className="pr-invite-row">
            <input className="pr-input" style={{ flex: 1 }} value={inviteCode} readOnly />
            <button className="pr-copy-btn" onClick={() => navigator.clipboard.writeText(inviteCode)}>Copy</button>
          </div>
          <p style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 8 }}>Expires in 24 hours</p>
        </Modal>
      )}

      {/* Confirm dialog */}
      {confirmDialog && (
        <div className="pr-overlay" onClick={() => setConfirmDialog(null)}>
          <div className="pr-modal" style={{ minWidth: 280, maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 14, color: 'var(--text-2)', fontFamily: 'var(--font-display)', marginBottom: 20, lineHeight: 1.5 }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDialog(null)} className="pr-cancel-btn">Cancel</button>
              <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} className="pr-confirm-btn" style={{ background: 'var(--danger)', color: '#fff' }}>Confirm</button>
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
      className="pr-section"
      style={{ ...(isCategoryDragOver ? { background: 'rgba(255,255,255,0.03)', borderRadius: 6 } : {}), opacity: isCatDragging ? 0.4 : 1, transition: 'opacity 0.15s' }}
      onDragOver={canManage ? onCategoryDragOver : undefined}
      onDragLeave={canManage ? onCategoryDragLeave : undefined}
      onDrop={canManage ? onCategoryDrop : undefined}
    >
      <button
        className="pr-category-header"
        onClick={() => setCollapsed(v => !v)}
        onContextMenu={onCategoryContextMenu}
        draggable={canManage}
        onDragStart={canManage ? onCategoryDragStart : undefined}
        onDragEnd={canManage ? onCategoryDragEnd : undefined}
      >
        {canManage && <span style={{ fontSize: 9, color: 'var(--text-3)', opacity: 0.5, marginRight: 2 }}>⠿</span>}
        {/* Arrow always uses the same chevron character; rotation is CSS-only */}
        <span className={`pr-category-arrow pr-category-arrow--${collapsed ? 'closed' : 'open'}`}>›</span>
        <span className="pr-category-name">{category.name}</span>
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
  const cls = [
    'pr-channel-item',
    active ? 'pr-channel-item--active' : '',
    isDragOver ? 'pr-channel-item--drag-over' : '',
    isDragging ? 'pr-channel-item--dragging' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      draggable={canManage}
      className={cls}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {canManage && <span style={{ fontSize: 8, color: 'var(--text-3)', opacity: 0.4, flexShrink: 0 }}>⠿</span>}
      <span className="pr-channel-hash">{channel.isPrivate ? <IconLock /> : '#'}</span>
      <span className="pr-channel-name">{channel.name}</span>
    </button>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="pr-overlay" onClick={onClose}>
      <div className="pr-modal" onClick={e => e.stopPropagation()}>
        <div className="pr-modal-header">
          <span className="pr-modal-title">{title}</span>
          <button onClick={onClose} className="pr-close-btn">x</button>
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
