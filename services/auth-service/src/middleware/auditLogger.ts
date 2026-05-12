import { pool } from '../db';
import { AuthRequest } from '../types';

export async function logAudit(req: AuthRequest, action: string, entity: string, payload: unknown = null) {
  await pool.query(
    `INSERT INTO audit_logs(user_id, action, entity, ip, user_agent, payload) VALUES ($1, $2, $3, $4, $5, $6)`,
    [req.user?.id || null, action, entity, req.ip || null, req.headers['user-agent']?.toString() || null, payload ? JSON.stringify(payload) : null]
  );
}
