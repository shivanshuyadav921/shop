import { getEnv } from '@shop/common-utils';

export const config = {
  port: Number(getEnv('PORT', '3004')),
  dbUrl: getEnv('DATABASE_URL', 'postgresql://shop:shop123@localhost:5432/shop_db'),
  eventLogEnabled: getEnv('EVENT_LOG_ENABLED', 'true') === 'true',
};
