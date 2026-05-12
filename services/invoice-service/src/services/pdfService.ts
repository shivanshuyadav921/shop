import PDFDocument from 'pdfkit';

export function createInvoicePdf(invoice: any, dealer: any, payments: any[]) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks: Uint8Array[] = [];

  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  doc.fontSize(18).text('Invoice Financing Statement', { align: 'center' });
  doc.moveDown();

  doc.fontSize(12).text(`Dealer: ${dealer.name}`);
  doc.text(`Email: ${dealer.email ?? 'N/A'}`);
  doc.text(`Phone: ${dealer.phone ?? 'N/A'}`);
  doc.text(`GSTIN: ${dealer.gstin ?? 'N/A'}`);
  doc.moveDown();

  doc.text(`Invoice Number: ${invoice.invoice_number}`);
  doc.text(`Issue Date: ${invoice.issue_date}`);
  doc.text(`Due Date: ${invoice.due_date}`);
  doc.text(`Amount: ₹${Number(invoice.amount).toFixed(2)}`);
  doc.text(`GST Rate: ${Number(invoice.gst_rate)}%`);
  doc.text(`GST Amount: ₹${Number(invoice.gst_amount).toFixed(2)}`);
  doc.text(`Total: ₹${Number(invoice.total_amount).toFixed(2)}`);
  doc.text(`Outstanding: ₹${Number(invoice.outstanding_amount).toFixed(2)}`);
  doc.text(`Status: ${invoice.status}`);
  doc.moveDown();

  doc.text('Payments', { underline: true });
  if (payments.length === 0) {
    doc.text('No payments recorded yet.');
  } else {
    payments.forEach((payment) => {
      doc.text(`- ${payment.paid_at}: ₹${Number(payment.amount).toFixed(2)} (${payment.payment_method})`);
    });
  }

  doc.end();
  return Buffer.concat(chunks);
}

export function createDealerStatementPdf(dealer: any, invoices: any[], payments: any[]) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks: Uint8Array[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  doc.fontSize(18).text('Dealer Credit Statement', { align: 'center' });
  doc.moveDown();

  doc.fontSize(12).text(`Dealer: ${dealer.name}`);
  doc.text(`Credit Limit: ₹${Number(dealer.credit_limit).toFixed(2)}`);
  doc.text(`Outstanding: ₹${Number(dealer.current_outstanding).toFixed(2)}`);
  doc.text(`Credit Score: ${dealer.credit_score}`);
  doc.moveDown();

  doc.text('Invoices', { underline: true });
  invoices.forEach((invoice) => {
    doc.text(`- ${invoice.invoice_number} | Due: ${invoice.due_date} | Outstanding: ₹${Number(invoice.outstanding_amount).toFixed(2)} | Status: ${invoice.status}`);
  });

  doc.moveDown();
  doc.text('Payments', { underline: true });
  payments.forEach((payment) => {
    doc.text(`- ${payment.paid_at}: ₹${Number(payment.amount).toFixed(2)} | Invoice: ${payment.invoice_id}`);
  });

  doc.end();
  return Buffer.concat(chunks);
}
