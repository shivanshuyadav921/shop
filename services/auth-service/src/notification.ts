import { config } from './config';

export async function deliverOtp(target: string, type: 'email' | 'phone', channel: string, otpCode: string, expiresInSeconds: number) {
  if (!config.notificationWebhookUrl) return;

  const response = await fetch(config.notificationWebhookUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.notificationWebhookToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      target,
      type,
      channel,
      template: 'otp',
      variables: {
        otpCode,
        expiresInSeconds,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OTP delivery provider returned ${response.status}`);
  }
}
