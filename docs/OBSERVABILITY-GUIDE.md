# Service Observability & Instrumentation Guide

## Overview

All services must emit comprehensive telemetry for effective operations. This guide defines the standards.

## Metrics

### Standard Metrics (All Services)

Every service exposes these metrics on port 9090 at `/metrics`:

```typescript
// Request metrics
http_request_total[labels: method, path, status]
http_request_duration_seconds[histogram: buckets 0.01, 0.05, 0.1, 0.5, 1, 5]
http_request_size_bytes[histogram: buckets 100, 1000, 10000, 100000]
http_response_size_bytes[histogram]

// Error metrics
http_errors_total[labels: method, path, error_type]
exceptions_total[labels: type, service]
circuit_breaker_state[labels: name, state]

// Business metrics
transactions_processed_total[labels: type, status]
transaction_duration_seconds[histogram: buckets]
business_revenue_total[counter, labels: currency]

// System metrics
nodejs_heap_size_bytes[gauge]
nodejs_gc_duration_seconds[histogram]
process_cpu_seconds_total[counter]
process_resident_memory_bytes[gauge]

// Custom metrics
idempotency_cache_hits_total[counter]
distributed_lock_acquisitions_total[counter, labels: outcome]
circuit_breaker_transitions_total[counter, labels: to_state]
```

### Payment Service Specific Metrics

```typescript
payment_processing_total[counter: status]
payment_processing_duration_seconds[histogram]
payment_amount_processed_total[counter: currency]
tokenization_operations_total[counter: status]
fraud_risk_scores[histogram: buckets 0, 25, 50, 75, 100]
fraud_blocks_total[counter: reason]
external_provider_calls_total[counter: provider, status]
ledger_entries_posted_total[counter: type]
```

## Logging

### Log Levels
- **ERROR:** Service failures, exceptions, corruption
- **WARN:** Degraded service, retry attempts, unusual patterns
- **INFO:** Normal operations, transaction summaries, state changes
- **DEBUG:** Function entry/exit, variable values (dev only)

### Structured Logging Format

```json
{
  "level": "info",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "service": "payment-service",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "span_id": "f9d5e7c6b3a2e1f0",
  "message": "Payment processed successfully",
  "fields": {
    "payment_id": "PAY-123456",
    "amount": 99.99,
    "currency": "USD",
    "status": "COMPLETED",
    "duration_ms": 245,
    "merchant_id": "MER-789",
    "customer_id": "CUST-456"
  }
}
```

### Critical Events (Always Log)

```typescript
// In payment-service
logger.info('payment.initiated', { paymentId, amount, customerId, merchantId });
logger.info('fraud.scored', { paymentId, riskScore, recommendation });
logger.info('payment.approved', { paymentId, status, ledgerRef });
logger.error('payment.failed', { paymentId, reason, error });

// In ledger-service
logger.info('ledger.reconciliation.started', { date, accounts: count });
logger.info('ledger.reconciliation.completed', { matched, unmatched, status });
logger.error('ledger.reconciliation.failed', { date, reason });

// In fraud-service
logger.warn('fraud.alert.high_risk', { paymentId, riskScore, threshold });
logger.info('fraud.graph.cluster_detected', { cluster_id, nodes: count, suspected_fraud_type });

// In compliance-service
logger.info('kyc.verification.updated', { customerId, oldStatus, newStatus });
logger.warn('aml.alert.generated', { customerId, alertType, severity });
```

## Distributed Tracing

### Span Attributes

All spans include:

```typescript
span.setAttributes({
  'service.name': 'payment-service',
  'service.version': '1.0.0',
  'deployment.environment': 'production',
  'http.method': req.method,
  'http.status_code': res.statusCode,
  'db.system': 'postgresql',
  'db.statement': sanitized_query,
  'http.client_ip': req.ip,
});
```

### Critical Trace Paths

**Payment Processing Path:**
```
1. payment-api:receive
   → fraud-detection:score
   → compliance:kyc-check
   → compliance:aml-check
   → payment-processor:tokenize
   → settlement:post
   → ledger:record
   → payment-api:respond
```

**Reconciliation Path:**
```
1. scheduler:trigger
   → reconciliation:start
   → ledger:verify-integrity
   → bank-api:fetch-statements
   → reconciliation:match
   → settlement:adjust
   → reconciliation:complete
```

## Alerting

### Alert Severity Levels

| Level | Response SLA | Examples |
|-------|--------------|----------|
| P0 (Critical) | 15 minutes | Payment failures >5%, Data corruption, Security breach |
| P1 (High) | 1 hour | Circuit breaker open, High fraud rate, KYC backlog |
| P2 (Medium) | 4 hours | High latency (>1s), Memory leak, Replication lag |
| P3 (Low) | 24 hours | Cache miss rate, Unused features, Minor bugs |

### Alert Rules

```yaml
# Payment alerts
- alert: PaymentFailureRate
  expr: rate(payment_failures_total[5m]) / (rate(payment_failures_total[5m]) + rate(payment_successes_total[5m])) > 0.05
  for: 5m
  severity: critical

- alert: PaymentLatencyP95
  expr: histogram_quantile(0.95, payment_processing_duration_seconds_bucket[5m]) > 1
  for: 5m
  severity: warning

# Ledger alerts
- alert: LedgerReconciliationFailed
  expr: increase(ledger_reconciliation_failures_total[1d]) > 0
  for: 1m
  severity: critical

- alert: LedgerUnbalanced
  expr: ledger_accounting_unbalanced > 0
  for: 1m
  severity: critical

# Fraud alerts
- alert: HighFraudRate
  expr: rate(fraud_alerts_high_total[5m]) > 10
  for: 2m
  severity: critical

- alert: FraudGraphAnomaly
  expr: increase(fraud_graph_clusters_detected[5m]) > 0
  for: 1m
  severity: warning

# Infrastructure alerts
- alert: CircuitBreakerOpen
  expr: circuit_breaker_state{state="OPEN"} > 0
  for: 1m
  severity: warning

- alert: HighMemoryUsage
  expr: process_resident_memory_bytes / 2147483648 > 0.85
  for: 5m
  severity: warning
```

## Dashboards

### Primary Dashboard (payment-service)
- Payment success/failure rate
- P50/P95/P99 latency
- Payment amount distribution
- Error rate by type
- Circuit breaker states
- Resource utilization (CPU, memory, connections)

### Ledger Dashboard (ledger-service)
- Reconciliation status
- Trial balance verification
- Unmatched transactions
- Reversal rate
- Audit trail size

### Fraud Dashboard (fraud-service)
- Risk score distribution
- Block rate by type
- Device fingerprint coverage
- Fraud graph clusters detected
- False positive rate

### Compliance Dashboard (compliance-service)
- KYC verification status
- AML alert backlog
- Consent compliance
- Data retention policies status
- Audit log volume

## Health Checks

### Startup Probe
```typescript
app.get('/startup', async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    hsm: await checkHSM(),
    config: await validateConfiguration(),
  };
  
  const healthy = Object.values(checks).every(c => c.status === 'ok');
  res.status(healthy ? 200 : 503).json({ healthy, checks });
});
```

### Readiness Probe
```typescript
app.get('/ready', async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    ledger: await checkLedgerIntegrity(),
    circuitBreaker: circuitBreaker.getState() !== 'OPEN',
  };
  
  const ready = Object.values(checks).every(c => c.status === 'ok');
  res.status(ready ? 200 : 503).json({ ready, checks });
});
```

### Liveness Probe
```typescript
app.get('/live', (req, res) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  const healthy = uptime > 30 && memoryUsage.heapUsed < 2147483648; // 2GB
  res.status(healthy ? 200 : 503).json({ 
    healthy, 
    uptime, 
    memory: memoryUsage 
  });
});
```

## SLOs & SLIs

### Payment Service SLOs
- **Availability:** 99.99% (4.38 mins downtime/month)
- **Latency:** P95 < 500ms
- **Error Rate:** < 0.1%
- **Fraud Detection Accuracy:** > 95%

### SLI Implementation
```typescript
// Track SLI metrics
const sliMetrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  latencyHistogram: new Histogram(),
};

app.use((req, res) => {
  const start = Date.now();
  const originalSend = res.send;
  
  res.send = function(data) {
    const duration = Date.now() - start;
    const success = res.statusCode < 400;
    
    sliMetrics.totalRequests++;
    if (success) sliMetrics.successfulRequests++;
    else sliMetrics.failedRequests++;
    sliMetrics.latencyHistogram.record(duration);
    
    return originalSend.call(this, data);
  };
});
```

## Troubleshooting Guide

### High Latency (P95 > 500ms)
1. Check query performance: `EXPLAIN ANALYZE` on slow queries
2. Check connection pool exhaustion: `SELECT COUNT(*) FROM pg_stat_activity`
3. Check lock contention: `SELECT pid, relation::regclass, mode FROM pg_locks WHERE granted=false`
4. Increase replicas if CPU > 70%

### High Memory Usage (> 85%)
1. Check for memory leaks: `--inspect` flag on startup
2. Reduce cache sizes
3. Increase garbage collection frequency
4. Restart pods (temporary fix)

### Payment Processing Failures
1. Check external provider status
2. Review fraud scoring (false positives?)
3. Verify ledger is balanced
4. Check database connectivity

