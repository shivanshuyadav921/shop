import { NextFunction, Response } from 'express';
import { pool } from '../db';
import { LedgerRequest } from '../types';

export async function enforceIdempotency(req: LedgerRequest, res: Response, next: NextFunction) {
  const key = req.header('Idempotency-Key');
  if (!key) {
    return res.status(400).json({ error: 'Missing Idempotency-Key header.' });
  }

  req.idempotencyKey = key;
  const result = await pool.query(`SELECT response FROM idempotency_keys WHERE key = $1`, [key]);

  if (result.rows.length) {
    return res.status(200).json(result.rows[0].response);
  }

  next();
}
