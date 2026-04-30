import { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcryptjs';
import connectToDatabase from '@/lib/mongodb';
import { signToken } from '@/lib/auth';
import { serialize } from 'cookie';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { login, password } = req.body;

  if (!login || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }

  try {
    const { db } = await connectToDatabase();

    const user = await db.collection('users').findOne({
      $or: [
        { username: { $regex: new RegExp(`^${login}$`, 'i') } },
        { email: login.toLowerCase() }
      ]
    });

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.siteBanned) {
      return res.status(403).json({ error: 'Your account has been banned from PaleRock.' });
    }

    const token = await signToken({ userId: user._id.toString(), username: user.username });

    res.setHeader('Set-Cookie', serialize('palerock_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    }));

    return res.status(200).json({
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        bio: user.bio || '',
        registeredAt: user.registeredAt,
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[login]', message);
    return res.status(500).json({ error: message });
  }
}
