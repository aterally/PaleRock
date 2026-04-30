import { MongoClient, Db } from 'mongodb';

interface MongoConnection {
  client: MongoClient;
  db: Db;
}

let cached: MongoConnection | null = null;
let clientPromise: Promise<MongoClient> | null = null;

export async function connectToDatabase(): Promise<MongoConnection> {
  if (cached) return cached;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set. Add it in Vercel → Project Settings → Environment Variables.');
  }

  if (!clientPromise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    });
    clientPromise = client.connect();
  }

  const client = await clientPromise;
  const db = client.db('palerock');

  // Create indexes — safe to run repeatedly, errors are non-fatal
  try {
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('messages').createIndex({ channelId: 1, createdAt: -1 });
    await db.collection('friendRequests').createIndex({ fromUserId: 1, toUserId: 1 }, { unique: true });
    await db.collection('channels').createIndex({ members: 1 });
  } catch (_) {
    // Indexes already exist — fine
  }

  cached = { client, db };
  return cached;
}

export default connectToDatabase;
