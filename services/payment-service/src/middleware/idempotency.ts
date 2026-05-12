import { NextFunction, Response } from 'express';
import { pool } from '../db';

export async function enforceIdempotency(req: any, res: Response, next: NextFunction) {
  const key = req.header('Idempotency-Key');
  if (!key) {
    return res.status(400).json({ error: 'Missing Idempotency-Key header.' });
  }

  const existing = await pool.query(`SELECT * FROM rail_transactions WHERE idempotency_key = $1`, [key]);
  if (existing.rows.length) {
    return res.status(200).json(existing.rows[0]);
  }

  req.idempotencyKey = key;
  next();
}
