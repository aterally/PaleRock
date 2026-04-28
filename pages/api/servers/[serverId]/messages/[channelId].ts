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

  const myMember = server.members.find((m: { userId: ObjectId }) => m.userId.equals(meId));
  if (!myMember) return res.status(403).json({ error: 'Not a member' });

  const isOwner = server.ownerId.equals(meId);
  const srv = server; // non-null capture for use inside closures

  // Build effective permissions: check assigned roles + @everyone (isDefault role)
  function hasPerm(perm: string): boolean {
    if (isOwner) return true;
    const myRoleIds: string[] = myMember.roles || [];
    return srv.roles.some((role: { id: string; isDefault: boolean; permissions: Record<string, boolean> }) => {
      const applies = role.isDefault || myRoleIds.includes(role.id);
      return applies && (role.permissions?.[perm] || role.permissions?.administrator);
    });
  }

  const channel = await db.collection('serverChannels').findOne({ _id: channelId, serverId });
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  // viewChannels gate
  if (!hasPerm('viewChannels')) return res.status(403).json({ error: 'Missing permission: viewChannels' });

  if (req.method === 'GET') {
    // readMessageHistory gate
    if (!hasPerm('readMessageHistory')) return res.status(403).json({ error: 'Missing permission: readMessageHistory' });

    const before = req.query.before ? new ObjectId(req.query.before as string) : null;
    const query: Record<string, unknown> = { channelId, serverId };
    if (before) query._id = { $lt: before };

    const messages = await db.collection('serverMessages')
      .find(query)
      .sort({ _id: -1 })
      .limit(50)
      .toArray();

    // Fetch author avatars
    const authorIds = Array.from(new Set(messages.map((m: any) => m.authorId.toString())));
    const authors = await db.collection('users').find(
      { _id: { $in: authorIds.map((id: string) => new ObjectId(id)) } },
      { projection: { avatar: 1 } }
    ).toArray();
    const avatarMap: Record<string, string | null> = {};
    authors.forEach((a: any) => { avatarMap[a._id.toString()] = a.avatar || null; });

    return res.status(200).json({ messages: messages.reverse().map((m: any) => ({
      id: m._id.toString(),
      content: m.content,
      authorId: m.authorId.toString(),
      authorUsername: m.authorUsername,
      authorAvatar: avatarMap[m.authorId.toString()] || null,
      createdAt: m.createdAt,
      replyTo: m.replyTo || null,
    }))});
  }

  if (req.method === 'POST') {
    // sendMessages gate
    if (!hasPerm('sendMessages')) return res.status(403).json({ error: 'Missing permission: sendMessages' });

    // mute gate — check mutedUntil on the member document
    const mutedUntil = myMember.mutedUntil ? new Date(myMember.mutedUntil) : null;
    if (mutedUntil && mutedUntil > new Date()) {
      return res.status(403).json({ error: 'You are muted', mutedUntil: mutedUntil.toISOString() });
    }

    const { content, replyTo } = req.body;
    if (!content || content.trim().length === 0) return res.status(400).json({ error: 'Content required' });
    if (content.length > 2000) return res.status(400).json({ error: 'Message too long' });

    const authorUser = await db.collection('users').findOne({ _id: meId }, { projection: { avatar: 1 } });
    const message = {
      channelId,
      serverId,
      authorId: meId,
      authorUsername: payload.username,
      authorAvatar: authorUser?.avatar || null,
      content: content.trim(),
      createdAt: new Date(),
      replyTo: replyTo ? { id: replyTo.id, authorUsername: replyTo.authorUsername, content: String(replyTo.content).slice(0, 200) } : null,
    };

    const result = await db.collection('serverMessages').insertOne(message);
    await db.collection('serverChannels').updateOne({ _id: channelId }, { $set: { lastMessageAt: new Date() } });

    return res.status(201).json({ message: { id: result.insertedId.toString(), ...message, authorId: meId.toString(), channelId: channelId.toString(), serverId: serverId.toString() } });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

