import { NextFunction, Response } from 'express';
import { AuthRequest } from '../types';
import { verifyJwt } from '../auth';

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const token = authorization.replace('Bearer ', '').trim();

  try {
    const payload = verifyJwt(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}
