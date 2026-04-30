// @ts-nocheck
import { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/adminAuth';
import connectToDatabase from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await requireAdmin(req, res))) return;

  const { db } = await connectToDatabase();
  const { userId, action } = req.query;

  // GET /api/admin/users — list all users
  if (req.method === 'GET' && !userId) {
    const users = await db.collection('users').find({}, { projection: { password: 0 } })
      .sort({ registeredAt: -1 }).toArray();
    return res.status(200).json({
      users: users.map(u => ({
        id: u._id.toString(),
        username: u.username,
        email: u.email,
        registeredAt: u.registeredAt,
        lastOnline: u.lastOnline,
        banned: u.siteBanned || false,
        isAdmin: u.isAdmin || false,
      }))
    });
  }

  if (!userId) return res.status(400).json({ error: 'userId required' });
  const targetId = new ObjectId(userId as string);

  // POST /api/admin/users?userId=X&action=ban|unban|delete
  if (req.method === 'POST') {
    // Protect the built-in admin account
    const targetUser = await db.collection('users').findOne({ _id: targetId });
    if (targetUser?.isAdmin) {
      return res.status(403).json({ error: 'Cannot modify the built-in admin account' });
    }

    if (action === 'ban') {
      await db.collection('users').updateOne({ _id: targetId }, { $set: { siteBanned: true } });
      return res.status(200).json({ success: true });
    }
    if (action === 'unban') {
      await db.collection('users').updateOne({ _id: targetId }, { $set: { siteBanned: false } });
      return res.status(200).json({ success: true });
    }
    if (action === 'delete') {
      // Remove from all servers, delete their messages, delete user
      await db.collection('servers').updateMany(
        { 'members.userId': targetId },
        { $pull: { members: { userId: targetId } } }
      );
      await db.collection('serverMessages').deleteMany({ authorId: targetId });
      await db.collection('messages').deleteMany({ authorId: targetId });
      await db.collection('users').deleteOne({ _id: targetId });
      return res.status(200).json({ success: true });
    }
    return res.status(400).json({ error: 'Unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
