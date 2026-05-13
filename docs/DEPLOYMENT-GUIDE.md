# Production Deployment Guide

## Pre-Deployment Checklist

### Security
- [ ] All secrets rotated within last 30 days
- [ ] HSM keys initialized and verified
- [ ] TLS certificates valid (>30 days remaining)
- [ ] Security scanning passed (no critical vulnerabilities)
- [ ] RBAC policies applied to cluster
- [ ] Network policies enforced
- [ ] Pod security standards enabled

### Data Integrity
- [ ] Database backups tested and verified
- [ ] Ledger reconciliation passed
- [ ] All accounts balanced (accounting equation verified)
- [ ] Idempotency cache cleared
- [ ] Distributed locks released

### Compliance
- [ ] Audit logs reviewed (no gaps)
- [ ] KYC/AML checks current
- [ ] Consent records backed up
- [ ] Data retention policies applied
- [ ] Regulatory notifications sent (if needed)

### Performance
- [ ] Load testing completed (10M txns/day capacity verified)
- [ ] Metrics baselines established
- [ ] Alert thresholds tuned
- [ ] Cache warmed up
- [ ] Connection pools configured

### Operational
- [ ] On-call team assigned
- [ ] Runbooks prepared
- [ ] Disaster recovery tested
- [ ] Chaos engineering tests passed
- [ ] Communication plan ready

## Deployment Steps

### Phase 1: Blue Deployment
1. Deploy new version to blue environment
2. Run smoke tests
3. Verify all health checks pass
4. Monitor for 15 minutes

```bash
kubectl apply -f infra/k8s/prod/payment-service-blue-green.yaml
kubectl rollout status deployment payment-service-blue -n shop-fintech --timeout=10m
```

### Phase 2: Traffic Migration
1. Gradually shift traffic from green to blue
2. Monitor error rates and latency
3. Watch circuit breakers and retry metrics

```bash
# Canary: 10% traffic
kubectl patch service payment-service -p '{"spec":{"selector":{"version":"blue"}}}'
# Monitor for 5 minutes

# Progressive: 50% traffic
kubectl set env deployment payment-service-blue VERSION=v1.0.0 -n shop-fintech
# Monitor for 10 minutes

# Full: 100% traffic
kubectl delete deployment payment-service-green -n shop-fintech
```

### Phase 3: Verification
1. Verify all requests routed to blue
2. Check ledger reconciliation
3. Confirm no data loss
4. Review audit logs

```bash
kubectl logs -n shop-fintech deployment/payment-service-blue -f --tail=100
kubectl exec -n shop-fintech deployment/payment-service-blue -- npm run verify:ledger
```

### Phase 4: Finalization
1. Archive green deployment config
2. Update documentation
3. Mark deployment complete in system

```bash
kubectl set image deployment/payment-service \
  payment-service=shop-payment-service:v1.0.0 \
  -n shop-fintech
```

## Rollback Procedure

If issues detected:

```bash
# Immediate rollback to green
kubectl delete deployment payment-service-blue -n shop-fintech
kubectl scale deployment payment-service-green --replicas=3 -n shop-fintech

# Verify rollback
kubectl rollout status deployment payment-service-green -n shop-fintech

# Investigate and fix
kubectl logs deployment/payment-service-blue > /tmp/deployment-failure.log
```

## Post-Deployment

1. **Monitoring** (2 hours)
   - Error rate < 0.1%
   - P95 latency < 500ms
   - No circuit breaker trips
   - Disk usage stable

2. **Data Reconciliation** (4 hours)
   - Ledger reconciliation successful
   - No duplicate transactions
   - All settlements processed
   - Audit logs complete

3. **Compliance Verification**
   - KYC/AML checks current
   - Consent records intact
   - Data retention policies applied

4. **Performance Baselines**
   - Establish new metrics
   - Document any changes
   - Adjust alerts if needed

## Disaster Recovery

If catastrophic failure:

```bash
# 1. Stop current deployment
kubectl delete deployment payment-service-blue payment-service-green -n shop-fintech

# 2. Restore from backup
bash infra/backups/disaster-recovery-restore.sh <BACKUP_ID>

# 3. Verify restoration
kubectl get pods -n shop-fintech
kubectl exec deployment/payment-service -- npm run verify:integrity

# 4. Monitor recovery
watch kubectl get pods -n shop-fintech
```

## Maintenance Windows

- Weekly: Backup verification (Sunday 2 AM UTC)
- Monthly: Chaos engineering test (First Friday)
- Quarterly: Full disaster recovery drill
- Semi-annual: Security audit

## Support

- On-call: [Pagerduty Link]
- Documentation: [Wiki Link]
- Incidents: #incidents Slack channel
