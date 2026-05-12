import express from 'express';
import {
  createDealer,
  getDealer,
  updateDealerCreditLimit,
  createInvoice,
  getInvoice,
  recordPayment,
  financeInvoice,
  getDealerStatement,
  calculateCreditScore,
  runAutoReminders,
  calculatePenaltyForOverdue,
} from '../services/invoiceService';
import { createInvoicePdf, createDealerStatementPdf } from '../services/pdfService';
import { sendEmail, sendSms } from '../services/notificationService';
import { pool } from '../db';

const router = express.Router();

router.post('/dealers', async (req, res) => {
  try {
    const dealer = await createDealer(req.body);
    res.status(201).json(dealer);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create dealer' });
  }
});

router.get('/dealers/:id', async (req, res) => {
  try {
    const dealer = await getDealer(req.params.id);
    if (!dealer) return res.status(404).json({ error: 'Dealer not found' });
    res.json(dealer);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch dealer' });
  }
});

router.put('/dealers/:id/credit-limit', async (req, res) => {
  try {
    const dealer = await updateDealerCreditLimit(req.params.id, req.body.creditLimit);
    res.json(dealer);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update credit limit' });
  }
});

router.post('/invoices', async (req, res) => {
  try {
    const invoice = await createInvoice(req.body);
    res.status(201).json(invoice);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create invoice' });
  }
});

router.get('/invoices/:id', async (req, res) => {
  try {
    const invoice = await getInvoice(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch invoice' });
  }
});

router.post('/invoices/:id/payments', async (req, res) => {
  try {
    const payment = await recordPayment({ invoiceId: req.params.id, ...req.body });
    res.status(201).json(payment);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to capture payment' });
  }
});

router.post('/invoices/:id/finance', async (req, res) => {
  try {
    const financing = await financeInvoice({ invoiceId: req.params.id, ...req.body });
    res.status(200).json(financing);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to finance invoice' });
  }
});

router.get('/invoices/:id/pdf', async (req, res) => {
  try {
    const invoice = await getInvoice(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const dealer = await getDealer(invoice.dealer_id);
    const paymentsResult = await pool.query('SELECT * FROM invoice_payments WHERE invoice_id = $1 ORDER BY paid_at DESC', [req.params.id]);
    const buffer = createInvoicePdf(invoice, dealer, paymentsResult.rows);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate invoice PDF' });
  }
});

router.get('/dealers/:id/statement', async (req, res) => {
  try {
    const dealer = await getDealer(req.params.id);
    if (!dealer) return res.status(404).json({ error: 'Dealer not found' });
    const statement = await getDealerStatement(req.params.id, req.query as any);
    const buffer = createDealerStatementPdf(dealer, statement.invoices, statement.payments);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate dealer statement' });
  }
});

router.post('/dealers/:id/score', async (req, res) => {
  try {
    const dealer = await calculateCreditScore(req.params.id);
    res.json(dealer);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to calculate credit score' });
  }
});

router.post('/reminders/run', async (req, res) => {
  try {
    const reminders = await runAutoReminders();
    for (const reminder of reminders) {
      const payload = reminder.payload as { message?: string; email?: string; phone?: string };
      if (reminder.channel === 'email') {
        await sendEmail(payload.email ?? '', 'Invoice Reminder', payload.message ?? 'Invoice reminder');
      } else {
        await sendSms(payload.phone ?? '', payload.message ?? 'Invoice reminder');
      }
    }
    res.json({ remindersSent: reminders.length });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to run reminders' });
  }
});

router.post('/penalties/calculate', async (req, res) => {
  try {
    const penalties = await calculatePenaltyForOverdue();
    res.json({ penalties });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to calculate penalties' });
  }
});

export default router;
