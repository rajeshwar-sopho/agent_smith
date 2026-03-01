#!/usr/bin/env bash
set -e

REGISTRY=${REGISTRY:-"your-registry"}
TAG=${TAG:-"latest"}
NAMESPACE="bot-orchestrator"

echo "🚀 Deploying BotOrchestrator to Kubernetes"
echo "Registry: $REGISTRY | Tag: $TAG"

# Build and push images
echo "📦 Building images..."
docker build -t $REGISTRY/bot-orchestrator-backend:$TAG ./backend
docker build -t $REGISTRY/bot-orchestrator-frontend:$TAG ./frontend
docker build -t $REGISTRY/bot-orchestrator-runtime:$TAG ./bot-runtime

echo "📤 Pushing images..."
docker push $REGISTRY/bot-orchestrator-backend:$TAG
docker push $REGISTRY/bot-orchestrator-frontend:$TAG
docker push $REGISTRY/bot-orchestrator-runtime:$TAG

# Update image references in manifests
sed -i "s|your-registry/bot-orchestrator-backend:latest|$REGISTRY/bot-orchestrator-backend:$TAG|g" k8s/03-backend.yaml
sed -i "s|your-registry/bot-orchestrator-frontend:latest|$REGISTRY/bot-orchestrator-frontend:$TAG|g" k8s/04-frontend.yaml

# Apply Kubernetes manifests
echo "⚙️  Applying Kubernetes manifests..."
kubectl apply -f k8s/00-namespace-configmap.yaml
kubectl apply -f k8s/01-secrets.yaml
kubectl apply -f k8s/02-volumes.yaml
kubectl apply -f k8s/03-backend.yaml
kubectl apply -f k8s/04-frontend.yaml
kubectl apply -f k8s/05-ingress.yaml
kubectl apply -f k8s/06-hpa.yaml

# Wait for rollout
echo "⏳ Waiting for deployments to be ready..."
kubectl rollout status deployment/backend -n $NAMESPACE
kubectl rollout status deployment/frontend -n $NAMESPACE

echo "✅ Deployment complete!"
kubectl get pods -n $NAMESPACE
