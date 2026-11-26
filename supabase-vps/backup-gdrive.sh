#!/usr/bin/env bash
# ==============================================================================
# OmniCore — Backup Automático do PostgreSQL para o Google Drive (via rclone)
# Uso: ./backup-gdrive.sh
# Cron recomendado (todo dia às 03:00):
#   0 3 * * * /caminho/para/supabase-vps/backup-gdrive.sh >> /var/log/omnicore-backup.log 2>&1
# ==============================================================================

set -euo pipefail

# ── Configurações (ajuste conforme sua VPS) ──────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-/root/backups/omnicore}"
GDRIVE_REMOTE="${GDRIVE_REMOTE:-gdrive:OmniCore-Backups}"
LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-7}"
GDRIVE_RETENTION_DAYS="${GDRIVE_RETENTION_DAYS:-14}"
PG_USER="${PG_USER:-postgres}"
PG_DATABASE="${PG_DATABASE:-postgres}"

TIMESTAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
FILENAME="omnicore_db_${TIMESTAMP}.sql.gz"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Iniciando backup do OmniCore..."

# 1. Garante diretório local de backup
mkdir -p "${BACKUP_DIR}"

# 2. Localiza automaticamente o container do PostgreSQL / Supabase
DB_CONTAINER="${DB_CONTAINER:-$(docker ps --format '{{.Names}}' | grep -E 'supabase-db|postgres|^db$' | head -n 1 || true)}"

if [ -z "${DB_CONTAINER}" ]; then
  echo "❌ ERRO: Nenhum container PostgreSQL em execução foi encontrado."
  echo "   Defina DB_CONTAINER=nome_do_container ou verifique 'docker ps'."
  exit 1
fi

echo "📦 Container detectado: ${DB_CONTAINER}"

# 3. Gera dump compactado
docker exec -t "${DB_CONTAINER}" pg_dump -U "${PG_USER}" -d "${PG_DATABASE}" --no-owner --no-acl | gzip > "${FILEPATH}"

if [ ! -s "${FILEPATH}" ]; then
  echo "❌ ERRO: O arquivo de backup gerado está vazio: ${FILEPATH}"
  rm -f "${FILEPATH}"
  exit 1
fi

FILESIZE="$(du -h "${FILEPATH}" | cut -f1)"
echo "✅ Dump local criado: ${FILEPATH} (${FILESIZE})"

# 4. Envia para o Google Drive via rclone
if ! command -v rclone >/dev/null 2>&1; then
  echo "❌ ERRO: 'rclone' não está instalado. Instale com: curl https://rclone.org/install.sh | sudo bash"
  exit 1
fi

echo "☁️  Enviando para ${GDRIVE_REMOTE}..."
rclone copy "${FILEPATH}" "${GDRIVE_REMOTE}" --progress

# 5. Limpeza de backups antigos (local e Google Drive)
echo "🧹 Removendo backups locais com mais de ${LOCAL_RETENTION_DAYS} dias..."
find "${BACKUP_DIR}" -type f -name "omnicore_db_*.sql.gz" -mtime +"${LOCAL_RETENTION_DAYS}" -delete

echo "🧹 Removendo backups no Google Drive com mais de ${GDRIVE_RETENTION_DAYS} dias..."
rclone delete "${GDRIVE_REMOTE}" --min-age "${GDRIVE_RETENTION_DAYS}d"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Backup concluído e enviado ao Google Drive com sucesso!"
