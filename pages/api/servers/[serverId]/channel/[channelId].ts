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
  const channelId = new ObjectId(req.query.channelId as string);

  const server = await db.collection('servers').findOne({ _id: serverId });
  if (!server) return res.status(404).json({ error: 'Server not found' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = server as any;
  const srv = server as unknown as { ownerId: ObjectId; members: { userId: ObjectId; roles: string[] }[]; roles: { id: string; permissions: Record<string, boolean>; isDefault: boolean; position: number }[]; categories: { id: string; name: string; position: number }[]; name: string; _id: ObjectId };

  const isMember = server.members.some((m: { userId: ObjectId }) => m.userId.equals(meId));
  if (!isMember) return res.status(403).json({ error: 'Not a member' });

  function hasManageChannels() {
    if (server.ownerId.equals(meId)) return true;
    const myMember = server.members.find((m: { userId: ObjectId }) => m.userId.equals(meId));
    if (!myMember) return false;
    const myRoleIds: string[] = (myMember as { roles: string[] }).roles;
    return (server.roles as { id: string; isDefault?: boolean; permissions: { manageChannels?: boolean; administrator?: boolean } }[]).some(role => {
      const applies = role.isDefault || myRoleIds.includes(role.id);
      return applies && (role.permissions?.manageChannels || role.permissions?.administrator);
    });
  }

  if (req.method === 'PATCH') {
    if (!hasManageChannels()) return res.status(403).json({ error: 'Missing permissions' });
    const updates: Record<string, unknown> = {};
    if (req.body.name) updates.name = req.body.name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 50);
    if (req.body.topic !== undefined) updates.topic = req.body.topic.slice(0, 200);
    if (req.body.categoryId !== undefined) updates.categoryId = req.body.categoryId;
    if (req.body.position !== undefined) updates.position = req.body.position;
    if (req.body.isPrivate !== undefined) updates.isPrivate = !!req.body.isPrivate;
    if (req.body.allowedRoles !== undefined) updates.allowedRoles = Array.isArray(req.body.allowedRoles) ? req.body.allowedRoles : [];
    await db.collection('serverChannels').updateOne({ _id: channelId, serverId }, { $set: updates });
    return res.status(200).json({ success: true });
  }

  if (req.method === 'DELETE') {
    if (!hasManageChannels()) return res.status(403).json({ error: 'Missing permissions' });
    // Don't allow deleting last channel
    const count = await db.collection('serverChannels').countDocuments({ serverId });
    if (count <= 1) return res.status(400).json({ error: 'Cannot delete the last channel' });
    await db.collection('serverChannels').deleteOne({ _id: channelId, serverId });
    await db.collection('serverMessages').deleteMany({ channelId });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
