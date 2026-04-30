import { NextApiRequest, NextApiResponse } from 'next';
import connectToDatabase from '@/lib/mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { db } = await connectToDatabase();
  const { code } = req.query;

  const invite = await db.collection('invites').findOne({ code });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });

  if (invite.expiresAt && new Date() > new Date(invite.expiresAt)) {
    return res.status(410).json({ error: 'Invite has expired' });
  }
  if (invite.maxUses > 0 && invite.uses >= invite.maxUses) {
    return res.status(410).json({ error: 'Invite has reached max uses' });
  }

  const server = await db.collection('servers').findOne({ _id: invite.serverId });
  if (!server) return res.status(404).json({ error: 'Server not found' });

  return res.status(200).json({
    invite: {
      code: invite.code,
      serverName: server.name,
      memberCount: server.members?.length || 0,
      expiresAt: invite.expiresAt || null,
    }
  });
}
