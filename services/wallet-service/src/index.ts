import express from 'express';
import Joi from 'joi';
import { Pool } from 'pg';
import { getEnv, loadEnv, logger } from '@shop/common-utils';

loadEnv();

const app = express();
app.use(express.json());

const port = parseInt(getEnv('PORT', '3003'), 10);
const pool = new Pool({
  connectionString: getEnv('DATABASE_URL', process.env.NODE_ENV === 'production' ? undefined : 'postgresql://shop:shop123@localhost:5432/shop_db'),
});

const createWalletSchema = Joi.object({
  ownerId: Joi.string().required(),
  currency: Joi.string().length(3).uppercase().default('INR'),
});

const transferSchema = Joi.object({
  fromOwnerId: Joi.string().required(),
  toOwnerId: Joi.string().required(),
  amount: Joi.number().positive().precision(2).required(),
  currency: Joi.string().length(3).uppercase().default('INR'),
  reference: Joi.string().max(128).optional(),
  metadata: Joi.object().default({}),
});

async function initSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS wallet_accounts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      owner_id TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      balance NUMERIC(18,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      UNIQUE(owner_id, currency)
    );

    CREATE TABLE IF NOT EXISTS wallet_transfers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      idempotency_key TEXT UNIQUE NOT NULL,
      from_wallet_id UUID REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
      to_wallet_id UUID REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
      amount NUMERIC(18,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL DEFAULT 'posted',
      reference TEXT,
      metadata JSONB DEFAULT '{}'::JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_wallet_accounts_owner ON wallet_accounts(owner_id, currency);
    CREATE INDEX IF NOT EXISTS idx_wallet_transfers_wallet_created ON wallet_transfers(from_wallet_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_wallet_transfers_to_wallet_created ON wallet_transfers(to_wallet_id, created_at DESC);

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_accounts_balance_non_negative') THEN
        ALTER TABLE wallet_accounts ADD CONSTRAINT wallet_accounts_balance_non_negative CHECK (balance >= 0) NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transfers_amount_positive') THEN
        ALTER TABLE wallet_transfers ADD CONSTRAINT wallet_transfers_amount_positive CHECK (amount > 0) NOT VALID;
      END IF;
    END $$;
  `);
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'wallet-service' });
});

app.post('/wallets', async (req, res) => {
  const { error, value } = createWalletSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const result = await pool.query(
    `INSERT INTO wallet_accounts(owner_id, currency)
     VALUES ($1, $2)
     ON CONFLICT(owner_id, currency) DO UPDATE SET updated_at = now()
     RETURNING id, owner_id, currency, balance, status, created_at, updated_at`,
    [value.ownerId, value.currency]
  );
  res.status(201).json(result.rows[0]);
});

app.get('/wallets/:ownerId', async (req, res) => {
  const currency = String(req.query.currency || 'INR').toUpperCase();
  const result = await pool.query(
    `SELECT id, owner_id, currency, balance, status, created_at, updated_at
     FROM wallet_accounts
     WHERE owner_id = $1 AND currency = $2`,
    [req.params.ownerId, currency]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Wallet not found.' });
  res.json(result.rows[0]);
});

app.post('/wallets/transfer', async (req, res) => {
  const idempotencyKey = req.header('Idempotency-Key');
  if (!idempotencyKey) return res.status(400).json({ error: 'Missing Idempotency-Key header.' });

  const { error, value } = transferSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  if (value.fromOwnerId === value.toOwnerId) return res.status(400).json({ error: 'Source and destination wallets must differ.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT * FROM wallet_transfers WHERE idempotency_key = $1 FOR UPDATE', [idempotencyKey]);
    if (existing.rows.length) {
      await client.query('COMMIT');
      return res.json(existing.rows[0]);
    }

    const wallets = await client.query(
      `SELECT id, owner_id, balance
       FROM wallet_accounts
       WHERE currency = $1 AND owner_id = ANY($2::text[])
       ORDER BY owner_id
       FOR UPDATE`,
      [value.currency, [value.fromOwnerId, value.toOwnerId]]
    );

    const fromWallet = wallets.rows.find((row) => row.owner_id === value.fromOwnerId);
    const toWallet = wallets.rows.find((row) => row.owner_id === value.toOwnerId);
    if (!fromWallet || !toWallet) throw new Error('Both wallets must exist before transfer.');
    if (Number(fromWallet.balance) < value.amount) throw new Error('Insufficient wallet balance.');

    await client.query('UPDATE wallet_accounts SET balance = balance - $1, updated_at = now() WHERE id = $2', [value.amount, fromWallet.id]);
    await client.query('UPDATE wallet_accounts SET balance = balance + $1, updated_at = now() WHERE id = $2', [value.amount, toWallet.id]);

    const transfer = await client.query(
      `INSERT INTO wallet_transfers(idempotency_key, from_wallet_id, to_wallet_id, amount, currency, reference, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [idempotencyKey, fromWallet.id, toWallet.id, value.amount, value.currency, value.reference || null, value.metadata || {}]
    );

    await client.query('COMMIT');
    res.status(201).json(transfer.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: error instanceof Error ? error.message : 'Transfer failed.' });
  } finally {
    client.release();
  }
});

initSchema()
  .then(() => {
    app.listen(port, () => {
      logger.info('Wallet service listening', { port });
    });
  })
  .catch((error) => {
    logger.error('Failed to initialize wallet schema', { error });
    process.exit(1);
  });
