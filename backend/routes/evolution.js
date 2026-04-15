const express = require('express');
const router = express.Router();
const axios = require('axios');
const { supabase } = require('../lib/supabase');
const { createEvolutionClient, extractQrCode } = require('../lib/evolutionApi');

// ─────────────────────────────────────────────────────────────
// GET /api/evolution/ping
// Tests connectivity to the Evolution API
// Query: ?evolutionUrl=&evolutionApiKey=
// ─────────────────────────────────────────────────────────────
router.get('/ping', async (req, res) => {
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
router.post('/setup', async (req, res) => {
  const { userId, evolutionUrl, evolutionApiKey, n8nWebhookUrl } = req.body;

  if (!userId || !evolutionUrl || !evolutionApiKey) {
    return res.status(400).json({ success: false, error: 'userId, evolutionUrl and evolutionApiKey are required' });
  }

  const instanceName = `omnicore_${userId.substring(0, 8)}`;
  const client = createEvolutionClient(evolutionUrl, evolutionApiKey);
  const frontendUrl = process.env.FRONTEND_URL;

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
      console.warn(`[setup] Instance create warning: ${msg}`);
    }
  }

  let qrCode = null;

  try {
    // 2. Connect and get QR code
    const { data: connectData } = await client.get(`/instance/connect/${instanceName}`);
    qrCode = extractQrCode(connectData);
  } catch (err) {
    console.warn('[setup] Connect error:', err.response?.data || err.message);
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
      console.warn('[setup] N8N config error:', err.response?.data || err.message);
    }
  }

  // 4. Configure webhook
  try {
    await client.post(`/webhook/set/${instanceName}`, {
      url: `${frontendUrl}/api/webhooks/evolution`,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
    });
  } catch (err) {
    console.warn('[setup] Webhook config error:', err.response?.data || err.message);
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
    console.error('[setup] Supabase upsert error:', upsertError.message);
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
router.get('/connect-qr', async (req, res) => {
  const { userId } = req.query;

  if (!userId) return res.status(400).json({ error: 'userId is required' });

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
router.get('/status', async (req, res) => {
  const { userId } = req.query;

  if (!userId) return res.status(400).json({ error: 'userId is required' });

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
router.post('/disconnect', async (req, res) => {
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ error: 'userId is required' });

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
    console.warn('[disconnect] Logout error:', err.response?.data || err.message);
    // Continue to update status even if logout call fails
  }

  await supabase
    .from('settings')
    .update({ evolution_status: 'close' })
    .eq('user_id', userId);

  return res.json({ success: true });
});

module.exports = router;
