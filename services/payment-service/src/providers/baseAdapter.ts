import { PaymentRailAdapter, RailRequestContext, RailResponse, RailTransactionPayload } from '../types';

export abstract class BaseAdapter implements PaymentRailAdapter {
  abstract providerId: string;
  abstract providerType: 'upi' | 'bank' | 'virtual_account' | 'qr';

  abstract initiateCollect(payload: RailTransactionPayload, context: RailRequestContext): Promise<RailResponse>;
  abstract generateQr(payload: RailTransactionPayload, context: RailRequestContext): Promise<RailResponse>;
  abstract resolveVpa(vpa: string): Promise<RailResponse>;
  abstract createVirtualAccount(payload: RailTransactionPayload, context: RailRequestContext): Promise<RailResponse>;
  abstract sendBankTransfer(payload: RailTransactionPayload, context: RailRequestContext): Promise<RailResponse>;
  abstract handleCallback(providerId: string, body: unknown, headers?: Record<string, string | string[] | undefined>): Promise<RailResponse>;
  abstract reconcilePending(): Promise<void>;

  protected successResponse(data: Record<string, unknown>, providerReference: string, message = 'OK'): RailResponse {
    return {
      status: 'initiated',
      providerReference,
      message,
      data,
    };
  }

  protected failureResponse(error: string, providerReference: string, data: Record<string, unknown> = {}): RailResponse {
    return {
      status: 'failed',
      providerReference,
      message: error,
      data,
    };
  }
}
