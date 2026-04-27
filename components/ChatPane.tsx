import { useState, useEffect, useRef, useCallback } from 'react';
import type { User, Channel } from '@/pages/app';
import { Avatar } from '@/components/Sidebar';

interface Message {
  id: string;
  channelId: string;
  senderId: string;
  senderUsername: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
}

interface ChatPaneProps {
  channelId: string;
  channel: Channel | null;
  currentUser: User;
}

export default function ChatPane({ channelId, channel, currentUser }: ChatPaneProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef<string>('');
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback((smooth = false) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    lastIdRef.current = '';
    fetch(`/api/channels/${channelId}/messages`)
      .then(r => r.json())
      .then(data => {
        if (data.messages) {
          setMessages(data.messages);
          setHasMore(data.hasMore);
          if (data.messages.length > 0) lastIdRef.current = data.messages[data.messages.length - 1].id;
        }
        setLoading(false);
        setTimeout(() => scrollToBottom(false), 50);
      })
      .catch(() => setLoading(false));
  }, [channelId, scrollToBottom]);

  useEffect(() => {
    if (loading) return;
    function poll() {
      const after = lastIdRef.current;
      fetch(`/api/channels/${channelId}/poll${after ? `?after=${after}` : ''}`)
        .then(r => r.json())
        .then(data => {
          if (data.messages && data.messages.length > 0) {
            const atBottom = listRef.current
              ? listRef.current.scrollHeight - listRef.current.scrollTop - listRef.current.clientHeight < 80
              : true;
            setMessages(prev => {
              const existingIds = new Set(prev.map(m => m.id));
              const newMsgs = data.messages.filter((m: Message) => !existingIds.has(m.id));
              if (newMsgs.length === 0) return prev;
              lastIdRef.current = newMsgs[newMsgs.length - 1].id;
              return [...prev, ...newMsgs];
            });
            if (atBottom) setTimeout(() => scrollToBottom(true), 30);
          }
        })
        .catch(() => {});
    }
    pollingRef.current = setInterval(poll, 2000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [channelId, loading, scrollToBottom]);

  async function loadMore() {
    if (messages.length === 0 || loadingMore) return;
    setLoadingMore(true);
    const before = messages[0].id;
    const prevHeight = listRef.current?.scrollHeight || 0;
    try {
      const r = await fetch(`/api/channels/${channelId}/messages?before=${before}`);
      const data = await r.json();
      if (data.messages) {
        setMessages(prev => [...data.messages, ...prev]);
        setHasMore(data.hasMore);
        setTimeout(() => {
          if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight - prevHeight;
        }, 0);
      }
    } finally { setLoadingMore(false); }
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput('');
    inputRef.current?.focus();
    try {
      const r = await fetch(`/api/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await r.json();
      if (r.ok && data.message) {
        setMessages(prev => prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message]);
        lastIdRef.current = data.message.id;
        setTimeout(() => scrollToBottom(true), 30);
      }
    } finally { setSending(false); }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  const otherUser = channel?.otherUser;
  const [dmProfile, setDmProfile] = useState<{ senderId: string; senderUsername: string; x: number; y: number } | null>(null);

  function handleProfileClick(e: React.MouseEvent, senderId: string, senderUsername: string) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.max(8, Math.min(rect.left, window.innerWidth - 268));
    const y = Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 200));
    setDmProfile({ senderId, senderUsername, x, y });
  }

  return (
    <div style={s.pane} onClick={() => setDmProfile(null)}>
      {/* Header */}
      <div style={s.header}>
        {otherUser && <Avatar username={otherUser.username} size={28} />}
        <div>
          <div style={s.headerName}>{otherUser?.username || '…'}</div>
          {otherUser?.bio && <div style={s.headerBio}>{otherUser.bio}</div>}
        </div>
      </div>

      {/* Messages */}
      <div ref={listRef} style={s.scroller}>
        <div style={s.messageList}>
          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <button onClick={loadMore} disabled={loadingMore} style={s.loadMore}>
                {loadingMore ? <span className="spinner" style={{ width: 11, height: 11 }} /> : '↑ Earlier messages'}
              </button>
            </div>
          )}

          {loading ? (
            <div style={s.center}><span className="spinner" style={{ width: 18, height: 18 }} /></div>
          ) : messages.length === 0 ? (
            <div style={s.empty}>
              {otherUser && <Avatar username={otherUser.username} size={56} />}
              <p style={s.emptyName}>{otherUser?.username}</p>
              <p style={s.emptyHint}>Beginning of your conversation</p>
            </div>
          ) : (
            <MessageList messages={messages} currentUserId={currentUser.id} onProfileClick={handleProfileClick} />
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div style={s.inputRow}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Write a message…"
          rows={1}
          style={{ ...s.input, height: Math.min(140, Math.max(42, input.split('\n').length * 22 + 20)) }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          style={{ ...s.sendBtn, opacity: !input.trim() || sending ? 0.25 : 1 }}
        >
          {sending
            ? <span className="spinner" style={{ width: 13, height: 13, borderTopColor: '#000' }} />
            : <IconSend />}
        </button>
      </div>
      {/* DM Profile popup */}
      {dmProfile && (
        <div
          style={{ position: 'fixed', top: dmProfile.y, left: dmProfile.x, width: 240, background: '#111', border: '1px solid #1e1e1e', borderRadius: 10, overflow: 'hidden', zIndex: 1000, boxShadow: '0 12px 40px rgba(0,0,0,0.8)' }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ height: 48, background: `hsl(${dmProfile.senderUsername.split('').reduce((a:number,c:string)=>a+c.charCodeAt(0),0)%360},15%,12%)` }} />
          <div style={{ padding: '0 16px 16px' }}>
            <div style={{ marginTop: -22, marginBottom: 8 }}>
              <Avatar username={dmProfile.senderUsername} size={44} />
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 600, fontSize: 16, color: '#e0e0e0' }}>{dmProfile.senderUsername}</div>
            {otherUser?.bio && dmProfile.senderId !== currentUser.id && (
              <div style={{ fontSize: 12, color: '#555', marginTop: 6, lineHeight: 1.5, fontFamily: "'Inter', system-ui, sans-serif" }}>{otherUser.bio}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MessageList({ messages, currentUserId, onProfileClick }: { messages: Message[]; currentUserId: string; onProfileClick?: (e: React.MouseEvent, senderId: string, senderUsername: string) => void; }) {
  const byDate: { date: string; messages: Message[] }[] = [];
  messages.forEach(msg => {
    const d = new Date(msg.createdAt).toDateString();
    const last = byDate[byDate.length - 1];
    if (last && last.date === d) last.messages.push(msg);
    else byDate.push({ date: d, messages: [msg] });
  });

  return (
    <>
      {byDate.map(group => (
        <div key={group.date}>
          <div style={s.dateSep}>
            <div style={s.dateLine} />
            <span style={s.dateLabel}>{formatDate(group.date)}</span>
            <div style={s.dateLine} />
          </div>
          {renderClusters(group.messages, currentUserId, onProfileClick)}
        </div>
      ))}
    </>
  );
}

function renderClusters(messages: Message[], currentUserId: string, onProfileClick?: (e: React.MouseEvent, senderId: string, senderUsername: string) => void) {
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];
    const isMe = msg.senderId === currentUserId;
    const cluster: Message[] = [msg];

    while (
      i + 1 < messages.length &&
      messages[i + 1].senderId === msg.senderId &&
      new Date(messages[i + 1].createdAt).getTime() - new Date(msg.createdAt).getTime() < 5 * 60 * 1000
    ) { i++; cluster.push(messages[i]); }

    nodes.push(
      // Outer row: full width, flex row, justifies left or right
      <div key={cluster[0].id} style={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: isMe ? 'flex-end' : 'flex-start',
        width: '100%',
        marginBottom: 14,
      }}>
        {/* Inner column: contains meta + bubbles, max 60% wide */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: isMe ? 'flex-end' : 'flex-start',
          maxWidth: '60%',
          gap: 2,
        }}>
          {/* Meta row */}
          <div style={{
            display: 'flex',
            flexDirection: isMe ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: 6,
            marginBottom: 3,
          }}>
            {!isMe && (
              <span onClick={(e) => onProfileClick?.(e, msg.senderId, msg.senderUsername)} style={{ cursor: 'pointer' }}>
                <Avatar username={msg.senderUsername} size={16} />
              </span>
            )}
            <span
              style={{ ...s.metaName, cursor: !isMe ? 'pointer' : 'default' }}
              onClick={!isMe ? (e) => onProfileClick?.(e, msg.senderId, msg.senderUsername) : undefined}
            >{isMe ? 'You' : msg.senderUsername}</span>
            <span style={s.metaTime}>{formatTime(cluster[cluster.length - 1].createdAt)}</span>
          </div>

          {/* Bubble(s) */}
          {cluster.map((m, idx) => {
            const first = idx === 0;
            const last = idx === cluster.length - 1;
            const r = 16;
            const t = 5;
            return (
              <div key={m.id} style={{
                padding: '9px 14px',
                fontSize: 14,
                lineHeight: 1.6,
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                letterSpacing: '0.01em',
                animation: 'fadeIn 0.12s ease',
                background: isMe ? '#efefef' : '#141414',
                color: isMe ? '#0d0d0d' : '#d8d8d8',
                marginBottom: last ? 0 : 2,
                borderRadius: isMe
                  ? `${first ? r : t}px ${t}px ${t}px ${last ? r : t}px`
                  : `${t}px ${first ? r : t}px ${last ? r : t}px ${t}px`,
                fontFamily: "'Inter', system-ui, sans-serif",
                fontWeight: 400,
              }}>
                {m.content}
              </div>
            );
          })}
        </div>
      </div>
    );
    i++;
  }

  return nodes;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

const IconSend = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);

const s: Record<string, React.CSSProperties> = {
  pane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    background: '#080808',
  },
  header: {
    padding: '14px 32px',
    borderBottom: '1px solid #181818',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: '#0a0a0a',
    flexShrink: 0,
  },
  headerName: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontWeight: 500,
    fontSize: 17,
    color: '#e0e0e0',
    letterSpacing: '0.03em',
  },
  headerBio: {
    fontSize: 11,
    color: '#444',
    fontFamily: "'Inter', system-ui, sans-serif",
    marginTop: 1,
  },
  scroller: {
    flex: 1,
    overflowY: 'auto',
    width: '100%',
  },
  messageList: {
    display: 'flex',
    flexDirection: 'column',
    padding: '28px 40px',
    minHeight: '100%',
    boxSizing: 'border-box',
  },
  center: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    padding: 80,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    paddingTop: 80,
  },
  emptyName: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontWeight: 400,
    fontStyle: 'italic',
    fontSize: 20,
    color: '#555',
    marginTop: 6,
  },
  emptyHint: {
    fontSize: 12,
    color: '#333',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 300,
    letterSpacing: '0.04em',
  },
  loadMore: {
    padding: '5px 16px',
    fontSize: 11,
    color: '#444',
    background: 'transparent',
    border: '1px solid #1f1f1f',
    borderRadius: 20,
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    letterSpacing: '0.03em',
  },
  dateSep: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    margin: '8px 0 16px',
  },
  dateLine: {
    flex: 1,
    height: 1,
    background: '#161616',
  },
  dateLabel: {
    fontSize: 10,
    color: '#353535',
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontWeight: 400,
    fontStyle: 'italic',
    letterSpacing: '0.08em',
    flexShrink: 0,
  },
  metaName: {
    fontSize: 11,
    color: '#404040',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 500,
    letterSpacing: '0.02em',
  },
  metaTime: {
    fontSize: 10,
    color: '#2e2e2e',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 300,
  },
  inputRow: {
    padding: '12px 32px 18px',
    borderTop: '1px solid #141414',
    display: 'flex',
    alignItems: 'flex-end',
    gap: 10,
    background: '#0a0a0a',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    background: '#111',
    border: '1px solid #1e1e1e',
    borderRadius: 12,
    padding: '10px 16px',
    color: '#d0d0d0',
    resize: 'none',
    outline: 'none',
    fontSize: 14,
    lineHeight: 1.55,
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 300,
    transition: 'border-color 0.15s',
    letterSpacing: '0.01em',
  },
  sendBtn: {
    width: 38,
    height: 38,
    background: '#e0e0e0',
    color: '#000',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'opacity 0.15s',
  },
};
