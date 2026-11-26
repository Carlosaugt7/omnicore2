const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../lib/supabase');
const { encryptSecret } = require('../lib/crypto');
const { logger } = require('../lib/logger');
const {
  getBackupConfig,
  resolveOAuthCreds,
  buildGoogleAuthUrl,
  handleGoogleCallback,
  generateBackupData,
  runBackupToGoogleDrive,
} = require('../services/backupService');

function getCallbackUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}/api/backup/google/callback`;
}

// ── GET /api/backup/status ──────────────────────────────────
router.get('/status', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const config = await getBackupConfig(userId);
    const { clientId, clientSecret } = resolveOAuthCreds(config);

    const { data: logs } = await supabase
      .from('backup_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(15);

    return res.json({
      success: true,
      config: config
        ? {
            enabled: config.enabled,
            frequency: config.frequency,
            send_time: config.send_time,
            timezone: config.timezone,
            retention_count: config.retention_count,
            google_client_id: config.google_client_id || '',
            has_client_secret: Boolean(config.google_client_secret),
            connected: Boolean(config.google_refresh_token),
            google_email: config.google_email || null,
            last_backup_at: config.last_backup_at,
            last_backup_status: config.last_backup_status,
            last_backup_error: config.last_backup_error,
          }
        : {
            enabled: false,
            frequency: 'weekly',
            send_time: '03:00',
            timezone: 'America/Manaus',
            retention_count: 14,
            google_client_id: '',
            has_client_secret: false,
            connected: false,
            google_email: null,
            last_backup_at: null,
            last_backup_status: null,
            last_backup_error: null,
          },
      hasOAuthCreds: Boolean(clientId && clientSecret),
      callbackUrl: getCallbackUrl(req),
      logs: logs || [],
    });
  } catch (err) {
    logger.error({ err: err.message }, 'backup/status: erro');
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/backup/settings ───────────────────────────────
router.post('/settings', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const {
      enabled,
      frequency,
      send_time,
      timezone,
      retention_count,
      google_client_id,
      google_client_secret,
    } = req.body || {};

    const payload = {
      user_id: userId,
      enabled: Boolean(enabled),
      frequency: ['daily', 'weekly', 'biweekly', 'monthly'].includes(frequency) ? frequency : 'weekly',
      send_time: send_time || '03:00',
      timezone: timezone || 'America/Manaus',
      retention_count: Math.max(1, Math.min(100, Number(retention_count || 14))),
      updated_at: new Date().toISOString(),
    };

    if (typeof google_client_id === 'string' && google_client_id.trim()) {
      payload.google_client_id = google_client_id.trim();
    }
    if (typeof google_client_secret === 'string' && google_client_secret.trim()) {
      payload.google_client_secret = encryptSecret(google_client_secret.trim());
    }

    const { error } = await supabase
      .from('backup_settings')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) throw new Error(error.message);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err: err.message }, 'backup/settings: erro');
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ── GET /api/backup/google/auth-url ─────────────────────────
router.get('/google/auth-url', requireAuth, async (req, res) => {
  try {
    const url = await buildGoogleAuthUrl(req.userId, getCallbackUrl(req));
    return res.json({ success: true, url });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ── GET /api/backup/google/callback ─────────────────────────
router.get('/google/callback', async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
  const { code, state, error: oauthErr } = req.query;

  if (oauthErr) {
    return res.redirect(`${frontendUrl}/dashboard/settings?tab=backup&gdrive=error&msg=${encodeURIComponent(String(oauthErr))}`);
  }
  if (!code || !state) {
    return res.redirect(`${frontendUrl}/dashboard/settings?tab=backup&gdrive=error&msg=missing_code`);
  }

  try {
    await handleGoogleCallback(String(code), String(state));
    return res.redirect(`${frontendUrl}/dashboard/settings?tab=backup&gdrive=connected`);
  } catch (err) {
    logger.error({ err: err.message }, 'backup/google/callback: erro');
    return res.redirect(`${frontendUrl}/dashboard/settings?tab=backup&gdrive=error&msg=${encodeURIComponent(err.message)}`);
  }
});

// ── POST /api/backup/google/disconnect ──────────────────────
router.post('/google/disconnect', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('backup_settings')
      .update({
        google_refresh_token: null,
        google_email: null,
        enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', req.userId);

    if (error) throw new Error(error.message);
    return res.json({ success: true });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ── POST /api/backup/run-now ────────────────────────────────
router.post('/run-now', requireAuth, async (req, res) => {
  try {
    const result = await runBackupToGoogleDrive(req.userId, { type: 'manual' });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ── GET /api/backup/download ────────────────────────────────
router.get('/download', requireAuth, async (req, res) => {
  try {
    const { jsonString } = await generateBackupData(req.userId);
    const stamp = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="omnicore-backup-${stamp}.json"`);
    return res.send(jsonString);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
