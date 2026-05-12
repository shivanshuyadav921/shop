import { getEnv } from '@shop/common-utils';

export const config = {
  port: Number(getEnv('PORT', '3001')),
  dbUrl: getEnv('DATABASE_URL', 'postgresql://shop:shop123@localhost:5432/shop_db'),
  emailFrom: getEnv('EMAIL_FROM', 'noreply@shop.example.com'),
  emailHost: getEnv('EMAIL_HOST', 'smtp.example.com'),
  emailPort: Number(getEnv('EMAIL_PORT', '587')),
  emailUser: getEnv('EMAIL_USER', 'user@example.com'),
  emailPass: getEnv('EMAIL_PASS', 'password'),
  smsProviderUrl: getEnv('SMS_PROVIDER_URL', ''),
  smsApiKey: getEnv('SMS_API_KEY', ''),
  reminderDaysBeforeDue: Number(getEnv('REMINDER_DAYS_BEFORE_DUE', '3')),
  penaltyRatePercent: Number(getEnv('PENALTY_RATE_PERCENT', '2')),
};
