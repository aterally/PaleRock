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

  // GET: list sent + received pending requests
  if (req.method === 'GET') {
    const sent = await db.collection('friendRequests').aggregate([
      { $match: { fromUserId: meId, status: 'pending' } },
      { $lookup: { from: 'users', localField: 'toUserId', foreignField: '_id', as: 'toUser' } },
      { $unwind: '$toUser' },
      { $project: { 'toUser.password': 0 } }
    ]).toArray();

    const received = await db.collection('friendRequests').aggregate([
      { $match: { toUserId: meId, status: 'pending' } },
      { $lookup: { from: 'users', localField: 'fromUserId', foreignField: '_id', as: 'fromUser' } },
      { $unwind: '$fromUser' },
      { $project: { 'fromUser.password': 0 } }
    ]).toArray();

    return res.status(200).json({
      sent: sent.map(r => ({
        id: r._id.toString(),
        toUser: { id: r.toUser._id.toString(), username: r.toUser.username, bio: r.toUser.bio || '' },
        createdAt: r.createdAt
      })),
      received: received.map(r => ({
        id: r._id.toString(),
        fromUser: { id: r.fromUser._id.toString(), username: r.fromUser.username, bio: r.fromUser.bio || '' },
        createdAt: r.createdAt
      }))
    });
  }

  // POST: send friend request
  if (req.method === 'POST') {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });

    const targetUser = await db.collection('users').findOne(
      { username: { $regex: new RegExp(`^${username}$`, 'i') } },
      { projection: { password: 0 } }
    );
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const targetId = targetUser._id as ObjectId;
    if (targetId.equals(meId)) return res.status(400).json({ error: 'Cannot add yourself' });

    // Check if already friends (channel exists)
    const existingChannel = await db.collection('channels').findOne({
      type: 'dm',
      members: { $all: [meId, targetId] }
    });
    if (existingChannel) return res.status(409).json({ error: 'Already friends' });

    // Check existing request either direction
    const existing = await db.collection('friendRequests').findOne({
      $or: [
        { fromUserId: meId, toUserId: targetId },
        { fromUserId: targetId, toUserId: meId }
      ],
      status: 'pending'
    });
    if (existing) return res.status(409).json({ error: 'Friend request already exists' });

    await db.collection('friendRequests').insertOne({
      fromUserId: meId,
      toUserId: targetId,
      status: 'pending',
      createdAt: new Date()
    });

    return res.status(201).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
