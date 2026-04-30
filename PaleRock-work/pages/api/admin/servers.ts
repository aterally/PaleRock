// @ts-nocheck
import { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/adminAuth';
import connectToDatabase from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await requireAdmin(req, res))) return;

  const { db } = await connectToDatabase();
  const { serverId, action } = req.query;

  // GET — list all servers
  if (req.method === 'GET' && !serverId) {
    const servers = await db.collection('servers').find({}).sort({ createdAt: -1 }).toArray();
    return res.status(200).json({
      servers: servers.map(s => ({
        id: s._id.toString(),
        name: s.name,
        ownerId: s.ownerId?.toString(),
        memberCount: s.members?.length || 0,
        createdAt: s.createdAt,
      }))
    });
  }

  if (!serverId) return res.status(400).json({ error: 'serverId required' });
  const sid = new ObjectId(serverId as string);

  // GET messages for a server
  if (req.method === 'GET' && action === 'messages') {
    const { channelId } = req.query;
    const query = channelId ? { channelId: new ObjectId(channelId as string) } : { serverId: sid };
    const messages = await db.collection('serverMessages').find(query)
      .sort({ createdAt: -1 }).limit(200).toArray();
    return res.status(200).json({
      messages: messages.map(m => ({
        id: m._id.toString(),
        content: m.content,
        authorId: m.authorId?.toString(),
        authorUsername: m.authorUsername,
        channelId: m.channelId?.toString(),
        createdAt: m.createdAt,
      }))
    });
  }

  // POST — server actions
  if (req.method === 'POST') {
    if (action === 'delete') {
      await db.collection('serverMessages').deleteMany({ serverId: sid });
      await db.collection('serverChannels').deleteMany({ serverId: sid });
      await db.collection('servers').deleteOne({ _id: sid });
      return res.status(200).json({ success: true });
    }
    if (action === 'delete-messages') {
      await db.collection('serverMessages').deleteMany({ serverId: sid });
      return res.status(200).json({ success: true });
    }
    return res.status(400).json({ error: 'Unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
