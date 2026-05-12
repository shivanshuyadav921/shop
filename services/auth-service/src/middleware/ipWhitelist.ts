import { NextFunction, Response } from 'express';
import { AuthRequest } from '../types';
import { config } from '../config';

const normalizeIp = (ip: string) => ip.replace(/^::ffff:/, '').trim();

export function requireIpWhitelist(req: AuthRequest, res: Response, next: NextFunction) {
  const clientIp = normalizeIp(req.ip || req.connection.remoteAddress || '');
  if (!clientIp) {
    return res.status(400).json({ error: 'Unable to resolve client IP.' });
  }

  if (config.trustedIpList.length === 0) {
    return next();
  }

  if (!config.trustedIpList.includes(clientIp)) {
    return res.status(403).json({ error: 'IP address not permitted.' });
  }

  next();
}
