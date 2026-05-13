# Incident Response Runbooks

## INC-001: High Payment Failure Rate (>5%)

### Detection
- Alert: `HighPaymentFailureRate` triggered
- Threshold: > 5% failures for > 5 minutes
- Severity: CRITICAL (P0)
- Response Time SLA: 15 minutes

### Root Cause Analysis

**Step 1: Identify failure pattern** (2 min)
```bash
# Get recent failures
kubectl logs -n shop-fintech deployment/payment-service --tail=100 | grep "ERROR"

# Check failure distribution
kubectl exec -n shop-fintech deployment/payment-service -- \
  curl -s http://localhost:9090/metrics | grep payment_failures

# Group by error type
kubectl logs deployment/payment-service -n shop-fintech | \
  grep "FAILED\|ERROR" | cut -d' ' -f5 | sort | uniq -c | sort -rn
```

**Step 2: Check external dependencies**
```bash
# Payment processor health
curl -s https://api.payment-processor.com/health

# Check circuit breaker state
kubectl exec deployment/payment-service -n shop-fintech -- \
  curl -s http://localhost:9090/metrics | grep circuit_breaker_state

# Check database connections
psql -c "SELECT count(*) FROM pg_stat_activity WHERE state='active';"
```

**Step 3: Review recent changes**
```bash
# Get deployment history
kubectl rollout history deployment/payment-service -n shop-fintech

# Check recent git commits
git log --oneline -20 | head -10

# Compare metric baselines (pre/post failure)
# Use Prometheus dashboards for visual comparison
```

### Remediation

**If external provider down:**
```bash
# Verify circuit breaker is open
kubectl exec deployment/payment-service -- \
  curl -s http://localhost:9090/metrics | grep "circuit_breaker_state{state=\"OPEN"

# Failover to backup provider
kubectl set env deployment/payment-service \
  PAYMENT_PROVIDER_PRIMARY=backup \
  -n shop-fintech

# Monitor recovery
watch kubectl logs deployment/payment-service -n shop-fintech -f | grep "failover\|success"
```

**If database slow:**
```bash
# Check query performance
psql -c "SELECT query, calls, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Kill long-running queries
psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE duration > 30;"

# Reset statistics
psql -c "SELECT pg_stat_statements_reset();"

# Increase connection pool if needed
kubectl set env deployment/payment-service \
  DB_POOL_SIZE=200 \
  -n shop-fintech
```

**If application memory leak:**
```bash
# Check memory usage
kubectl top pods -n shop-fintech | grep payment-service

# If > 90%, restart affected pods
kubectl rollout restart deployment/payment-service -n shop-fintech

# Monitor heap
kubectl exec deployment/payment-service -- \
  curl -s http://localhost:9090/metrics | grep nodejs_heap_size
```

### Communication
1. Notify #incidents channel
2. Update status page
3. Notify customers if duration > 10 min
4. Post-mortem within 24 hours

---

## INC-002: Ledger Reconciliation Failure

### Detection
- Alert: `LedgerReconciliationFailed` triggered
- Trigger: reconciliation_failures_total > 0
- Severity: CRITICAL (P0)
- Response Time SLA: 5 minutes

### Diagnosis

**Step 1: Identify discrepancy** (5 min)
```bash
# Get latest reconciliation report
kubectl exec deployment/ledger-service -n shop-fintech -- \
  npm run reconcile:report

# Check account balances
psql ledger_db -c "
  SELECT account_id, balance, expected_balance, discrepancy
  FROM account_reconciliation
  WHERE status = 'UNMATCHED'
  ORDER BY ABS(discrepancy) DESC;"

# Identify affected accounts
kubectl exec deployment/ledger-service -- \
  npm run reconcile:identify-affected --date=$(date -d '1 day ago' +%Y-%m-%d)
```

**Step 2: Check transaction logs**
```bash
# Get all transactions for affected account
psql ledger_db -c "
  SELECT id, debit, credit, status, created_at
  FROM transactions
  WHERE account_id = 'XXXX'
  ORDER BY created_at DESC
  LIMIT 100;"

# Verify hash chain integrity
kubectl exec deployment/ledger-service -- \
  npm run verify:hash-chain --account=XXXX
```

**Step 3: Review recent transactions**
```bash
# Find transactions around error time
psql ledger_db -c "
  SELECT * FROM transactions
  WHERE created_at > NOW() - INTERVAL '2 hours'
  ORDER BY created_at DESC
  LIMIT 50;"

# Check if any transactions lack corresponding entries
psql ledger_db -c "
  SELECT * FROM transactions
  WHERE status != 'POSTED'
  LIMIT 20;"
```

### Remediation

**If data corruption detected:**
```bash
# DO NOT DELETE - use reversals only
# Create reversing entry
psql ledger_db -c "
  INSERT INTO transactions (id, debit, credit, status, reason)
  VALUES ('REV-' || gen_random_uuid(), amount, 0, 'REVERSAL', 'Corruption correction');"

# Update reconciliation
kubectl exec deployment/ledger-service -- \
  npm run reconcile:correct --transaction=XXXX
```

**If transactions missing:**
```bash
# Recover from backup
bash infra/backups/disaster-recovery-restore.sh <BACKUP_ID>

# Or replay from event log
kubectl exec deployment/ledger-service -- \
  npm run replay:transactions --from=$(date -d '1 day ago' +%Y-%m-%d)
```

**If clock skew causing issues:**
```bash
# Verify server time
date && kubectl exec deployment/ledger-service -- date

# Sync NTP if drifted
ntpdate -s time.nist.gov

# Retry reconciliation
kubectl exec deployment/ledger-service -- npm run reconcile:full
```

### Prevention
1. Add hash integrity checks every 6 hours
2. Implement transaction audit trail
3. Set up automated reversal detection

---

## INC-003: Fraud Detection False Positives (>50%)

### Detection
- Alert: `FraudFalsePositiveRate` triggered
- Threshold: > 50% of blocked transactions later approved
- Severity: WARNING (P2)
- Response Time SLA: 1 hour

### Analysis

**Step 1: Review blocked transactions**
```bash
# Get recently blocked transactions
psql fraud_db -c "
  SELECT payment_id, risk_score, reason, customer_id, amount
  FROM fraud_decisions
  WHERE status = 'BLOCKED'
  AND created_at > NOW() - INTERVAL '1 hour'
  ORDER BY created_at DESC;"

# Check if manually approved
psql fraud_db -c "
  SELECT * FROM fraud_decisions
  WHERE status = 'APPROVED_OVERRIDE'
  AND created_at > NOW() - INTERVAL '2 hours';"
```

**Step 2: Analyze risk model**
```bash
# Get model performance
kubectl exec deployment/fraud-service -- \
  npm run analyze:model-performance --window=24h

# Check signal weights
curl -s http://fraud-service:3000/api/v1/model/weights

# Get signal distribution
kubectl exec deployment/fraud-service -- \
  npm run analyze:signal-distribution --signal=device_risk
```

**Step 3: Review recent changes**
```bash
# Check risk model version
kubectl get configmap fraud-risk-model -n shop-fintech -o yaml

# Compare previous version
git diff HEAD~1 -- libs/fraud-detection/src/risk-scoring/config.json

# Check if rules recently updated
kubectl logs deployment/fraud-service -n shop-fintech | grep "rule.*updated"
```

### Remediation

**If model weights miscalibrated:**
```bash
# Adjust weights temporarily
kubectl patch configmap fraud-risk-model -p '{
  "data": {
    "device_weight": "0.15",
    "behavior_weight": "0.25"
  }
}'

# Apply changes without restart
kubectl exec deployment/fraud-service -- npm run reload:config

# Monitor impact
kubectl exec deployment/fraud-service -- \
  curl -s http://localhost:9090/metrics | grep fraud_false_positive_rate
```

**If new device detection too aggressive:**
```bash
# Increase trust score for returning customers
kubectl patch configmap fraud-config -p '{
  "data": {
    "new_device_threshold": "40",
    "returning_customer_boost": "20"
  }
}'

# Verify change
kubectl exec deployment/fraud-service -- npm run test:model --sample=1000
```

**If geographic risk wrong:**
```bash
# Update risk countries
curl -X POST http://fraud-service:3000/api/v1/admin/risk-config \
  -H "Content-Type: application/json" \
  -d '{
    "high_risk_countries": ["KP", "IR"],
    "medium_risk_countries": ["CN", "RU"]
  }'
```

### Prevention
1. Implement A/B testing for model changes
2. Gradually roll out new risk thresholds (canary 10% → 25% → 50% → 100%)
3. Set up feedback loop from customer support

---

## INC-004: Data Corruption / Integrity Lost

### Detection
- Alert: `DataCorruptionDetected` or manual report
- Trigger: Hash verification fails or accounting unbalanced
- Severity: CRITICAL (P0)
- Response Time SLA: Immediate

### Containment

**Step 1: Stop the bleeding** (2 min)
```bash
# Scale down affected services (stop accepting new transactions)
kubectl scale deployment payment-service --replicas=0 -n shop-fintech
kubectl scale deployment settlement-service --replicas=0 -n shop-fintech

# Block new API requests
kubectl scale deployment api-gateway --replicas=0 -n shop-fintech

# Keep audit systems running
kubectl get pods -n shop-fintech | grep audit
```

**Step 2: Assess damage scope** (5 min)
```bash
# Check data integrity
kubectl exec deployment/ledger-service -- npm run verify:integrity

# List affected accounts
psql ledger_db -c "
  SELECT account_id, COUNT(*) as count
  FROM transactions
  WHERE hash_chain_valid = false
  GROUP BY account_id;"

# Estimate rollback point
kubectl exec deployment/ledger-service -- \
  npm run diagnose:corruption --last-good-time=T-30min
```

**Step 3: Prepare restore** (10 min)
```bash
# Identify last known good backup
ls -lh /backups/ | head -5

# Verify backup integrity
bash infra/backups/disaster-recovery-restore.sh --verify <BACKUP_ID>

# Calculate data loss
# Last backup time vs current time = data loss window
```

### Remediation

**If minor corruption (<100 transactions):**
```bash
# Manual reversal + correction
psql ledger_db -c "
  BEGIN;
  INSERT INTO transactions (...) VALUES (...);  -- Reversal
  UPDATE accounts SET balance = correct_value WHERE id = 'XXXX';
  COMMIT;"

# Verify fix
kubectl exec deployment/ledger-service -- npm run verify:account XXXX

# Resume services
kubectl scale deployment payment-service --replicas=3 -n shop-fintech
```

**If major corruption (>100 transactions):**
```bash
# Full restore from backup
bash infra/backups/disaster-recovery-restore.sh <BACKUP_ID>

# Verify restoration
kubectl exec deployment/ledger-service -- npm run verify:integrity

# Check all services healthy
kubectl get pods -n shop-fintech

# Notify customers of restored state
# Send emails about affected transactions
```

### Investigation
```bash
# Collect forensic evidence
kubectl logs deployment/ledger-service --since=2h > /tmp/ledger-logs.txt
kubectl exec deployment/ledger-service -- npm run dump:audit-trail > /tmp/audit.json

# Identify root cause
# - Process crash during write?
# - Network partition during saga?
# - Bug in transaction logic?

# File incident for engineering
```

### Prevention
1. Implement weekly data integrity checks
2. Add constraints/triggers at DB level
3. Increase audit logging
4. Test recovery procedures monthly

---

## INC-005: Security Incident / Potential Breach

### Detection
- Alert: Unusual access patterns, rate limit bypassed, SSH key leaked
- Severity: CRITICAL (P0)
- Response Time SLA: Immediate
- External notification: Required within 24 hours

### Immediate Actions (0-15 min)

```bash
# 1. Rotate all secrets immediately
bash infra/k8s/secrets/rotate-secrets-emergency.sh

# 2. Revoke compromised credentials
kubectl delete secret database-credentials -n shop-fintech
kubectl create secret generic database-credentials --from-literal=...

# 3. Block suspicious access
aws wafv2 create-ip-set --name "compromised-ips" \
  --scope CLOUDFRONT \
  --ip-address-version IPV4 \
  --addresses "1.2.3.4/32"

# 4. Enable debug logging
kubectl set env deployment -n shop-fintech \
  LOG_LEVEL=debug \
  DEBUG_ENABLED=true
```

### Investigation (15 min - 1 hour)

```bash
# Get access logs
kubectl logs deployment/api-gateway -n shop-fintech --all-containers=true > /tmp/api-logs.txt

# Check for data exfiltration
psql -c "
  SELECT * FROM audit_vault
  WHERE action = 'EXPORT_DATA'
  AND timestamp > NOW() - INTERVAL '6 hours';"

# Review changed configs
git log --oneline -p -- infra/k8s/secrets/ | head -50

# Check for backdoors/persistence
kubectl exec deployment/payment-service -- \
  find / -type f -newer /proc/1/fd/0 2>/dev/null

# Get network traffic
kubectl exec deployment/payment-service -- \
  netstat -tunap | grep ESTABLISHED
```

### Containment & Recovery

```bash
# If confirmed breach:
# 1. Isolate affected cluster
kubectl delete networkpolicy -n shop-fintech --all

# 2. Prepare to rebuild
docker image rm shop-payment-service:latest

# 3. Force redeploy from signed image
kubectl set image deployment/payment-service \
  payment-service=shop-payment-service:v1.0.0 \
  --record -n shop-fintech

# 4. Audit all past actions
kubectl exec deployment/audit-service -- npm run export:all-audit-logs > /tmp/full-audit.json
```

### Notification Protocol
1. Notify security team lead (in-person)
2. Gather incident response team
3. Brief executive leadership
4. Prepare customer notification
5. Contact legal team
6. Notify regulators (within 24-72 hours depending on jurisdiction)

