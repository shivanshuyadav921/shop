import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { sign, verify } from 'jsonwebtoken';
import { pool } from './db';
import { config } from './config';
import { storeRefreshToken, removeRefreshToken } from './redis';

export interface JwtPayloadExtensions {
  sub: string;
  email: string;
  role: string;
  tenantId?: string;
}

export const hashPassword = async (password: string) => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (password: string, hash: string) => bcrypt.compare(password, hash);

export const generateJwt = (payload: JwtPayloadExtensions) => {
  return sign(payload as any, config.jwtSecret as any, {
    expiresIn: config.jwtExpiresIn,
    subject: payload.sub,
  } as any);
};

export const verifyJwt = (token: string) => {
  return verify(token, config.jwtSecret as any) as JwtPayloadExtensions;
};

export const generateRefreshToken = () => crypto.randomBytes(48).toString('hex');

const digestToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export async function persistRefreshToken(token: string, userId: string, deviceId: string | null, ip: string | null, userAgent: string | null) {
  const expiresAt = new Date(Date.now() + config.refreshTokenExpiryDays * 24 * 60 * 60 * 1000);
  const tokenDigest = digestToken(token);
  await pool.query(
    `INSERT INTO refresh_tokens(token, user_id, device_id, ip, user_agent, expires_at) VALUES ($1, $2, $3, $4, $5, $6)` ,
    [tokenDigest, userId, deviceId, ip, userAgent, expiresAt]
  );
  await storeRefreshToken(tokenDigest, { userId, deviceId, ip, userAgent, expiresAt: expiresAt.toISOString() }, config.refreshTokenExpiryDays * 24 * 60 * 60);
  return expiresAt;
}

export async function revokeRefreshToken(token: string) {
  const tokenDigest = digestToken(token);
  await pool.query(`UPDATE refresh_tokens SET revoked = TRUE WHERE token = $1`, [tokenDigest]);
  await removeRefreshToken(tokenDigest);
}

export async function getStoredRefreshToken(token: string) {
  const row = await pool.query(`SELECT token, user_id, device_id, ip, user_agent, expires_at, revoked FROM refresh_tokens WHERE token = $1`, [digestToken(token)]);
  if (!row.rows.length) return null;
  return row.rows[0];
}
