import { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';
import { verifyToken } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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

  function hasPerm(perm: string): boolean {
    if (isOwner) return true;
    const myRoleIds: string[] = myMember.roles || [];
    return srv.roles.some((role: { id: string; isDefault: boolean; permissions: Record<string, boolean> }) => {
      const applies = role.isDefault || myRoleIds.includes(role.id);
      return applies && (role.permissions?.[perm] || role.permissions?.administrator);
    });
  }

  if (!hasPerm('viewChannels')) return res.status(403).json({ messages: [] });
  if (!hasPerm('readMessageHistory')) return res.status(403).json({ messages: [] });

  const after = req.query.after ? new ObjectId(req.query.after as string) : null;
  const query: Record<string, unknown> = { channelId, serverId };
  if (after) query._id = { $gt: after };

  const messages = await db.collection('serverMessages')
    .find(query)
    .sort({ _id: 1 })
    .limit(50)
    .toArray();

  return res.status(200).json({
    messages: messages.map(m => ({
      id: m._id.toString(),
      content: m.content,
      authorId: m.authorId.toString(),
      authorUsername: m.authorUsername,
      createdAt: m.createdAt,
    }))
  });
}
