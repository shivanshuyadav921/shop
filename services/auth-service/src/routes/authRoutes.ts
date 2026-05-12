import express from 'express';
import Joi from 'joi';
import crypto from 'crypto';
import { pool } from '../db';
import { logAudit } from '../middleware/auditLogger';
import { comparePassword, generateJwt, generateRefreshToken, getStoredRefreshToken, hashPassword, persistRefreshToken, revokeRefreshToken } from '../auth';
import { requireAuth } from '../middleware/authMiddleware';
import { AuthRequest } from '../types';
import { config } from '../config';
import { deliverOtp } from '../notification';

const router = express.Router();

const credentialsSchema = Joi.object({
  emailOrPhone: Joi.string().required(),
  password: Joi.string().required(),
  deviceName: Joi.string().optional(),
  platform: Joi.string().optional(),
});

const otpRequestSchema = Joi.object({
  target: Joi.string().required(),
  type: Joi.string().valid('email', 'phone').required(),
  channel: Joi.string().valid('login', 'verification').default('verification'),
});

const otpVerifySchema = Joi.object({
  target: Joi.string().required(),
  type: Joi.string().valid('email', 'phone').required(),
  otpCode: Joi.string().length(6).required(),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  phone: Joi.string().required(),
  password: Joi.string().min(10).required(),
  role: Joi.string().valid('super-admin', 'finance', 'dealer', 'distributor', 'customer', 'compliance-officer').default('dealer'),
});

const hashOtp = (otpCode: string) => crypto.createHash('sha256').update(otpCode).digest('hex');

async function hasTooManyFailedLogins(username: string) {
  const result = await pool.query(
    `SELECT count(*)::int AS failed_count
     FROM login_attempts
     WHERE username = $1
       AND success = FALSE
       AND created_at > now() - interval '15 minutes'`,
    [username]
  );
  return Number(result.rows[0]?.failed_count || 0) >= config.maxLoginAttempts;
}

router.post('/auth/register', async (req, res) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.message });
  }

  const passwordHash = await hashPassword(value.password);
  const user = await pool.query(
    `INSERT INTO users(email, phone, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, phone, role`,
    [value.email.toLowerCase(), value.phone, passwordHash, value.role]
  );

  await logAudit(req as AuthRequest, 'user.register', 'user', { userId: user.rows[0].id, role: value.role });
  res.status(201).json({ user: user.rows[0] });
});

router.post('/auth/login', async (req, res) => {
  const { error, value } = credentialsSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.message });
  }

  const username = value.emailOrPhone.toLowerCase();
  if (await hasTooManyFailedLogins(username)) {
    return res.status(429).json({ error: 'Too many failed login attempts. Try again later.' });
  }

  const userResult = await pool.query(`SELECT * FROM users WHERE email = $1 OR phone = $1`, [username]);
  const user = userResult.rows[0];

  if (!user || !(await comparePassword(value.password, user.password_hash))) {
    await pool.query(
      `INSERT INTO login_attempts(user_id, username, success, ip, device, reason) VALUES ($1, $2, $3, $4, $5, $6)`,
      [user ? user.id : null, username, false, req.ip, value.deviceName || null, 'invalid_credentials']
    );
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  if (!user.is_enabled) {
    return res.status(403).json({ error: 'User account is disabled.' });
  }

  const payload = {
    sub: user.id,
    email: user.email || user.phone,
    role: user.role,
    tenantId: user.tenant_id || null,
  };

  const token = generateJwt(payload);
  const refreshToken = generateRefreshToken();

  await persistRefreshToken(refreshToken, user.id, null, req.ip || null, req.headers['user-agent']?.toString() || null);

  await pool.query(
    `INSERT INTO login_attempts(user_id, username, success, ip, device, reason) VALUES ($1, $2, $3, $4, $5, $6)`,
    [user.id, username, true, req.ip, value.deviceName || null, 'success']
  );

  await logAudit(req as AuthRequest, 'user.login', 'user', { userId: user.id, deviceName: value.deviceName, platform: value.platform });
  res.json({ accessToken: token, refreshToken, expiresIn: config.jwtExpiresIn, role: user.role });
});

router.post('/auth/refresh', async (req, res) => {
  const { error, value } = refreshSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.message });
  }

  const session = await getStoredRefreshToken(value.refreshToken);

  if (!session || session.revoked || new Date(session.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Refresh token invalid or expired.' });
  }

  const userResult = await pool.query(`SELECT id, email, phone, role, tenant_id FROM users WHERE id = $1`, [session.user_id]);
  const user = userResult.rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Invalid session.' });
  }

  const payload = {
    sub: user.id,
    email: user.email || user.phone,
    role: user.role,
    tenantId: user.tenant_id || null,
  };

  const accessToken = generateJwt(payload);
  res.json({ accessToken, expiresIn: config.jwtExpiresIn });
});

router.post('/auth/logout', requireAuth, async (req: AuthRequest, res) => {
  const token = req.body.refreshToken;
  if (token) {
    await revokeRefreshToken(token);
  }

  await logAudit(req, 'user.logout', 'user', {});
  res.json({ success: true });
});

router.get('/auth/me', requireAuth, async (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

router.post('/auth/otp/request', async (req, res) => {
  const { error, value } = otpRequestSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.message });
  }

  const otpCode = crypto.randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + config.otpExpirySeconds * 1000);

  await pool.query(
    `INSERT INTO otp_requests(target, otp_code, otp_code_hash, type, channel, expires_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [value.target, '', hashOtp(otpCode), value.type, value.channel, expiresAt]
  );

  await deliverOtp(value.target, value.type, value.channel, otpCode, config.otpExpirySeconds);

  await logAudit(req as AuthRequest, 'otp.request', 'otp', { target: value.target, channel: value.channel });

  res.status(202).json({ message: 'OTP generated and queued for delivery.', target: value.target, expirySeconds: config.otpExpirySeconds });
});

router.post('/auth/otp/verify', async (req, res) => {
  const { error, value } = otpVerifySchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.message });
  }

  const row = await pool.query(
    `SELECT id, user_id, expires_at, consumed FROM otp_requests WHERE target = $1 AND type = $2 AND otp_code_hash = $3 ORDER BY created_at DESC LIMIT 1`,
    [value.target, value.type, hashOtp(value.otpCode)]
  );

  const request = row.rows[0];
  if (!request || request.consumed || new Date(request.expires_at) < new Date()) {
    return res.status(401).json({ error: 'OTP invalid or expired.' });
  }

  await pool.query(`UPDATE otp_requests SET consumed = TRUE WHERE id = $1`, [request.id]);

  if (request.user_id) {
    if (value.type === 'email') {
      await pool.query(`UPDATE users SET is_email_verified = TRUE WHERE id = $1`, [request.user_id]);
    }
    if (value.type === 'phone') {
      await pool.query(`UPDATE users SET is_phone_verified = TRUE WHERE id = $1`, [request.user_id]);
    }
  }

  await logAudit(req as AuthRequest, 'otp.verify', 'otp', { target: value.target, type: value.type });
  res.json({ success: true, verified: true });
});

router.get('/auth/sessions', requireAuth, async (req: AuthRequest, res) => {
  const result = await pool.query(`SELECT id, device_id, ip, user_agent, last_seen_at, created_at FROM sessions WHERE user_id = $1 ORDER BY created_at DESC`, [req.user!.id]);
  res.json({ sessions: result.rows });
});

router.get('/auth/devices', requireAuth, async (req: AuthRequest, res) => {
  const result = await pool.query(`SELECT id, name, platform, last_seen_at, created_at FROM devices WHERE user_id = $1 ORDER BY last_seen_at DESC`, [req.user!.id]);
  res.json({ devices: result.rows });
});

export default router;
