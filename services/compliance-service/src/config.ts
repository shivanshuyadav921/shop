import { getEnv, requireProductionSecret } from '@shop/common-utils';

export const config = {
  port: Number(getEnv('PORT', '3005')),
  dbUrl: getEnv('DATABASE_URL', process.env.NODE_ENV === 'production' ? undefined : 'postgresql://shop:shop123@localhost:5432/shop_db'),
  uploadPath: getEnv('COMPLIANCE_UPLOAD_PATH', './uploads/compliance'),
  alertEmailFrom: getEnv('ALERT_EMAIL_FROM', 'compliance@shop.example.com'),
  verificationApiBaseUrl: getEnv('COMPLIANCE_VERIFICATION_API_BASE_URL', process.env.NODE_ENV === 'production' ? undefined : ''),
  verificationApiToken: requireProductionSecret(
    'COMPLIANCE_VERIFICATION_API_TOKEN',
    getEnv('COMPLIANCE_VERIFICATION_API_TOKEN', process.env.NODE_ENV === 'production' ? undefined : 'dev-compliance-token-with-32-chars')
  ),
};
