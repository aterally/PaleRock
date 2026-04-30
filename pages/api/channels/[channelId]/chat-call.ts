import { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';
import { verifyToken } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

// In-memory store for active chat calls and live typing state
// Shape: { [channelId]: CallSession }
interface CallSession {
  callerId: string;
  callerUsername: string;
  calleeId: string;
  status: 'ringing' | 'active' | 'ended';
  startedAt: number;
  typing: {
    [userId: string]: { text: string; updatedAt: number };
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __chatCalls: Map<string, CallSession> | undefined;
}

if (!global.__chatCalls) global.__chatCalls = new Map();
const calls = global.__chatCalls;

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

  // Verify membership
  const channel = await db.collection('channels').findOne({ _id: new ObjectId(channelId), members: meId });
  if (!channel) return res.status(403).json({ error: 'Access denied' });

  const me = await db.collection('users').findOne({ _id: meId });
  if (!me) return res.status(404).json({ error: 'User not found' });

  const otherMemberId = channel.members.find((id: ObjectId) => !id.equals(meId));

  // GET — poll for call state + live typing
  if (req.method === 'GET') {
    let session = calls.get(channelId);
    // Clean up stale ended calls (> 10s) and stale ringing (> 30s)
    if (session) {
      const age = Date.now() - session.startedAt;
      if (session.status === 'ended' && age > 10000) { calls.delete(channelId); session = undefined; }
      else if (session.status === 'ringing' && age > 30000) { calls.delete(channelId); session = undefined; }
    }
    return res.status(200).json({ session: session || null });
  }

  // POST — actions: initiate | accept | reject | end | typing
  if (req.method === 'POST') {
    const { action, text } = req.body || {};

    if (action === 'initiate') {
      const existing = calls.get(channelId);
      // If a live session already exists, return it as-is so the caller's overlay
      // can detect it (handles the "both parties press call" race)
      if (existing && existing.status !== 'ended') {
        return res.status(200).json({ ok: true, existing: true });

      }
      calls.set(channelId, {
        callerId: meId.toString(),
        callerUsername: me.username,
        calleeId: otherMemberId?.toString() || '',
        status: 'ringing',
        startedAt: Date.now(),
        typing: {},
      });
      return res.status(200).json({ ok: true });
    }

    if (action === 'accept') {
      const session = calls.get(channelId);
      if (!session || session.status !== 'ringing') return res.status(404).json({ error: 'No ringing call' });
      if (session.calleeId !== meId.toString()) return res.status(403).json({ error: 'Not the callee' });
      session.status = 'active';
      session.startedAt = Date.now(); // reset timer from when call became active
      return res.status(200).json({ ok: true });
    }

    if (action === 'reject' || action === 'end') {
      const session = calls.get(channelId);
      if (!session) return res.status(404).json({ error: 'No active call' });
      session.status = 'ended';
      return res.status(200).json({ ok: true });
    }

    if (action === 'typing') {
      const session = calls.get(channelId);
      if (!session || session.status !== 'active') return res.status(400).json({ error: 'No active call' });
      session.typing[meId.toString()] = { text: text ?? '', updatedAt: Date.now() };
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
