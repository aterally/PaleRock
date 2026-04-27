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

  const server = await db.collection('servers').findOne({ _id: serverId });
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const isMember = server.members.some((m: { userId: ObjectId }) => m.userId.equals(meId));
  if (!isMember) return res.status(403).json({ error: 'Not a member' });

  if (req.method === 'GET') {
    const channels = await db.collection('serverChannels')
      .find({ serverId })
      .sort({ position: 1 })
      .toArray();

    // Get full member details
    const memberIds = server.members.map((m: { userId: ObjectId }) => m.userId);
    const users = await db.collection('users')
      .find({ _id: { $in: memberIds } }, { projection: { password: 0 } })
      .toArray();

    const userMap = new Map(users.map(u => [u._id.toString(), u]));

    return res.status(200).json({
      server: {
        id: server._id.toString(),
        name: server.name,
        icon: server.icon,
        ownerId: server.ownerId.toString(),
        roles: server.roles,
        categories: server.categories,
        members: server.members.map((m: { userId: ObjectId; username: string; roles: string[]; joinedAt: Date; nickname: string | null; mutedUntil?: Date | null }) => {
          const user = userMap.get(m.userId.toString());
          return {
            userId: m.userId.toString(),
            username: user?.username || m.username,
            nickname: m.nickname,
            roles: m.roles,
            joinedAt: m.joinedAt,
            bio: user?.bio || '',
            mutedUntil: m.mutedUntil ? m.mutedUntil.toISOString() : null,
          };
        }),
        channels: channels.map(ch => ({
          id: ch._id.toString(),
          name: ch.name,
          topic: ch.topic || '',
          type: ch.type,
          categoryId: ch.categoryId,
          position: ch.position,
        })),
      }
    });
  }

  // PATCH - update server settings (owner/admin only)
  if (req.method === 'PATCH') {
    const myMember = server.members.find((m: { userId: ObjectId }) => m.userId.equals(meId));
    const myRoles = myMember?.roles || [];
    const serverRoles = server.roles as { id: string; permissions: { manageServer: boolean; administrator: boolean } }[];
    const hasPermission = server.ownerId.equals(meId) || myRoles.some((roleId: string) => {
      const role = serverRoles.find(r => r.id === roleId);
      return role?.permissions?.manageServer || role?.permissions?.administrator;
    });
    if (!hasPermission) return res.status(403).json({ error: 'Missing permissions' });

    const updates: Record<string, unknown> = {};
    if (req.body.name) updates.name = req.body.name.trim().slice(0, 50);

    await db.collection('servers').updateOne({ _id: serverId }, { $set: updates });
    return res.status(200).json({ success: true });
  }

  // DELETE - delete server (owner only)
  if (req.method === 'DELETE') {
    if (!server.ownerId.equals(meId)) return res.status(403).json({ error: 'Only the owner can delete the server' });
    await db.collection('servers').deleteOne({ _id: serverId });
    await db.collection('serverChannels').deleteMany({ serverId });
    await db.collection('serverMessages').deleteMany({ serverId });
    await db.collection('invites').deleteMany({ serverId });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
