import { pool } from '../db';
import { InvoicePayload, PaymentPayload, FinancingPayload, DealerPayload, StatementQuery } from '../types';
import { config } from '../config';

const DEFAULT_GST_RATE = 18;

function calculateGst(amount: number, gstRate: number) {
  const gstAmount = Number(((amount * gstRate) / 100).toFixed(2));
  const totalAmount = Number((amount + gstAmount).toFixed(2));
  return { gstAmount, totalAmount };
}

function invoiceStatus(outstanding: number, dueDate: string, originalAmount: number) {
  if (outstanding <= 0) return 'paid';
  const now = new Date().toISOString().slice(0, 10);
  if (now > dueDate) return 'overdue';
  return outstanding === originalAmount ? 'issued' : 'partially_paid';
}

export async function createDealer(payload: DealerPayload) {
  const result = await pool.query(
    `INSERT INTO dealers (name, email, phone, gstin, credit_limit, metadata) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [payload.name, payload.email || null, payload.phone || null, payload.gstin || null, payload.creditLimit ?? 0, payload.metadata || {}]
  );
  return result.rows[0];
}

export async function getDealer(dealerId: string) {
  const result = await pool.query('SELECT * FROM dealers WHERE id = $1', [dealerId]);
  return result.rows[0];
}

export async function updateDealerCreditLimit(dealerId: string, creditLimit: number) {
  const result = await pool.query(
    'UPDATE dealers SET credit_limit = $1, updated_at = now() WHERE id = $2 RETURNING *',
    [creditLimit, dealerId]
  );
  return result.rows[0];
}

export async function createInvoice(payload: InvoicePayload) {
  const gstRate = payload.gstRate ?? DEFAULT_GST_RATE;
  const { gstAmount, totalAmount } = calculateGst(payload.amount, gstRate);
  const result = await pool.query(
    `INSERT INTO invoices (dealer_id, invoice_number, issue_date, due_date, amount, gst_rate, gst_amount, total_amount, outstanding_amount, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9)
     RETURNING *`,
    [payload.dealerId, payload.invoiceNumber, payload.issueDate, payload.dueDate, payload.amount, gstRate, gstAmount, totalAmount, payload.metadata || {}]
  );
  return result.rows[0];
}

export async function getInvoice(invoiceId: string) {
  const result = await pool.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
  return result.rows[0];
}

export async function recordPayment(payload: PaymentPayload) {
  const invoice = await getInvoice(payload.invoiceId);
  if (!invoice) throw new Error('Invoice not found');

  const newOutstanding = Number((invoice.outstanding_amount - payload.amount).toFixed(2));
  const status = invoiceStatus(newOutstanding, invoice.due_date, Number(invoice.amount));
  const paidAgainstFinancing = Math.min(payload.amount, Number(invoice.financed_amount ?? 0));
  const remainingFinanced = Number(Math.max(0, Number(invoice.financed_amount ?? 0) - paidAgainstFinancing).toFixed(2));

  await pool.query('BEGIN');
  try {
    await pool.query(
      `INSERT INTO invoice_payments (invoice_id, amount, payment_method, reference, metadata) VALUES ($1, $2, $3, $4, $5)`,
      [payload.invoiceId, payload.amount, payload.paymentMethod, payload.reference || null, payload.metadata || {}]
    );

    await pool.query(
      'UPDATE invoices SET outstanding_amount = $1, status = $2, financed_amount = $3, updated_at = now() WHERE id = $4',
      [newOutstanding, status, remainingFinanced, payload.invoiceId]
    );

    if (paidAgainstFinancing > 0) {
      await pool.query(
        'UPDATE dealers SET current_outstanding = GREATEST(current_outstanding - $1, 0), updated_at = now() WHERE id = $2',
        [paidAgainstFinancing, invoice.dealer_id]
      );
    }

    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }

  return getInvoice(payload.invoiceId);
}

export async function financeInvoice(payload: FinancingPayload) {
  const invoice = await getInvoice(payload.invoiceId);
  if (!invoice) throw new Error('Invoice not found');

  const dealer = await getDealer(invoice.dealer_id);
  if (!dealer) throw new Error('Dealer not found');

  if (payload.financeAmount > invoice.outstanding_amount) {
    throw new Error('Finance amount cannot exceed outstanding invoice amount');
  }

  const availableCredit = Number((dealer.credit_limit - dealer.current_outstanding).toFixed(2));
  if (payload.financeAmount > availableCredit) {
    throw new Error('Requested financing exceeds dealer credit limit');
  }

  await pool.query('BEGIN');
  try {
    await pool.query(
      'UPDATE invoices SET financed_amount = financed_amount + $1, updated_at = now() WHERE id = $2',
      [payload.financeAmount, payload.invoiceId]
    );

    await pool.query(
      'UPDATE dealers SET current_outstanding = current_outstanding + $1, updated_at = now() WHERE id = $2',
      [payload.financeAmount, dealer.id]
    );

    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }

  return getInvoice(payload.invoiceId);
}

export async function getDealerStatement(dealerId: string, query: StatementQuery) {
  const conditionals: string[] = ['dealer_id = $1'];
  const values: Array<string> = [dealerId];

  if (query.from) {
    conditionals.push(`issue_date >= $${values.length + 1}`);
    values.push(query.from);
  }
  if (query.to) {
    conditionals.push(`issue_date <= $${values.length + 1}`);
    values.push(query.to);
  }

  const invoices = await pool.query(
    `SELECT * FROM invoices WHERE ${conditionals.join(' AND ')} ORDER BY issue_date DESC`,
    values
  );
  const payments = await pool.query(
    `SELECT * FROM invoice_payments WHERE invoice_id IN (SELECT id FROM invoices WHERE dealer_id = $1) ORDER BY paid_at DESC`,
    [dealerId]
  );

  return {
    invoices: invoices.rows,
    payments: payments.rows,
  };
}

export async function calculateCreditScore(dealerId: string) {
  const dealer = await getDealer(dealerId);
  if (!dealer) throw new Error('Dealer not found');

  const invoiceResult = await pool.query('SELECT total_amount, outstanding_amount, due_date, status FROM invoices WHERE dealer_id = $1', [dealerId]);
  const invoices = invoiceResult.rows;
  const totalDue = invoices.reduce((sum: number, inv: any) => sum + Number(inv.total_amount), 0);
  const totalOutstanding = invoices.reduce((sum: number, inv: any) => sum + Number(inv.outstanding_amount), 0);
  const overdueCount = invoices.filter((inv: any) => inv.status === 'overdue').length;
  const utilization = totalDue > 0 ? (totalOutstanding / totalDue) : 0;

  let score = 750;
  score -= Math.round(utilization * 150);
  score -= overdueCount * 30;
  score = Math.max(300, Math.min(900, score));

  const result = await pool.query('UPDATE dealers SET credit_score = $1, updated_at = now() WHERE id = $2 RETURNING *', [score, dealerId]);
  return result.rows[0];
}

export async function runAutoReminders() {
  const reminderWindow = config.reminderDaysBeforeDue;
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + reminderWindow);
  const targetString = targetDate.toISOString().slice(0, 10);

  const invoices = await pool.query(
    'SELECT i.*, d.email, d.phone, d.name FROM invoices i JOIN dealers d ON d.id = i.dealer_id WHERE i.status <> $1 AND i.due_date <= $2',
    ['paid', targetString]
  );

  const reminders = [] as Array<Record<string, unknown>>;
  for (const invoice of invoices.rows) {
    const channel = invoice.due_date < new Date().toISOString().slice(0, 10) ? 'sms' : 'email';
    const payload = {
      message: `Invoice ${invoice.invoice_number} is due on ${invoice.due_date} with outstanding ₹${invoice.outstanding_amount}`,
      invoiceId: invoice.id,
      dealerId: invoice.dealer_id,
      email: invoice.email,
      phone: invoice.phone,
    };

    await pool.query(
      'INSERT INTO invoice_reminders (invoice_id, dealer_id, reminder_type, channel, payload) VALUES ($1, $2, $3, $4, $5)',
      [invoice.id, invoice.dealer_id, invoice.due_date < new Date().toISOString().slice(0, 10) ? 'overdue' : 'upcoming', channel, payload]
    );

    reminders.push({ invoiceId: invoice.id, dealerId: invoice.dealer_id, channel, payload });
  }

  return reminders;
}

export async function calculatePenaltyForOverdue() {
  const overdueInvoices = await pool.query('SELECT id, due_date, outstanding_amount FROM invoices WHERE status = $1', ['overdue']);
  const updates = [] as Array<Record<string, unknown>>;

  for (const invoice of overdueInvoices.rows) {
    const dueDate = new Date(invoice.due_date);
    const now = new Date();
    const daysOverdue = Math.max(0, Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
    if (daysOverdue <= 0) continue;

    const penaltyAmount = Number(((invoice.outstanding_amount * config.penaltyRatePercent) / 100 * daysOverdue).toFixed(2));
    await pool.query(
      'INSERT INTO invoice_penalties (invoice_id, penalty_amount, details) VALUES ($1, $2, $3)',
      [invoice.id, penaltyAmount, { daysOverdue, ratePercent: config.penaltyRatePercent }]
    );

    updates.push({ invoiceId: invoice.id, penaltyAmount, daysOverdue });
  }

  return updates;
}
