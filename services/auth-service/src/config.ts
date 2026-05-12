import { getEnv, requireProductionSecret } from '@shop/common-utils';

export const config = {
  port: Number(getEnv('PORT', '3000')),
  jwtSecret: requireProductionSecret('JWT_SECRET', getEnv('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'change-me'), ['change-me', 'replace-with-strong-secret']),
  jwtExpiresIn: getEnv('JWT_EXPIRES_IN', '15m'),
  refreshTokenExpiryDays: Number(getEnv('REFRESH_TOKEN_EXPIRY_DAYS', '30')),
  redisUrl: getEnv('REDIS_URL', 'redis://localhost:6379'),
  dbUrl: getEnv('DATABASE_URL', process.env.NODE_ENV === 'production' ? undefined : 'postgresql://shop:shop123@localhost:5432/shop_db'),
  otpExpirySeconds: Number(getEnv('OTP_TTL_SECONDS', '300')),
  rateLimitWindowMs: Number(getEnv('RATE_LIMIT_WINDOW_MS', '60000')),
  rateLimitMax: Number(getEnv('RATE_LIMIT_MAX', '100')),
  trustedIpList: (process.env.TRUSTED_IPS || '').split(',').map(ip => ip.trim()).filter(Boolean),
  geoRestrictedCountries: (process.env.GEO_RESTRICTED_COUNTRIES || '').split(',').map(country => country.trim().toUpperCase()).filter(Boolean),
  maxLoginAttempts: Number(getEnv('MAX_LOGIN_ATTEMPTS', '5')),
  notificationWebhookUrl: getEnv('AUTH_NOTIFICATION_WEBHOOK_URL', process.env.NODE_ENV === 'production' ? undefined : ''),
  notificationWebhookToken: requireProductionSecret(
    'AUTH_NOTIFICATION_WEBHOOK_TOKEN',
    getEnv('AUTH_NOTIFICATION_WEBHOOK_TOKEN', process.env.NODE_ENV === 'production' ? undefined : 'dev-auth-notification-token-32-chars')
  ),
};
