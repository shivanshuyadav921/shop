import { Request } from 'express';

export interface LedgerRequest extends Request {
  idempotencyKey?: string;
}

export interface LedgerEntry {
  accountId: string;
  entryType: 'debit' | 'credit';
  amount: number;
  currency?: string;
  metadata?: Record<string, unknown>;
}
