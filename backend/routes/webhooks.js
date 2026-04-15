const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { getUserSettings, sendMessage } = require('../services/evolutionService');
const { formatPhone } = require('../lib/evolutionApi');

// Keywords that indicate a payment confirmation
const PAYMENT_KEYWORDS = [
  'paguei',
  'pago',
  'fiz o pix',
  'transferi',
  'comprovante',
  'realizei o pagamento',
  'efetuei o pagamento',
];

/**
 * Checks if a message text contains any payment keyword.
 * @param {string} text
 * @returns {boolean}
 */
function isPaymentMessage(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return PAYMENT_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Validates the Evolution API webhook via URL query param secret.
 * A Evolution API não suporta headers customizados, então o segredo é
 * passado como query param na URL do webhook:
 *   https://api.rsconsultoria.pro/api/webhooks/evolution?secret=SEU_SEGREDO
 *
 * Set EVOLUTION_WEBHOOK_SECRET in your backend .env to enable.
 * If the env var is not set, validation is skipped (backward-compatible).
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function isValidWebhookRequest(req) {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (!secret) return true; // secret not configured — allow all

  const provided = req.query.secret;
  return provided === secret;
}

/**
 * Handles a detected payment message:
 * - Finds the client by phone
 * - Sends an automatic confirmation reply
 * - Creates an internal notification
 * @param {string} phone - Raw phone number (digits only, no @s.whatsapp.net)
 * @param {string} instanceName - Evolution instance name
 */
async function handlePaymentDetected(phone, instanceName) {
  // Find the settings row that owns this instance
  const { data: settings, error: settingsError } = await supabase
    .from('settings')
    .select('*')
    .eq('evolution_instance', instanceName)
    .single();

  if (settingsError || !settings) {
    console.warn('[webhook] No settings found for instance:', instanceName);
    return;
  }

  const userId = settings.user_id;
  const formattedPhone = formatPhone(phone);

  // Find client by phone (try both with and without country code)
  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .eq('user_id', userId)
    .or(`phone.eq.${phone},phone.eq.${formattedPhone},phone.eq.+${formattedPhone}`);

  const client = clients?.[0] || null;

  // Send automatic confirmation reply
  try {
    const confirmationText =
      '✅ Recebemos sua mensagem! Seu pagamento será verificado em breve. Obrigado! 😊';
    await sendMessage(settings, phone, confirmationText);
  } catch (err) {
    console.error('[webhook] Failed to send confirmation:', err.message);
  }

  // Create internal notification
  const notificationData = {
    user_id: userId,
    type: 'payment_detected',
    title: 'Possível pagamento detectado',
    message: client
      ? `${client.name} (${phone}) enviou uma mensagem indicando pagamento.`
      : `Número ${phone} enviou uma mensagem indicando pagamento (cliente não encontrado).`,
    client_id: client?.id || null,
    read: false,
    created_at: new Date().toISOString(),
  };

  const { error: notifError } = await supabase
    .from('notifications')
    .insert(notificationData);

  if (notifError) {
    console.warn('[webhook] Notification insert error:', notifError.message);
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/webhooks/evolution
// Receives events from the Evolution API
// Optionally protected by EVOLUTION_WEBHOOK_SECRET env var
// ─────────────────────────────────────────────────────────────
router.post('/evolution', async (req, res) => {
  // Validate webhook secret if configured
  if (!isValidWebhookRequest(req)) {
    console.warn('[webhook/evolution] Rejected request: invalid secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Acknowledge immediately so Evolution doesn't retry
  res.json({ received: true });

  const body = req.body;
  const event = body?.event || body?.type;
  const instanceName = body?.instance || body?.instanceName;

  console.log(`[webhook/evolution] Event: ${event} | Instance: ${instanceName}`);

  try {
    // ── MESSAGES_UPSERT ──────────────────────────────────────
    if (event === 'messages.upsert' || event === 'MESSAGES_UPSERT') {
      const messageData = body?.data || body;
      const fromMe = messageData?.key?.fromMe || messageData?.fromMe;

      // Only process incoming messages (not sent by us)
      if (!fromMe) {
        const text =
          messageData?.message?.conversation ||
          messageData?.message?.extendedTextMessage?.text ||
          messageData?.text ||
          '';

        const remoteJid =
          messageData?.key?.remoteJid ||
          messageData?.remoteJid ||
          '';

        const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');

        if (isPaymentMessage(text)) {
          console.log(`[webhook/evolution] Payment message detected from ${phone}`);
          await handlePaymentDetected(phone, instanceName);
        }
      }
    }

    // ── CONNECTION_UPDATE ────────────────────────────────────
    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      const state =
        body?.data?.state ||
        body?.state ||
        body?.connection ||
        'unknown';

      console.log(`[webhook/evolution] Connection update: ${state} for ${instanceName}`);

      if (instanceName) {
        const { error } = await supabase
          .from('settings')
          .update({ evolution_status: state })
          .eq('evolution_instance', instanceName);

        if (error) {
          console.error('[webhook/evolution] Status update error:', error.message);
        }
      }
    }
  } catch (err) {
    console.error('[webhook/evolution] Processing error:', err.message);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/webhooks/payment-detected
// Receives payment detection events from N8N
// Body: { phone, message, instanceName }
// ─────────────────────────────────────────────────────────────
router.post('/payment-detected', async (req, res) => {
  // Validate webhook secret if configured
  if (!isValidWebhookRequest(req)) {
    console.warn('[webhook/payment-detected] Rejected request: invalid secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { phone, message, instanceName } = req.body;

  if (!phone || !instanceName) {
    return res.status(400).json({ received: false, error: 'phone and instanceName are required' });
  }

  console.log(`[webhook/payment-detected] Phone: ${phone} | Instance: ${instanceName}`);

  // Acknowledge immediately
  res.json({ received: true });

  try {
    if (isPaymentMessage(message || '')) {
      await handlePaymentDetected(phone, instanceName);
    } else {
      console.log('[webhook/payment-detected] Message does not contain payment keywords, skipping');
    }
  } catch (err) {
    console.error('[webhook/payment-detected] Error:', err.message);
  }
});

module.exports = router;
