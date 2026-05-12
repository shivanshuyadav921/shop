import { pool } from '../db';
import { PaymentRailAdapter, RailRequestContext, RailResponse, RailTransactionPayload } from '../types';
import { getAdapter } from '../providers/providerRegistry';

export async function createRailTransaction(payload: RailTransactionPayload, context: RailRequestContext): Promise<RailResponse> {
  const adapter = getAdapter(context.providerId);
  if (!adapter) throw new Error(`Provider adapter not registered: ${context.providerId}`);

  await pool.query('BEGIN');
  try {
    const insertResult = await pool.query(
      `INSERT INTO rail_transactions (idempotency_key, provider_id, rail_type, amount, currency, external_reference, beneficiary, request_payload, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        context.idempotencyKey,
        context.providerId,
        payload.railType,
        payload.amount,
        payload.currency,
        payload.externalReference,
        payload.beneficiary || {},
        payload,
        payload.metadata || {},
      ]
    );

    const response = await runAdapterForPayload(adapter, payload, context);
    await pool.query(
      'UPDATE rail_transactions SET status = $1, response_payload = $2, failure_reason = $3, updated_at = now() WHERE id = $4',
      [response.status, response.data || {}, response.status === 'failed' ? response.message : null, insertResult.rows[0].id]
    );
    await pool.query('COMMIT');
    return response;
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

export async function handleProviderCallback(providerId: string, body: unknown, headers?: Record<string, string | string[] | undefined>): Promise<RailResponse> {
  const adapter = getAdapter(providerId);
  if (!adapter) throw new Error(`Provider adapter not registered: ${providerId}`);

  const result = await adapter.handleCallback(providerId, body, headers);
  await pool.query(
    'INSERT INTO rail_callbacks (transaction_id, provider_id, event_type, payload) VALUES (NULL, $1, $2, $3)',
    [providerId, 'callback_received', body]
  );
  return result;
}

export async function reconcileAllPending() {
  const adapters = Array.from(new Set(Array.from((await pool.query('SELECT provider_id FROM rail_transactions WHERE status = $1', ['pending'])).rows.map((row) => row.provider_id))));
  for (const providerId of adapters) {
    const adapter = getAdapter(providerId);
    if (!adapter) continue;
    await adapter.reconcilePending();
  }
}

async function runAdapterForPayload(adapter: PaymentRailAdapter, payload: RailTransactionPayload, context: RailRequestContext): Promise<RailResponse> {
  switch (payload.railType) {
    case 'upi_collect':
      return adapter.initiateCollect(payload, context);
    case 'qr':
      return adapter.generateQr(payload, context);
    case 'vpa':
      return adapter.resolveVpa((payload.beneficiary?.vpa as string) || '');
    case 'virtual_account':
      return adapter.createVirtualAccount(payload, context);
    case 'imps':
    case 'neft':
    case 'rtgs':
      return adapter.sendBankTransfer(payload, context);
    default:
      return {
        status: 'failed',
        providerReference: 'unsupported',
        message: 'Unsupported rail type',
      };
  }
}
