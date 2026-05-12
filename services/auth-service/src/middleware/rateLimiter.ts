import rateLimit from 'express-rate-limit';
import { config } from '../config';

export const globalRateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
  },
});

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.headers['x-forwarded-for']?.toString() || '';
  },
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many login attempts. Try again after 15 minutes.' });
  },
});
