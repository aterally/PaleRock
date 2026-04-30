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
  const { code } = req.query;

  const invite = await db.collection('invites').findOne({ code });
  if (!invite) return res.status(404).json({ error: 'Invite not found or expired' });

  if (invite.expiresAt && new Date() > new Date(invite.expiresAt)) {
    return res.status(410).json({ error: 'Invite has expired' });
  }
  if (invite.maxUses > 0 && invite.uses >= invite.maxUses) {
    return res.status(410).json({ error: 'Invite has reached max uses' });
  }

  const server = await db.collection('servers').findOne({ _id: invite.serverId });
  if (!server) return res.status(404).json({ error: 'Server not found' });

  // Check if banned
  const isBanned = (server.bannedUsers || []).some((id: ObjectId) => id.equals(meId));
  if (isBanned) {
    return res.status(403).json({ error: 'You are banned from this server' });
  }

  // Check if already a member
  const alreadyMember = server.members.some((m: { userId: ObjectId }) => m.userId.equals(meId));
  if (alreadyMember) {
    // Return server info anyway so client can redirect
    const firstChannel = await db.collection('serverChannels').findOne({ serverId: server._id }, { sort: { position: 1 } });
    return res.status(200).json({
      alreadyMember: true,
      serverId: server._id.toString(),
      channelId: firstChannel?._id.toString(),
    });
  }

  // Get the @everyone role
  const everyoneRole = (server.roles as { id: string; isDefault: boolean }[]).find(r => r.isDefault);

  // Add member
  await db.collection('servers').updateOne(
    { _id: server._id },
    {
      $push: {
        members: {
          userId: meId,
          username: payload.username,
          roles: everyoneRole ? [everyoneRole.id] : [],
          joinedAt: new Date(),
          nickname: null,
        }
      } as Parameters<typeof db.collection>['0'] extends string ? never : never
    }
  );

  // Increment invite uses
  await db.collection('invites').updateOne({ code }, { $inc: { uses: 1 } });

  const firstChannel = await db.collection('serverChannels').findOne({ serverId: server._id }, { sort: { position: 1 } });

  return res.status(200).json({
    success: true,
    serverId: server._id.toString(),
    serverName: server.name,
    channelId: firstChannel?._id.toString(),
  });
}
