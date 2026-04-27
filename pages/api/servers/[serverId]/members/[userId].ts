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
  const targetUserId = new ObjectId(req.query.userId as string);

  const server = await db.collection('servers').findOne({ _id: serverId });
  if (!server) return res.status(404).json({ error: 'Server not found' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = server as any;
  const srv = server as unknown as { ownerId: ObjectId; members: { userId: ObjectId; roles: string[] }[]; roles: { id: string; permissions: Record<string, boolean>; isDefault: boolean; position: number }[]; categories: { id: string; name: string; position: number }[]; name: string; _id: ObjectId };

  const isMember = server.members.some((m: { userId: ObjectId }) => m.userId.equals(meId));
  if (!isMember) return res.status(403).json({ error: 'Not a member' });

  function hasPermission(perm: string) {
    if (server.ownerId.equals(meId)) return true;
    const myMember = server.members.find((m: { userId: ObjectId }) => m.userId.equals(meId));
    if (!myMember) return false;
    return (myMember as { roles: string[] }).roles.some((roleId: string) => {
      const role = (server.roles as { id: string; permissions: Record<string, boolean> }[]).find(r => r.id === roleId);
      return role?.permissions?.[perm] || role?.permissions?.administrator;
    });
  }

  // PATCH - assign/remove roles
  if (req.method === 'PATCH') {
    if (!hasPermission('manageRoles')) return res.status(403).json({ error: 'Missing permissions' });

    const { addRoles = [], removeRoles = [] } = req.body;
    const memberIndex = server.members.findIndex((m: { userId: ObjectId }) => m.userId.equals(targetUserId));
    if (memberIndex === -1) return res.status(404).json({ error: 'Member not found' });

    let currentRoles = (server.members[memberIndex] as { roles: string[] }).roles as string[];

    for (const roleId of removeRoles) {
      const role = (server.roles as { id: string; isDefault: boolean }[]).find(r => r.id === roleId);
      if (!role?.isDefault) currentRoles = currentRoles.filter((r: string) => r !== roleId);
    }
    for (const roleId of addRoles) {
      if (!currentRoles.includes(roleId)) currentRoles.push(roleId);
    }

    await db.collection('servers').updateOne(
      { _id: serverId },
      { $set: { [`members.${memberIndex}.roles`]: currentRoles } }
    );
    return res.status(200).json({ success: true });
  }

  // DELETE - kick member
  if (req.method === 'DELETE') {
    if (!hasPermission('kickMembers')) return res.status(403).json({ error: 'Missing permissions' });
    if (targetUserId.equals(meId)) return res.status(400).json({ error: 'Cannot kick yourself' });
    if (targetUserId.equals(server.ownerId)) return res.status(400).json({ error: 'Cannot kick the owner' });

    await db.collection('servers').updateOne(
      { _id: serverId },
      { $pull: { members: { userId: targetUserId } } as Parameters<typeof db.collection>['0'] extends string ? never : never }
    );
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
