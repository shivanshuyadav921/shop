import { getEnv, requireProductionSecret } from '@shop/common-utils';
import { HttpRailProviderConfig } from './types';

const providerConfigs = JSON.parse(getEnv('PAYMENT_PROVIDER_CONFIGS', process.env.NODE_ENV === 'production' ? undefined : '[]')) as HttpRailProviderConfig[];

export const config = {
  port: Number(getEnv('PORT', '3002')),
  dbUrl: getEnv('DATABASE_URL', process.env.NODE_ENV === 'production' ? undefined : 'postgresql://shop:shop123@localhost:5432/shop_db'),
  internalApiToken: requireProductionSecret('INTERNAL_API_TOKEN', getEnv('INTERNAL_API_TOKEN', process.env.NODE_ENV === 'production' ? undefined : 'dev-internal-token-with-32-characters'), ['dev-internal-token-with-32-characters']),
  paymentProviderConfigs: providerConfigs,
  reconcileBatchSize: Number(getEnv('RECONCILE_BATCH_SIZE', '50')),
  maxRetryAttempts: Number(getEnv('RAIL_RETRY_ATTEMPTS', '3')),
  retryBackoffMs: Number(getEnv('RAIL_RETRY_BACKOFF_MS', '1000')),
};

if (process.env.NODE_ENV === 'production' && !providerConfigs.length) {
  throw new Error('PAYMENT_PROVIDER_CONFIGS must include at least one production payment provider.');
}
