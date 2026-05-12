import { NextFunction, Response } from 'express';
import geoip from 'geoip-lite';
import { AuthRequest } from '../types';
import { config } from '../config';

const normalizeIp = (ip: string) => ip.replace(/^::ffff:/, '').trim();

export function requireGeoRestriction(req: AuthRequest, res: Response, next: NextFunction) {
  if (!config.geoRestrictedCountries.length) {
    return next();
  }

  const clientIp = normalizeIp(req.ip || req.connection.remoteAddress || '');
  if (!clientIp) {
    return res.status(400).json({ error: 'Unable to resolve client IP.' });
  }

  const geo = geoip.lookup(clientIp);
  if (!geo || !geo.country) {
    return next();
  }

  if (config.geoRestrictedCountries.includes(geo.country.toUpperCase())) {
    return res.status(403).json({ error: 'Access from this region is restricted.' });
  }

  next();
}
