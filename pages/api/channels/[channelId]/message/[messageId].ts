import { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';
import { verifyToken } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const cookies = parse(req.headers.cookie || '');
  const token = cookies.palerock_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const payload = await verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid token' });

  const { db } = await connectToDatabase();
  const meId = new ObjectId(payload.userId);
  const { channelId, messageId } = req.query;

  if (!channelId || !messageId) return res.status(400).json({ error: 'Missing params' });

  // Verify channel membership
  const channel = await db.collection('channels').findOne({
    _id: new ObjectId(channelId as string),
    members: meId,
  });
  if (!channel) return res.status(403).json({ error: 'Access denied' });

  const message = await db.collection('messages').findOne({ _id: new ObjectId(messageId as string) });
  if (!message) return res.status(404).json({ error: 'Message not found' });

  // DELETE
  if (req.method === 'DELETE') {
    if (!message.senderId.equals(meId)) return res.status(403).json({ error: 'Not your message' });
    await db.collection('messages').deleteOne({ _id: new ObjectId(messageId as string) });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
