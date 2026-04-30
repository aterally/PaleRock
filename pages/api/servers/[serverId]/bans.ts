// @ts-nocheck
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

  const isMember = server.members.some((m: any) => m.userId.equals(meId));
  if (!isMember) return res.status(403).json({ error: 'Not a member' });

  function hasPermission(perm: string) {
    if (server.ownerId.equals(meId)) return true;
    const myMember = server.members.find((m: any) => m.userId.equals(meId));
    if (!myMember) return false;
    return server.roles.some((role: any) => {
      const applies = role.isDefault || (myMember.roles || []).includes(role.id);
      return applies && (role?.permissions?.[perm] || role?.permissions?.administrator);
    });
  }

  if (!hasPermission('banMembers')) return res.status(403).json({ error: 'Missing permissions' });

  // GET - list banned users
  if (req.method === 'GET') {
    const bannedIds = (server.bannedUsers || []).map((id: ObjectId) => id);
    const bannedUsers = bannedIds.length > 0
      ? await db.collection('users').find({ _id: { $in: bannedIds } }, { projection: { password: 0 } }).toArray()
      : [];
    return res.status(200).json({
      bans: bannedUsers.map((u: any) => ({ id: u._id.toString(), username: u.username }))
    });
  }

  // DELETE - unban user
  if (req.method === 'DELETE') {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const targetId = new ObjectId(userId as string);
    await db.collection('servers').updateOne({ _id: serverId }, { $pull: { bannedUsers: targetId } as any });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
