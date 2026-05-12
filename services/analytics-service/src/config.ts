import { getEnv } from '@shop/common-utils';

export const config = {
  port: Number(getEnv('PORT', '3010')),
  dbUrl: getEnv('DATABASE_URL', 'postgresql://shop:shop123@localhost:5432/shop_db'),
  reportSchedule: getEnv('ANALYTICS_REPORT_CRON', '0 2 * * *'),
  metricsWindowDays: Number(getEnv('ANALYTICS_WINDOW_DAYS', '30')),
};
