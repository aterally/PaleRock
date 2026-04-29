import { useState, useEffect, useRef, useCallback } from 'react';
import type { User, Channel } from '@/pages/app';
import { Avatar } from '@/components/Sidebar';
import TicTacToeCard from '@/components/games/TicTacToeCard';
import Connect4Card from '@/components/games/Connect4Card';

interface Message {
  id: string;
  channelId: string;
  senderId: string;
  senderUsername: string;
  senderAvatar?: string | null;
  content: string;
  createdAt: string;
  editedAt: string | null;
  replyTo?: { id: string; senderUsername: string; content: string } | null;
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
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  // Pin to bottom whenever content height grows (handles async game card expansion)
  const shouldStickRef = useRef(true);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (shouldStickRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    });
    // Observe the inner content div (first child of scroller)
    const inner = el.firstElementChild;
    if (inner) ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  // Track whether user has scrolled away from bottom
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    function onScroll() {
      if (!el) return;
      shouldStickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    lastIdRef.current = '';
    shouldStickRef.current = true;
    fetch(`/api/channels/${channelId}/messages`)
      .then(r => r.json())
      .then(data => {
        if (data.messages) {
          setMessages(data.messages);
          setHasMore(data.hasMore);
          if (data.messages.length > 0) lastIdRef.current = data.messages[data.messages.length - 1].id;
        }
        setLoading(false);
        // ResizeObserver will scroll to bottom as content renders
        shouldStickRef.current = true;
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
            setMessages(prev => {
              const existingIds = new Set(prev.map(m => m.id));
              const newMsgs = data.messages.filter((m: Message) => !existingIds.has(m.id));
              if (newMsgs.length === 0) return prev;
              lastIdRef.current = newMsgs[newMsgs.length - 1].id;
              return [...prev, ...newMsgs];
            });
            // ResizeObserver handles scrolling if pinned to bottom
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
    shouldStickRef.current = false; // don't snap to bottom while loading history
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

  const [replyTo, setReplyTo] = useState<{ id: string; senderUsername: string; content: string } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ msg: Message; x: number; y: number } | null>(null);
  const [showGamePicker, setShowGamePicker] = useState(false);
  const [launchingGame, setLaunchingGame] = useState(false);

  async function deleteMessage(msgId: string) {
    await fetch(`/api/channels/${channelId}/message/${msgId}`, { method: 'DELETE' });
    setMessages(prev => prev.filter(m => m.id !== msgId));
  }

  async function sendGame(type: string) {
    setLaunchingGame(true);
    setShowGamePicker(false);
    try {
      const r = await fetch(`/api/channels/${channelId}/game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (r.ok) {
        // Trigger an immediate poll so the game message appears
        const after = lastIdRef.current;
        const pr = await fetch(`/api/channels/${channelId}/poll${after ? `?after=${after}` : ''}`);
        const pdata = await pr.json();
        if (pdata.messages && pdata.messages.length > 0) {
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const newMsgs = pdata.messages.filter((m: Message) => !existingIds.has(m.id));
            if (newMsgs.length === 0) return prev;
            lastIdRef.current = newMsgs[newMsgs.length - 1].id;
            return [...prev, ...newMsgs];
          });
          shouldStickRef.current = true; scrollToBottom(false);
        }
      } else {
        const data = await r.json();
        alert(data.error || 'Failed to send game invite');
      }
    } finally { setLaunchingGame(false); }
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput('');
    const replyingTo = replyTo;
    setReplyTo(null);
    inputRef.current?.focus();
    try {
      const r = await fetch(`/api/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, replyTo: replyingTo }),
      });
      const data = await r.json();
      if (r.ok && data.message) {
        setMessages(prev => prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message]);
        lastIdRef.current = data.message.id;
        shouldStickRef.current = true; scrollToBottom(false);
      }
    } finally { setSending(false); }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    if (e.key === 'Escape') setReplyTo(null);
  }

  const otherUser = channel?.otherUser;
  const [dmProfile, setDmProfile] = useState<{ senderId: string; senderUsername: string; senderAvatar?: string | null; x: number; y: number } | null>(null);

  function handleProfileClick(e: React.MouseEvent, senderId: string, senderUsername: string, senderAvatar?: string | null) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.max(8, Math.min(rect.left, window.innerWidth - 268));
    const y = Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 200));
    setDmProfile({ senderId, senderUsername, senderAvatar, x, y });
  }

  // Compute online status for DM header
  const dmIsOnline = otherUser?.lastOnline && (Date.now() - new Date(otherUser.lastOnline).getTime()) < 5 * 60 * 1000;
  const dmLastSeenLabel = (() => {
    if (!otherUser?.lastOnline) return null;
    if (dmIsOnline) return 'Online';
    const diff = Date.now() - new Date(otherUser.lastOnline).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Last seen just now';
    if (mins < 60) return `Last seen ${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Last seen ${hrs}h ago`;
    return `Last seen ${Math.floor(hrs / 24)}d ago`;
  })();

  return (
    <div style={s.pane} onClick={() => { setDmProfile(null); setCtxMenu(null); setShowGamePicker(false); }}>
      {/* Header */}
      <div style={s.header}>
        {otherUser && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Avatar username={otherUser.username} avatar={otherUser.avatar} size={28} />
            <span style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 9, height: 9, borderRadius: '50%',
              background: dmIsOnline ? '#23a55a' : 'var(--bg-3)',
              border: '2px solid var(--bg-2)',
            }} />
          </div>
        )}
        <div>
          <div style={s.headerName}>{otherUser?.username || '…'}</div>
          {dmLastSeenLabel ? (
            <div style={{ fontSize: 11, color: dmIsOnline ? '#23a55a' : 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.02em' }}>
              {dmLastSeenLabel}
            </div>
          ) : otherUser?.bio ? (
            <div style={s.headerBio}>{otherUser.bio}</div>
          ) : null}
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
              {otherUser && <Avatar username={otherUser.username} avatar={otherUser.avatar} size={56} />}
              <p style={s.emptyName}>{otherUser?.username}</p>
              <p style={s.emptyHint}>Beginning of your conversation</p>
            </div>
          ) : (
            <MessageList
            messages={messages}
            currentUserId={currentUser.id}
            currentUsername={currentUser.username}
            currentUserAvatar={currentUser.avatar}
            otherUsername={otherUser?.username || ''}
            channelId={channelId}
            onProfileClick={handleProfileClick}
            onReply={(msg) => { setReplyTo({ id: msg.id, senderUsername: msg.senderUsername, content: msg.content }); inputRef.current?.focus(); }}
            onDelete={deleteMessage}
            onLongPress={(msg, x, y) => setCtxMenu({ msg, x, y })}
          />
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Reply banner */}
      {replyTo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: 'var(--bg-2)', borderTop: '1px solid var(--border)', fontSize: 12 }}>
          <span style={{ color: 'var(--text-3)' }}>Replying to <b style={{ color: 'var(--text-2)' }}>{replyTo.senderUsername}</b>: <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>{replyTo.content.slice(0, 60)}{replyTo.content.length > 60 ? '...' : ''}</span></span>
          <button onClick={() => setReplyTo(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 4px' }}>x</button>
        </div>
      )}
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
          {/* Game picker button */}
          <div style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button
              title="Mini Games"
              onClick={() => setShowGamePicker(v => !v)}
              disabled={launchingGame}
              style={{
                width: 38, height: 38,
                background: showGamePicker ? 'var(--bg-3)' : 'transparent',
                border: '1px solid ' + (showGamePicker ? 'var(--border-bright)' : 'var(--border)'),
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: showGamePicker ? 'var(--text-2)' : 'var(--text-3)',
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
            >
              {launchingGame
                ? <span className="spinner" style={{ width: 12, height: 12 }} />
                : <IconGamepad />}
            </button>
            {/* Game picker panel */}
            {showGamePicker && (
              <div style={{
                position: 'absolute', bottom: 46, right: 0,
                background: 'var(--bg-2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)', padding: '6px',
                minWidth: 220,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                zIndex: 200,
              }}>
                <div style={{
                  fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-display)',
                  fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                  padding: '8px 12px 6px', borderBottom: '1px solid var(--border)',
                  marginBottom: 4,
                }}>
                  Mini Games
                </div>
                {GAMES.map(game => (
                  <button
                    key={game.id}
                    onClick={() => sendGame(game.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      width: '100%', padding: '10px 12px',
                      background: 'none', border: 'none',
                      borderRadius: 'var(--radius)', cursor: 'pointer',
                      color: 'var(--text-2)', textAlign: 'left',
                      transition: 'background 0.1s',
                      fontFamily: 'var(--font-display)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-3)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <span style={{ fontSize: 18, lineHeight: 1, color: 'var(--text-3)', flexShrink: 0 }}>{game.icon}</span>
                    <div>
                      <div style={{ fontSize: 14, fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '0.02em' }}>{game.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-display)', marginTop: 1 }}>{game.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
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
      {/* Long-press context menu (touch devices) */}
      {ctxMenu && (
        <div
          className="lp-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <button onClick={() => {
            setReplyTo({ id: ctxMenu.msg.id, senderUsername: ctxMenu.msg.senderUsername, content: ctxMenu.msg.content });
            inputRef.current?.focus();
            setCtxMenu(null);
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
            <span>Reply</span>
          </button>
          {ctxMenu.msg.senderId === currentUser.id && (
            <>
              <hr />
              <button className="danger" onClick={() => {
                if (confirm('Delete this message?')) deleteMessage(ctxMenu.msg.id);
                setCtxMenu(null);
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                <span>Delete</span>
              </button>
            </>
          )}
        </div>
      )}
      {/* DM Profile popup */}
      {dmProfile && (
        <div
          style={{ position: 'fixed', top: dmProfile.y, left: dmProfile.x, width: 240, background: '#111', border: '1px solid #1e1e1e', borderRadius: 10, overflow: 'hidden', zIndex: 1000, boxShadow: '0 12px 40px rgba(0,0,0,0.8)' }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ height: 48, background: `hsl(${dmProfile.senderUsername.split('').reduce((a:number,c:string)=>a+c.charCodeAt(0),0)%360},15%,12%)` }} />
          <div style={{ padding: '0 16px 16px' }}>
            <div style={{ marginTop: -22, marginBottom: 8 }}>
              <Avatar username={dmProfile.senderUsername} avatar={dmProfile.senderAvatar} size={44} />
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

function MessageList({ messages, currentUserId, currentUsername, currentUserAvatar, otherUsername, channelId, onProfileClick, onReply, onDelete, onLongPress }: {
  messages: Message[];
  currentUserId: string;
  currentUsername: string;
  currentUserAvatar?: string | null;
  otherUsername: string;
  channelId: string;
  onProfileClick?: (e: React.MouseEvent, senderId: string, senderUsername: string, senderAvatar?: string | null) => void;
  onReply?: (msg: Message) => void;
  onDelete?: (msgId: string) => void;
  onLongPress?: (msg: Message, x: number, y: number) => void;
}) {
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
          {renderClusters(group.messages, currentUserId, currentUsername, currentUserAvatar, otherUsername, channelId, onProfileClick, onReply, onDelete, onLongPress)}
        </div>
      ))}
    </>
  );
}

function renderClusters(messages: Message[], currentUserId: string, currentUsername: string, currentUserAvatar: string | null | undefined, otherUsername: string, channelId: string, onProfileClick?: (e: React.MouseEvent, senderId: string, senderUsername: string, senderAvatar?: string | null) => void, onReply?: (msg: Message) => void, onDelete?: (msgId: string) => void, onLongPress?: (msg: Message, x: number, y: number) => void) {
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
      <div key={cluster[0].id} style={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: isMe ? 'flex-end' : 'flex-start',
        width: '100%',
        marginBottom: 12,
        gap: 8,
      }}>
        {/* Avatar — left for others */}
        {!isMe && (
          <span style={{ flexShrink: 0, alignSelf: 'flex-end', cursor: 'pointer' }}
            onClick={(e) => onProfileClick?.(e, msg.senderId, msg.senderUsername, msg.senderAvatar)}>
            <Avatar username={msg.senderUsername} avatar={msg.senderAvatar} size={28} />
          </span>
        )}

        {/* Inner column: meta + messages */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: isMe ? 'flex-end' : 'flex-start',
          maxWidth: '72%',
          gap: 3,
        }}>
          {/* Meta row */}
          <div style={{
            display: 'flex',
            flexDirection: isMe ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: 6,
            marginBottom: 1,
          }}>
            <span
              style={{ ...s.metaName, cursor: !isMe ? 'pointer' : 'default' }}
              onClick={!isMe ? (e) => onProfileClick?.(e, msg.senderId, msg.senderUsername, msg.senderAvatar) : undefined}
            >{isMe ? 'You' : msg.senderUsername}</span>
            <span style={s.metaTime}>{formatTime(cluster[cluster.length - 1].createdAt)}</span>
          </div>

          {/* Messages */}
          {cluster.map((m, idx) => {
            let lpTimer: ReturnType<typeof setTimeout> | null = null;
            function handleTouchStart(e: React.TouchEvent) {
              const touch = e.touches[0];
              const tx = touch.clientX;
              const ty = touch.clientY;
              lpTimer = setTimeout(() => {
                const mx = Math.min(tx, window.innerWidth - 180);
                const my = Math.min(ty, window.innerHeight - 120);
                onLongPress?.(m, mx, my);
              }, 500);
            }
            function handleTouchEnd() {
              if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
            }

            // Game message — render card
            if (m.content.startsWith('__GAME__:')) {
              let gameInfo: { gameId: string; type: string; status: string } | null = null;
              try { gameInfo = JSON.parse(m.content.slice('__GAME__:'.length)); } catch {}
              if (gameInfo) {
                const GameCard = gameInfo.type === 'connect4' ? Connect4Card : TicTacToeCard;
                return (
                  <div key={m.id}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchEnd}
                  >
                    <GameCard
                      gameId={gameInfo.gameId}
                      channelId={channelId}
                      currentUserId={currentUserId}
                      currentUsername={currentUsername}
                      otherUsername={otherUsername}
                      initialStatus={gameInfo.status as 'pending' | 'active' | 'finished' | 'denied'}
                    />
                  </div>
                );
              }
            }

            return (
              <div key={m.id} style={{ position: 'relative', width: '100%' }} className="msg-wrap"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchEnd}
              >
                {/* Reply preview */}
                {m.replyTo && (
                  <div style={{
                    fontSize: 12, color: 'var(--text-3)', marginBottom: 2,
                    display: 'flex', alignItems: 'center', gap: 4,
                    justifyContent: isMe ? 'flex-end' : 'flex-start',
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    fontStyle: 'italic',
                  }}>
                    <span style={{ opacity: 0.5 }}>↩</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>{m.replyTo.senderUsername}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160, opacity: 0.7 }}>{m.replyTo.content}</span>
                  </div>
                )}
                {/* Plain text — no bubble */}
                <div style={{
                  fontSize: 17,
                  lineHeight: 1.55,
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                  letterSpacing: '0.01em',
                  animation: 'fadeIn 0.12s ease',
                  color: isMe ? 'var(--text)' : 'var(--text-2)',
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontWeight: 400,
                  textAlign: isMe ? 'right' : 'left',
                }}>
                  {m.content}
                </div>
                {/* Hover action buttons */}
                <div className="msg-actions" style={{
                  position: 'absolute', top: 0,
                  ...(isMe ? { left: -60 } : { right: -60 }),
                  display: 'flex', gap: 4, opacity: 0,
                  transition: 'opacity 0.1s',
                }}>
                  <button
                    title="Reply"
                    onClick={() => onReply?.(m)}
                    style={{ padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-2)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', lineHeight: 1 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                  </button>
                  {m.senderId === currentUserId && (
                    <button
                      title="Delete"
                      onClick={() => { if (confirm('Delete this message?')) onDelete?.(m.id); }}
                      style={{ padding: '4px 6px', border: '1px solid rgba(237,66,69,0.35)', borderRadius: 4, background: 'rgba(237,66,69,0.12)', color: '#ff6b6b', cursor: 'pointer', display: 'flex', alignItems: 'center', lineHeight: 1 }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Avatar on the right for own messages */}
        {isMe && (
          <span style={{ flexShrink: 0, alignSelf: 'flex-end' }}>
            <Avatar username={currentUsername} avatar={currentUserAvatar ?? null} size={28} />
          </span>
        )}
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

const IconGamepad = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/>
    <circle cx="15" cy="11" r="0.5" fill="currentColor" stroke="none"/>
    <circle cx="17" cy="13" r="0.5" fill="currentColor" stroke="none"/>
    <rect x="2" y="7" width="20" height="10" rx="5"/>
  </svg>
);

const GAMES = [
  { id: 'tictactoe', name: 'Tic Tac Toe', icon: 'X', desc: '2-player · Classic 3x3 grid' },
  { id: 'connect4',  name: 'Connect 4',   icon: 'O', desc: '2-player · Drop pieces, align 4' },
];

const s: Record<string, React.CSSProperties> = {
  pane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    overflow: 'hidden',
    background: '#080808',
  },
  header: {
    padding: '0 32px',
    height: 60,
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
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
    justifyContent: 'flex-end',
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
    background: '#2a2a2a',
  },
  dateLabel: {
    fontSize: 10,
    color: '#888888',
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontWeight: 400,
    fontStyle: 'italic',
    letterSpacing: '0.08em',
    flexShrink: 0,
  },
  metaName: {
    fontSize: 11,
    color: '#bbbbbb',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 500,
    letterSpacing: '0.02em',
  },
  metaTime: {
    fontSize: 10,
    color: '#888888',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 300,
  },
  inputRow: {
    padding: '12px 32px 18px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'flex-end',
    gap: 10,
    background: 'var(--bg-1)',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    background: 'var(--bg-2)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '10px 16px',
    color: '#e8e8e8',
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
