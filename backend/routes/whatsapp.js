const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const {
  getUserSettings,
  buildMessage,
  sendMessage,
  saveReminderLog,
} = require('../services/evolutionService');
const { requireAuth } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────
// POST /api/whatsapp/send-single
// Sends a WhatsApp message to a single client using a template
// Body: { userId, clientId, phone, templateType }
// ─────────────────────────────────────────────────────────────
router.post('/send-single', requireAuth, async (req, res) => {
  const userId = req.userId; // verified from JWT
  const { clientId, phone, templateType } = req.body;

  if (!clientId || !templateType) {
    return res.status(400).json({
      success: false,
      error: 'clientId and templateType are required',
    });
  }

  // Validate phone format
  if (!phone || !/^\+?\d{8,15}$/.test(phone.replace(/[\s\-().]/g, ''))) {
    return res.status(400).json({
      success: false,
      error: 'Invalid phone number format',
    });
  }

  // 1. Fetch user settings
  let settings;
  try {
    settings = await getUserSettings(userId);
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message });
  }

  if (!settings.evolution_api_url || !settings.evolution_api_key || !settings.evolution_instance) {
    return res.status(400).json({
      success: false,
      error: 'Evolution API not configured. Please set up your WhatsApp connection first.',
    });
  }

  // 2. Fetch client data (verify it belongs to this user)
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('user_id', userId)
    .single();

  if (clientError || !client) {
    return res.status(404).json({ success: false, error: 'Client not found' });
  }

  // 3. Build message from template
  const template = settings[templateType];
  if (!template) {
    return res.status(400).json({
      success: false,
      error: `Template "${templateType}" not configured`,
    });
  }

  const text = buildMessage(template, client, settings);

  // 4. Send via Evolution API
  try {
    const result = await sendMessage(settings, phone, text);

    if (settings.send_pix_separately && settings.pix_key) {
      await sendMessage(settings, phone, settings.pix_key);
    }

    await saveReminderLog({
      userId,
      clientId: client.id,
      clientName: client.name,
      phone,
      templateType,
      status: 'success',
      messageId: result?.key?.id || result?.messageId || null,
    });

    return res.json({ success: true, messageId: result?.key?.id || null });
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;

    await saveReminderLog({
      userId,
      clientId: client.id,
      clientName: client.name,
      phone,
      templateType,
      status: 'failed',
      errorMessage: errorMsg,
    });

    return res.status(500).json({ success: false, error: errorMsg });
  }
});

module.exports = router;
