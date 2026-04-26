import { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';
import { verifyToken } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cookies = parse(req.headers.cookie || '');
  const token = cookies.palerock_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const payload = await verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid token' });

  const { db } = await connectToDatabase();
  const meId = new ObjectId(payload.userId);
  const { requestId, action } = req.body;

  if (!requestId || !['accept', 'decline', 'cancel'].includes(action)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const request = await db.collection('friendRequests').findOne({
    _id: new ObjectId(requestId),
    status: 'pending'
  });

  if (!request) return res.status(404).json({ error: 'Request not found' });

  const fromId = request.fromUserId as ObjectId;
  const toId = request.toUserId as ObjectId;

  if (action === 'cancel') {
    if (!fromId.equals(meId)) return res.status(403).json({ error: 'Forbidden' });
    await db.collection('friendRequests').deleteOne({ _id: new ObjectId(requestId) });
    return res.status(200).json({ success: true });
  }

  if (action === 'decline') {
    if (!toId.equals(meId)) return res.status(403).json({ error: 'Forbidden' });
    await db.collection('friendRequests').deleteOne({ _id: new ObjectId(requestId) });
    return res.status(200).json({ success: true });
  }

  if (action === 'accept') {
    if (!toId.equals(meId)) return res.status(403).json({ error: 'Forbidden' });

    // Create DM channel
    const channelResult = await db.collection('channels').insertOne({
      type: 'dm',
      members: [fromId, toId],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessage: null,
      // Expandable: reactions, pinned messages, etc.
    });

    await db.collection('friendRequests').deleteOne({ _id: new ObjectId(requestId) });

    return res.status(200).json({ success: true, channelId: channelResult.insertedId.toString() });
  }
}
