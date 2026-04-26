import { MongoClient, Db } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

interface MongoConnection {
  client: MongoClient;
  db: Db;
}

let cached: MongoConnection | null = null;
let clientPromise: Promise<MongoClient> | null = null;

export async function connectToDatabase(): Promise<MongoConnection> {
  if (cached) return cached;

  if (!clientPromise) {
    const client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    clientPromise = client.connect();
  }

  const client = await clientPromise;
  const db = client.db('palerock');

  // Create indexes for performance and expandability
  try {
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('messages').createIndex({ channelId: 1, createdAt: -1 });
    await db.collection('friendRequests').createIndex({ fromUserId: 1, toUserId: 1 }, { unique: true });
    await db.collection('channels').createIndex({ members: 1 });
    await db.collection('sessions').createIndex({ token: 1 }, { unique: true });
    await db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  } catch (_) {
    // Indexes may already exist
  }

  cached = { client, db };
  return cached;
}

export default connectToDatabase;
