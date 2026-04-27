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

  if (req.method === 'GET') {
    // Get all servers the user is a member of
    const servers = await db.collection('servers').aggregate([
      { $match: { 'members.userId': meId } },
      { $sort: { createdAt: 1 } }
    ]).toArray();

    return res.status(200).json({
      servers: servers.map(s => ({
        id: s._id.toString(),
        name: s.name,
        icon: s.icon || null,
        ownerId: s.ownerId.toString(),
        memberCount: s.members?.length || 0,
      }))
    });
  }

  if (req.method === 'POST') {
    const { name } = req.body;
    if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Server name must be at least 2 characters' });

    const serverName = name.trim().slice(0, 50);

    // Default role: @everyone
    const everyoneRole = {
      id: new ObjectId().toString(),
      name: '@everyone',
      color: '#ffffff',
      permissions: {
        viewChannels: true,
        sendMessages: true,
        readMessageHistory: true,
        manageMessages: false,
        manageChannels: false,
        manageRoles: false,
        manageServer: false,
        kickMembers: false,
        banMembers: false,
        createInvites: true,
        administrator: false,
      },
      position: 0,
      isDefault: true,
    };

    const adminRole = {
      id: new ObjectId().toString(),
      name: 'Admin',
      color: '#ff6b35',
      permissions: {
        viewChannels: true,
        sendMessages: true,
        readMessageHistory: true,
        manageMessages: true,
        manageChannels: true,
        manageRoles: true,
        manageServer: true,
        kickMembers: true,
        banMembers: true,
        createInvites: true,
        administrator: true,
      },
      position: 1,
      isDefault: false,
    };

    // Default category + channel
    const generalCategoryId = new ObjectId().toString();
    const generalChannelId = new ObjectId();

    const server = {
      name: serverName,
      ownerId: meId,
      icon: null,
      createdAt: new Date(),
      roles: [everyoneRole, adminRole],
      categories: [
        { id: generalCategoryId, name: 'GENERAL', position: 0 }
      ],
      members: [
        {
          userId: meId,
          username: payload.username,
          roles: [adminRole.id],
          joinedAt: new Date(),
          nickname: null,
        }
      ],
    };

    const result = await db.collection('servers').insertOne(server);
    const serverId = result.insertedId;

    // Create general channel
    await db.collection('serverChannels').insertOne({
      _id: generalChannelId,
      serverId,
      categoryId: generalCategoryId,
      name: 'general',
      topic: '',
      type: 'text',
      position: 0,
      createdAt: new Date(),
      lastMessageAt: null,
    });

    // Create indexes
    try {
      await db.collection('servers').createIndex({ 'members.userId': 1 });
      await db.collection('serverChannels').createIndex({ serverId: 1 });
      await db.collection('serverMessages').createIndex({ channelId: 1, createdAt: -1 });
      await db.collection('invites').createIndex({ code: 1 }, { unique: true });
      await db.collection('invites').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    } catch (_) {}

    return res.status(201).json({
      server: {
        id: serverId.toString(),
        name: serverName,
        defaultChannelId: generalChannelId.toString(),
      }
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
