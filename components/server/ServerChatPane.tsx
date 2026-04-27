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
  server, channel, currentUser, myMember, hasPermission, showMembers, onToggleMembers
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const bottomRef = useRef<HTMLDivElement>(null);
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
      setMessages(data.messages);
      if (data.messages.length > 0) {
        lastIdRef.current = data.messages[data.messages.length - 1].id;
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
        if (data.messages.length > 0) {
          setMessages(prev => [...prev, ...data.messages]);
          lastIdRef.current = data.messages[data.messages.length - 1].id;
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [server.id, channel.id]);

  async function sendMessage() {
    const content = input.trim();
    if (!content || !canSend || isMuted) return;
    setInput('');
    const r = await fetch(`/api/servers/${server.id}/messages/${channel.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (r.ok) {
      const data = await r.json();
      setMessages(prev => [...prev, data.message]);
      lastIdRef.current = data.message.id;
    }
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
    <div style={styles.pane} onClick={() => setProfilePopup(null)}>
      {/* Channel header */}
      <div style={styles.header}>
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
      <div style={styles.messageArea}>
        {loading ? (
          <div style={styles.loadingState}>
            <span style={styles.loadingText}>LOADING MESSAGES</span>
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
                <div key={i} style={styles.messageGroup}>
                  <div
                    style={{ cursor: 'pointer', flexShrink: 0 }}
                    onClick={(e) => openProfile(e, group.authorId, group.author)}
                    title="View profile"
                  >
                    <Avatar username={group.author} avatar={group.authorAvatar} size={36} />
                  <div style={styles.groupContent}>
                    <div style={styles.groupHeader}>
                      <span
                        style={{ ...styles.authorName, color, cursor: 'pointer' }}
                        onClick={(e) => openProfile(e, group.authorId, group.author)}
                        title="View profile"
                      >{group.author}</span>
                      {(() => {
                        const m = server.members.find(m => m.userId === group.authorId);
                        const isMemberMuted = m?.mutedUntil && new Date(m.mutedUntil).getTime() > now;
                        return isMemberMuted ? (
                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(237,66,69,0.12)', color: '#ed4245', border: '1px solid rgba(237,66,69,0.3)', fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.06em', flexShrink: 0 }}>MUTED</span>
                        ) : null;
                      })()}
                      <span style={styles.timestamp}>
                        {new Date(group.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {group.messages.map(msg => (
                      <p key={msg.id} style={styles.messageText}>{msg.content}</p>
                    ))}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Profile popup */}
      {profilePopup && (() => {
        const member = server.members.find(m => m.userId === profilePopup.userId);
        if (!member) return null;
        const hue = member.username.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0) % 360;
        const profileRoles = server.roles.filter(r => !r.isDefault && member.roles.includes(r.id));
        const isMuted = member.mutedUntil && new Date(member.mutedUntil).getTime() > now;
        const avatarPixels = member.avatar ? JSON.parse(member.avatar) : null;
        return (
          <div
            style={{ position: 'fixed', top: profilePopup.y, left: profilePopup.x, width: 256, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', zIndex: 1000, boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ height: 56, background: `hsl(${hue},20%,14%)` }} />
            <div style={{ padding: '0 16px 16px' }}>
              <div style={{ marginTop: -24, marginBottom: 8 }}>
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
                  <div style={{ width: 48, height: 48, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, border: '3px solid var(--bg-2)', userSelect: 'none', background: `hsl(${hue},10%,20%)`, color: `hsl(${hue},20%,80%)` }}>
                    {member.username.slice(0,2).toUpperCase()}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{member.nickname || member.username}</div>
                {isMuted && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(237,66,69,0.12)', color: '#ed4245', border: '1px solid rgba(237,66,69,0.3)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>MUTED</span>}
              </div>
              {member.nickname && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1, fontFamily: 'var(--font-mono)' }}>{member.username}</div>}
              {member.pronouns && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, fontStyle: 'italic' }}>{member.pronouns}</div>}
              {member.bio && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.5 }}>{member.bio}</div>}
              {profileRoles.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>ROLES</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {profileRoles.map(r => (
                      <span key={r.id} style={{ fontSize: 9, padding: '1px 5px', border: `1px solid ${r.color}55`, borderRadius: 2, color: r.color }}>{r.name}</span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>JOINED SERVER</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{new Date(member.joinedAt).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Input */}
      <div style={styles.inputArea}>
        {isMuted ? (
          <div style={{ ...styles.noPermission, color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            You are muted — unmuted in <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', marginLeft: 2 }}>{formatMuteTime(muteSecondsLeft)}</span>
          </div>
        ) : canSend ? (
          <div style={styles.inputRow}>
            <input
              style={styles.input}
              placeholder={`Message #${channel.name}`}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
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

const styles: Record<string, React.CSSProperties> = {
  pane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--bg)',
  },
  header: {
    padding: '0 16px',
    height: 60,
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  channelInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    overflow: 'hidden',
  },
  hash: {
    fontSize: 20,
    color: 'var(--text-3)',
    fontWeight: 300,
    flexShrink: 0,
  },
  channelName: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: '0.04em',
    color: 'var(--text)',
    flexShrink: 0,
  },
  divider: {
    width: 1,
    height: 16,
    background: 'var(--border)',
    flexShrink: 0,
  },
  topic: {
    fontSize: 12,
    color: 'var(--text-3)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  headerBtn: {
    padding: 6,
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    border: 'none',
    background: 'transparent',
    transition: 'color var(--transition)',
    flexShrink: 0,
  },
  messageArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 24px 0',
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
    fontSize: 10,
    letterSpacing: '0.15em',
    color: 'var(--text-3)',
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
    fontSize: 48,
    color: 'var(--text-3)',
    fontWeight: 300,
    marginBottom: 8,
  },
  emptyTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--text)',
    marginBottom: 4,
  },
  emptyTopic: {
    fontSize: 13,
    color: 'var(--text-2)',
    marginBottom: 4,
  },
  emptyHint: {
    fontSize: 12,
    color: 'var(--text-3)',
  },
  messageGroup: {
    display: 'flex',
    gap: 14,
    marginBottom: 18,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 'var(--radius)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: 14,
    flexShrink: 0,
    letterSpacing: 1,
    userSelect: 'none',
    marginTop: 2,
  },
  groupContent: {
    flex: 1,
    minWidth: 0,
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 3,
  },
  authorName: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: '0.02em',
  },
  timestamp: {
    fontSize: 10,
    color: 'var(--text-3)',
    letterSpacing: '0.04em',
  },
  messageText: {
    fontSize: 14,
    color: 'var(--text-2)',
    lineHeight: 1.6,
    wordBreak: 'break-word',
    marginBottom: 2,
  },
  inputArea: {
    padding: '12px 16px',
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
    padding: '0 12px',
  },
  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text)',
    fontSize: 13,
    padding: '11px 0',
  },
  sendBtn: {
    color: 'var(--text-3)',
    cursor: 'pointer',
    padding: '6px',
    display: 'flex',
    alignItems: 'center',
    border: 'none',
    background: 'transparent',
    flexShrink: 0,
    transition: 'color var(--transition)',
    borderRadius: 'var(--radius)',
  },
  noPermission: {
    padding: '11px 16px',
    background: 'var(--bg-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 12,
    color: 'var(--text-3)',
    textAlign: 'center',
  },
};
