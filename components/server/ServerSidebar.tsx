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
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelCategory, setNewChannelCategory] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'channel' | 'category'; id: string } | null>(null);
  const [dragging, setDragging] = useState<{ type: 'channel' | 'category'; id: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  async function createChannel() {
    if (!newChannelName.trim()) return;
    const r = await fetch(`/api/servers/${server.id}/channels`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newChannelName, categoryId: newChannelCategory || null }),
    });
    if (r.ok) {
      const data = await r.json();
      setShowCreateChannel(false); setNewChannelName('');
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

  async function deleteCategory(categoryId: string) {
    if (!confirm('Delete this category? Channels will become uncategorized.')) return;
    await fetch(`/api/servers/${server.id}/categories?categoryId=${categoryId}`, { method: 'DELETE' });
    setContextMenu(null); onServerUpdate();
  }

  async function reorderChannels(draggedId: string, targetId: string) {
    const channels = [...server.channels].sort((a, b) => a.position - b.position);
    const dragIdx = channels.findIndex(c => c.id === draggedId);
    const targetIdx = channels.findIndex(c => c.id === targetId);
    if (dragIdx === -1 || targetIdx === -1 || dragIdx === targetIdx) return;
    const moved = channels.splice(dragIdx, 1)[0];
    channels.splice(targetIdx, 0, moved);
    // Update positions optimistically via bulk patch — fall back to re-fetch
    await Promise.all(channels.map((ch, i) =>
      fetch(`/api/servers/${server.id}/channel/${ch.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: i }),
      })
    ));
    onServerUpdate();
  }

  async function reorderCategories(draggedId: string, targetId: string) {
    const cats = [...server.categories].sort((a, b) => a.position - b.position);
    const dragIdx = cats.findIndex(c => c.id === draggedId);
    const targetIdx = cats.findIndex(c => c.id === targetId);
    if (dragIdx === -1 || targetIdx === -1 || dragIdx === targetIdx) return;
    const moved = cats.splice(dragIdx, 1)[0];
    cats.splice(targetIdx, 0, moved);
    await Promise.all(cats.map((cat, i) =>
      fetch(`/api/servers/${server.id}/categories`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: cat.id, position: i }),
      })
    ));
    onServerUpdate();
  }

  const canManageChannels = hasPermission('manageChannels');
  const canInvite = hasPermission('createInvites');

  const uncategorized = server.channels.filter(c => !c.categoryId).sort((a, b) => a.position - b.position);
  const byCategory = server.categories
    .slice().sort((a, b) => a.position - b.position)
    .map(cat => ({
      category: cat,
      channels: server.channels.filter(c => c.categoryId === cat.id).sort((a, b) => a.position - b.position),
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
                  if (dragging?.type === 'channel' && dragging.id !== ch.id) reorderChannels(dragging.id, ch.id);
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
            onChannelDrop={(chId) => {
              setDragOver(null);
              if (dragging?.type === 'channel' && dragging.id !== chId) reorderChannels(dragging.id, chId);
              setDragging(null);
            }}
          />
        ))}

        {/* Add channel / category buttons */}
        {canManageChannels && (
          <div style={styles.addRow}>
            <button style={styles.addBtn} onClick={() => setShowCreateChannel(true)}>
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
          {contextMenu.type === 'channel' && (
            <button style={{ ...styles.contextItem, color: 'var(--danger)' }} onClick={() => deleteChannel(contextMenu.id)}>
              Delete Channel
            </button>
          )}
          {contextMenu.type === 'category' && (
            <button style={{ ...styles.contextItem, color: 'var(--danger)' }} onClick={() => deleteCategory(contextMenu.id)}>
              Delete Category
            </button>
          )}
        </div>
      )}

      {/* Create channel modal */}
      {showCreateChannel && (
        <Modal title="CREATE CHANNEL" onClose={() => setShowCreateChannel(false)}>
          <label style={styles.label}>CHANNEL NAME</label>
          <input style={styles.input} placeholder="general" value={newChannelName} onChange={e => setNewChannelName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createChannel()} autoFocus />
          <label style={styles.label}>CATEGORY (optional)</label>
          <select style={styles.input} value={newChannelCategory} onChange={e => setNewChannelCategory(e.target.value)}>
            <option value="">No category</option>
            {server.categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
          <div style={styles.modalActions}>
            <button style={styles.cancelBtn} onClick={() => setShowCreateChannel(false)}>Cancel</button>
            <button style={styles.confirmBtn} onClick={createChannel}>Create</button>
          </div>
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
  onChannelDrop: (chId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div
      style={{ ...styles.section, ...(isCategoryDragOver ? { background: 'rgba(255,255,255,0.03)', borderRadius: 6 } : {}) }}
      onDragOver={canManage ? onCategoryDragOver : undefined}
      onDragLeave={canManage ? onCategoryDragLeave : undefined}
      onDrop={canManage ? onCategoryDrop : undefined}
    >
      <button
        style={{ ...styles.categoryHeader, cursor: canManage ? 'grab' : 'pointer' }}
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
          onClick={() => onChannelSelect(ch.id)}
          onContextMenu={canManage ? (e) => onChannelContextMenu(e, ch.id) : undefined}
          onDragStart={() => setDragging({ type: 'channel', id: ch.id })}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(ch.id); }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => { e.stopPropagation(); onChannelDrop(ch.id); }}
          onDragEnd={() => { setDragging(null); setDragOver(null); }}
        />
      ))}
    </div>
  );
}

function ChannelItem({ channel, active, onClick, onContextMenu, canManage, isDragOver, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }: {
  channel: ServerChannel;
  active: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  canManage?: boolean;
  isDragOver?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
}) {
  return (
    <button
      draggable={canManage}
      style={{
        ...styles.channelItem,
        background: isDragOver ? 'var(--bg-3)' : active ? 'var(--bg-3)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--text-3)',
        borderLeft: active ? '2px solid var(--text)' : isDragOver ? '2px solid rgba(255,255,255,0.2)' : '2px solid transparent',
        cursor: canManage ? 'grab' : 'pointer',
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
      <span style={styles.channelHash}>#</span>
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
  sidebar: { width: 240, minWidth: 240, height: '100vh', background: 'var(--bg-1)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' },
  header: { padding: '14px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 },
  backBtn: { color: 'var(--text-3)', padding: 4, borderRadius: 'var(--radius)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'color var(--transition)', flexShrink: 0 },
  serverName: { flex: 1, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, letterSpacing: '0.06em', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  settingsBtn: { color: 'var(--text-3)', padding: 4, borderRadius: 'var(--radius)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'color var(--transition)', flexShrink: 0 },
  quickActions: { padding: '8px 8px 0' },
  actionBtn: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-md)', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', border: '1px dashed var(--border)', transition: 'all var(--transition)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', marginBottom: 4 },
  channelList: { flex: 1, overflowY: 'auto', padding: '8px 4px' },
  section: { marginBottom: 4 },
  categoryHeader: { display: 'flex', alignItems: 'center', gap: 4, width: '100%', padding: '6px 8px', cursor: 'pointer', color: 'var(--text-3)', border: 'none', background: 'transparent', textAlign: 'left' },
  categoryArrow: { fontSize: 10, color: 'var(--text-3)', width: 12, display: 'inline-block' },
  categoryName: { fontSize: 10, letterSpacing: '0.12em', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-3)' },
  channelItem: { display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 10px', cursor: 'pointer', border: 'none', borderRadius: 'var(--radius-md)', textAlign: 'left', transition: 'all var(--transition)' },
  channelHash: { color: 'var(--text-3)', fontSize: 14, fontWeight: 400, flexShrink: 0 },
  channelName: { fontSize: 12, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  addRow: { padding: '8px 4px 0', display: 'flex', flexDirection: 'column', gap: 4 },
  addBtn: { display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 10px', borderRadius: 'var(--radius)', color: 'var(--text-3)', fontSize: 11, cursor: 'pointer', border: 'none', background: 'transparent', transition: 'color var(--transition)', letterSpacing: '0.04em' },
  contextMenu: { position: 'fixed', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 4, zIndex: 1000, minWidth: 160, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' },
  contextItem: { display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, borderRadius: 'var(--radius)' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 },
  modal: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 24, minWidth: 340, maxWidth: 480, width: '100%' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '0.1em', color: 'var(--text)' },
  closeBtn: { color: 'var(--text-3)', cursor: 'pointer', fontSize: 14, padding: 4, border: 'none', background: 'transparent' },
  label: { display: 'block', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 6, marginTop: 12 },
  input: { width: '100%', padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 13, outline: 'none' },
  modalActions: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 },
  cancelBtn: { padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12 },
  confirmBtn: { padding: '8px 20px', border: 'none', borderRadius: 'var(--radius)', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.06em' },
  inviteRow: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 },
  copyBtn: { padding: '9px 14px', background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, flexShrink: 0 },
};
