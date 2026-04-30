// @ts-nocheck
import { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/adminAuth';
import connectToDatabase from '@/lib/mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await requireAdmin(req, res))) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { db } = await connectToDatabase();

  const [userCount, serverCount, messageCount, users, servers] = await Promise.all([
    db.collection('users').countDocuments(),
    db.collection('servers').countDocuments(),
    db.collection('serverMessages').countDocuments(),
    db.collection('users').find({}, { projection: { password: 0 } })
      .sort({ registeredAt: -1 }).limit(100).toArray(),
    db.collection('servers').find({}).sort({ createdAt: -1 }).limit(100).toArray(),
  ]);

  return res.status(200).json({
    stats: { userCount, serverCount, messageCount },
    users: users.map(u => ({
      id: u._id.toString(),
      username: u.username,
      email: u.email,
      registeredAt: u.registeredAt,
      lastOnline: u.lastOnline,
      banned: u.siteBanned || false,
      isAdmin: u.isAdmin || false,
    })),
    servers: servers.map(s => ({
      id: s._id.toString(),
      name: s.name,
      ownerId: s.ownerId?.toString(),
      memberCount: s.members?.length || 0,
      createdAt: s.createdAt,
    })),
  });
}
