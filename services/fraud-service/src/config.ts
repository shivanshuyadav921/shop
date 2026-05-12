import { getEnv } from '@shop/common-utils';

export const config = {
  port: Number(getEnv('PORT', '3004')),
  dbUrl: getEnv('DATABASE_URL', 'postgresql://shop:shop123@localhost:5432/shop_db'),
  alertThreshold: Number(getEnv('FRAUD_ALERT_THRESHOLD', '60')),
  blockThreshold: Number(getEnv('FRAUD_BLOCK_THRESHOLD', '80')),
  reviewThreshold: Number(getEnv('FRAUD_REVIEW_THRESHOLD', '70')),
  suspiciousIps: (getEnv('FRAUD_SUSPICIOUS_IPS', '') || '').split(',').filter(Boolean),
};
