import express from 'express';
import Joi from 'joi';
import { pool } from '../db';
import { requireAuth } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/rbac';
import { logAudit } from '../middleware/auditLogger';
import { AuthRequest } from '../types';

const router = express.Router();

const whitelistSchema = Joi.object({
  label: Joi.string().required(),
  ipCidr: Joi.string().required(),
});

const geoRestrictionSchema = Joi.object({
  label: Joi.string().required(),
  countryCode: Joi.string().length(2).uppercase().required(),
  action: Joi.string().valid('block', 'monitor').default('block'),
});

router.use(requireAuth, requireRole('super-admin', 'compliance-officer'));

router.post('/admin/ip-whitelist', async (req: AuthRequest, res) => {
  const { error, value } = whitelistSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.message });
  }

  await pool.query(`INSERT INTO ip_whitelist(label, ip_cidr) VALUES ($1, $2)`, [value.label, value.ipCidr]);
  await logAudit(req, 'ip.whitelist.add', 'ip_whitelist', value);
  res.status(201).json({ success: true });
});

router.post('/admin/geo-restrictions', async (req: AuthRequest, res) => {
  const { error, value } = geoRestrictionSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.message });
  }

  await pool.query(`INSERT INTO geo_restrictions(label, country_code, action) VALUES ($1, $2, $3)`, [value.label, value.countryCode, value.action]);
  await logAudit(req, 'geo.restriction.add', 'geo_restrictions', value);
  res.status(201).json({ success: true });
});

router.get('/admin/audit-logs', async (req: AuthRequest, res) => {
  const result = await pool.query(`SELECT id, user_id, action, entity, ip, user_agent, payload, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 100`);
  res.json({ auditLogs: result.rows });
});

router.get('/admin/users', async (_req, res) => {
  const result = await pool.query(`SELECT id, email, phone, role, is_email_verified, is_phone_verified, is_enabled, created_at FROM users ORDER BY created_at DESC LIMIT 100`);
  res.json({ users: result.rows });
});

export default router;
