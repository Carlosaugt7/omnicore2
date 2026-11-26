# Backup Automático do Banco OmniCore para o Google Drive

Este guia configura o backup diário do PostgreSQL (Supabase na VPS/EasyPanel) com envio automático para o seu **Google Drive** usando o `rclone`.

---

## 1. Instalar o `rclone` na VPS

Acesse sua VPS via SSH e execute:

```bash
curl https://rclone.org/install.sh | sudo bash
```

---

## 2. Conectar sua conta do Google Drive

Execute o assistente de configuração:

```bash
rclone config
```

Siga os passos:

1. Digite **`n`** (New remote)
2. Nome do remote: **`gdrive`** (importante manter exatamente `gdrive`)
3. Tipo de storage: escolha o número correspondente a **`Google Drive`** (`drive`)
4. `client_id` e `client_secret`: aperte **Enter** para usar o padrão
5. Scope: escolha **`1`** (Full access)
6. `service_account_file`: aperte **Enter**
7. `Use web browser to automatically authenticate`:
   - Se estiver direto na VPS sem navegador, escolha **`n`** e siga a instrução exibida na tela (`rclone authorize "drive"` no seu computador Windows e cole o token na VPS).
8. Confirme com **`y`** e saia com **`q`**.

Para testar se conectou:

```bash
rclone mkdir gdrive:OmniCore-Backups
rclone lsd gdrive:
```

---

## 3. Dar permissão e testar o script de backup

```bash
chmod +x supabase-vps/backup-gdrive.sh
./supabase-vps/backup-gdrive.sh
```

> Se o nome do seu container no EasyPanel for diferente (ex: `projeto_db`), você pode testar passando `DB_CONTAINER=projeto_db ./supabase-vps/backup-gdrive.sh`.

---

## 4. Agendar backup diário automático (Cron)

Abra o agendador da VPS:

```bash
crontab -e
```

Adicione a linha abaixo no final do arquivo para rodar **todo dia às 03:00 da manhã** (mantendo 7 dias locais e 14 dias no Google Drive):

```cron
0 3 * * * /caminho/completo/para/omnicore2/supabase-vps/backup-gdrive.sh >> /var/log/omnicore-backup.log 2>&1
```

Para acompanhar os logs:

```bash
tail -f /var/log/omnicore-backup.log
```
