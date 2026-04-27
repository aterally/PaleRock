// @ts-nocheck
import { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';
import { verifyToken } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

function hasManageRoles(server: { ownerId: ObjectId; members: { userId: ObjectId; roles: string[] }[]; roles: { id: string; permissions: { manageRoles?: boolean; administrator?: boolean } }[] }, meId: ObjectId) {
  if (server.ownerId.equals(meId)) return true;
  const myMember = server.members.find(m => m.userId.equals(meId));
  if (!myMember) return false;
  return myMember.roles.some(roleId => {
    const role = server.roles.find(r => r.id === roleId);
    return role?.permissions?.manageRoles || role?.permissions?.administrator;
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

  // POST - create role
  if (req.method === 'POST') {
    if (!hasManageRoles(server, meId)) return res.status(403).json({ error: 'Missing permissions' });

    const { name, color = '#ffffff', permissions = {} } = req.body;
    if (!name || name.trim().length < 1) return res.status(400).json({ error: 'Role name required' });

    const defaultPerms = {
      viewChannels: true,
      sendMessages: true,
      readMessageHistory: true,
      manageMessages: false,
      manageChannels: false,
      manageRoles: false,
      manageServer: false,
      kickMembers: false,
      banMembers: false,
      muteMembers: false,
      createInvites: true,
      administrator: false,
    };

    const newRole = {
      id: new ObjectId().toString(),
      name: name.trim().slice(0, 30),
      color,
      permissions: { ...defaultPerms, ...permissions },
      position: server.roles.length,
      isDefault: false,
    };

    await db.collection('servers').updateOne({ _id: serverId }, { $push: { roles: newRole } as Parameters<typeof db.collection>['0'] extends string ? never : never });
    return res.status(201).json({ role: newRole });
  }

  // PATCH - update role
  if (req.method === 'PATCH') {
    if (!hasManageRoles(server, meId)) return res.status(403).json({ error: 'Missing permissions' });

    const { roleId, name, color, permissions } = req.body;
    if (!roleId) return res.status(400).json({ error: 'roleId required' });

    const roleIndex = server.roles.findIndex((r: { id: string }) => r.id === roleId);
    if (roleIndex === -1) return res.status(404).json({ error: 'Role not found' });

    const role = server.roles[roleIndex] as { id: string; name: string; color: string; permissions: Record<string, boolean>; isDefault: boolean };
    if (role.isDefault && name) return res.status(400).json({ error: 'Cannot rename @everyone' });

    const updates: Record<string, unknown> = {};
    if (name && !role.isDefault) updates[`roles.${roleIndex}.name`] = name.trim().slice(0, 30);
    if (color) updates[`roles.${roleIndex}.color`] = color;
    if (permissions) {
      for (const [key, value] of Object.entries(permissions)) {
        updates[`roles.${roleIndex}.permissions.${key}`] = value;
      }
    }

    await db.collection('servers').updateOne({ _id: serverId }, { $set: updates });
    return res.status(200).json({ success: true });
  }

  // DELETE - delete role
  if (req.method === 'DELETE') {
    if (!hasManageRoles(server, meId)) return res.status(403).json({ error: 'Missing permissions' });

    const { roleId } = req.query;
    const role = server.roles.find((r: { id: string; isDefault: boolean }) => r.id === roleId);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if ((role as { isDefault: boolean }).isDefault) return res.status(400).json({ error: 'Cannot delete @everyone' });

    await db.collection('servers').updateOne({ _id: serverId }, {
      $pull: { roles: { id: roleId } } as Parameters<typeof db.collection>['0'] extends string ? never : never
    });

    // Remove role from all members
    await db.collection('servers').updateOne({ _id: serverId }, {
      $pull: { 'members.$[].roles': roleId } as Parameters<typeof db.collection>['0'] extends string ? never : never
    });

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
