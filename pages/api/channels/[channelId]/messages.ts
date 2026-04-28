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
  const { channelId } = req.query;

  if (!channelId || typeof channelId !== 'string') {
    return res.status(400).json({ error: 'Channel ID required' });
  }

  // Verify membership
  const channel = await db.collection('channels').findOne({
    _id: new ObjectId(channelId),
    members: meId,
  });
  if (!channel) return res.status(403).json({ error: 'Access denied' });

  // GET: fetch messages
  if (req.method === 'GET') {
    const before = req.query.before as string | undefined;
    const limit = 50;

    const query: Record<string, unknown> = { channelId: new ObjectId(channelId) };
    if (before) {
      query._id = { $lt: new ObjectId(before) };
    }

    const messages = await db.collection('messages')
      .find(query)
      .sort({ _id: -1 })
      .limit(limit)
      .toArray();

    messages.reverse();

    // Fetch sender info
    const senderIds = Array.from(new Set(messages.map(m => m.senderId.toString())));
    const senders = await db.collection('users').find(
      { _id: { $in: senderIds.map(id => new ObjectId(id)) } },
      { projection: { password: 0 } }
    ).toArray();

    const senderMap: Record<string, { username: string; avatar?: string | null }> = {};
    senders.forEach(s => { senderMap[s._id.toString()] = { username: s.username, avatar: s.avatar || null }; });

    const result = messages.map(m => ({
      id: m._id.toString(),
      channelId: m.channelId.toString(),
      senderId: m.senderId.toString(),
      senderUsername: senderMap[m.senderId.toString()]?.username || 'Unknown',
      senderAvatar: senderMap[m.senderId.toString()]?.avatar || null,
      content: m.content,
      createdAt: m.createdAt,
      editedAt: m.editedAt || null,
      replyTo: m.replyTo || null,
    }));

    return res.status(200).json({ messages: result, hasMore: messages.length === limit });
  }

  // POST: send message
  if (req.method === 'POST') {
    const { content, replyTo } = req.body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Content required' });
    }
    if (content.length > 4000) {
      return res.status(400).json({ error: 'Message too long (max 4000 chars)' });
    }

    const now = new Date();
    const result = await db.collection('messages').insertOne({
      channelId: new ObjectId(channelId),
      senderId: meId,
      content: content.trim(),
      createdAt: now,
      editedAt: null,
      replyTo: replyTo ? { id: replyTo.id, senderUsername: replyTo.senderUsername, content: replyTo.content.slice(0, 200) } : null,
    });

    await db.collection('channels').updateOne(
      { _id: new ObjectId(channelId) },
      {
        $set: {
          updatedAt: now,
          lastMessage: { content: content.trim().slice(0, 100), senderId: meId, createdAt: now }
        }
      }
    );

    return res.status(201).json({
      message: {
        id: result.insertedId.toString(),
        channelId,
        senderId: payload.userId,
        senderUsername: payload.username,
        senderAvatar: (await db.collection('users').findOne({ _id: meId }, { projection: { avatar: 1 } }))?.avatar || null,
        content: content.trim(),
        createdAt: now,
        editedAt: null,
        replyTo: replyTo ? { id: replyTo.id, senderUsername: replyTo.senderUsername, content: replyTo.content.slice(0, 200) } : null,
      }
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
