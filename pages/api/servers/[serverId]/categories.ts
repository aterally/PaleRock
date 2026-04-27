// @ts-nocheck
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
  const serverId = new ObjectId(req.query.serverId as string);

  const server = await db.collection('servers').findOne({ _id: serverId });
  if (!server) return res.status(404).json({ error: 'Server not found' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = server as any;
  const srv = server as unknown as { ownerId: ObjectId; members: { userId: ObjectId; roles: string[] }[]; roles: { id: string; permissions: Record<string, boolean>; isDefault: boolean; position: number }[]; categories: { id: string; name: string; position: number }[]; name: string; _id: ObjectId };

  const isMember = server.members.some((m: { userId: ObjectId }) => m.userId.equals(meId));
  if (!isMember) return res.status(403).json({ error: 'Not a member' });

  function hasManageChannels() {
    if (server.ownerId.equals(meId)) return true;
    const myMember = server.members.find((m: { userId: ObjectId }) => m.userId.equals(meId));
    if (!myMember) return false;
    return (myMember as { roles: string[] }).roles.some((roleId: string) => {
      const role = (server.roles as { id: string; permissions: { manageChannels?: boolean; administrator?: boolean } }[]).find(r => r.id === roleId);
      return role?.permissions?.manageChannels || role?.permissions?.administrator;
    });
  }

  if (req.method === 'POST') {
    if (!hasManageChannels()) return res.status(403).json({ error: 'Missing permissions' });

    const { name } = req.body;
    if (!name || name.trim().length < 1) return res.status(400).json({ error: 'Category name required' });

    const newCategory = {
      id: new ObjectId().toString(),
      name: name.trim().toUpperCase().slice(0, 50),
      position: (server.categories?.length || 0),
    };

    await db.collection('servers').updateOne({ _id: serverId }, {
      $push: { categories: newCategory } as Parameters<typeof db.collection>['0'] extends string ? never : never
    });

    return res.status(201).json({ category: newCategory });
  }

  if (req.method === 'PATCH') {
    if (!hasManageChannels()) return res.status(403).json({ error: 'Missing permissions' });

    const { categoryId, name } = req.body;
    if (!categoryId) return res.status(400).json({ error: 'categoryId required' });

    const catIndex = server.categories.findIndex((c: { id: string }) => c.id === categoryId);
    if (catIndex === -1) return res.status(404).json({ error: 'Category not found' });

    if (name) {
      await db.collection('servers').updateOne({ _id: serverId }, {
        $set: { [`categories.${catIndex}.name`]: name.trim().toUpperCase().slice(0, 50) }
      });
    }

    return res.status(200).json({ success: true });
  }

  if (req.method === 'DELETE') {
    if (!hasManageChannels()) return res.status(403).json({ error: 'Missing permissions' });

    const { categoryId } = req.query;

    // Move channels in this category to uncategorized
    await db.collection('serverChannels').updateMany(
      { serverId, categoryId },
      { $set: { categoryId: null } }
    );

    await db.collection('servers').updateOne({ _id: serverId }, {
      $pull: { categories: { id: categoryId } } as Parameters<typeof db.collection>['0'] extends string ? never : never
    });

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
