import { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';
import { verifyToken } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const cookies = parse(req.headers.cookie || '');
    const token = cookies.palerock_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const payload = await verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Invalid token' });

    const { db } = await connectToDatabase();
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(payload.userId) },
      { projection: { password: 0 } }
    );

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Track lastOnline on every authenticated request
    await db.collection('users').updateOne(
      { _id: new ObjectId(payload.userId) },
      { $set: { lastOnline: new Date() } }
    );

    return res.status(200).json({
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        bio: user.bio || '',
        registeredAt: user.registeredAt,
        status: user.status || 'online',
        lastOnline: user.lastOnline ? user.lastOnline.toISOString() : null,
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
