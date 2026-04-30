import { SignJWT, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';
import connectToDatabase from './mongodb';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'palerock-default-secret-change-in-production'
);

export interface JWTPayload {
  userId: string;
  username: string;
}

export async function signToken(payload: JWTPayload): Promise<string> {
  return await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export async function getAuthUser(req: NextRequest): Promise<JWTPayload | null> {
  const token = req.cookies.get('palerock_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function getUserById(userId: string) {
  const { db } = await connectToDatabase();
  const { ObjectId } = await import('mongodb');
  try {
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0 } }
    );
    return user;
  } catch {
    return null;
  }
}
