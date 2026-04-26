import { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';
import { verifyToken } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const cookies = parse(req.headers.cookie || '');
  const token = cookies.palerock_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const payload = await verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid token' });

  const { db } = await connectToDatabase();
  const userId = new ObjectId(payload.userId);

  if (req.method === 'GET') {
    const user = await db.collection('users').findOne(
      { _id: userId },
      { projection: { password: 0 } }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.status(200).json({ user: { ...user, id: user._id.toString() } });
  }

  if (req.method === 'PATCH') {
    const { username, bio, currentPassword, newPassword } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (username !== undefined) {
      if (username.length < 3 || username.length > 20) {
        return res.status(400).json({ error: 'Username must be 3–20 characters' });
      }
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ error: 'Username: letters, numbers, underscores only' });
      }
      const conflict = await db.collection('users').findOne({
        username: { $regex: new RegExp(`^${username}$`, 'i') },
        _id: { $ne: userId }
      });
      if (conflict) return res.status(409).json({ error: 'Username already taken' });
      updates.username = username;
    }

    if (bio !== undefined) {
      if (bio.length > 160) return res.status(400).json({ error: 'Bio max 160 characters' });
      updates.bio = bio;
    }

    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: 'Current password required' });
      if (newPassword.length < 6) return res.status(400).json({ error: 'New password min 6 characters' });

      const user = await db.collection('users').findOne({ _id: userId });
      if (!user) return res.status(404).json({ error: 'User not found' });

      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) return res.status(401).json({ error: 'Current password incorrect' });

      updates.password = await bcrypt.hash(newPassword, 12);
    }

    await db.collection('users').updateOne({ _id: userId }, { $set: updates });
    const updated = await db.collection('users').findOne({ _id: userId }, { projection: { password: 0 } });

    return res.status(200).json({ user: { ...updated, id: updated!._id.toString() } });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
