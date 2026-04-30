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
  const messageId = new ObjectId(req.query.messageId as string);

  const server = await db.collection('servers').findOne({ _id: serverId });
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const myMember = server.members.find((m: any) => m.userId.equals(meId));
  if (!myMember) return res.status(403).json({ error: 'Not a member' });

  const isOwner = server.ownerId.equals(meId);
  const serverDoc = server;
  function hasPerm(perm: string): boolean {
    if (isOwner) return true;
    const myRoleIds: string[] = myMember.roles || [];
    return serverDoc.roles.some((role: any) => {
      const applies = role.isDefault || myRoleIds.includes(role.id);
      return applies && (role.permissions?.[perm] || role.permissions?.administrator);
    });
  }

  const message = await db.collection('serverMessages').findOne({ _id: messageId, serverId });
  if (!message) return res.status(404).json({ error: 'Message not found' });

  if (req.method === 'DELETE') {
    const isAuthor = message.authorId.equals(meId);
    const canManage = hasPerm('manageMessages');
    if (!isAuthor && !canManage) return res.status(403).json({ error: 'Cannot delete this message' });
    await db.collection('serverMessages').deleteOne({ _id: messageId });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
