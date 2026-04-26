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

  // Initial load
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
          if (data.messages.length > 0) {
            lastIdRef.current = data.messages[data.messages.length - 1].id;
          }
        }
        setLoading(false);
        setTimeout(() => scrollToBottom(false), 50);
      })
      .catch(() => setLoading(false));
  }, [channelId, scrollToBottom]);

  // Polling for new messages
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
        // Keep scroll position
        setTimeout(() => {
          if (listRef.current) {
            const newHeight = listRef.current.scrollHeight;
            listRef.current.scrollTop = newHeight - prevHeight;
          }
        }, 0);
      }
    } finally {
      setLoadingMore(false);
    }
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
        setMessages(prev => {
          const exists = prev.some(m => m.id === data.message.id);
          if (exists) return prev;
          return [...prev, data.message];
        });
        lastIdRef.current = data.message.id;
        setTimeout(() => scrollToBottom(true), 30);
      }
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const otherUser = channel?.otherUser;

  return (
    <div style={styles.pane}>
      {/* Header */}
      <div style={styles.header}>
        {otherUser && <Avatar username={otherUser.username} size={28} />}
        <div>
          <div style={styles.headerName}>{otherUser?.username || '...'}</div>
          {otherUser?.bio && <div style={styles.headerBio}>{otherUser.bio}</div>}
        </div>
      </div>

      {/* Messages */}
      <div ref={listRef} style={styles.messages}>
        {hasMore && (
          <button onClick={loadMore} disabled={loadingMore} style={styles.loadMore}>
            {loadingMore ? <span className="spinner" /> : 'Load earlier messages'}
          </button>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <span className="spinner" style={{ width: 20, height: 20 }} />
          </div>
        ) : messages.length === 0 ? (
          <div style={styles.emptyChat}>
            <div style={styles.emptyChatIcon}>
              {otherUser && <Avatar username={otherUser.username} size={48} />}
            </div>
            <p style={{ color: 'var(--text-2)', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>
              {otherUser?.username}
            </p>
            <p style={{ color: 'var(--text-3)', fontSize: 12 }}>
              This is the beginning of your conversation.
            </p>
          </div>
        ) : (
          <MessageList messages={messages} currentUserId={currentUser.id} />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={styles.inputArea}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Message ${otherUser?.username || ''}…`}
          rows={1}
          style={{
            ...styles.input,
            height: Math.min(120, Math.max(40, input.split('\n').length * 20 + 20)),
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          style={{
            ...styles.sendBtn,
            opacity: !input.trim() || sending ? 0.4 : 1,
          }}
        >
          {sending ? <span className="spinner" style={{ width: 14, height: 14, borderTopColor: '#000' }} /> : <IconSend />}
        </button>
      </div>
    </div>
  );
}

function MessageList({ messages, currentUserId }: { messages: Message[]; currentUserId: string }) {
  const groups: { date: string; messages: Message[] }[] = [];

  messages.forEach(msg => {
    const d = new Date(msg.createdAt).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.date === d) last.messages.push(msg);
    else groups.push({ date: d, messages: [msg] });
  });

  return (
    <>
      {groups.map(group => (
        <div key={group.date}>
          <div style={styles.dateSep}>
            <div style={styles.dateLine} />
            <span style={styles.dateLabel}>{formatDate(group.date)}</span>
            <div style={styles.dateLine} />
          </div>
          {renderGroupedMessages(group.messages, currentUserId)}
        </div>
      ))}
    </>
  );
}

function renderGroupedMessages(messages: Message[], currentUserId: string) {
  const result: React.ReactNode[] = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    const isMe = msg.senderId === currentUserId;
    const cluster: Message[] = [msg];

    while (
      i + 1 < messages.length &&
      messages[i + 1].senderId === msg.senderId &&
      new Date(messages[i + 1].createdAt).getTime() - new Date(msg.createdAt).getTime() < 5 * 60 * 1000
    ) {
      i++;
      cluster.push(messages[i]);
    }

    result.push(
      <div key={cluster[0].id} style={{ ...styles.cluster, alignItems: isMe ? 'flex-end' : 'flex-start' }}>
        <div style={styles.clusterHeader}>
          {!isMe && <Avatar username={msg.senderUsername} size={20} />}
          <span style={{ ...styles.senderName, color: isMe ? 'var(--text-3)' : 'var(--text-2)' }}>
            {isMe ? 'You' : msg.senderUsername}
          </span>
          <span style={styles.timestamp}>{formatTime(msg.createdAt)}</span>
        </div>
        {cluster.map(m => (
          <div key={m.id} style={{
            ...styles.bubble,
            background: isMe ? 'var(--text)' : 'var(--bg-3)',
            color: isMe ? 'var(--bg)' : 'var(--text)',
            borderRadius: isMe ? '4px 4px 0 4px' : '4px 4px 4px 0',
          }}>
            {m.content}
          </div>
        ))}
      </div>
    );
    i++;
  }
  return result;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'TODAY';
  if (d.toDateString() === yesterday.toDateString()) return 'YESTERDAY';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}

const IconSend = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const styles: Record<string, React.CSSProperties> = {
  pane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    background: 'var(--bg)',
  },
  header: {
    padding: '16px 24px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: 'var(--bg-1)',
    flexShrink: 0,
  },
  headerName: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: '0.05em',
  },
  headerBio: {
    fontSize: 11,
    color: 'var(--text-3)',
    marginTop: 1,
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  loadMore: {
    alignSelf: 'center',
    padding: '6px 16px',
    fontSize: 11,
    color: 'var(--text-3)',
    background: 'var(--bg-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    marginBottom: 16,
    fontFamily: 'var(--font-mono)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  emptyChat: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 48,
    marginTop: 'auto',
  },
  emptyChatIcon: { marginBottom: 4 },
  cluster: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    marginBottom: 12,
    maxWidth: '70%',
    alignSelf: 'flex-start',
  },
  clusterHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  senderName: {
    fontSize: 11,
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  timestamp: {
    fontSize: 10,
    color: 'var(--text-3)',
    fontFamily: 'var(--font-mono)',
  },
  bubble: {
    padding: '8px 12px',
    fontSize: 13,
    lineHeight: 1.55,
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
    maxWidth: '100%',
    animation: 'fadeIn 0.15s ease',
  },
  dateSep: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    margin: '16px 0',
  },
  dateLine: {
    flex: 1,
    height: 1,
    background: 'var(--border)',
  },
  dateLabel: {
    fontSize: 10,
    color: 'var(--text-3)',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    letterSpacing: '0.12em',
    flexShrink: 0,
  },
  inputArea: {
    padding: '12px 24px 16px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'flex-end',
    gap: 8,
    background: 'var(--bg-1)',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    background: 'var(--bg-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    color: 'var(--text)',
    resize: 'none',
    outline: 'none',
    fontSize: 13,
    lineHeight: 1.5,
    transition: 'border-color var(--transition)',
    fontFamily: 'var(--font-mono)',
  },
  sendBtn: {
    width: 40, height: 40,
    background: 'var(--text)',
    color: 'var(--bg)',
    border: 'none',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'opacity var(--transition)',
  },
};
