// @ts-nocheck
import { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';
import { verifyToken } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

function hasManageChannels(server: { ownerId: ObjectId; members: { userId: ObjectId; roles: string[] }[]; roles: { id: string; isDefault?: boolean; permissions: { manageChannels?: boolean; administrator?: boolean } }[] }, meId: ObjectId) {
  if (server.ownerId.equals(meId)) return true;
  const myMember = server.members.find(m => m.userId.equals(meId));
  if (!myMember) return false;
  return server.roles.some(role => {
    const applies = role.isDefault || myMember.roles.includes(role.id);
    return applies && (role.permissions?.manageChannels || role.permissions?.administrator);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const cookies = parse(req.headers.cookie || '');
  const token = cookies.palerock_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const payload = await verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid token' });

  const { db } = await connectToDatabase();
  const meId = new ObjectId(payload.userId);
  const serverId = new ObjectId(req.query.serverId as string);

  const server = await db.collection('servers').findOne({ _id: serverId });
  if (!server) return res.status(404).json({ error: 'Server not found' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = server as any;
  const srv = server as unknown as { ownerId: ObjectId; members: { userId: ObjectId; roles: string[] }[]; roles: { id: string; permissions: Record<string, boolean>; isDefault: boolean; position: number }[]; categories: { id: string; name: string; position: number }[]; name: string; _id: ObjectId };

  const isMember = server.members.some((m: { userId: ObjectId }) => m.userId.equals(meId));
  if (!isMember) return res.status(403).json({ error: 'Not a member' });

  // POST - create channel
  if (req.method === 'POST') {
    if (!hasManageChannels(server, meId)) return res.status(403).json({ error: 'Missing permissions' });

    const { name, categoryId, type = 'text', topic = '' } = req.body;
    if (!name || name.trim().length < 1) return res.status(400).json({ error: 'Channel name required' });

    const channelName = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 50);

    const count = await db.collection('serverChannels').countDocuments({ serverId, categoryId });

    const channel = {
      serverId,
      categoryId: categoryId || null,
      name: channelName,
      topic,
      type,
      position: count,
      createdAt: new Date(),
      lastMessageAt: null,
    };

    const result = await db.collection('serverChannels').insertOne(channel);
    return res.status(201).json({ channel: { id: result.insertedId.toString(), ...channel, serverId: serverId.toString() } });
  }

  // PATCH - bulk reorder channels
  if (req.method === 'PATCH') {
    if (!hasManageChannels(server, meId)) return res.status(403).json({ error: 'Missing permissions' });
    const { order } = req.body; // array of { id, position }
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });
    await Promise.all(order.map(({ id, position }: { id: string; position: number }) =>
      db.collection('serverChannels').updateOne(
        { _id: new ObjectId(id), serverId },
        { $set: { position } }
      )
    ));
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
