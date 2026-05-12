import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { BaseAdapter } from './baseAdapter';
import { HttpRailProviderConfig, PaymentRailType, ProviderType, RailRequestContext, RailResponse, RailTransactionPayload } from '../types';

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hmac(secret: string, body: unknown) {
  return crypto.createHmac('sha256', secret).update(canonicalJson(body)).digest('hex');
}

export class HttpRailProviderAdapter extends BaseAdapter {
  providerId: string;
  providerType: ProviderType;
  private client: AxiosInstance;
  private signingSecret: string;
  private endpoints: NonNullable<HttpRailProviderConfig['endpoints']>;

  constructor(providerConfig: HttpRailProviderConfig) {
    super();
    this.providerId = providerConfig.providerId;
    this.providerType = providerConfig.providerType;
    this.signingSecret = providerConfig.signingSecret;
    this.endpoints = providerConfig.endpoints || {};
    this.client = axios.create({
      baseURL: providerConfig.apiBaseUrl,
      timeout: providerConfig.timeoutMs || 10000,
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  initiateCollect(payload: RailTransactionPayload, context: RailRequestContext) {
    return this.send('upi_collect', payload, context);
  }

  generateQr(payload: RailTransactionPayload, context: RailRequestContext) {
    return this.send('qr', payload, context);
  }

  resolveVpa(vpa: string) {
    return this.send('vpa', { vpa }, { idempotencyKey: `vpa:${vpa}`, userId: '', providerId: this.providerId, callbackUrl: '' });
  }

  createVirtualAccount(payload: RailTransactionPayload, context: RailRequestContext) {
    return this.send('virtual_account', payload, context);
  }

  sendBankTransfer(payload: RailTransactionPayload, context: RailRequestContext) {
    return this.send(payload.railType, payload, context);
  }

  async handleCallback(providerId: string, body: unknown, headers: Record<string, string | string[] | undefined> = {}): Promise<RailResponse> {
    const signature = String(headers['x-provider-signature'] || headers['X-Provider-Signature'] || '');
    const expected = hmac(this.signingSecret, body);
    const received = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (!signature || received.length !== expectedBuffer.length || !crypto.timingSafeEqual(received, expectedBuffer)) {
      return this.failureResponse('Invalid callback signature', `callback-${providerId}`);
    }
    return this.normalizeResponse(body, `callback-${providerId}`);
  }

  async reconcilePending(): Promise<void> {
    await this.client.post(this.endpoint('reconcile'), {}, { headers: this.signedHeaders({}) });
  }

  private async send(railType: PaymentRailType, payload: RailTransactionPayload | Record<string, unknown>, context: RailRequestContext): Promise<RailResponse> {
    const requestBody = { ...payload, providerId: this.providerId, idempotencyKey: context.idempotencyKey, userId: context.userId, callbackUrl: context.callbackUrl };
    const response = await this.client.post(this.endpoint(railType), requestBody, { headers: this.signedHeaders(requestBody) });
    return this.normalizeResponse(response.data, `${this.providerId}-${context.idempotencyKey}`);
  }

  private endpoint(operation: PaymentRailType | 'reconcile') {
    return this.endpoints[operation] || `/rails/${operation}`;
  }

  private signedHeaders(body: unknown) {
    return {
      'Idempotency-Key': typeof body === 'object' && body && 'idempotencyKey' in body ? String((body as { idempotencyKey?: unknown }).idempotencyKey) : undefined,
      'X-Shop-Signature': hmac(this.signingSecret, body),
    };
  }

  private normalizeResponse(data: unknown, fallbackReference: string): RailResponse {
    const record = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    const status = typeof record.status === 'string' ? record.status : 'initiated';
    if (!['pending', 'initiated', 'success', 'failed', 'reconciled', 'cancelled'].includes(status)) {
      return this.failureResponse('Provider returned an invalid status', fallbackReference, { raw: record });
    }
    return {
      status: status as RailResponse['status'],
      providerReference: String(record.providerReference || record.reference || fallbackReference),
      message: typeof record.message === 'string' ? record.message : undefined,
      data: record,
    };
  }
}
