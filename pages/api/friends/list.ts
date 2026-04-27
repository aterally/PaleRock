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

  // Actual friends = DM channels (a channel existing = accepted friendship)
  const dmChannels = await db.collection('channels').aggregate([
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

  const friends = dmChannels.map(ch => {
    const other = ch.memberDetails.find((m: { _id: ObjectId }) => !m._id.equals(meId));
    return {
      userId: other?._id.toString(),
      username: other?.username,
      bio: other?.bio || '',
      channelId: ch._id.toString(),
      since: ch.createdAt,
    };
  }).filter(f => f.userId);

  // Pending received
  const received = await db.collection('friendRequests').aggregate([
    { $match: { toUserId: meId, status: 'pending' } },
    { $lookup: { from: 'users', localField: 'fromUserId', foreignField: '_id', as: 'fromUser' } },
    { $unwind: '$fromUser' },
    { $project: { 'fromUser.password': 0 } },
    { $sort: { createdAt: -1 } }
  ]).toArray();

  // Pending sent
  const sent = await db.collection('friendRequests').aggregate([
    { $match: { fromUserId: meId, status: 'pending' } },
    { $lookup: { from: 'users', localField: 'toUserId', foreignField: '_id', as: 'toUser' } },
    { $unwind: '$toUser' },
    { $project: { 'toUser.password': 0 } },
    { $sort: { createdAt: -1 } }
  ]).toArray();

  return res.status(200).json({
    friends,
    received: received.map(r => ({
      id: r._id.toString(),
      fromUser: { id: r.fromUser._id.toString(), username: r.fromUser.username, bio: r.fromUser.bio || '' },
      createdAt: r.createdAt,
    })),
    sent: sent.map(r => ({
      id: r._id.toString(),
      toUser: { id: r.toUser._id.toString(), username: r.toUser.username, bio: r.toUser.bio || '' },
      createdAt: r.createdAt,
    })),
  });
}
