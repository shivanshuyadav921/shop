#!/bin/bash
# Enterprise Fintech Platform - Build & Deployment Script

set -e

PROJECT_NAME="shop"
VERSION="${1:-1.0.0}"
ENVIRONMENT="${2:-production}"
REGISTRY="${3:-docker.io}"

echo "======================================"
echo "Enterprise Fintech Platform Build"
echo "======================================"
echo "Project: $PROJECT_NAME"
echo "Version: $VERSION"
echo "Environment: $ENVIRONMENT"
echo "Registry: $REGISTRY"
echo ""

# ========== BUILD PHASE ==========
echo "[1/5] Building libraries..."
npm -w libs/crypto-vault run build
npm -w libs/distributed-transactions run build
npm -w libs/ledger-core run build
npm -w libs/fraud-detection run build
npm -w libs/compliance-engine run build
echo "✓ Libraries built successfully"

echo ""
echo "[2/5] Building services..."
for service in payment-service auth-service ledger-service fraud-service compliance-service wallet-service invoice-service analytics-service audit-service; do
  echo "  Building $service..."
  npm -w services/$service run build
done
echo "✓ Services built successfully"

# ========== SECURITY SCAN ==========
echo ""
echo "[3/5] Security scanning..."
npm audit --audit-level=moderate || echo "⚠ Warning: Vulnerabilities detected"
echo "✓ Security scan completed"

# ========== DOCKER BUILD ==========
echo ""
echo "[4/5] Building Docker images..."

services=(
  "payment-service"
  "auth-service"
  "ledger-service"
  "fraud-service"
  "compliance-service"
  "wallet-service"
  "invoice-service"
  "analytics-service"
  "audit-service"
)

for service in "${services[@]}"; do
  echo "  Building Docker image for $service..."
  docker build \
    --build-arg NODE_ENV=$ENVIRONMENT \
    --build-arg VERSION=$VERSION \
    -t "$REGISTRY/shop-$service:$VERSION" \
    -t "$REGISTRY/shop-$service:latest" \
    "services/$service"
done
echo "✓ Docker images built successfully"

# ========== KUBERNETES DEPLOYMENT ==========
echo ""
echo "[5/5] Deploying to Kubernetes..."

# Create namespace if not exists
kubectl create namespace shop-fintech --dry-run=client -o yaml | kubectl apply -f -

# Apply configurations
kubectl apply -f infra/k8s/observability/
kubectl apply -f infra/k8s/prod/

# Wait for rollout
echo "Waiting for deployment to become ready..."
kubectl rollout status deployment -n shop-fintech --timeout=5m || {
  echo "⚠ Deployment warning: Some services not ready within 5 minutes"
  kubectl get pods -n shop-fintech
}

echo ""
echo "======================================"
echo "✓ Build & deployment completed!"
echo "======================================"
echo ""
echo "Deployment Information:"
echo "  Namespace: shop-fintech"
echo "  Version: $VERSION"
echo "  Environment: $ENVIRONMENT"
echo ""
echo "Health check:"
kubectl get pods -n shop-fintech
echo ""
echo "Next steps:"
echo "  1. Monitor services: kubectl logs -n shop-fintech -f"
echo "  2. Access API: kubectl port-forward service/payment-service 3000:80 -n shop-fintech"
echo "  3. View metrics: kubectl port-forward service/prometheus 9090:9090 -n shop-fintech"
echo "  4. View traces: kubectl port-forward service/jaeger 16686:16686 -n shop-fintech"
