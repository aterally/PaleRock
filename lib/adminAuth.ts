import { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';
import { verifyToken } from './auth';
import connectToDatabase from './mongodb';
import { ObjectId } from 'mongodb';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin';

export function isAdminCredentials(username: string, password: string) {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

export async function requireAdmin(req: NextApiRequest, res: NextApiResponse): Promise<boolean> {
  const cookies = parse(req.headers.cookie || '');

  // Accept explicit admin session cookie
  if (cookies.palerock_admin === 'authenticated') return true;

  // Also accept regular JWT from an isAdmin user
  const token = cookies.palerock_token;
  if (token) {
    const payload = await verifyToken(token);
    if (payload?.userId) {
      try {
        const { db } = await connectToDatabase();
        const user = await db.collection('users').findOne({ _id: new ObjectId(payload.userId) });
        if (user?.isAdmin) return true;
      } catch (_) {}
    }
  }

  res.status(401).json({ error: 'Admin authentication required' });
  return false;
}
