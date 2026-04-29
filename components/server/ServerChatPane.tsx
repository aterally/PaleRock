import { useState, useEffect, useRef, useCallback } from 'react';
import type { ServerData, ServerChannel, CurrentUser, ServerMember } from '@/pages/servers/[serverId]/[channelId]';
import { Avatar } from '@/components/Sidebar';

interface Message {
  id: string;
  content: string;
  authorId: string;
  authorUsername: string;
  authorAvatar?: string | null;
  createdAt: string;
  replyTo?: { id: string; authorUsername: string; content: string } | null;
}

interface Props {
  server: ServerData;
  channel: ServerChannel;
  currentUser: CurrentUser;
  myMember: ServerMember | null | undefined;
  isOwner: boolean;
  hasPermission: (perm: string) => boolean;
  showMembers: boolean;
  onToggleMembers: () => void;
}

export default function ServerChatPane({
  server, channel, currentUser, myMember, isOwner, hasPermission, showMembers, onToggleMembers
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [replyTo, setReplyTo] = useState<{ id: string; authorUsername: string; content: string } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ msg: Message; x: number; y: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastIdRef = useRef<string | null>(null);
  const canSend = hasPermission('sendMessages');

  // Live countdown ticker
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const mutedUntilMs = myMember?.mutedUntil ? new Date(myMember.mutedUntil).getTime() : 0;
  const isMuted = mutedUntilMs > now;
  const muteSecondsLeft = isMuted ? Math.ceil((mutedUntilMs - now) / 1000) : 0;

  function formatMuteTime(secs: number) {
    if (secs >= 3600) {
      const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
      return `${h}h ${m}m ${s}s`;
    }
    if (secs >= 60) {
      const m = Math.floor(secs / 60), s = secs % 60;
      return `${m}m ${s}s`;
    }
    return `${secs}s`;
  }

  const [profilePopup, setProfilePopup] = useState<{ userId: string; username: string; x: number; y: number } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

  function openProfile(e: React.MouseEvent, authorId: string, authorName: string) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(rect.right + 8, window.innerWidth - 268);
    const y = Math.max(8, Math.min(rect.top, window.innerHeight - 300));
    setProfilePopup({ userId: authorId, username: authorName, x, y });
  }

  const fetchMessages = useCallback(async () => {
    const r = await fetch(`/api/servers/${server.id}/messages/${channel.id}`);
    if (r.ok) {
      const data = await r.json();
      const msgs = data.messages || [];
      setMessages(msgs);
      if (msgs.length > 0) {
        lastIdRef.current = msgs[msgs.length - 1].id;
      }
    }
    setLoading(false);
  }, [server.id, channel.id]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    lastIdRef.current = null;
    fetchMessages();
  }, [fetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Poll for new messages
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!lastIdRef.current) return;
      const r = await fetch(`/api/servers/${server.id}/poll/${channel.id}?after=${lastIdRef.current}`);
      if (r.ok) {
        const data = await r.json();
        const msgs = data.messages || [];
        if (msgs.length > 0) {
          setMessages(prev => [...prev, ...msgs]);
          lastIdRef.current = msgs[msgs.length - 1].id;
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [server.id, channel.id]);

  async function sendMessage() {
    const content = input.trim();
    if (!content || !canSend || isMuted) return;
    setInput('');
    const replyingTo = replyTo;
    setReplyTo(null);
    const r = await fetch(`/api/servers/${server.id}/messages/${channel.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, replyTo: replyingTo }),
    });
    if (r.ok) {
      const data = await r.json();
      setMessages(prev => [...prev, data.message]);
      lastIdRef.current = data.message.id;
    }
  }

  async function deleteMessage(msgId: string) {
    await fetch(`/api/servers/${server.id}/message/${msgId}`, { method: 'DELETE' });
    setMessages(prev => prev.filter(m => m.id !== msgId));
  }

  function groupMessages(msgs: Message[]) {
    const groups: { author: string; authorId: string; authorAvatar?: string | null; messages: Message[]; time: string }[] = [];
    for (const msg of msgs) {
      const last = groups[groups.length - 1];
      const timeDiff = last ? (new Date(msg.createdAt).getTime() - new Date(last.messages[last.messages.length - 1].createdAt).getTime()) : Infinity;
      if (last && last.authorId === msg.authorId && timeDiff < 5 * 60 * 1000) {
        last.messages.push(msg);
      } else {
        groups.push({ author: msg.authorUsername, authorId: msg.authorId, authorAvatar: msg.authorAvatar, messages: [msg], time: msg.createdAt });
      }
    }
    return groups;
  }

  // Get member role color
  function getMemberColor(authorId: string) {
    const member = server.members.find(m => m.userId === authorId);
    if (!member) return 'var(--text)';
    const highestRole = member.roles
      .map(roleId => server.roles.find(r => r.id === roleId))
      .filter(Boolean)
      .sort((a, b) => (b?.position || 0) - (a?.position || 0))[0];
    return highestRole?.color || 'var(--text)';
  }

  const groups = groupMessages(messages);

  return (
    <div className="pr-chat-pane" onClick={() => { setProfilePopup(null); setCtxMenu(null); }}>
      {/* Channel header */}
      <div className="pr-chat-header">
        <div style={styles.channelInfo}>
          <span style={styles.hash}>#</span>
          <span style={styles.channelName}>{channel.name}</span>
          {channel.topic && (
            <>
              <div style={styles.divider} />
              <span style={styles.topic}>{channel.topic}</span>
            </>
          )}
        </div>
        <button
          style={{ ...styles.headerBtn, color: showMembers ? 'var(--text)' : 'var(--text-3)' }}
          onClick={onToggleMembers}
          title="Toggle member list"
        >
          <IconMembers />
        </button>
      </div>

      {/* Messages */}
      <div className="pr-chat-message-area">
        {loading ? (
          <div style={styles.loadingState}>
            <span className="spinner" style={{ width: 18, height: 18 }} />
          </div>
        ) : messages.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.channelIconLarge}>#</div>
            <p style={styles.emptyTitle}>Welcome to #{channel.name}</p>
            {channel.topic && <p style={styles.emptyTopic}>{channel.topic}</p>}
            <p style={styles.emptyHint}>This is the beginning of the #{channel.name} channel.</p>
          </div>
        ) : (
          <>
            {groups.map((group, i) => {
              const color = getMemberColor(group.authorId);
              return (
                <div key={i} className="pr-message-group">
                  <div
                    style={{ cursor: 'pointer', flexShrink: 0 }}
                    onClick={(e) => openProfile(e, group.authorId, group.author)}
                    title="View profile"
                  >
                    <Avatar username={group.author} avatar={group.authorAvatar} size={34} />
                  </div>
                  <div style={styles.groupContent}>
                    <div style={styles.groupHeader}>
                      <span
                        className="pr-message-author"
                        style={{ color, cursor: 'pointer' }}
                        onClick={(e) => openProfile(e, group.authorId, group.author)}
                        title="View profile"
                      >{group.author}</span>
                      {(() => {
                        const m = server.members.find(m => m.userId === group.authorId);
                        const mutedMs = m?.mutedUntil ? new Date(m.mutedUntil).getTime() : 0;
                        const isMemberMuted = mutedMs > now;
                        if (!isMemberMuted) return null;
                        const msLeft = mutedMs - now;
                        const totalMins = Math.ceil(msLeft / 60000);
                        const durationLabel = totalMins < 60 ? `${totalMins}m` : totalMins < 1440 ? `${Math.ceil(totalMins / 60)}h` : `${Math.ceil(totalMins / 1440)}d`;
                        return (
                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(237,66,69,0.12)', color: '#ed4245', border: '1px solid rgba(237,66,69,0.3)', fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.06em', flexShrink: 0 }}>MUTED {durationLabel}</span>
                        );
                      })()}
                      <span style={styles.timestamp}>
                        {new Date(group.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {group.messages.map(msg => {
                      let lpTimer: ReturnType<typeof setTimeout> | null = null;
                      function handleTouchStart(e: React.TouchEvent) {
                        const touch = e.touches[0];
                        const tx = touch.clientX;
                        const ty = touch.clientY;
                        lpTimer = setTimeout(() => {
                          const mx = Math.min(tx, window.innerWidth - 180);
                          const my = Math.min(ty, window.innerHeight - 120);
                          setCtxMenu({ msg, x: mx, y: my });
                        }, 500);
                      }
                      function handleTouchEnd() {
                        if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
                      }
                      return (
                      <div key={msg.id} className="msg-wrap" style={{ position: 'relative' }}
                        onTouchStart={handleTouchStart}
                        onTouchEnd={handleTouchEnd}
                        onTouchMove={handleTouchEnd}
                      >
                        {msg.replyTo && (
                          <div style={{ fontSize: 14, color: '#d4d4d4', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4, fontStyle: 'italic' }}>
                            <span style={{ opacity: 0.6 }}>↩</span>
                            <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>{msg.replyTo.authorUsername}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200, opacity: 0.8 }}>{msg.replyTo.content}</span>
                          </div>
                        )}
                        <p className="pr-message-text">{renderContent(msg.content)}</p>
                        <div className="msg-actions" style={{ position: 'absolute', top: 0, right: 0, display: 'flex', gap: 4, opacity: 0, transition: 'opacity 0.1s' }}>
                          <button title="Reply" onClick={() => { setReplyTo({ id: msg.id, authorUsername: msg.authorUsername, content: msg.content }); inputRef.current?.focus(); }}
                            style={{ padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-2)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', lineHeight: 1 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                          </button>
                          {(msg.authorId === currentUser.id || isOwner || hasPermission('manageMessages')) && (
                            <button title="Delete" onClick={() => { setConfirmDialog({ message: 'Delete this message?', onConfirm: () => deleteMessage(msg.id) }); }}
                              style={{ padding: '4px 6px', border: '1px solid rgba(237,66,69,0.35)', borderRadius: 4, background: 'rgba(237,66,69,0.12)', color: '#ff6b6b', cursor: 'pointer', display: 'flex', alignItems: 'center', lineHeight: 1 }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                            </button>
                          )}
                        </div>
                      </div>
                    );})}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Long-press context menu (touch devices) */}
      {ctxMenu && (
        <div
          className="lp-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <button onClick={() => {
            setReplyTo({ id: ctxMenu.msg.id, authorUsername: ctxMenu.msg.authorUsername, content: ctxMenu.msg.content });
            inputRef.current?.focus();
            setCtxMenu(null);
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
            <span>Reply</span>
          </button>
          {(ctxMenu.msg.authorId === currentUser.id || isOwner || hasPermission('manageMessages')) && (
            <>
              <hr />
              <button className="danger" onClick={() => {
                setCtxMenu(null);
                setConfirmDialog({ message: 'Delete this message?', onConfirm: () => deleteMessage(ctxMenu.msg.id) });
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                <span>Delete</span>
              </button>
            </>
          )}
        </div>
      )}
      {/* Profile popup */}
      {profilePopup && (() => {
        const member = server.members.find(m => m.userId === profilePopup.userId);
        if (!member) return null;
        const hue = member.username.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0) % 360;
        const profileRoles = server.roles.filter(r => !r.isDefault && member.roles.includes(r.id));
        const mutedMs = member.mutedUntil ? new Date(member.mutedUntil).getTime() : 0;
        const isMuted = mutedMs > now;
        const mutedTimeLabel = isMuted ? (() => {
          const totalMins = Math.ceil((mutedMs - now) / 60000);
          if (totalMins < 60) return `MUTED ${totalMins}m`;
          if (totalMins < 1440) return `MUTED ${Math.ceil(totalMins / 60)}h`;
          return `MUTED ${Math.ceil(totalMins / 1440)}d`;
        })() : null;
        return (
          <div
            style={{ position: 'fixed', top: profilePopup.y, left: profilePopup.x, width: 256, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', zIndex: 1000, boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ height: 56, background: `hsl(${hue},20%,14%)` }} />
            <div style={{ padding: '0 16px 16px' }}>
              <div style={{ marginTop: -24, marginBottom: 8 }}>
                <Avatar username={member.username} avatar={member.avatar} size={48} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{member.nickname || member.username}</div>
                {mutedTimeLabel && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(237,66,69,0.12)', color: '#ed4245', border: '1px solid rgba(237,66,69,0.3)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>{mutedTimeLabel}</span>}
              </div>
              {member.nickname && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1, fontFamily: 'var(--font-mono)' }}>{member.username}</div>}
              {member.pronouns && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2, fontStyle: 'italic' }}>{member.pronouns}</div>}
              {member.bio && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.5 }}>{member.bio}</div>}
              {profileRoles.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-2)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>ROLES</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {profileRoles.map(r => (
                      <span key={r.id} style={{ fontSize: 9, padding: '1px 5px', border: `1px solid ${r.color}55`, borderRadius: 2, color: r.color }}>{r.name}</span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-2)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>JOINED SERVER</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{new Date(member.joinedAt).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Reply banner */}
      {replyTo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: 'var(--bg-2)', borderTop: '1px solid var(--border)', fontSize: 12 }}>
          <span style={{ color: 'var(--text-2)' }}>Replying to <b style={{ color: 'var(--text-2)' }}>{replyTo.authorUsername}</b>: <span style={{ color: 'var(--text-2)', fontStyle: 'italic' }}>{replyTo.content.slice(0, 60)}{replyTo.content.length > 60 ? '...' : ''}</span></span>
          <button onClick={() => setReplyTo(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 4px' }}>x</button>
        </div>
      )}
      {/* Input */}
      <div className="pr-input-area">
        {isMuted ? (
          <div style={{ ...styles.noPermission, color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            You are muted — unmuted in <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', marginLeft: 2 }}>{formatMuteTime(muteSecondsLeft)}</span>
          </div>
        ) : canSend ? (
          <div className="pr-input-row">
            <input
              ref={inputRef}
              className="pr-chat-input"
              placeholder={`Message #${channel.name}`}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } if (e.key === 'Escape') setReplyTo(null); }}
              maxLength={2000}
            />
            <button style={styles.sendBtn} onClick={sendMessage} disabled={!input.trim()}>
              <IconSend />
            </button>
          </div>
        ) : (
          <div style={styles.noPermission}>
            You don't have permission to send messages in this channel.
          </div>
        )}
      </div>
      {/* Confirm dialog */}
      {confirmDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={() => setConfirmDialog(null)}>
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '24px 28px', minWidth: 280, maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 14, color: 'var(--text-2)', fontFamily: 'var(--font-display)', marginBottom: 20, lineHeight: 1.5 }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDialog(null)} style={{ padding: '7px 16px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)' }}>Cancel</button>
              <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} style={{ padding: '7px 16px', border: 'none', borderRadius: 'var(--radius)', background: 'var(--danger)', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const IconMembers = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconSend = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

function renderContent(text: string): React.ReactNode {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: '#7eb8f7', textDecoration: 'underline', wordBreak: 'break-all' }}>{part}</a>
      : part
  );
}

const styles: Record<string, React.CSSProperties> = {
  pane: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg)', overflow: 'hidden' },
  header: { padding: '0 20px', height: 72, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
  channelInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    overflow: 'hidden',
  },
  hash: {
    fontSize: 26,
    color: '#ffffff',
    fontWeight: 300,
    flexShrink: 0,
  },
  channelName: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 19,
    letterSpacing: '0.04em',
    color: '#ffffff',
    flexShrink: 0,
  },
  divider: {
    width: 1,
    height: 18,
    background: 'var(--border)',
    flexShrink: 0,
  },
  topic: {
    fontSize: 15,
    color: '#f0f0f0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-display)',
  },
  headerBtn: {
    padding: 6,
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    border: 'none',
    background: 'transparent',
    transition: 'color 0.15s ease',
    flexShrink: 0,
  },
  messageArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '28px 36px 0',
    display: 'flex',
    flexDirection: 'column',
  },
  loadingState: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 12,
    letterSpacing: '0.15em',
    color: 'var(--text-2)',
    fontFamily: 'var(--font-display)',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    paddingBottom: 16,
  },
  channelIconLarge: {
    fontSize: 52,
    color: 'var(--text-2)',
    fontWeight: 300,
    marginBottom: 10,
  },
  emptyTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 22,
    fontWeight: 700,
    color: '#ffffff',
    marginBottom: 4,
  },
  emptyTopic: {
    fontSize: 15,
    color: 'var(--text-2)',
    marginBottom: 4,
    fontFamily: 'var(--font-display)',
  },
  emptyHint: {
    fontSize: 14,
    color: 'var(--text-2)',
    fontFamily: 'var(--font-display)',
  },
  messageGroup: {
    display: 'flex',
    gap: 10,
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 'var(--radius)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: 12,
    flexShrink: 0,
    letterSpacing: 1,
    userSelect: 'none',
    marginTop: 1,
  },
  groupContent: {
    flex: 1,
    minWidth: 0,
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 7,
    marginBottom: 1,
  },
  authorName: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: '0.02em',
    lineHeight: 1.4,
  },
  timestamp: {
    fontSize: 11,
    color: '#d4d4d4',
    letterSpacing: '0.04em',
    fontFamily: 'var(--font-display)',
  },
  messageText: {
    fontSize: 15,
    color: '#f5f5f5',
    lineHeight: 1.45,
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
    marginBottom: 1,
    fontFamily: 'var(--font-display)',
  },
  inputArea: {
    padding: '14px 18px',
    borderTop: '1px solid var(--border)',
    flexShrink: 0,
  },
  inputRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    background: 'var(--bg-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '0 14px',
  },
  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#ffffff',
    fontSize: 15,
    padding: '14px 0',
    fontFamily: 'var(--font-display)',
  },
  sendBtn: {
    color: '#ffffff',
    cursor: 'pointer',
    padding: '6px',
    display: 'flex',
    alignItems: 'center',
    border: 'none',
    background: 'transparent',
    flexShrink: 0,
    transition: 'color 0.15s ease, transform 0.12s ease',
    borderRadius: 'var(--radius)',
  },
  noPermission: {
    padding: '12px 18px',
    background: 'var(--bg-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: '#f5f5f5',
    textAlign: 'center',
    fontSize: 15,
    fontFamily: 'var(--font-display)',
  },
};
