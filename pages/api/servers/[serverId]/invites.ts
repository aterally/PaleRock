import { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';
import { verifyToken } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

function generateCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
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

  const isMember = server.members.some((m: { userId: ObjectId }) => m.userId.equals(meId));
  if (!isMember) return res.status(403).json({ error: 'Not a member' });

  // POST - create invite
  if (req.method === 'POST') {
    // Check create invite permission
    const myMember = server.members.find((m: { userId: ObjectId }) => m.userId.equals(meId));
    const hasPermission = server.ownerId.equals(meId) || (myMember as { roles: string[] })?.roles.some((roleId: string) => {
      const role = (server.roles as { id: string; permissions: { createInvites?: boolean; administrator?: boolean } }[]).find(r => r.id === roleId);
      return role?.permissions?.createInvites || role?.permissions?.administrator;
    });
    if (!hasPermission) return res.status(403).json({ error: 'Missing permissions' });

    const { maxUses = 0, expiresIn = 24 } = req.body; // expiresIn in hours, 0 = never

    let code = generateCode();
    // ensure uniqueness
    let attempts = 0;
    while (attempts < 10) {
      const existing = await db.collection('invites').findOne({ code });
      if (!existing) break;
      code = generateCode();
      attempts++;
    }

    const invite: Record<string, unknown> = {
      code,
      serverId,
      serverName: server.name,
      createdBy: meId,
      createdAt: new Date(),
      uses: 0,
      maxUses: maxUses || 0, // 0 = unlimited
    };

    if (expiresIn && expiresIn > 0) {
      invite.expiresAt = new Date(Date.now() + expiresIn * 60 * 60 * 1000);
    }

    await db.collection('invites').insertOne(invite);

    return res.status(201).json({ code, url: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/invite/${code}` });
  }

  // GET - list invites for server
  if (req.method === 'GET') {
    const canManage = server.ownerId.equals(meId);
    if (!canManage) return res.status(403).json({ error: 'Missing permissions' });

    const invites = await db.collection('invites').find({ serverId }).sort({ createdAt: -1 }).toArray();
    return res.status(200).json({
      invites: invites.map(i => ({
        code: i.code,
        uses: i.uses,
        maxUses: i.maxUses,
        expiresAt: i.expiresAt,
        createdAt: i.createdAt,
      }))
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
