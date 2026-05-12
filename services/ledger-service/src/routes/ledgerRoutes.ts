import express from 'express';
import Joi from 'joi';
import { enforceIdempotency } from '../middleware/idempotency';
import { createAccount, createLedgerTransaction, getAccount, getTransaction, reverseTransaction, settleLedgerTransaction } from '../ledger';
import { LedgerEntry, LedgerRequest } from '../types';

const router = express.Router();

const accountSchema = Joi.object({
  ownerId: Joi.string().required(),
  ownerType: Joi.string().required(),
  accountType: Joi.string().required(),
  currency: Joi.string().default('INR'),
  metadata: Joi.object().default({}),
});

const transactionSchema = Joi.object({
  externalId: Joi.string().optional(),
  type: Joi.string().valid('payment', 'refund', 'chargeback', 'settlement', 'adjustment').required(),
  description: Joi.string().optional(),
  entries: Joi.array()
    .items(
      Joi.object({
        accountId: Joi.string().required(),
        entryType: Joi.string().valid('debit', 'credit').required(),
        amount: Joi.number().positive().required(),
        currency: Joi.string().default('INR'),
        metadata: Joi.object().default({}),
      })
    )
    .min(2)
    .required(),
  metadata: Joi.object().default({}),
});

const reversalSchema = Joi.object({
  reason: Joi.string().required(),
});

router.post('/ledger/accounts', async (req, res) => {
  const { error, value } = accountSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const account = await createAccount(value.ownerId, value.ownerType, value.accountType, value.currency, value.metadata);
  res.status(201).json(account);
});

router.get('/ledger/accounts/:accountId', async (req, res) => {
  const account = await getAccount(req.params.accountId);
  if (!account) return res.status(404).json({ error: 'Ledger account not found.' });
  res.json(account);
});

router.post('/ledger/transactions', enforceIdempotency, async (req: LedgerRequest, res) => {
  const { error, value } = transactionSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const created = await createLedgerTransaction(
      value.externalId || null,
      req.idempotencyKey || null,
      value.type,
      'pending',
      value.description || '',
      value.entries as LedgerEntry[],
      value.metadata || {}
    );
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.get('/ledger/transactions/:transactionId', async (req, res) => {
  const transaction = await getTransaction(req.params.transactionId);
  if (!transaction) return res.status(404).json({ error: 'Ledger transaction not found.' });
  res.json(transaction);
});

router.post('/ledger/transactions/:transactionId/settle', async (req, res) => {
  try {
    const settled = await settleLedgerTransaction(req.params.transactionId);
    res.json(settled);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post('/ledger/transactions/:transactionId/refund', async (req, res) => {
  const { error, value } = reversalSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const refund = await reverseTransaction(req.params.transactionId, 'refund', value.reason);
    res.status(201).json(refund);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post('/ledger/transactions/:transactionId/chargeback', async (req, res) => {
  const { error, value } = reversalSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const chargeback = await reverseTransaction(req.params.transactionId, 'chargeback', value.reason);
    res.status(201).json(chargeback);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

export default router;
