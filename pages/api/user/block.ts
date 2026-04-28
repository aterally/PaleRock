import { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';
import { verifyToken } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const cookies = parse(req.headers.cookie || '');
  const token = cookies.palerock_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const payload = await verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid token' });

  const { db } = await connectToDatabase();
  const meId = new ObjectId(payload.userId);

  // GET: list blocked users
  if (req.method === 'GET') {
    const me = await db.collection('users').findOne({ _id: meId }, { projection: { blockedUsers: 1 } });
    const blockedIds: ObjectId[] = (me?.blockedUsers || []).map((id: string) => new ObjectId(id));
    const blockedUsers = blockedIds.length > 0
      ? await db.collection('users').find({ _id: { $in: blockedIds } }, { projection: { password: 0 } }).toArray()
      : [];
    return res.status(200).json({
      blocked: blockedUsers.map(u => ({ id: u._id.toString(), username: u.username, avatar: u.avatar || null }))
    });
  }

  // POST: block a user
  if (req.method === 'POST') {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const targetId = new ObjectId(userId);
    if (targetId.equals(meId)) return res.status(400).json({ error: 'Cannot block yourself' });

    await db.collection('users').updateOne(
      { _id: meId },
      { $addToSet: { blockedUsers: userId } }
    );

    // Also remove any pending friend requests between the two
    await db.collection('friendRequests').deleteMany({
      $or: [
        { fromUserId: meId, toUserId: targetId },
        { fromUserId: targetId, toUserId: meId },
      ],
      status: 'pending',
    });

    return res.status(200).json({ success: true });
  }

  // DELETE: unblock a user
  if (req.method === 'DELETE') {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    await db.collection('users').updateOne(
      { _id: meId },
      { $pull: { blockedUsers: userId } as any }
    );

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
