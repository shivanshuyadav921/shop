import express from 'express';
import Joi from 'joi';
import { createRailTransaction, handleProviderCallback, reconcileAllPending } from '../services/paymentService';
import { enforceIdempotency } from '../middleware/idempotency';
import { config } from '../config';

interface IdempotentRequest extends express.Request {
  idempotencyKey?: string;
}

const router = express.Router();

const railTransactionSchema = Joi.object({
  providerId: Joi.string().required(),
  railType: Joi.string().valid('upi_collect', 'qr', 'vpa', 'virtual_account', 'imps', 'neft', 'rtgs').required(),
  amount: Joi.number().positive().precision(2).required(),
  currency: Joi.string().length(3).uppercase().default('INR'),
  externalReference: Joi.string().max(128).optional(),
  beneficiary: Joi.object().default({}),
  callbackUrl: Joi.string().uri().required(),
  metadata: Joi.object().default({}),
});

function requireInternalToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.header('X-Internal-Token');
  if (!token || token !== config.internalApiToken) {
    return res.status(401).json({ error: 'Internal authentication required.' });
  }
  next();
}

router.post('/rail/transaction', enforceIdempotency, async (req, res) => {
  const request = req as IdempotentRequest;
  const { error, value: payload } = railTransactionSchema.validate(request.body);
  if (error) return res.status(400).json({ error: error.message });
  const userId = request.header('X-User-Id');
  if (!userId) return res.status(401).json({ error: 'X-User-Id is required.' });

  const context = {
    idempotencyKey: request.idempotencyKey || '',
    userId,
    providerId: payload.providerId,
    callbackUrl: payload.callbackUrl,
  };

  try {
    const result = await createRailTransaction(payload, context);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

router.post('/rail/callback/:providerId', async (req, res) => {
  try {
    const result = await handleProviderCallback(req.params.providerId, req.body, req.headers);
    if (result.status === 'failed') return res.status(401).json(result);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

router.post('/rail/reconcile', requireInternalToken, async (req, res) => {
  try {
    await reconcileAllPending();
    res.status(200).json({ status: 'reconciliation_started' });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

export default router;
