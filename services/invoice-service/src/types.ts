export type InvoiceStatus = 'issued' | 'partially_paid' | 'paid' | 'overdue';
export type PaymentStatus = 'confirmed' | 'pending' | 'failed';
export type ReminderChannel = 'email' | 'sms';

export interface DealerPayload {
  name: string;
  email?: string;
  phone?: string;
  gstin?: string;
  creditLimit?: number;
  metadata?: Record<string, unknown>;
}

export interface InvoicePayload {
  dealerId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  amount: number;
  gstRate?: number;
  metadata?: Record<string, unknown>;
}

export interface PaymentPayload {
  invoiceId: string;
  amount: number;
  paymentMethod: string;
  reference?: string;
  metadata?: Record<string, unknown>;
}

export interface FinancingPayload {
  invoiceId: string;
  financeAmount: number;
  lenderReference?: string;
  tenorDays?: number;
  metadata?: Record<string, unknown>;
}

export interface StatementQuery {
  from?: string;
  to?: string;
}
