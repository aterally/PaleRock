import { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';
import { verifyToken } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cookies = parse(req.headers.cookie || '');
  const token = cookies.palerock_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const payload = await verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid token' });

  const { db } = await connectToDatabase();
  const meId = new ObjectId(payload.userId);
  const { channelId } = req.query;
  const after = req.query.after as string;

  if (!channelId || typeof channelId !== 'string') {
    return res.status(400).json({ error: 'Channel ID required' });
  }

  const channel = await db.collection('channels').findOne({
    _id: new ObjectId(channelId),
    members: meId,
  });
  if (!channel) return res.status(403).json({ error: 'Access denied' });

  const query: Record<string, unknown> = { channelId: new ObjectId(channelId) };
  if (after) {
    query._id = { $gt: new ObjectId(after) };
  }

  const messages = await db.collection('messages')
    .find(query)
    .sort({ _id: 1 })
    .limit(50)
    .toArray();

  if (messages.length === 0) {
    return res.status(200).json({ messages: [] });
  }

  const senderIds = [...new Set(messages.map(m => m.senderId.toString()))];
  const senders = await db.collection('users').find(
    { _id: { $in: senderIds.map(id => new ObjectId(id)) } },
    { projection: { password: 0 } }
  ).toArray();

  const senderMap: Record<string, { username: string }> = {};
  senders.forEach(s => { senderMap[s._id.toString()] = { username: s.username }; });

  return res.status(200).json({
    messages: messages.map(m => ({
      id: m._id.toString(),
      channelId: m.channelId.toString(),
      senderId: m.senderId.toString(),
      senderUsername: senderMap[m.senderId.toString()]?.username || 'Unknown',
      content: m.content,
      createdAt: m.createdAt,
      editedAt: m.editedAt || null,
    }))
  });
}
