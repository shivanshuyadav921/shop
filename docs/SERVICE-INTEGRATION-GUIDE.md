# Service Integration Guide

## Overview

This guide explains how to integrate enterprise libraries into each service. All services follow the same pattern:

1. **Import libraries**
2. **Initialize at startup**
3. **Use in middleware**
4. **Emit telemetry**

## Payment Service Integration

### Installation
```bash
npm install -w services/payment-service \
  @shop/crypto-vault \
  @shop/distributed-transactions \
  @shop/ledger-core \
  @shop/fraud-detection \
  @shop/compliance-engine
```

### Initialization (index.ts)
```typescript
import HSMClient from '@shop/crypto-vault/hsm-client';
import PaymentTokenizer from '@shop/crypto-vault/tokenizer';
import SagaOrchestrator from '@shop/distributed-transactions/saga-orchestrator';
import IdempotencyManager from '@shop/distributed-transactions/idempotency-manager';
import CircuitBreaker from '@shop/distributed-transactions/circuit-breaker';
import DistributedLock from '@shop/distributed-transactions/distributed-lock';
import ImmutableLedger from '@shop/ledger-core/immutable-ledger';
import RiskScorer from '@shop/fraud-detection/risk-scorer';
import KYCManager from '@shop/compliance-engine/kyc-manager';
import AMLChecker from '@shop/compliance-engine/aml-checker';
import AuditVault, { AuditAction } from '@shop/compliance-engine/audit-vault';

// Initialize all components
const hsmClient = new HSMClient(process.env.AWS_REGION);
const tokenizer = new PaymentTokenizer(process.env.ENCRYPTION_KEY_HEX);
const saga = new SagaOrchestrator(pgClient, pgBossQueue, logger);
const idempotency = new IdempotencyManager(86400);
const circuitBreaker = new CircuitBreaker({...});
const lock = new DistributedLock(redisClient);
const ledger = new ImmutableLedger(logger);
const riskScorer = new RiskScorer(logger);
const kyc = new KYCManager(logger);
const aml = new AMLChecker(logger);
const audit = new AuditVault(logger);
```

### Request Pipeline

```typescript
app.post('/api/v1/payments', async (req, res) => {
  // 1. Idempotency - Exactly-once processing
  const idempotencyKey = req.get('Idempotency-Key');
  const isDuplicate = await idempotency.checkIdempotency(idempotencyKey, req.body);
  if (isDuplicate) {
    return res.json(cached_result);
  }

  // 2. Fraud Detection - Risk scoring
  const riskScore = await riskScorer.calculateRiskScore(paymentId, fraudSignals);
  if (riskScore.recommendation === 'BLOCK') {
    return res.status(403).json({ error: 'Blocked' });
  }

  // 3. Compliance - KYC/AML checks
  if (!kyc.isVerified(customerId)) {
    return res.status(403).json({ error: 'Not verified' });
  }
  const amlResult = aml.checkTransaction(customerId, amount);
  if (amlResult.blocked) {
    return res.status(403).json({ error: 'AML block' });
  }

  // 4. Tokenization - Secure card handling
  const token = await tokenizer.tokenizeCard(cardNumber, expiry);

  // 5. Distributed Lock - Prevent race conditions
  const lockId = await lock.acquireLock(`payment:${customerId}`);

  try {
    // 6. Saga - Orchestrate multi-step transaction
    const saga = new SagaOrchestrator([
      { service: 'auth', operation: 'verifyCustomer' },
      { service: 'tokenizer', operation: 'createToken' },
      { service: 'processor', operation: 'processPayment' },
      { service: 'ledger', operation: 'postEntries' },
      { service: 'settlement', operation: 'settle' },
    ]);
    const result = await saga.execute();

    // 7. Ledger - Record double-entry
    const debit = ledger.postEntry('DEBIT', merchantAccount, amount);
    const credit = ledger.postEntry('CREDIT', customerAccount, amount);

    // 8. Audit - Log action
    audit.recordAction(
      AuditAction.TRANSACTION_COMPLETED,
      customerId,
      'payment-service',
      'payment',
      paymentId,
      { amount, merchant: merchantId }
    );

    // 9. Record success
    idempotency.recordSuccess(idempotencyKey, result);
    res.json(result);
  } catch (error) {
    idempotency.recordFailure(idempotencyKey, error);
    throw error;
  } finally {
    await lock.releaseLock(lockId, `payment:${customerId}`);
  }
});
```

## Auth Service Integration

### Libraries Needed
```bash
npm install -w services/auth-service \
  @shop/crypto-vault \
  @shop/compliance-engine
```

### Usage
```typescript
import ZeroTrustAuth from '@shop/crypto-vault/zero-trust-auth';
import KYCManager from '@shop/compliance-engine/kyc-manager';
import AuditVault, { AuditAction } from '@shop/compliance-engine/audit-vault';

// Device verification
const deviceAuth = new ZeroTrustAuth(logger);
const isDeviceTrusted = deviceAuth.verifyDeviceCertificate(deviceCert);

// KYC on signup
const kyc = new KYCManager(logger);
kyc.createProfile(customerId, 'BASIC');

// Audit logging
const audit = new AuditVault(logger);
audit.recordAction(AuditAction.USER_CREATED, userId, 'auth-service', ...);
```

## Ledger Service Integration

### Libraries Needed
```bash
npm install -w services/ledger-service \
  @shop/ledger-core \
  @shop/compliance-engine
```

### Usage
```typescript
import ImmutableLedger from '@shop/ledger-core/immutable-ledger';
import DoubleEntry from '@shop/ledger-core/double-entry';
import Reconciler from '@shop/ledger-core/reconciler';

// Ledger operations
const ledger = new ImmutableLedger(logger);
const entry = ledger.postEntry('DEBIT', account, amount, transactionId);

// Double-entry verification
const chart = new DoubleEntry();
const isSane = chart.verifyTransaction(debitEntries, creditEntries);

// Daily reconciliation
const reconciler = new Reconciler();
await reconciler.reconcile(date);
```

## Fraud Service Integration

### Libraries Needed
```bash
npm install -w services/fraud-service \
  @shop/fraud-detection \
  @shop/compliance-engine
```

### Usage
```typescript
import DeviceFingerprinter from '@shop/fraud-detection/device-fingerprint';
import BehaviorAnalyzer from '@shop/fraud-detection/behavior-analyzer';
import RiskScorer from '@shop/fraud-detection/risk-scorer';
import FraudGraph from '@shop/fraud-detection/fraud-graph';

const fingerprinter = new DeviceFingerprinter(logger);
const analyzer = new BehaviorAnalyzer(logger);
const scorer = new RiskScorer(logger);
const graph = new FraudGraph(logger);

// Pre-payment analysis
app.post('/api/v1/payments/:id/fraud-check', async (req, res) => {
  const fingerprint = fingerprinter.identifyDevice(customerId, deviceData);
  const behavior = analyzer.analyzeTransaction(customerId, txn);
  const riskScore = scorer.calculateRiskScore(paymentId, {
    deviceRisk: fingerprint.riskScore,
    behavioralRisk: behavior.riskFlags.severity,
    // ... other signals
  });

  // Ring fraud detection
  const clusters = graph.detectClusters(customerId);
  
  res.json({ riskScore, clusters });
});
```

## Compliance Service Integration

### Libraries Needed
```bash
npm install -w services/compliance-service \
  @shop/compliance-engine
```

### Usage
```typescript
import KYCManager from '@shop/compliance-engine/kyc-manager';
import AMLChecker from '@shop/compliance-engine/aml-checker';
import AuditVault, { AuditAction } from '@shop/compliance-engine/audit-vault';
import ConsentManager from '@shop/compliance-engine/consent-manager';
import RetentionPolicy from '@shop/compliance-engine/retention-policy';

const kyc = new KYCManager(logger);
const aml = new AMLChecker(logger);
const audit = new AuditVault(logger);
const consent = new ConsentManager(logger);
const retention = new RetentionPolicy(logger);

// KYC verification workflow
app.post('/api/v1/kyc/:customerId', async (req, res) => {
  kyc.createProfile(customerId, 'STANDARD');
  kyc.verifyIdentity(customerId, req.body.documents);
  audit.recordAction(AuditAction.KYC_CHECK, customerId, 'compliance-service', ...);
});

// AML monitoring
app.post('/api/v1/aml-check', async (req, res) => {
  const result = await aml.checkTransaction(customerId, amount, merchant);
  if (result.blocked) {
    audit.recordAction(AuditAction.COMPLIANCE_CHECK_FAILED, ...);
  }
});

// Data retention
retention.scheduleDelete(customerId, 'GDPR'); // 7-year retention
```

## Middleware Pattern

Every service should include this middleware:

```typescript
// Distributed tracing
app.use(setupOpenTelemetry);

// Audit logging
app.use((req, res, next) => {
  audit.recordAction(
    AuditAction.API_CALL,
    req.userId || 'anonymous',
    'service-name',
    'api',
    `${req.method} ${req.path}`
  );
  next();
});

// Error handling with audit
app.use((error, req, res, next) => {
  audit.recordAction(
    AuditAction.ERROR_OCCURRED,
    req.userId,
    'service-name',
    'error',
    error.message
  );
  logger.error('Unhandled error', error);
  res.status(500).json({ error: 'Internal server error' });
});
```

## Common Patterns

### Saga Pattern Usage
```typescript
const paymentSaga = new SagaOrchestrator([
  {
    name: 'verify_kyc',
    action: () => kyc.verify(customerId),
    compensation: () => { /* no-op */ }
  },
  {
    name: 'tokenize_card',
    action: () => tokenizer.tokenize(cardNumber),
    compensation: () => tokenizer.revoke(token)
  },
  {
    name: 'process_payment',
    action: () => processor.process(token, amount),
    compensation: () => processor.refund(paymentId)
  },
  {
    name: 'post_ledger',
    action: () => ledger.post(debitEntry, creditEntry),
    compensation: () => ledger.reverse(debitEntry, creditEntry)
  }
]);

try {
  const result = await paymentSaga.execute();
} catch (error) {
  // Saga automatically rolls back all completed steps
  logger.error('Saga failed, compensation triggered', error);
}
```

### Idempotency Pattern
```typescript
app.post('/api/v1/action', async (req, res) => {
  const idempotencyKey = req.get('Idempotency-Key');
  
  // Check if already processed
  const existing = await idempotency.get(idempotencyKey);
  if (existing) {
    return res.json(existing);
  }
  
  try {
    const result = await performAction(req.body);
    // Store result for future identical requests
    await idempotency.set(idempotencyKey, result);
    res.json(result);
  } catch (error) {
    // Store error for future identical requests
    await idempotency.setError(idempotencyKey, error);
    throw error;
  }
});
```

### Circuit Breaker Pattern
```typescript
const externalAPICircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
});

try {
  const result = await externalAPICircuitBreaker.execute(
    () => externalAPI.call()
  );
} catch (error) {
  if (error.circuit === 'open') {
    // Use fallback strategy
    return getFallbackResult();
  }
  throw error;
}
```

## Testing Integration

All tests should verify library integration:

```typescript
describe('Payment Service with Libraries', () => {
  it('should use fraud detection', async () => {
    const response = await request(app)
      .post('/api/v1/payments')
      .send({...paymentData});
    
    expect(response.body).toHaveProperty('riskScore');
  });

  it('should verify KYC', async () => {
    // Customer not verified
    let response = await request(app)
      .post('/api/v1/payments')
      .send({...paymentData});
    
    expect(response.status).toBe(403);
    
    // After KYC verification
    await kyc.verify(customerId);
    response = await request(app)
      .post('/api/v1/payments')
      .send({...paymentData});
    
    expect(response.status).toBe(201);
  });

  it('should ensure idempotency', async () => {
    const key = 'test-idempotency-key';
    
    const response1 = await request(app)
      .post('/api/v1/payments')
      .set('Idempotency-Key', key)
      .send({...paymentData});
    
    const response2 = await request(app)
      .post('/api/v1/payments')
      .set('Idempotency-Key', key)
      .send({...paymentData});
    
    expect(response1.body.paymentId).toBe(response2.body.paymentId);
  });
});
```

