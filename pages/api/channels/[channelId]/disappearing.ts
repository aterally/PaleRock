import { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';
import { verifyToken } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

// GET  — fetch current disappearing setting for a DM channel
// POST — set/clear disappearing messages timer (both members can do this)
// DELETE messages that have expired (called opportunistically on GET)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const cookies = parse(req.headers.cookie || '');
  const token = cookies.palerock_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const payload = await verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid token' });

  const { db } = await connectToDatabase();
  const meId = new ObjectId(payload.userId);
  const { channelId } = req.query;

  if (!channelId || typeof channelId !== 'string')
    return res.status(400).json({ error: 'Channel ID required' });

  const channel = await db.collection('channels').findOne({
    _id: new ObjectId(channelId),
    members: meId,
    type: 'dm',
  });
  if (!channel) return res.status(403).json({ error: 'Access denied' });

  // ── GET: return current setting + purge expired messages ─────────────────
  if (req.method === 'GET') {
    // Purge any messages whose disappearAt has passed
    await db.collection('messages').deleteMany({
      channelId: new ObjectId(channelId),
      disappearAt: { $lte: new Date() },
    });

    return res.status(200).json({
      disappearAfterMs: channel.disappearAfterMs ?? null,
      setBy: channel.disappearSetBy ?? null,
      setAt: channel.disappearSetAt ?? null,
    });
  }

  // ── POST: update the timer ────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { disappearAfterMs } = req.body;

    // Allowed values (null = off, or a positive number of ms)
    if (disappearAfterMs !== null && (typeof disappearAfterMs !== 'number' || disappearAfterMs <= 0))
      return res.status(400).json({ error: 'Invalid timer value' });

    await db.collection('channels').updateOne(
      { _id: new ObjectId(channelId) },
      {
        $set: {
          disappearAfterMs: disappearAfterMs ?? null,
          disappearSetBy: meId,
          disappearSetAt: new Date(),
        },
      }
    );

    // If enabling, stamp existing messages with a disappearAt time
    if (disappearAfterMs) {
      const disappearAt = new Date(Date.now() + disappearAfterMs);
      await db.collection('messages').updateMany(
        { channelId: new ObjectId(channelId), disappearAt: { $exists: false } },
        { $set: { disappearAt } }
      );
    } else {
      // Turning off — remove disappearAt from all messages that haven't expired
      await db.collection('messages').updateMany(
        { channelId: new ObjectId(channelId) },
        { $unset: { disappearAt: '' } }
      );
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
