import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from '@/components/Sidebar';

interface CallSession {
  callerId: string;
  callerUsername: string;
  calleeId: string;
  status: 'ringing' | 'active' | 'ended';
  startedAt: number;
  typing: { [userId: string]: { text: string; updatedAt: number } };
}

interface Props {
  channelId: string;
  currentUserId: string;
  currentUsername: string;
  currentAvatar?: string | null;
  otherUsername: string;
  otherAvatar?: string | null;
  otherUserId: string;
  alreadyAccepted?: boolean;
  onClose: () => void;
}

export default function ChatCallOverlay({
  channelId, currentUserId, currentUsername, currentAvatar,
  otherUsername, otherAvatar, otherUserId, alreadyAccepted, onClose,
}: Props): JSX.Element {
  // null = "loading, don't render anything yet" — prevents the flash on mount
  const [status, setStatus] = useState<'ringing' | 'active' | 'ended' | null>(null);
  const [isCallee, setIsCallee] = useState(false);
  const [theirText, setTheirText] = useState('');
  const [myText, setMyText] = useState('');
  const [elapsed, setElapsed] = useState(0);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // We use a recursive setTimeout (not setInterval) so polls never overlap
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  // Only end the call on null/ended after we've seen a live session at least once
  const sessionConfirmedRef = useRef(false);
  // Require consecutive misses before accepting the call as truly over —
  // guards against a single transient null from a cold-start resetting in-memory state
  const missCountRef = useRef(0);
  const MISS_THRESHOLD = 3;

  // ─── Core poll — called manually; schedules itself when done ──────────────
  async function doPoll() {
    if (stoppedRef.current) return;
    try {
      const r = await fetch(`/api/channels/${channelId}/chat-call`);
      if (!r.ok) return;
      const data = await r.json();
      const s: CallSession | null = data.session;

      if (!s || s.status === 'ended') {
        // Only treat this as "call over" if:
        // 1. We've confirmed the session was live at some point (guards against pre-init nulls)
        // 2. We've seen this consistently for MISS_THRESHOLD polls (guards against transient server glitches)
        if (sessionConfirmedRef.current) {
          missCountRef.current += 1;
          if (missCountRef.current >= MISS_THRESHOLD) {
            if (s?.status === 'ended') {
              setStatus('ended');
            }
            stopAndClose();
          }
        }
        return;
      }

      // We have a live session — reset miss counter and mark confirmed
      missCountRef.current = 0;
      sessionConfirmedRef.current = true;

      setStatus(s.status);
      setIsCallee(s.calleeId === currentUserId);

      if (s.status === 'active') {
        const theirTyping = s.typing[otherUserId];
        setTheirText(theirTyping?.text ?? '');
      }
    } catch (_) {
      // network error — just retry
    } finally {
      if (!stoppedRef.current) {
        pollTimerRef.current = setTimeout(doPoll, 600);
      }
    }
  }

  function stopPolling() {
    if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
  }

  function stopAndClose(immediate = false) {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    stopPolling();
    setTimeout(() => onCloseRef.current(), immediate ? 0 : 1600);
  }

  // ─── Mount: init then start polling ───────────────────────────────────────
  useEffect(() => {
    async function init() {
      if (alreadyAccepted) {
        // Callee already accepted via the banner — session is active, just poll once then loop
        sessionConfirmedRef.current = true;
        await doPoll();
        return;
      }
      // Check for an existing session first (handles both-parties-press-call race)
      try {
        const r = await fetch(`/api/channels/${channelId}/chat-call`);
        if (r.ok) {
          const data = await r.json();
          const s: CallSession | null = data.session;
          if (s && (s.status === 'ringing' || s.status === 'active')) {
            // A live session already exists — surface it, don't create a second one
            sessionConfirmedRef.current = true;
            setStatus(s.status);
            setIsCallee(s.calleeId === currentUserId);
            if (!stoppedRef.current) pollTimerRef.current = setTimeout(doPoll, 600);
            return;
          }
        }
      } catch (_) {}
      // No existing session — initiate
      try {
        await fetch(`/api/channels/${channelId}/chat-call`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'initiate' }),
        });
      } catch (_) {}
      await doPoll();
    }
    init();
    return () => {
      stoppedRef.current = true;
      stopPolling();
      if (typingRef.current) clearTimeout(typingRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Elapsed timer — only while active ────────────────────────────────────
  useEffect(() => {
    if (status === 'active' && !elapsedRef.current) {
      elapsedRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
    if (status !== 'active' && elapsedRef.current) {
      clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
  }, [status]);

  // ─── Typing ────────────────────────────────────────────────────────────────
  function handleType(val: string) {
    setMyText(val);
    if (typingRef.current) clearTimeout(typingRef.current);
    typingRef.current = setTimeout(() => {
      fetch(`/api/channels/${channelId}/chat-call`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'typing', text: val }),
      }).catch(() => {});
    }, 80);
  }

  // ─── Accept (callee pressing accept inside the overlay, not via banner) ────
  async function acceptCall() {
    try {
      await fetch(`/api/channels/${channelId}/chat-call`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept' }),
      });
      setElapsed(0);
      setStatus('active');
      setIsCallee(true);
    } catch (_) {}
  }

  // ─── Reject / end ──────────────────────────────────────────────────────────
  async function rejectOrEnd() {
    const action = status === 'ringing' ? 'reject' : 'end';
    stoppedRef.current = true; // stop polling immediately — no more state changes
    stopPolling();
    try {
      await fetch(`/api/channels/${channelId}/chat-call`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
    } catch (_) {}
    setStatus('ended');
    setTimeout(() => onCloseRef.current(), 1500);
  }

  function fmtElapsed(s: number) {
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  }

  if (typeof window === 'undefined') return <></>;
  // Don't render anything until we've confirmed the session state
  if (status === null) return createPortal(<></>, document.body) as JSX.Element;

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      // Fade the whole overlay in once, not the inner cards on every state change
      animation: 'ccOverlayIn 0.2s ease forwards',
    }}>
      <style>{`
        @keyframes ccOverlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes ccRingPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(99,179,237,0.5); }
          50%       { box-shadow: 0 0 0 14px rgba(99,179,237,0); }
        }
        @keyframes ccBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        .cc-card {
          display: flex; flex-direction: column; align-items: center; gap: 24;
          padding: 48px 40px; background: var(--bg-2); border-radius: 20;
          border: 1px solid var(--border); min-width: 320px;
          box-shadow: 0 32px 80px rgba(0,0,0,0.7);
        }
        .cc-textarea {
          width: 100%; background: transparent; border: none; outline: none;
          resize: none; color: var(--text); font-family: var(--font-display);
          font-size: 16px; line-height: 1.6; padding: 0; caret-color: #63b3ed;
        }
        .cc-cursor-blink::after {
          content: '|'; animation: ccBlink 1s step-end infinite;
          color: #63b3ed; font-weight: 100;
        }
      `}</style>

      {/* ── RINGING ── */}
      {status === 'ringing' && (
        <div className="cc-card">
          <div style={{
            borderRadius: '50%', padding: 4,
            animation: !isCallee ? 'ccRingPulse 1.5s ease-in-out infinite' : 'none',
          }}>
            <Avatar
              username={!isCallee ? otherUsername : currentUsername}
              avatar={!isCallee ? otherAvatar : currentAvatar}
              size={72}
            />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.02em' }}>
              {!isCallee ? otherUsername : currentUsername}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6, letterSpacing: '0.08em' }}>
              {!isCallee ? 'CHAT CALL — RINGING…' : `${otherUsername.toUpperCase()} IS CALLING`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            {isCallee && (
              <button onClick={acceptCall} style={{
                width: 56, height: 56, borderRadius: '50%', border: 'none',
                background: '#23a55a', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 20px rgba(35,165,90,0.5)', transition: 'transform 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="6" width="20" height="12" rx="2"/>
                  <line x1="6" y1="10" x2="6" y2="10" strokeWidth="3"/><line x1="10" y1="10" x2="10" y2="10" strokeWidth="3"/>
                  <line x1="14" y1="10" x2="14" y2="10" strokeWidth="3"/><line x1="18" y1="10" x2="18" y2="10" strokeWidth="3"/>
                  <line x1="6" y1="14" x2="18" y2="14" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              </button>
            )}
            <button onClick={rejectOrEnd} style={{
              width: 56, height: 56, borderRadius: '50%', border: 'none',
              background: '#ed4245', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(237,66,69,0.4)', transition: 'transform 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
              </svg>
            </button>
          </div>
          {!isCallee && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em' }}>
              Waiting for {otherUsername} to accept…
            </div>
          )}
        </div>
      )}

      {/* ── ACTIVE ── */}
      {status === 'active' && (
        <div style={{
          width: 'min(860px, 96vw)', height: 'min(560px, 92dvh)',
          background: 'var(--bg-2)', borderRadius: 20,
          border: '1px solid var(--border)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 20px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-3)', flexShrink: 0,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#23a55a', boxShadow: '0 0 6px #23a55a' }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-3)' }}>CHAT CALL</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{fmtElapsed(elapsed)}</span>
            <div style={{ flex: 1 }} />
            <button onClick={rejectOrEnd} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 14px', borderRadius: 8, border: 'none',
              background: 'rgba(237,66,69,0.15)', color: '#ed4245',
              cursor: 'pointer', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.08em', transition: 'background 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(237,66,69,0.3)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(237,66,69,0.15)')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
              </svg>
              END CALL
            </button>
          </div>
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* MY pane */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--bg)' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 18px', borderBottom: '1px solid var(--border)',
                flexShrink: 0, background: 'var(--bg-2)',
              }}>
                <Avatar username={currentUsername} avatar={currentAvatar} size={22} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.04em' }}>{currentUsername}</span>
                <span style={{ fontSize: 10, color: '#23a55a', letterSpacing: '0.08em', fontWeight: 700, marginLeft: 4 }}>YOU</span>
              </div>
              <div style={{ flex: 1, padding: '20px 22px', overflow: 'auto' }}>
                <textarea
                  ref={inputRef}
                  className="cc-textarea"
                  value={myText}
                  onChange={e => handleType(e.target.value)}
                  placeholder="Start typing… they'll see it as you type"
                  style={{ height: '100%', minHeight: 200 }}
                />
              </div>
            </div>
            {/* THEIR pane */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 18px', borderBottom: '1px solid var(--border)',
                flexShrink: 0, background: 'var(--bg-2)',
              }}>
                <Avatar username={otherUsername} avatar={otherAvatar} size={22} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.04em' }}>{otherUsername}</span>
              </div>
              <div style={{ flex: 1, padding: '20px 22px', overflow: 'auto' }}>
                {theirText
                  ? <div style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} className="cc-cursor-blink">{theirText}</div>
                  : <div style={{ fontSize: 13, color: 'var(--text-3)', fontStyle: 'italic', marginTop: 4 }}>Waiting for {otherUsername} to type…</div>
                }
              </div>
            </div>
          </div>
          <div style={{
            padding: '8px 20px', borderTop: '1px solid var(--border)',
            background: 'var(--bg-3)', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.06em' }}>Everything you type is live — updated every 0.6s</span>
          </div>
        </div>
      )}

      {/* ── ENDED ── */}
      {status === 'ended' && (
        <div className="cc-card" style={{ minWidth: 260, gap: 16, padding: '40px 48px' }}>
          <div style={{ fontSize: 28 }}>📵</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.1em' }}>CALL ENDED</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{fmtElapsed(elapsed)}</div>
        </div>
      )}
    </div>,
    document.body,
  ) as JSX.Element;
}

// ─── Incoming call banner ──────────────────────────────────────────────────
interface IncomingCallBannerProps {
  callerUsername: string;
  callerAvatar?: string | null;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallBanner({ callerUsername, callerAvatar, onAccept, onReject }: IncomingCallBannerProps): JSX.Element {
  if (typeof window === 'undefined') return <></>;
  return createPortal(
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9997, background: 'var(--bg-2)', border: '1px solid var(--border)',
      borderRadius: 16, padding: '16px 20px',
      display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: '0 16px 48px rgba(0,0,0,0.7)', fontFamily: 'var(--font-display)',
      animation: 'ccBannerIn 0.25s ease forwards', minWidth: 300,
    }}>
      <style>{`
        @keyframes ccBannerIn {
          from { opacity:0; transform: translateX(-50%) translateY(12px); }
          to   { opacity:1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes ccRingPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(99,179,237,0.5); }
          50%       { box-shadow: 0 0 0 14px rgba(99,179,237,0); }
        }
      `}</style>
      <div style={{ borderRadius: '50%', animation: 'ccRingPulse 1.5s ease-in-out infinite' }}>
        <Avatar username={callerUsername} avatar={callerAvatar} size={40} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{callerUsername}</div>
        <div style={{ fontSize: 11, color: '#63b3ed', letterSpacing: '0.08em', marginTop: 2 }}>incoming chat call</div>
      </div>
      <button onClick={onAccept} style={{
        width: 38, height: 38, borderRadius: '50%', border: 'none',
        background: '#23a55a', color: '#fff', cursor: 'pointer', fontSize: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>✓</button>
      <button onClick={onReject} style={{
        width: 38, height: 38, borderRadius: '50%', border: 'none',
        background: '#ed4245', color: '#fff', cursor: 'pointer', fontSize: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>✕</button>
    </div>,
    document.body,
  ) as JSX.Element;
}
