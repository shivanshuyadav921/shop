export type ComplianceStatus = 'pending' | 'verified' | 'manual_review' | 'rejected' | 'approved';
export type RiskCategory = 'low' | 'medium' | 'high' | 'critical';
export type DocumentType = 'pan_card' | 'gst_certificate' | 'bank_statement' | 'id_proof' | 'address_proof';

export interface ComplianceOnboardPayload {
  dealerId: string;
  name: string;
  email: string;
  phone: string;
  pan: string;
  gstin: string;
  bankAccount: string;
  ifsc: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovalActionPayload {
  reviewerId: string;
  action: 'approve' | 'reject' | 'request_more_info';
  notes?: string;
}

export interface DocumentUploadPayload {
  entityId: string;
  docType: DocumentType;
  metadata?: Record<string, unknown>;
}
