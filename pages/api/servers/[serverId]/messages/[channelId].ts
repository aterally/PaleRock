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
  const serverId = new ObjectId(req.query.serverId as string);
  const channelId = new ObjectId(req.query.channelId as string);

  const server = await db.collection('servers').findOne({ _id: serverId });
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const isMember = server.members.some((m: { userId: ObjectId }) => m.userId.equals(meId));
  if (!isMember) return res.status(403).json({ error: 'Not a member' });

  const channel = await db.collection('serverChannels').findOne({ _id: channelId, serverId });
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  if (req.method === 'GET') {
    const before = req.query.before ? new ObjectId(req.query.before as string) : null;
    const query: Record<string, unknown> = { channelId, serverId };
    if (before) query._id = { $lt: before };

    const messages = await db.collection('serverMessages')
      .find(query)
      .sort({ _id: -1 })
      .limit(50)
      .toArray();

    return res.status(200).json({ messages: messages.reverse().map(m => ({
      id: m._id.toString(),
      content: m.content,
      authorId: m.authorId.toString(),
      authorUsername: m.authorUsername,
      createdAt: m.createdAt,
    }))});
  }

  if (req.method === 'POST') {
    const { content } = req.body;
    if (!content || content.trim().length === 0) return res.status(400).json({ error: 'Content required' });
    if (content.length > 2000) return res.status(400).json({ error: 'Message too long' });

    const message = {
      channelId,
      serverId,
      authorId: meId,
      authorUsername: payload.username,
      content: content.trim(),
      createdAt: new Date(),
    };

    const result = await db.collection('serverMessages').insertOne(message);
    await db.collection('serverChannels').updateOne({ _id: channelId }, { $set: { lastMessageAt: new Date() } });

    return res.status(201).json({ message: { id: result.insertedId.toString(), ...message, authorId: meId.toString(), channelId: channelId.toString(), serverId: serverId.toString() } });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
