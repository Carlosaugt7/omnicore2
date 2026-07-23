#!/bin/sh
# ─────────────────────────────────────────────────────────────
# OmniCore — VPS Setup Script
# Testado em Ubuntu 22.04 / Debian 12 / Alpine
# Uso: sh vps-setup.sh
# ─────────────────────────────────────────────────────────────

set -e

echo ""
echo "🖥️  OmniCore VPS Setup"
echo "────────────────────────────────────────"

# ── 1. Atualizar sistema ──────────────────────────────────────
echo "📦 Atualizando sistema..."
apt-get update -qq && apt-get upgrade -y -qq

# ── 2. Instalar Docker ────────────────────────────────────────
if ! command -v docker > /dev/null 2>&1; then
  echo "🐳 Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
else
  echo "✅ Docker já instalado: $(docker --version)"
fi

# ── 3. Instalar Docker Compose plugin ────────────────────────
if ! docker compose version > /dev/null 2>&1; then
  echo "🐳 Instalando Docker Compose plugin..."
  apt-get install -y docker-compose-plugin
else
  echo "✅ Docker Compose já instalado: $(docker compose version)"
fi

# ── 4. Instalar Nginx ─────────────────────────────────────────
if ! command -v nginx > /dev/null 2>&1; then
  echo "🌐 Instalando Nginx..."
  apt-get install -y nginx
  systemctl enable nginx
  systemctl start nginx
else
  echo "✅ Nginx já instalado"
fi

# ── 5. Instalar Certbot ───────────────────────────────────────
if ! command -v certbot > /dev/null 2>&1; then
  echo "🔒 Instalando Certbot..."
  apt-get install -y certbot python3-certbot-nginx
else
  echo "✅ Certbot já instalado"
fi

# ── 6. Configurar Nginx ───────────────────────────────────────
echo "🌐 Configurando Nginx..."
cp nginx/omnicore.conf /etc/nginx/sites-available/omnicore

# Remover default se existir
rm -f /etc/nginx/sites-enabled/default

# Criar symlink
ln -sf /etc/nginx/sites-available/omnicore /etc/nginx/sites-enabled/omnicore

# Testar config
nginx -t

# ── 7. Gerar certificados SSL ─────────────────────────────────
echo ""
echo "🔒 Gerando certificados SSL..."
echo "   (Certifique-se que os domínios apontam para este servidor)"
echo ""

certbot --nginx \
  -d api.rsconsultoria.pro \
  -d omnicore.rsconsultoria.pro \
  --non-interactive \
  --agree-tos \
  --email admin@rsconsultoria.pro \
  --redirect || echo "⚠️  Certbot falhou — verifique se os domínios estão apontando para este IP"

# Recarregar Nginx
systemctl reload nginx

# ── 8. Criar diretório do frontend ───────────────────────────
mkdir -p /var/www/omnicore
echo "📁 Diretório /var/www/omnicore criado"

# ── 9. Deploy do backend ──────────────────────────────────────
echo ""
echo "🚀 Fazendo deploy do backend..."
bash deploy.sh

echo ""
echo "────────────────────────────────────────"
echo "✅ Setup concluído!"
echo ""
echo "📋 Próximos passos:"
echo "   1. Faça o build do frontend: npm run build"
echo "   2. Copie a pasta dist/ para /var/www/omnicore/"
echo "      scp -r dist/* root@45.92.10.182:/var/www/omnicore/"
echo "   3. Acesse https://omnicore.rsconsultoria.pro"
echo ""
echo "📋 Comandos úteis:"
echo "   Logs backend:  docker logs -f omnicore-backend"
echo "   Status:        docker compose ps"
echo "   Restart:       docker compose restart backend"
echo "────────────────────────────────────────"
