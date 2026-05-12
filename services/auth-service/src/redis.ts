import Redis from 'ioredis';
import { config } from './config';

export const redis = new Redis(config.redisUrl);

export const sessionKey = (sessionId: string) => `session:${sessionId}`;
export const refreshTokenKey = (token: string) => `refresh:${token}`;

export async function storeSession(sessionId: string, payload: object, ttlSeconds: number) {
  await redis.set(sessionKey(sessionId), JSON.stringify(payload), 'EX', ttlSeconds);
}

export async function getSession(sessionId: string) {
  const payload = await redis.get(sessionKey(sessionId));
  return payload ? JSON.parse(payload) : null;
}

export async function removeSession(sessionId: string) {
  await redis.del(sessionKey(sessionId));
}

export async function storeRefreshToken(token: string, payload: object, ttlSeconds: number) {
  await redis.set(refreshTokenKey(token), JSON.stringify(payload), 'EX', ttlSeconds);
}

export async function getRefreshToken(token: string) {
  const payload = await redis.get(refreshTokenKey(token));
  return payload ? JSON.parse(payload) : null;
}

export async function removeRefreshToken(token: string) {
  await redis.del(refreshTokenKey(token));
}
