import { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';
import { verifyToken } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

// Game state stored in MongoDB `games` collection
// Each game has: _id, channelId, type, inviterId, inviteeId,
//   status: 'pending'|'active'|'finished', board, turn, winner,
//   invitedAt (for 60s timeout), messageId (the system message id)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const cookies = parse(req.headers.cookie || '');
  const token = cookies.palerock_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const payload = await verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid token' });

  const { db } = await connectToDatabase();
  const meId = new ObjectId(payload.userId);
  const { channelId } = req.query;
  if (!channelId || typeof channelId !== 'string') return res.status(400).json({ error: 'Channel ID required' });

  // Verify DM channel membership
  const channel = await db.collection('channels').findOne({ _id: new ObjectId(channelId), members: meId });
  if (!channel) return res.status(403).json({ error: 'Access denied' });

  // POST /game — send a game invite
  if (req.method === 'POST') {
    const { type } = req.body;
    if (!type || type !== 'tictactoe') return res.status(400).json({ error: 'Invalid game type' });

    // Check no active/pending game already in this channel
    const existing = await db.collection('games').findOne({
      channelId: new ObjectId(channelId),
      status: { $in: ['pending', 'active'] },
    });
    if (existing) return res.status(409).json({ error: 'A game is already in progress in this channel' });

    const otherMemberId = channel.members.find((m: ObjectId) => !m.equals(meId));
    if (!otherMemberId) return res.status(400).json({ error: 'No other member found' });

    const now = new Date();

    // Insert game record
    const gameResult = await db.collection('games').insertOne({
      channelId: new ObjectId(channelId),
      type,
      inviterId: meId,
      inviteeId: otherMemberId,
      status: 'pending',
      board: Array(9).fill(null), // tictactoe: 9 cells
      turn: meId, // inviter goes first (X)
      winner: null,
      invitedAt: now,
      createdAt: now,
    });

    const gameId = gameResult.insertedId.toString();

    // Insert a system message so the invite appears in chat
    const msgResult = await db.collection('messages').insertOne({
      channelId: new ObjectId(channelId),
      senderId: meId,
      content: `__GAME__:${JSON.stringify({ gameId, type, status: 'pending' })}`,
      createdAt: now,
      editedAt: null,
      replyTo: null,
      isGameMessage: true,
    });

    // Store message ID back on game for easy lookup
    await db.collection('games').updateOne(
      { _id: gameResult.insertedId },
      { $set: { messageId: msgResult.insertedId } }
    );

    await db.collection('channels').updateOne(
      { _id: new ObjectId(channelId) },
      { $set: { updatedAt: now } }
    );

    return res.status(201).json({ gameId, messageId: msgResult.insertedId.toString() });
  }

  // PATCH /game — respond to invite (accept/deny) or make a move
  if (req.method === 'PATCH') {
    const { gameId, action, cellIndex } = req.body;
    if (!gameId) return res.status(400).json({ error: 'gameId required' });

    const game = await db.collection('games').findOne({ _id: new ObjectId(gameId) });
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (!game.channelId.equals(new ObjectId(channelId))) return res.status(403).json({ error: 'Game not in this channel' });

    // accept / deny
    if (action === 'accept' || action === 'deny') {
      if (!game.inviteeId.equals(meId)) return res.status(403).json({ error: 'Not the invitee' });
      if (game.status !== 'pending') return res.status(409).json({ error: 'Game is not pending' });

      // Check 60s timeout
      const elapsed = Date.now() - new Date(game.invitedAt).getTime();
      if (elapsed > 60000) {
        await db.collection('games').updateOne({ _id: new ObjectId(gameId) }, { $set: { status: 'denied' } });
        // Update system message content
        await db.collection('messages').updateOne(
          { _id: game.messageId },
          { $set: { content: `__GAME__:${JSON.stringify({ gameId, type: game.type, status: 'denied' })}` } }
        );
        return res.status(410).json({ error: 'Invite expired' });
      }

      if (action === 'deny') {
        await db.collection('games').updateOne({ _id: new ObjectId(gameId) }, { $set: { status: 'denied' } });
        await db.collection('messages').updateOne(
          { _id: game.messageId },
          { $set: { content: `__GAME__:${JSON.stringify({ gameId, type: game.type, status: 'denied' })}` } }
        );
        return res.status(200).json({ ok: true, status: 'denied' });
      }

      // accept
      await db.collection('games').updateOne({ _id: new ObjectId(gameId) }, { $set: { status: 'active' } });
      await db.collection('messages').updateOne(
        { _id: game.messageId },
        { $set: { content: `__GAME__:${JSON.stringify({ gameId, type: game.type, status: 'active' })}` } }
      );
      return res.status(200).json({ ok: true, status: 'active' });
    }

    // move
    if (action === 'move') {
      if (game.status !== 'active') return res.status(409).json({ error: 'Game is not active' });
      if (!game.turn.equals(meId)) return res.status(403).json({ error: 'Not your turn' });
      if (typeof cellIndex !== 'number' || cellIndex < 0 || cellIndex > 8) return res.status(400).json({ error: 'Invalid cell' });
      if (game.board[cellIndex] !== null) return res.status(409).json({ error: 'Cell taken' });

      const isInviter = game.inviterId.equals(meId);
      const symbol = isInviter ? 'X' : 'O';
      const newBoard = [...game.board];
      newBoard[cellIndex] = symbol;

      const winner = checkWinner(newBoard);
      const isDraw = !winner && newBoard.every((c: string | null) => c !== null);
      const newStatus = winner || isDraw ? 'finished' : 'active';
      const winnerField = winner ? meId : null;
      const nextTurn = isInviter ? game.inviteeId : game.inviterId;

      await db.collection('games').updateOne(
        { _id: new ObjectId(gameId) },
        { $set: { board: newBoard, turn: newStatus === 'active' ? nextTurn : game.turn, status: newStatus, winner: winnerField, isDraw: isDraw } }
      );

      const gamePayload = { gameId, type: game.type, status: newStatus };
      await db.collection('messages').updateOne(
        { _id: game.messageId },
        { $set: { content: `__GAME__:${JSON.stringify(gamePayload)}` } }
      );

      return res.status(200).json({ ok: true, board: newBoard, status: newStatus, winner: winnerField?.toString() || null, isDraw });
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  // GET /game?gameId=xxx — fetch full game state
  if (req.method === 'GET') {
    const { gameId } = req.query;
    if (!gameId || typeof gameId !== 'string') return res.status(400).json({ error: 'gameId required' });
    const game = await db.collection('games').findOne({ _id: new ObjectId(gameId) });
    if (!game) return res.status(404).json({ error: 'Not found' });
    if (!game.channelId.equals(new ObjectId(channelId))) return res.status(403).json({ error: 'Access denied' });

    return res.status(200).json({
      id: game._id.toString(),
      type: game.type,
      status: game.status,
      board: game.board,
      inviterId: game.inviterId.toString(),
      inviteeId: game.inviteeId.toString(),
      turn: game.turn?.toString() || null,
      winner: game.winner?.toString() || null,
      isDraw: game.isDraw || false,
      invitedAt: game.invitedAt,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

function checkWinner(board: (string | null)[]): string | null {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}
