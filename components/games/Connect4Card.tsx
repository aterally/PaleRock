import { useState, useEffect, useCallback } from 'react';

const COLS = 7;
const ROWS = 6;

interface GameState {
  id: string;
  type: string;
  status: 'pending' | 'active' | 'finished' | 'denied';
  board: (string | null)[];
  inviterId: string;
  inviteeId: string;
  turn: string | null;
  winner: string | null;
  isDraw: boolean;
  invitedAt: string;
}

interface Connect4CardProps {
  gameId: string;
  channelId: string;
  currentUserId: string;
  currentUsername: string;
  otherUsername: string;
  initialStatus: 'pending' | 'active' | 'finished' | 'denied';
}

export default function Connect4Card({
  gameId, channelId, currentUserId, currentUsername, otherUsername, initialStatus,
}: Connect4CardProps) {
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);

  const fetchGame = useCallback(async () => {
    try {
      const r = await fetch(`/api/channels/${channelId}/game?gameId=${gameId}`);
      if (r.ok) { const data = await r.json(); setGame(data); setLoading(false); }
    } catch {}
  }, [channelId, gameId]);

  useEffect(() => { fetchGame(); }, [fetchGame]);

  useEffect(() => {
    if (!game) return;
    if (game.status === 'finished' || game.status === 'denied') return;
    const interval = setInterval(fetchGame, 2000);
    return () => clearInterval(interval);
  }, [game?.status, fetchGame]);

  useEffect(() => {
    if (!game || game.status !== 'pending') return;
    const isInvitee = game.inviteeId === currentUserId;
    if (!isInvitee) return;
    function tick() {
      if (!game) return;
      const elapsed = Date.now() - new Date(game.invitedAt).getTime();
      const left = Math.max(0, 60 - Math.floor(elapsed / 1000));
      setTimeLeft(left);
      if (left === 0) {
        fetch(`/api/channels/${channelId}/game`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId, action: 'deny' }),
        }).then(() => fetchGame());
      }
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [game?.status, game?.invitedAt, game?.inviteeId, currentUserId, channelId, gameId, fetchGame]);

  async function respond(action: 'accept' | 'deny') {
    setActing(true);
    try {
      await fetch(`/api/channels/${channelId}/game`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, action }),
      });
      await fetchGame();
    } finally { setActing(false); }
  }

  async function dropPiece(col: number) {
    if (!game || game.turn !== currentUserId || acting) return;
    // Find the lowest empty row in this column
    let row = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (game.board[r * COLS + col] === null) { row = r; break; }
    }
    if (row === -1) return; // column full
    const cellIndex = row * COLS + col;
    setActing(true);
    try {
      await fetch(`/api/channels/${channelId}/game`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, action: 'move', cellIndex }),
      });
      await fetchGame();
    } finally { setActing(false); }
  }

  if (loading) {
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: 14 }}>
          <span className="spinner" style={{ width: 12, height: 12 }} />
          Loading game…
        </div>
      </div>
    );
  }
  if (!game) return null;

  const isInviter = game.inviterId === currentUserId;
  const isInvitee = game.inviteeId === currentUserId;
  const myColor = isInviter ? '#e05c5c' : '#e8c84a';
  const theirColor = isInviter ? '#e8c84a' : '#e05c5c';
  const myLabel = isInviter ? '●' : '●';
  const isMyTurn = game.turn === currentUserId;
  const iWon = game.winner === currentUserId;
  const theyWon = game.winner && game.winner !== currentUserId;
  const winningCells = game.status === 'finished' && !game.isDraw ? getWinningCells(game.board) : null;

  if (game.status === 'pending') {
    if (isInviter) {
      return (
        <div style={card}>
          <div style={cardHeader}><IconConnect4 /> <span>Connect 4</span><span style={badge('yellow')}>Waiting…</span></div>
          <p style={cardBody}>Waiting for {otherUsername} to accept your challenge.</p>
          <div style={timerBar}><div style={{ ...timerFill, width: `${((timeLeft ?? 60) / 60) * 100}%` }} /></div>
        </div>
      );
    }
    return (
      <div style={card}>
        <div style={cardHeader}><IconConnect4 /> <span>Connect 4</span><span style={badge('yellow')}>Challenge!</span></div>
        <p style={cardBody}>{otherUsername} wants to play Connect 4!</p>
        {timeLeft !== null && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4, fontFamily: 'var(--font-display)' }}>Auto-denying in {timeLeft}s</div>
            <div style={timerBar}><div style={{ ...timerFill, width: `${(timeLeft / 60) * 100}%`, background: timeLeft < 15 ? '#ed4245' : '#4ade80' }} /></div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => respond('accept')} disabled={acting || timeLeft === 0}
            style={{ ...btn, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' }}>
            {acting ? <span className="spinner" style={{ width: 10, height: 10 }} /> : '✓ Accept'}
          </button>
          <button onClick={() => respond('deny')} disabled={acting || timeLeft === 0}
            style={{ ...btn, background: 'rgba(237,66,69,0.08)', border: '1px solid rgba(237,66,69,0.3)', color: '#ed4245' }}>
            ✕ Deny
          </button>
        </div>
      </div>
    );
  }

  if (game.status === 'denied') {
    return (
      <div style={{ ...card, opacity: 0.6 }}>
        <div style={cardHeader}><IconConnect4 /> <span>Connect 4</span><span style={badge('red')}>Declined</span></div>
        <p style={cardBody}>{isInviter ? `${otherUsername} declined the challenge.` : 'You declined the challenge.'}</p>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={cardHeader}>
        <IconConnect4 /> <span>Connect 4</span>
        <span style={badge(game.status === 'finished' ? (iWon ? 'green' : theyWon ? 'red' : 'grey') : isMyTurn ? 'blue' : 'yellow')}>
          {game.status === 'finished'
            ? (game.isDraw ? 'Draw' : iWon ? 'You won!' : `${otherUsername} won`)
            : isMyTurn ? 'Your turn' : `${otherUsername}'s turn`}
        </span>
      </div>
      {game.status === 'active' && (
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 10, fontFamily: 'var(--font-display)', display: 'flex', gap: 12 }}>
          <span>You <span style={{ color: myColor, fontWeight: 700 }}>●</span></span>
          <span>{otherUsername} <span style={{ color: theirColor, fontWeight: 700 }}>●</span></span>
        </div>
      )}
      {/* Column drop buttons */}
      {game.status === 'active' && isMyTurn && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: 3, marginBottom: 2, width: COLS * 36 + (COLS - 1) * 3 }}>
          {Array.from({ length: COLS }, (_, col) => {
            const colFull = game.board[col] !== null; // top row filled = column full
            return (
              <button
                key={col}
                onClick={() => dropPiece(col)}
                disabled={acting || colFull}
                onMouseEnter={() => setHoverCol(col)}
                onMouseLeave={() => setHoverCol(null)}
                style={{
                  height: 20, background: 'transparent', border: 'none', cursor: colFull ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: hoverCol === col && !colFull ? myColor : 'transparent',
                  fontSize: 14, transition: 'color 0.1s',
                }}
              >▼</button>
            );
          })}
        </div>
      )}
      {/* Board */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${COLS}, 36px)`,
        gridTemplateRows: `repeat(${ROWS}, 36px)`,
        gap: 3,
        background: 'var(--bg-3)',
        borderRadius: 8,
        padding: 6,
        border: '1px solid var(--border)',
      }}>
        {game.board.map((cell, i) => {
          const row = Math.floor(i / COLS);
          const col = i % COLS;
          const isWin = winningCells?.includes(i);
          const isHoverCol = hoverCol === col && game.status === 'active' && isMyTurn && !acting;
          // Find the drop preview row (lowest empty in hovered col)
          let previewRow = -1;
          if (isHoverCol) {
            for (let r = ROWS - 1; r >= 0; r--) {
              if (game.board[r * COLS + col] === null) { previewRow = r; break; }
            }
          }
          const isPreview = isHoverCol && row === previewRow && cell === null;
          const cellColor = cell === game.inviterId ? '#e05c5c' : cell === game.inviteeId ? '#e8c84a' : null;
          return (
            <div
              key={i}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: isWin
                  ? (cellColor || 'transparent')
                  : isPreview
                  ? myColor + '44'
                  : cell
                  ? (cellColor || 'var(--bg-4)')
                  : 'var(--bg-2)',
                border: isWin ? `2px solid ${cellColor}` : `1px solid var(--border)`,
                boxShadow: isWin ? `0 0 8px ${cellColor}66` : 'none',
                transition: 'background 0.15s',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function getWinningCells(board: (string | null)[]): number[] | null {
  // Check horizontal
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const i = r * COLS + c;
      if (board[i] && board[i] === board[i+1] && board[i] === board[i+2] && board[i] === board[i+3])
        return [i, i+1, i+2, i+3];
    }
  }
  // Check vertical
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      if (board[i] && board[i] === board[i+COLS] && board[i] === board[i+2*COLS] && board[i] === board[i+3*COLS])
        return [i, i+COLS, i+2*COLS, i+3*COLS];
    }
  }
  // Check diagonal ↘
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const i = r * COLS + c;
      if (board[i] && board[i] === board[i+COLS+1] && board[i] === board[i+2*(COLS+1)] && board[i] === board[i+3*(COLS+1)])
        return [i, i+COLS+1, i+2*(COLS+1), i+3*(COLS+1)];
    }
  }
  // Check diagonal ↙
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 3; c < COLS; c++) {
      const i = r * COLS + c;
      if (board[i] && board[i] === board[i+COLS-1] && board[i] === board[i+2*(COLS-1)] && board[i] === board[i+3*(COLS-1)])
        return [i, i+COLS-1, i+2*(COLS-1), i+3*(COLS-1)];
    }
  }
  return null;
}

function IconConnect4() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, color: 'var(--text-3)' }}>
      <circle cx="6" cy="6" r="2.5"/><circle cx="12" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/>
      <circle cx="6" cy="12" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="18" cy="12" r="2.5"/>
      <circle cx="6" cy="18" r="2.5"/><circle cx="12" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/>
    </svg>
  );
}

function badge(color: 'yellow' | 'green' | 'red' | 'grey' | 'blue'): React.CSSProperties {
  const map = {
    yellow: { bg: 'rgba(250,204,21,0.1)', border: 'rgba(250,204,21,0.3)', color: '#facc15' },
    green:  { bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.3)', color: '#4ade80' },
    red:    { bg: 'rgba(237,66,69,0.1)',  border: 'rgba(237,66,69,0.3)',  color: '#ed4245' },
    grey:   { bg: 'rgba(100,100,100,0.1)',border: 'rgba(100,100,100,0.3)',color: '#888' },
    blue:   { bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.3)', color: '#60a5fa' },
  };
  const c = map[color];
  return {
    marginLeft: 'auto', fontSize: 11, padding: '2px 8px', borderRadius: 20,
    background: c.bg, border: `1px solid ${c.border}`, color: c.color,
    fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '0.05em',
    textTransform: 'uppercase', flexShrink: 0,
  };
}

const card: React.CSSProperties = {
  background: 'var(--bg-1)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '14px 16px',
  minWidth: 280,
  maxWidth: 320,
  fontFamily: 'var(--font-display)',
};

const cardHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10,
  fontSize: 14, fontWeight: 600, color: 'var(--text-3)',
};

const cardBody: React.CSSProperties = {
  fontSize: 14, color: 'var(--text-3)', margin: '0 0 12px', lineHeight: 1.5,
};

const timerBar: React.CSSProperties = {
  height: 2, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden', marginBottom: 12,
};

const timerFill: React.CSSProperties = {
  height: '100%', background: '#facc15', borderRadius: 2, transition: 'width 1s linear, background 0.3s',
};

const btn: React.CSSProperties = {
  padding: '7px 14px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
  fontFamily: 'var(--font-display)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5,
};
