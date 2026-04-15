#!/bin/bash
# ─────────────────────────────────────────────────────────────
# OmniCore — Deploy script
# Uso: ./deploy.sh
# Requer: Docker, Docker Compose instalados na VPS
# ─────────────────────────────────────────────────────────────

set -e

echo ""
echo "🚀 OmniCore Deploy"
echo "────────────────────────────────────────"

# 1. Verificar se backend/.env existe
if [ ! -f "backend/.env" ]; then
  echo "❌ Arquivo backend/.env não encontrado."
  echo "   Copie backend/.env.example para backend/.env e preencha as variáveis."
  exit 1
fi

# 2. Build da imagem do backend
echo "📦 Building backend image..."
docker compose build --no-cache backend

# 3. Parar container antigo (se existir)
echo "🛑 Stopping old container..."
docker compose down --remove-orphans || true

# 4. Subir novo container
echo "▶️  Starting backend..."
docker compose up -d backend

# 5. Aguardar health check
echo "⏳ Waiting for health check..."
sleep 5

STATUS=$(docker inspect --format='{{.State.Health.Status}}' omnicore-backend 2>/dev/null || echo "unknown")
if [ "$STATUS" = "healthy" ] || [ "$STATUS" = "starting" ]; then
  echo "✅ Backend is up!"
else
  echo "⚠️  Container status: $STATUS"
  echo "   Check logs with: docker logs omnicore-backend"
fi

echo ""
echo "📋 Useful commands:"
echo "   Logs:    docker logs -f omnicore-backend"
echo "   Status:  docker compose ps"
echo "   Stop:    docker compose down"
echo "────────────────────────────────────────"
echo ""
