const axios = require('axios');
const crypto = require('crypto');
const { gzipSync } = require('zlib');
const { supabase } = require('../lib/supabase');
const { logger } = require('../lib/logger');
const { encryptSecret, decryptSecret } = require('../lib/crypto');

const BACKUP_TABLES = [
  'clients',
  'services',
  'plans',
  'transactions',
  'mac_addresses',
  'settings',
  'referrals',
  'cashback_records',
  'report_settings',
  'notifications',
  'reminder_logs',
];

function getStateSecret() {
  return process.env.PANEL_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_KEY || 'omnicore-state-secret';
}

function signState(payloadObj) {
  const data = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto.createHmac('sha256', getStateSecret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyState(stateStr) {
  if (!stateStr || !stateStr.includes('.')) throw new Error('State OAuth inválido.');
  const [data, sig] = stateStr.split('.');
  const expected = crypto.createHmac('sha256', getStateSecret()).update(data).digest('base64url');
  if (sig !== expected) throw new Error('Assinatura OAuth inválida.');
  return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
}

function getDateInfoInTZ(tz) {
  const safeTz = tz || 'America/Manaus';
  const now = new Date();
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: safeTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
  }
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour') === '24' ? '00' : get('hour');
  const minute = get('minute');
  return {
    dateStr: `${year}-${month}-${day}`,
    hhmm: `${hour}:${minute}`,
    monthKey: `${year}-${month}`,
  };
}

function daysBetween(dateA, dateB) {
  const a = new Date(`${dateA}T00:00:00Z`).getTime();
  const b = new Date(`${dateB}T00:00:00Z`).getTime();
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

async function getBackupConfig(userId) {
  const { data, error } = await supabase
    .from('backup_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function resolveOAuthCreds(config) {
  const clientId = (config?.google_client_id || process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (
    (config?.google_client_secret ? decryptSecret(config.google_client_secret) : '') ||
    process.env.GOOGLE_CLIENT_SECRET ||
    ''
  ).trim();
  return { clientId, clientSecret };
}

/**
 * Gera URL de autorização OAuth2 do Google Drive.
 */
async function buildGoogleAuthUrl(userId, callbackUrl) {
  const config = await getBackupConfig(userId);
  const { clientId, clientSecret } = resolveOAuthCreds(config);

  if (!clientId || !clientSecret) {
    throw new Error('Informe o Google Client ID e Client Secret antes de conectar.');
  }

  const state = signState({ userId, callbackUrl, ts: Date.now() });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Troca o código OAuth2 por refresh_token e salva no banco criptografado.
 */
async function handleGoogleCallback(code, stateStr) {
  const { userId, callbackUrl } = verifyState(stateStr);
  const config = await getBackupConfig(userId);
  const { clientId, clientSecret } = resolveOAuthCreds(config);

  if (!clientId || !clientSecret) {
    throw new Error('Credenciais Google OAuth não encontradas.');
  }

  const tokenRes = await axios.post(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const { access_token, refresh_token } = tokenRes.data;
  if (!refresh_token && !config?.google_refresh_token) {
    throw new Error('O Google não retornou o refresh_token. Remova o acesso do app na sua conta Google e tente novamente.');
  }

  let googleEmail = config?.google_email || null;
  try {
    const userRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    googleEmail = userRes.data?.email || googleEmail;
  } catch {
    // Email opcional para exibição
  }

  const updatePayload = {
    user_id: userId,
    google_email: googleEmail,
    updated_at: new Date().toISOString(),
  };
  if (refresh_token) {
    updatePayload.google_refresh_token = encryptSecret(refresh_token);
  }

  const { error } = await supabase
    .from('backup_settings')
    .upsert(updatePayload, { onConflict: 'user_id' });

  if (error) throw new Error(error.message);
  return { userId, googleEmail };
}

/**
 * Obtém access_token válido a partir do refresh_token salvo.
 */
async function getValidAccessToken(config) {
  const { clientId, clientSecret } = resolveOAuthCreds(config);
  const refreshToken = decryptSecret(config?.google_refresh_token);

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google Drive não está conectado ou faltam credenciais OAuth.');
  }

  const res = await axios.post(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  return res.data.access_token;
}

/**
 * Garante a existência da pasta "OmniCore-Backups" no Google Drive.
 */
async function ensureBackupFolder(accessToken, existingFolderId) {
  if (existingFolderId) {
    try {
      const check = await axios.get(`https://www.googleapis.com/drive/v3/files/${existingFolderId}`, {
        params: { fields: 'id, trashed' },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (check.data?.id && !check.data?.trashed) {
        return check.data.id;
      }
    } catch {
      // Pasta não existe mais ou sem acesso — busca/cria outra
    }
  }

  const search = await axios.get('https://www.googleapis.com/drive/v3/files', {
    params: {
      q: "name = 'OmniCore-Backups' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: 'files(id, name)',
      spaces: 'drive',
    },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (search.data?.files?.length > 0) {
    return search.data.files[0].id;
  }

  const create = await axios.post(
    'https://www.googleapis.com/drive/v3/files',
    {
      name: 'OmniCore-Backups',
      mimeType: 'application/vnd.google-apps.folder',
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return create.data.id;
}

/**
 * Faz upload multipart para o Google Drive API v3.
 */
async function uploadToGoogleDrive(accessToken, folderId, fileName, buffer) {
  const boundary = `omnicore_boundary_${Date.now()}`;
  const metadata = JSON.stringify({
    name: fileName,
    parents: [folderId],
  });

  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`,
    'utf8'
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([head, buffer, tail]);

  const res = await axios.post(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size',
    body,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    }
  );

  return res.data;
}

/**
 * Remove backups antigos no Google Drive mantendo apenas os N mais recentes.
 */
async function enforceRetention(accessToken, folderId, retentionCount) {
  const keep = Math.max(1, Number(retentionCount || 14));
  const listRes = await axios.get('https://www.googleapis.com/drive/v3/files', {
    params: {
      q: `'${folderId}' in parents and trashed = false`,
      orderBy: 'createdTime desc',
      fields: 'files(id, name, createdTime)',
      pageSize: 100,
    },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const files = listRes.data?.files || [];
  if (files.length <= keep) return;

  const toDelete = files.slice(keep);
  for (const f of toDelete) {
    try {
      await axios.delete(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (err) {
      logger.warn({ fileId: f.id, err: err.message }, 'backupService: falha ao remover backup antigo');
    }
  }
}

/**
 * Exporta todas as tabelas do usuário paginando em lotes de 1000.
 */
async function fetchTableAllRows(table, userId) {
  const all = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .range(from, from + pageSize - 1);

    if (error) {
      logger.warn({ table, error: error.message }, 'backupService: tabela ignorada na exportação');
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

async function generateBackupData(userId) {
  const tablesData = {};
  for (const table of BACKUP_TABLES) {
    tablesData[table] = await fetchTableAllRows(table, userId);
  }

  const payload = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    userId,
    tables: tablesData,
  };

  const jsonString = JSON.stringify(payload, null, 2);
  const gzBuffer = gzipSync(Buffer.from(jsonString, 'utf8'));
  return { payload, jsonString, gzBuffer };
}

/**
 * Executa backup completo e envia para o Google Drive.
 */
async function runBackupToGoogleDrive(userId, { type = 'manual' } = {}) {
  const config = await getBackupConfig(userId);
  if (!config) {
    throw new Error('Configure e conecte o Google Drive primeiro na aba Backup.');
  }

  const info = getDateInfoInTZ(config.timezone);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `omnicore_backup_${stamp}.json.gz`;

  try {
    const accessToken = await getValidAccessToken(config);
    const folderId = await ensureBackupFolder(accessToken, config.gdrive_folder_id);
    const { gzBuffer } = await generateBackupData(userId);
    const uploaded = await uploadToGoogleDrive(accessToken, folderId, fileName, gzBuffer);

    await enforceRetention(accessToken, folderId, config.retention_count);

    await supabase
      .from('backup_settings')
      .update({
        gdrive_folder_id: folderId,
        last_backup_at: new Date().toISOString(),
        last_backup_date: info.dateStr,
        last_backup_status: 'success',
        last_backup_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    await supabase.from('backup_logs').insert({
      user_id: userId,
      type,
      status: 'success',
      file_name: fileName,
      file_size_bytes: gzBuffer.length,
      gdrive_file_id: uploaded.id,
    });

    logger.info({ userId, type, fileName, bytes: gzBuffer.length }, 'backupService: backup enviado ao Google Drive');

    return {
      success: true,
      fileName,
      sizeBytes: gzBuffer.length,
      gdriveFileId: uploaded.id,
    };
  } catch (err) {
    const errMsg = err.response?.data?.error_description || err.response?.data?.error?.message || err.message;
    logger.error({ userId, type, err: errMsg }, 'backupService: erro ao executar backup');

    await supabase
      .from('backup_settings')
      .update({
        last_backup_at: new Date().toISOString(),
        last_backup_status: 'failed',
        last_backup_error: errMsg,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    await supabase.from('backup_logs').insert({
      user_id: userId,
      type,
      status: 'failed',
      file_name: fileName,
      error_message: errMsg,
    });

    throw new Error(errMsg);
  }
}

/**
 * Verifica a cada minuto os backups automáticos agendados (Diário, Semanal, Quinzenal, Mensal).
 */
async function processScheduledBackups() {
  const { data: configs, error } = await supabase
    .from('backup_settings')
    .select('*')
    .eq('enabled', true)
    .not('google_refresh_token', 'is', null);

  if (error || !configs || configs.length === 0) return;

  for (const config of configs) {
    try {
      const info = getDateInfoInTZ(config.timezone);
      if (config.send_time !== info.hhmm) continue;
      if (config.last_backup_date === info.dateStr) continue;

      let shouldRun = false;
      if (!config.last_backup_date) {
        shouldRun = true;
      } else {
        const diff = daysBetween(config.last_backup_date, info.dateStr);
        if (config.frequency === 'daily' && diff >= 1) shouldRun = true;
        else if (config.frequency === 'weekly' && diff >= 7) shouldRun = true;
        else if (config.frequency === 'biweekly' && diff >= 15) shouldRun = true;
        else if (config.frequency === 'monthly' && config.last_backup_date.slice(0, 7) !== info.monthKey && diff >= 28) shouldRun = true;
      }

      if (shouldRun) {
        logger.info({ userId: config.user_id, frequency: config.frequency }, 'backupService: disparando backup automático');
        await runBackupToGoogleDrive(config.user_id, { type: 'auto' });
      }
    } catch (err) {
      logger.error({ userId: config.user_id, err: err.message }, 'backupService: falha no agendamento automático');
    }
  }
}

module.exports = {
  getBackupConfig,
  resolveOAuthCreds,
  buildGoogleAuthUrl,
  handleGoogleCallback,
  generateBackupData,
  runBackupToGoogleDrive,
  processScheduledBackups,
};
