import { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';
import { verifyToken } from './auth';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin';

export function isAdminCredentials(username: string, password: string) {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

export async function requireAdmin(req: NextApiRequest, res: NextApiResponse): Promise<boolean> {
  const cookies = parse(req.headers.cookie || '');
  const adminSession = cookies.palerock_admin;
  if (adminSession === 'authenticated') return true;
  res.status(401).json({ error: 'Admin authentication required' });
  return false;
}
