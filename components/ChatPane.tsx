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

  return (
    <div style={s.pane}>
      <div style={s.header}>
        {otherUser && <Avatar username={otherUser.username} size={30} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={s.headerName}>{otherUser?.username || '…'}</span>
          {otherUser?.bio && <span style={s.headerBio}>{otherUser.bio}</span>}
        </div>
      </div>

      <div ref={listRef} style={s.messages}>
        {hasMore && (
          <button onClick={loadMore} disabled={loadingMore} style={s.loadMore}>
            {loadingMore ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '↑ Earlier messages'}
          </button>
        )}
        {loading ? (
          <div style={s.center}><span className="spinner" style={{ width: 18, height: 18 }} /></div>
        ) : messages.length === 0 ? (
          <div style={s.empty}>
            {otherUser && <Avatar username={otherUser.username} size={52} />}
            <p style={s.emptyName}>{otherUser?.username}</p>
            <p style={s.emptyHint}>Beginning of your conversation</p>
          </div>
        ) : (
          <MessageList messages={messages} currentUserId={currentUser.id} />
        )}
        <div ref={bottomRef} />
      </div>

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
          style={{ ...s.sendBtn, opacity: !input.trim() || sending ? 0.3 : 1 }}
        >
          {sending
            ? <span className="spinner" style={{ width: 13, height: 13, borderTopColor: '#000' }} />
            : <IconSend />}
        </button>
      </div>
    </div>
  );
}

function MessageList({ messages, currentUserId }: { messages: Message[]; currentUserId: string }) {
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
          {renderClusters(group.messages, currentUserId)}
        </div>
      ))}
    </>
  );
}

function renderClusters(messages: Message[], currentUserId: string) {
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
      <div key={cluster[0].id} style={{ ...s.cluster, alignSelf: isMe ? 'flex-end' : 'flex-start', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
        <div style={{ ...s.meta, flexDirection: isMe ? 'row-reverse' : 'row' }}>
          {!isMe && <Avatar username={msg.senderUsername} size={16} />}
          <span style={s.metaName}>{isMe ? 'You' : msg.senderUsername}</span>
          <span style={s.metaTime}>{formatTime(cluster[cluster.length - 1].createdAt)}</span>
        </div>
        {cluster.map((m, idx) => {
          const first = idx === 0;
          const last = idx === cluster.length - 1;
          return (
            <div key={m.id} style={{
              ...s.bubble,
              background: isMe ? '#f0f0f0' : '#161616',
              color: isMe ? '#0a0a0a' : '#e0e0e0',
              marginBottom: last ? 0 : 2,
              borderRadius: isMe
                ? `${first ? 16 : 5}px 5px 5px ${last ? 16 : 5}px`
                : `5px ${first ? 16 : 5}px ${last ? 16 : 5}px 5px`,
            }}>
              {m.content}
            </div>
          );
        })}
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
  pane: { flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#080808' },
  header: { padding: '14px 28px', borderBottom: '1px solid #191919', display: 'flex', alignItems: 'center', gap: 12, background: '#0b0b0b', flexShrink: 0 },
  headerName: { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: '#e8e8e8', letterSpacing: '0.02em' },
  headerBio: { fontSize: 11, color: '#4a4a4a', fontFamily: 'var(--font-mono)' },
  messages: { flex: 1, overflowY: 'auto', padding: '28px 36px', display: 'flex', flexDirection: 'column', gap: 14 },
  center: { display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, padding: 60 },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, flex: 1, paddingTop: 80 },
  emptyName: { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: '#888', marginTop: 6 },
  emptyHint: { fontSize: 12, color: '#3a3a3a', fontFamily: 'var(--font-mono)' },
  loadMore: { alignSelf: 'center', padding: '5px 16px', fontSize: 11, color: '#444', background: 'transparent', border: '1px solid #222', borderRadius: 20, cursor: 'pointer', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 },
  dateSep: { display: 'flex', alignItems: 'center', gap: 14, margin: '2px 0 6px' },
  dateLine: { flex: 1, height: 1, background: '#181818' },
  dateLabel: { fontSize: 10, color: '#383838', fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '0.06em', flexShrink: 0 },
  cluster: { display: 'flex', flexDirection: 'column', maxWidth: '60%', gap: 0 },
  meta: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 },
  metaName: { fontSize: 11, color: '#4a4a4a', fontFamily: 'var(--font-display)', fontWeight: 500 },
  metaTime: { fontSize: 10, color: '#333', fontFamily: 'var(--font-mono)' },
  bubble: { padding: '9px 14px', fontSize: 13.5, lineHeight: 1.58, wordBreak: 'break-word', whiteSpace: 'pre-wrap', letterSpacing: '0.005em', animation: 'fadeIn 0.12s ease' },
  inputRow: { padding: '12px 28px 16px', borderTop: '1px solid #141414', display: 'flex', alignItems: 'flex-end', gap: 10, background: '#0b0b0b', flexShrink: 0 },
  input: { flex: 1, background: '#111', border: '1px solid #222', borderRadius: 12, padding: '10px 16px', color: '#ddd', resize: 'none', outline: 'none', fontSize: 13.5, lineHeight: 1.55, fontFamily: 'var(--font-mono)', transition: 'border-color 0.15s' },
  sendBtn: { width: 38, height: 38, background: '#e8e8e8', color: '#000', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'opacity 0.15s' },
};
