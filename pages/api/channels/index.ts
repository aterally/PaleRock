import { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'cookie';
import { verifyToken } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cookies = parse(req.headers.cookie || '');
  const token = cookies.palerock_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const payload = await verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid token' });

  const { db } = await connectToDatabase();
  const meId = new ObjectId(payload.userId);

  const channels = await db.collection('channels').aggregate([
    { $match: { type: 'dm', members: meId } },
    {
      $lookup: {
        from: 'users',
        let: { members: '$members' },
        pipeline: [
          { $match: { $expr: { $in: ['$_id', '$$members'] } } },
          { $project: { password: 0 } }
        ],
        as: 'memberDetails'
      }
    },
    { $sort: { updatedAt: -1 } }
  ]).toArray();

  const result = channels.map(ch => {
    const other = ch.memberDetails.find((m: { _id: ObjectId }) => !m._id.equals(meId));
    return {
      id: ch._id.toString(),
      type: ch.type,
      updatedAt: ch.updatedAt,
      lastMessage: ch.lastMessage,
      otherUser: other ? {
        id: other._id.toString(),
        username: other.username,
        bio: other.bio || '',
      } : null,
    };
  });

  return res.status(200).json({ channels: result });
}
