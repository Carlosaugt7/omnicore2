const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { createEvolutionClient, extractQrCode } = require('../lib/evolutionApi');
const { requireAuth } = require('../middleware/auth');
const { logger } = require('../lib/logger');

// ─────────────────────────────────────────────────────────────
// GET /api/evolution/ping
// Tests connectivity to the Evolution API
// Query: ?evolutionUrl=&evolutionApiKey=
// ─────────────────────────────────────────────────────────────
router.get('/ping', requireAuth, async (req, res) => {
  const { evolutionUrl, evolutionApiKey } = req.query;

  if (!evolutionUrl || !evolutionApiKey) {
    return res.status(400).json({ ok: false, error: 'evolutionUrl and evolutionApiKey are required' });
  }

  try {
    const client = createEvolutionClient(evolutionUrl, evolutionApiKey);
    await client.get('/instance/fetchInstances');
    return res.json({ ok: true });
  } catch (err) {
    const error = err.response?.data?.message || err.message;
    return res.status(200).json({ ok: false, error });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/evolution/setup
// Creates/configures an Evolution instance for a user
// Body: { userId, evolutionUrl, evolutionApiKey, n8nWebhookUrl? }
// ─────────────────────────────────────────────────────────────
router.post('/setup', requireAuth, async (req, res) => {
  const userId = req.userId; // verified from JWT
  const { evolutionUrl, evolutionApiKey, n8nWebhookUrl } = req.body;

  if (!evolutionUrl || !evolutionApiKey) {
    return res.status(400).json({ success: false, error: 'evolutionUrl and evolutionApiKey are required' });
  }

  const instanceName = `omnicore_${userId.substring(0, 8)}`;
  const client = createEvolutionClient(evolutionUrl, evolutionApiKey);
  const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;

  try {
    // 1. Create instance
    await client.post('/instance/create', {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    });
  } catch (err) {
    // Instance may already exist — continue
    const msg = err.response?.data?.message || err.message;
    if (!msg.toLowerCase().includes('already')) {
      logger.warn({ instanceName, error: msg }, 'setup: instance create warning');
    }
  }

  let qrCode = null;

  try {
    // 2. Connect and get QR code
    const { data: connectData } = await client.get(`/instance/connect/${instanceName}`);
    qrCode = extractQrCode(connectData);
  } catch (err) {
    logger.warn({ instanceName, error: err.response?.data || err.message }, 'setup: connect error');
  }

  let n8nConfigured = false;

  // 3. Configure N8N integration if URL provided
  if (n8nWebhookUrl) {
    try {
      await client.post(`/n8n/set/${instanceName}`, {
        enabled: true,
        url: n8nWebhookUrl,
      });
      n8nConfigured = true;
    } catch (err) {
      logger.warn({ instanceName, error: err.response?.data || err.message }, 'setup: N8N config error');
    }
  }

  // 4. Configure webhook pointing to our backend
  try {
    // Append secret as query param — Evolution API does not support custom headers
    const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
    const webhookUrl = webhookSecret
      ? `${backendUrl}/api/webhooks/evolution?secret=${encodeURIComponent(webhookSecret)}`
      : `${backendUrl}/api/webhooks/evolution`;

    await client.post(`/webhook/set/${instanceName}`, {
      url: webhookUrl,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
      byEvents: false,
      base64: false,
    });
  } catch (err) {
    logger.warn({ instanceName, error: err.response?.data || err.message }, 'setup: webhook config error');
  }

  // 5. Upsert settings in Supabase
  const { error: upsertError } = await supabase
    .from('settings')
    .upsert(
      {
        user_id: userId,
        evolution_api_url: evolutionUrl,
        evolution_api_key: evolutionApiKey,
        evolution_instance: instanceName,
        evolution_status: 'close',
        n8n_webhook_url: n8nWebhookUrl || null,
        n8n_configured: n8nConfigured,
      },
      { onConflict: 'user_id' }
    );

  if (upsertError) {
    logger.error({ userId, error: upsertError.message }, 'setup: supabase upsert error');
    return res.status(500).json({ success: false, error: 'Failed to save settings' });
  }

  return res.json({
    success: true,
    instanceName,
    qrCode,
    n8nConfigured,
  });
});

// ─────────────────────────────────────────────────────────────
// GET /api/evolution/connect-qr
// Returns a fresh QR code for an existing instance
// Query: ?userId=
// ─────────────────────────────────────────────────────────────
router.get('/connect-qr', requireAuth, async (req, res) => {
  const userId = req.userId; // verified from JWT

  const { data: settings, error } = await supabase
    .from('settings')
    .select('evolution_api_url, evolution_api_key, evolution_instance')
    .eq('user_id', userId)
    .single();

  if (error || !settings) {
    return res.status(404).json({ error: 'Settings not found' });
  }

  try {
    const client = createEvolutionClient(settings.evolution_api_url, settings.evolution_api_key);
    const { data } = await client.get(`/instance/connect/${settings.evolution_instance}`);
    const qrCode = extractQrCode(data);

    return res.json({ qrCode });
  } catch (err) {
    const error = err.response?.data?.message || err.message;
    return res.status(500).json({ error });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/evolution/status
// Returns connection state for the user's instance
// Query: ?userId=
// ─────────────────────────────────────────────────────────────
router.get('/status', requireAuth, async (req, res) => {
  const userId = req.userId; // verified from JWT

  const { data: settings, error } = await supabase
    .from('settings')
    .select('evolution_api_url, evolution_api_key, evolution_instance')
    .eq('user_id', userId)
    .single();

  if (error || !settings) {
    return res.status(404).json({ error: 'Settings not found' });
  }

  try {
    const client = createEvolutionClient(settings.evolution_api_url, settings.evolution_api_key);
    const { data } = await client.get(`/instance/connectionState/${settings.evolution_instance}`);

    const state = data?.instance?.state || data?.state || 'unknown';
    const phone = data?.instance?.profileName || data?.phone || null;
    const connected = state === 'open';

    // Update status in Supabase when connected
    if (connected) {
      await supabase
        .from('settings')
        .update({ evolution_status: 'open', evolution_phone: phone })
        .eq('user_id', userId);
    }

    return res.json({ connected, state, phone });
  } catch (err) {
    const error = err.response?.data?.message || err.message;
    return res.status(500).json({ error });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/evolution/disconnect
// Logs out the WhatsApp instance
// Body: { userId }
// ─────────────────────────────────────────────────────────────
router.post('/disconnect', requireAuth, async (req, res) => {
  const userId = req.userId; // verified from JWT

  const { data: settings, error } = await supabase
    .from('settings')
    .select('evolution_api_url, evolution_api_key, evolution_instance')
    .eq('user_id', userId)
    .single();

  if (error || !settings) {
    return res.status(404).json({ error: 'Settings not found' });
  }

  try {
    const client = createEvolutionClient(settings.evolution_api_url, settings.evolution_api_key);
    await client.delete(`/instance/logout/${settings.evolution_instance}`);
  } catch (err) {
    logger.warn({ userId, error: err.response?.data || err.message }, 'disconnect: logout error');
    // Continue to update status even if logout call fails
  }

  await supabase
    .from('settings')
    .update({ evolution_status: 'close' })
    .eq('user_id', userId);

  return res.json({ success: true });
});

module.exports = router;
