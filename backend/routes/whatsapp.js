const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const {
  getUserSettings,
  buildMessage,
  sendMessage,
  saveReminderLog,
} = require('../services/evolutionService');

// ─────────────────────────────────────────────────────────────
// POST /api/whatsapp/send-single
// Sends a WhatsApp message to a single client using a template
// Body: { userId, clientId, phone, templateType }
// ─────────────────────────────────────────────────────────────
router.post('/send-single', async (req, res) => {
  const { userId, clientId, phone, templateType } = req.body;

  if (!userId || !clientId || !templateType) {
    return res.status(400).json({
      success: false,
      error: 'userId, clientId and templateType are required',
    });
  }

  // 1. Fetch user settings
  let settings;
  try {
    settings = await getUserSettings(userId);
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message });
  }

  if (!settings.evolution_api_url || !settings.evolution_instance) {
    return res.status(400).json({ success: false, error: 'Evolution API not configured' });
  }

  // 2. Fetch client data
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('user_id', userId)
    .single();

  if (clientError || !client) {
    return res.status(404).json({ success: false, error: 'Client not found' });
  }

  // 3. Resolve phone: use provided phone or fall back to client.phone
  const targetPhone = phone || client.phone;

  // 4. Build message from template
  const template = settings[templateType];
  if (!template) {
    return res.status(400).json({
      success: false,
      error: `Template "${templateType}" not configured in settings`,
    });
  }

  const text = buildMessage(template, client, settings);

  // 5. Send message
  try {
    const result = await sendMessage(settings, targetPhone, text);
    const messageId = result?.key?.id || result?.messageId || null;

    // 6. Save log
    await saveReminderLog({
      userId,
      clientId: client.id,
      clientName: client.name,
      phone: targetPhone,
      templateType,
      status: 'sent',
      messageId,
    });

    return res.json({ success: true, messageId });
  } catch (err) {
    const errorMessage = err.response?.data?.message || err.message;

    await saveReminderLog({
      userId,
      clientId: client.id,
      clientName: client.name,
      phone: targetPhone,
      templateType,
      status: 'failed',
      errorMessage,
    });

    return res.status(500).json({ success: false, error: errorMessage });
  }
});

module.exports = router;
