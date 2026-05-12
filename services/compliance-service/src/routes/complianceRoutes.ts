import express from 'express';
import multer from 'multer';
import {
  onboardEntity,
  getEntity,
  verifyPan,
  verifyGst,
  verifyBankAccount,
  uploadDocument,
  listDocuments,
  categorizeRisk,
  submitApproval,
  getPendingApprovals,
  getAuditTrail,
} from '../services/complianceService';
import { storeDocument, ensureUploadPath } from '../services/storageService';

const router = express.Router();
const upload = multer({
  dest: './tmp/uploads',
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.post('/compliance/onboard', async (req, res) => {
  try {
    const entity = await onboardEntity(req.body);
    res.status(201).json(entity);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Onboarding failed' });
  }
});

router.get('/compliance/:id', async (req, res) => {
  try {
    const entity = await getEntity(req.params.id);
    if (!entity) return res.status(404).json({ error: 'Entity not found' });
    res.json(entity);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch entity' });
  }
});

router.post('/compliance/:id/pan-verify', async (req, res) => {
  try {
    const result = await verifyPan(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'PAN verification failed' });
  }
});

router.post('/compliance/:id/gst-verify', async (req, res) => {
  try {
    const result = await verifyGst(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'GST verification failed' });
  }
});

router.post('/compliance/:id/bank-verify', async (req, res) => {
  try {
    const result = await verifyBankAccount(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Bank verification failed' });
  }
});

router.post('/compliance/:id/documents', upload.single('document'), async (req, res) => {
  try {
    const file = req.file;
    const entityId = req.params.id;
    if (!file) return res.status(400).json({ error: 'Missing document file' });
    await ensureUploadPath();
    const path = await storeDocument(file);
    const doc = await uploadDocument(entityId, req.body.docType, file.originalname, path, req.body.metadata ? JSON.parse(req.body.metadata) : {});
    res.status(201).json(doc);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Document upload failed' });
  }
});

router.get('/compliance/:id/documents', async (req, res) => {
  try {
    const documents = await listDocuments(req.params.id);
    res.json(documents);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list documents' });
  }
});

router.post('/compliance/:id/risk-categorize', async (req, res) => {
  try {
    const result = await categorizeRisk(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Risk categorization failed' });
  }
});

router.get('/compliance/approvals/pending', async (_req, res) => {
  try {
    const approvals = await getPendingApprovals();
    res.json(approvals);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch approvals' });
  }
});

router.post('/compliance/:id/approvals', async (req, res) => {
  try {
    const approval = await submitApproval(req.params.id, req.body);
    res.status(201).json(approval);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Approval action failed' });
  }
});

router.get('/compliance/:id/audit', async (req, res) => {
  try {
    const auditTrail = await getAuditTrail(req.params.id);
    res.json(auditTrail);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch audit trail' });
  }
});

export default router;
