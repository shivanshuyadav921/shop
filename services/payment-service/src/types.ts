export type PaymentRailType = 'upi_collect' | 'qr' | 'vpa' | 'virtual_account' | 'imps' | 'neft' | 'rtgs';
export type PaymentRailStatus = 'pending' | 'initiated' | 'success' | 'failed' | 'reconciled' | 'cancelled';
export type ProviderType = 'upi' | 'bank' | 'virtual_account' | 'qr';

export interface RailTransactionPayload {
  providerId: string;
  railType: PaymentRailType;
  amount: number;
  currency: string;
  externalReference?: string;
  beneficiary?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface RailResponse {
  status: PaymentRailStatus;
  providerReference: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface ProviderResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface RailRequestContext {
  idempotencyKey: string;
  userId: string;
  providerId: string;
  callbackUrl: string;
}

export interface PaymentRailAdapter {
  providerId: string;
  providerType: ProviderType;
  initiateCollect(payload: RailTransactionPayload, context: RailRequestContext): Promise<RailResponse>;
  generateQr(payload: RailTransactionPayload, context: RailRequestContext): Promise<RailResponse>;
  resolveVpa(vpa: string): Promise<RailResponse>;
  createVirtualAccount(payload: RailTransactionPayload, context: RailRequestContext): Promise<RailResponse>;
  sendBankTransfer(payload: RailTransactionPayload, context: RailRequestContext): Promise<RailResponse>;
  handleCallback(providerId: string, body: unknown, headers?: Record<string, string | string[] | undefined>): Promise<RailResponse>;
  reconcilePending(): Promise<void>;
}

export interface HttpRailProviderConfig {
  providerId: string;
  providerType: ProviderType;
  apiBaseUrl: string;
  apiKey: string;
  signingSecret: string;
  timeoutMs?: number;
  endpoints?: Partial<Record<PaymentRailType | 'callback' | 'reconcile', string>>;
}
