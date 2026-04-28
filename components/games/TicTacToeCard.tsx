import { useState, useEffect, useCallback } from 'react';

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

interface TicTacToeCardProps {
  gameId: string;
  channelId: string;
  currentUserId: string;
  currentUsername: string;
  otherUsername: string;
  // snapshot from message (just status, refresh for full state)
  initialStatus: 'pending' | 'active' | 'finished' | 'denied';
}

export default function TicTacToeCard({
  gameId, channelId, currentUserId, currentUsername, otherUsername, initialStatus,
}: TicTacToeCardProps) {
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const fetchGame = useCallback(async () => {
    try {
      const r = await fetch(`/api/channels/${channelId}/game?gameId=${gameId}`);
      if (r.ok) {
        const data = await r.json();
        setGame(data);
        setLoading(false);
      }
    } catch {}
  }, [channelId, gameId]);

  useEffect(() => {
    fetchGame();
  }, [fetchGame]);

  // Poll for game state when active/pending
  useEffect(() => {
    if (!game) return;
    if (game.status === 'finished' || game.status === 'denied') return;
    const interval = setInterval(fetchGame, 2000);
    return () => clearInterval(interval);
  }, [game?.status, fetchGame]);

  // 60s countdown for invitee
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
        // auto-deny
        fetch(`/api/channels/${channelId}/game`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
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
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, action }),
      });
      await fetchGame();
    } finally { setActing(false); }
  }

  async function makeMove(cellIndex: number) {
    if (!game || game.turn !== currentUserId || acting) return;
    if (game.board[cellIndex] !== null) return;
    setActing(true);
    try {
      await fetch(`/api/channels/${channelId}/game`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, action: 'move', cellIndex }),
      });
      await fetchGame();
    } finally { setActing(false); }
  }

  if (loading) {
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: 13 }}>
          <span className="spinner" style={{ width: 12, height: 12 }} />
          Loading game…
        </div>
      </div>
    );
  }
  if (!game) return null;

  const isInviter = game.inviterId === currentUserId;
  const isInvitee = game.inviteeId === currentUserId;
  const mySymbol = isInviter ? 'X' : 'O';
  const theirSymbol = isInviter ? 'O' : 'X';
  const isMyTurn = game.turn === currentUserId;
  const iWon = game.winner === currentUserId;
  const theyWon = game.winner && game.winner !== currentUserId;

  // --- PENDING ---
  if (game.status === 'pending') {
    if (isInviter) {
      return (
        <div style={card}>
          <div style={cardHeader}>
            <IconGame /> <span>Tic Tac Toe</span>
            <span style={badge('yellow')}>Waiting…</span>
          </div>
          <p style={cardBody}>Waiting for {otherUsername} to accept your challenge.</p>
          <div style={timerBar}>
            <div style={{ ...timerFill, width: `${((timeLeft ?? 60) / 60) * 100}%` }} />
          </div>
        </div>
      );
    }
    // invitee
    return (
      <div style={card}>
        <div style={cardHeader}>
          <IconGame /> <span>Tic Tac Toe</span>
          <span style={badge('yellow')}>Challenge!</span>
        </div>
        <p style={cardBody}>{otherUsername} wants to play Tic Tac Toe!</p>
        {timeLeft !== null && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 4, fontFamily: 'var(--font-display)' }}>
              Auto-denying in {timeLeft}s
            </div>
            <div style={timerBar}>
              <div style={{ ...timerFill, width: `${(timeLeft / 60) * 100}%`, background: timeLeft < 15 ? '#ed4245' : '#4ade80' }} />
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => respond('accept')}
            disabled={acting || timeLeft === 0}
            style={{ ...btn, background: '#1a3a1a', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' }}
          >
            {acting ? <span className="spinner" style={{ width: 10, height: 10 }} /> : '✓ Accept'}
          </button>
          <button
            onClick={() => respond('deny')}
            disabled={acting || timeLeft === 0}
            style={{ ...btn, background: 'rgba(237,66,69,0.08)', border: '1px solid rgba(237,66,69,0.3)', color: '#ed4245' }}
          >
            ✕ Deny
          </button>
        </div>
      </div>
    );
  }

  // --- DENIED / EXPIRED ---
  if (game.status === 'denied') {
    return (
      <div style={{ ...card, opacity: 0.6 }}>
        <div style={cardHeader}>
          <IconGame /> <span>Tic Tac Toe</span>
          <span style={badge('red')}>Declined</span>
        </div>
        <p style={cardBody}>
          {isInviter ? `${otherUsername} declined the challenge.` : 'You declined the challenge.'}
        </p>
      </div>
    );
  }

  // --- FINISHED ---
  if (game.status === 'finished') {
    return (
      <div style={card}>
        <div style={cardHeader}>
          <IconGame /> <span>Tic Tac Toe</span>
          <span style={badge(iWon ? 'green' : theyWon ? 'red' : 'grey')}>
            {game.isDraw ? 'Draw' : iWon ? 'You won!' : `${otherUsername} won`}
          </span>
        </div>
        <Board board={game.board} winningLine={getWinningLine(game.board)} onCell={null} mySymbol={mySymbol} />
      </div>
    );
  }

  // --- ACTIVE ---
  return (
    <div style={card}>
      <div style={cardHeader}>
        <IconGame /> <span>Tic Tac Toe</span>
        <span style={badge('blue')}>
          {isMyTurn ? 'Your turn' : `${otherUsername}'s turn`}
        </span>
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 10, fontFamily: 'var(--font-display)' }}>
        You are <span style={{ color: mySymbol === 'X' ? '#e0e0e0' : '#a0a0a0', fontWeight: 600 }}>{mySymbol}</span>
        {' · '}
        {otherUsername} is <span style={{ color: theirSymbol === 'X' ? '#e0e0e0' : '#a0a0a0', fontWeight: 600 }}>{theirSymbol}</span>
      </div>
      <Board
        board={game.board}
        winningLine={null}
        onCell={isMyTurn && !acting ? makeMove : null}
        mySymbol={mySymbol}
      />
    </div>
  );
}

function Board({ board, winningLine, onCell, mySymbol }: {
  board: (string | null)[];
  winningLine: number[] | null;
  onCell: ((i: number) => void) | null;
  mySymbol: string;
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 4,
      width: 180,
    }}>
      {board.map((cell, i) => {
        const isWin = winningLine?.includes(i);
        const isEmpty = cell === null;
        const isMine = cell === mySymbol;
        return (
          <button
            key={i}
            onClick={() => onCell?.(i)}
            disabled={!isEmpty || !onCell}
            style={{
              width: '100%',
              aspectRatio: '1',
              background: isWin ? 'rgba(74,222,128,0.12)' : 'var(--bg-2)',
              border: `1px solid ${isWin ? 'rgba(74,222,128,0.4)' : '#222'}`,
              borderRadius: 6,
              fontSize: 22,
              fontWeight: 700,
              color: !cell ? 'transparent' : isMine ? '#e0e0e0' : '#505050',
              cursor: isEmpty && onCell ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.1s, border-color 0.1s',
              fontFamily: "'Cormorant Garamond', Georgia, serif",
            }}
          >
            {cell || (isEmpty && onCell ? <span style={{ color: '#1e1e1e', fontSize: 14 }}>·</span> : '')}
          </button>
        );
      })}
    </div>
  );
}

function getWinningLine(board: (string | null)[]): number[] | null {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];
  for (const line of lines) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return line;
  }
  return null;
}

function IconGame() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text-3)' }}>
      <line x1="8" y1="2" x2="8" y2="22" /><line x1="16" y1="2" x2="16" y2="22" />
      <line x1="2" y1="8" x2="22" y2="8" /><line x1="2" y1="16" x2="22" y2="16" />
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
    marginLeft: 'auto',
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 20,
    background: c.bg,
    border: `1px solid ${c.border}`,
    color: c.color,
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    flexShrink: 0,
  };
}

const card: React.CSSProperties = {
  background: 'var(--bg-1)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '14px 16px',
  minWidth: 240,
  maxWidth: 280,
  fontFamily: 'var(--font-display)',
};

const cardHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  marginBottom: 10,
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-3)',
};

const cardBody: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-3)',
  margin: '0 0 12px',
  lineHeight: 1.5,
};

const timerBar: React.CSSProperties = {
  height: 2,
  background: 'var(--bg-3)',
  borderRadius: 2,
  overflow: 'hidden',
  marginBottom: 12,
};

const timerFill: React.CSSProperties = {
  height: '100%',
  background: '#facc15',
  borderRadius: 2,
  transition: 'width 1s linear, background 0.3s',
};

const btn: React.CSSProperties = {
  padding: '7px 14px',
  fontSize: 14,
  borderRadius: 6,
  cursor: 'pointer',
  fontFamily: 'var(--font-display)',
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
  gap: 5,
};
