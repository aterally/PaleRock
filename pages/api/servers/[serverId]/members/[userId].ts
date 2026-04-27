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

  const isMember = server.members.some((m: any) => m.userId.equals(meId));
  if (!isMember) return res.status(403).json({ error: 'Not a member' });

  function hasPermission(perm: string) {
    if (server.ownerId.equals(meId)) return true;
    const myMember = server.members.find((m: any) => m.userId.equals(meId));
    if (!myMember) return false;
    return myMember.roles.some((roleId: string) => {
      const role = server.roles.find((r: any) => r.id === roleId);
      return role?.permissions?.[perm] || role?.permissions?.administrator;
    });
  }

  if (req.method === 'PATCH') {
    const { addRoles, removeRoles, mute, muteDuration } = req.body;

    if (addRoles !== undefined || removeRoles !== undefined) {
      if (!hasPermission('manageRoles')) return res.status(403).json({ error: 'Missing permissions' });
      const memberIndex = server.members.findIndex((m: any) => m.userId.equals(targetUserId));
      if (memberIndex === -1) return res.status(404).json({ error: 'Member not found' });
      let currentRoles = server.members[memberIndex].roles as string[];
      for (const roleId of (removeRoles || [])) {
        const role = server.roles.find((r: any) => r.id === roleId);
        if (!role?.isDefault) currentRoles = currentRoles.filter((r: string) => r !== roleId);
      }
      for (const roleId of (addRoles || [])) {
        if (!currentRoles.includes(roleId)) currentRoles.push(roleId);
      }
      await db.collection('servers').updateOne({ _id: serverId }, { $set: { [`members.${memberIndex}.roles`]: currentRoles } });
      return res.status(200).json({ success: true });
    }

    if (mute !== undefined) {
      if (!hasPermission('muteMembers')) return res.status(403).json({ error: 'Missing permissions' });
      if (targetUserId.equals(meId)) return res.status(400).json({ error: 'Cannot mute yourself' });
      if (targetUserId.equals(server.ownerId)) return res.status(400).json({ error: 'Cannot mute the owner' });
      const memberIndex = server.members.findIndex((m: any) => m.userId.equals(targetUserId));
      if (memberIndex === -1) return res.status(404).json({ error: 'Member not found' });
      const mutedUntil = (mute && muteDuration > 0) ? new Date(Date.now() + muteDuration * 60 * 1000) : null;
      await db.collection('servers').updateOne({ _id: serverId }, { $set: { [`members.${memberIndex}.mutedUntil`]: mutedUntil } });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'No valid action specified' });
  }

  if (req.method === 'DELETE') {
    const { action } = req.query;
    if (action === 'ban') {
      if (!hasPermission('banMembers')) return res.status(403).json({ error: 'Missing permissions' });
      if (targetUserId.equals(meId)) return res.status(400).json({ error: 'Cannot ban yourself' });
      if (targetUserId.equals(server.ownerId)) return res.status(400).json({ error: 'Cannot ban the owner' });
      await db.collection('servers').updateOne({ _id: serverId }, { $pull: { members: { userId: targetUserId } } as any });
      await db.collection('servers').updateOne({ _id: serverId }, { $addToSet: { bannedUsers: targetUserId } as any });
      return res.status(200).json({ success: true });
    }
    if (!hasPermission('kickMembers')) return res.status(403).json({ error: 'Missing permissions' });
    if (targetUserId.equals(meId)) return res.status(400).json({ error: 'Cannot kick yourself' });
    if (targetUserId.equals(server.ownerId)) return res.status(400).json({ error: 'Cannot kick the owner' });
    await db.collection('servers').updateOne({ _id: serverId }, { $pull: { members: { userId: targetUserId } } as any });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
