import nodemailer from 'nodemailer';
import { config } from '../config';

const transport = nodemailer.createTransport({
  host: config.emailHost,
  port: config.emailPort,
  secure: config.emailPort === 465,
  auth: {
    user: config.emailUser,
    pass: config.emailPass,
  },
});

export async function sendEmail(to: string, subject: string, body: string) {
  if (!to) {
    throw new Error('Missing recipient email address');
  }

  await transport.sendMail({
    from: config.emailFrom,
    to,
    subject,
    text: body,
  });
}

export async function sendSms(to: string, message: string) {
  if (!config.smsProviderUrl || !config.smsApiKey) {
    console.warn('SMS provider not configured; logging SMS instead', { to, message });
    return;
  }

  // Placeholder: real implementation would call an SMS gateway.
  console.log(JSON.stringify({ level: 'info', channel: 'sms', to, message }));
}
