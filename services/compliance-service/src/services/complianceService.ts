import { pool } from '../db';
import { ComplianceOnboardPayload, DocumentType, ApprovalActionPayload } from '../types';
import { verifyWithProvider } from './verificationProvider';

function panValid(pan: string) {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase());
}

function gstValid(gstin: string) {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin.toUpperCase());
}

function ifscValid(ifsc: string) {
  return /^[A-Z]{4}0[0-9A-Z]{6}$/.test(ifsc.toUpperCase());
}

export async function onboardEntity(payload: ComplianceOnboardPayload) {
  if (!panValid(payload.pan)) throw new Error('PAN validation failed');
  if (!gstValid(payload.gstin)) throw new Error('GSTIN validation failed');
  if (!ifscValid(payload.ifsc)) throw new Error('IFSC validation failed');

  const result = await pool.query(
    `INSERT INTO compliance_entities (dealer_id, name, email, phone, pan, gstin, bank_account, ifsc, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [payload.dealerId, payload.name, payload.email, payload.phone, payload.pan.toUpperCase(), payload.gstin.toUpperCase(), payload.bankAccount, payload.ifsc.toUpperCase(), payload.metadata || {}]
  );
  await recordAudit(result.rows[0].id, payload.dealerId, 'onboard', { payload });
  return result.rows[0];
}

export async function getEntity(entityId: string) {
  const result = await pool.query('SELECT * FROM compliance_entities WHERE id = $1', [entityId]);
  return result.rows[0];
}

export async function recordAudit(entityId: string, userId: string, action: string, details: Record<string, unknown>) {
  await pool.query('INSERT INTO compliance_audit_logs (entity_id, user_id, action, details) VALUES ($1, $2, $3, $4)', [entityId, userId, action, details]);
}

export async function verifyPan(entityId: string) {
  const entity = await getEntity(entityId);
  if (!entity) throw new Error('Entity not found');
  const providerResult = await verifyWithProvider('pan', { pan: entity.pan, name: entity.name });
  const valid = providerResult ? providerResult.valid : panValid(entity.pan);
  const status = valid ? 'verified' : 'rejected';
  await pool.query('UPDATE compliance_entities SET status = $1, updated_at = now() WHERE id = $2', [status, entityId]);
  await recordAudit(entityId, entity.dealer_id, 'pan_verification', { valid, providerReference: providerResult?.reference, reason: providerResult?.reason });
  return { entityId, pan: entity.pan, valid, providerReference: providerResult?.reference };
}

export async function verifyGst(entityId: string) {
  const entity = await getEntity(entityId);
  if (!entity) throw new Error('Entity not found');
  const providerResult = await verifyWithProvider('gst', { gstin: entity.gstin, pan: entity.pan, name: entity.name });
  const valid = providerResult ? providerResult.valid : gstValid(entity.gstin) && entity.gstin.slice(2, 12) === entity.pan;
  const status = valid ? 'verified' : 'rejected';
  await pool.query('UPDATE compliance_entities SET status = $1, updated_at = now() WHERE id = $2', [status, entityId]);
  await recordAudit(entityId, entity.dealer_id, 'gst_verification', { valid, providerReference: providerResult?.reference, reason: providerResult?.reason });
  return { entityId, gstin: entity.gstin, valid, providerReference: providerResult?.reference };
}

export async function verifyBankAccount(entityId: string) {
  const entity = await getEntity(entityId);
  if (!entity) throw new Error('Entity not found');
  const providerResult = await verifyWithProvider('bank', { accountNumber: entity.bank_account, ifsc: entity.ifsc, name: entity.name });
  const valid = providerResult ? providerResult.valid : ifscValid(entity.ifsc) && entity.bank_account.length >= 9;
  const status = valid ? 'verified' : 'rejected';
  await pool.query('UPDATE compliance_entities SET status = $1, updated_at = now() WHERE id = $2', [status, entityId]);
  await recordAudit(entityId, entity.dealer_id, 'bank_verification', { valid, providerReference: providerResult?.reference, reason: providerResult?.reason });
  return { entityId, bankAccount: entity.bank_account, valid, providerReference: providerResult?.reference };
}

export async function uploadDocument(entityId: string, docType: DocumentType, filename: string, path: string, metadata: Record<string, unknown>) {
  const entity = await getEntity(entityId);
  if (!entity) throw new Error('Entity not found');
  const result = await pool.query(
    `INSERT INTO compliance_documents (entity_id, doc_type, filename, path, metadata)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [entityId, docType, filename, path, metadata || {}]
  );
  await recordAudit(entityId, entity.dealer_id, 'upload_document', { docType, filename });
  return result.rows[0];
}

export async function listDocuments(entityId: string) {
  const result = await pool.query('SELECT * FROM compliance_documents WHERE entity_id = $1 ORDER BY uploaded_at DESC', [entityId]);
  return result.rows;
}

export async function categorizeRisk(entityId: string) {
  const entity = await getEntity(entityId);
  if (!entity) throw new Error('Entity not found');

  let category: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (entity.status === 'rejected') category = 'critical';
  else if (entity.status === 'manual_review') category = 'high';
  else if (!entity.email || !entity.phone) category = 'medium';

  const documents = await listDocuments(entityId);
  if (documents.length < 3) category = 'medium';

  await pool.query('UPDATE compliance_entities SET risk_category = $1, updated_at = now() WHERE id = $2', [category, entityId]);
  await recordAudit(entityId, entity.dealer_id, 'risk_categorization', { riskCategory: category });
  return { entityId, riskCategory: category };
}

export async function submitApproval(entityId: string, payload: ApprovalActionPayload) {
  const entity = await getEntity(entityId);
  if (!entity) throw new Error('Entity not found');
  const status = payload.action === 'approve' ? 'approved' : payload.action === 'reject' ? 'rejected' : 'manual_review';
  await pool.query('UPDATE compliance_entities SET status = $1, updated_at = now() WHERE id = $2', [status, entityId]);
  const result = await pool.query(
    `INSERT INTO compliance_approvals (entity_id, reviewer_id, action, notes) VALUES ($1, $2, $3, $4) RETURNING *`,
    [entityId, payload.reviewerId, payload.action, payload.notes || null]
  );
  await recordAudit(entityId, payload.reviewerId, 'approval_action', { action: payload.action, notes: payload.notes });
  return result.rows[0];
}

export async function getPendingApprovals() {
  const result = await pool.query(`
    SELECT a.*, e.dealer_id, e.name, e.status FROM compliance_approvals a
    JOIN compliance_entities e ON e.id = a.entity_id
    WHERE a.action = 'request_more_info' OR e.status = 'pending' OR e.status = 'manual_review'
    ORDER BY a.created_at DESC
  `);
  return result.rows;
}

export async function getAuditTrail(entityId: string) {
  const result = await pool.query('SELECT * FROM compliance_audit_logs WHERE entity_id = $1 ORDER BY created_at DESC', [entityId]);
  return result.rows;
}
