import { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import { isAdminCredentials } from '@/lib/adminAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Credentials required' });

    if (!isAdminCredentials(username, password)) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    res.setHeader('Set-Cookie', serialize('palerock_admin', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60, // 8 hours
      path: '/',
    }));
    return res.status(200).json({ success: true });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', serialize('palerock_admin', '', {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', maxAge: 0, path: '/',
    }));
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
