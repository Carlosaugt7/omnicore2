const { supabase } = require('../lib/supabase');
const { createEvolutionClient, formatPhone } = require('../lib/evolutionApi');

/**
 * Fetches the user settings row from Supabase.
 * @param {string} userId
 * @returns {Promise<object>} settings row
 */
async function getUserSettings(userId) {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) throw new Error(`Settings not found for user ${userId}`);
  return data;
}

/**
 * Replaces template variables with actual client data.
 * @param {string} template
 * @param {object} client
 * @param {object} settings
 * @returns {string}
 */
function buildMessage(template, client, settings) {
  if (!template) return '';

  const dueDate = client.due_date
    ? new Date(client.due_date + 'T00:00:00').toLocaleDateString('pt-BR')
    : '';

  const value = client.value
    ? `R$ ${Number(client.value).toFixed(2).replace('.', ',')}`
    : '';

  return template
    .replace(/\{nome\}/gi, client.name || '')
    .replace(/\{plano\}/gi, client.plan || '')
    .replace(/\{valor\}/gi, value)
    .replace(/\{vencimento\}/gi, dueDate)
    .replace(/\{servidor\}/gi, client.server || '')
    .replace(/\{chavePix\}/gi, settings.pix_key || '');
}

/**
 * Sends a WhatsApp text message via Evolution API.
 * @param {object} settings - User settings with evolution credentials
 * @param {string} phone - Destination phone number (raw)
 * @param {string} text - Message text
 * @returns {Promise<object>} Evolution API response
 */
async function sendMessage(settings, phone, text) {
  const client = createEvolutionClient(
    settings.evolution_api_url,
    settings.evolution_api_key
  );

  const formattedPhone = formatPhone(phone);
  const number = `${formattedPhone}@s.whatsapp.net`;

  const { data } = await client.post(
    `/message/sendText/${settings.evolution_instance}`,
    { number, text }
  );

  return data;
}

/**
 * Saves a reminder log entry to Supabase.
 * @param {object} params
 */
async function saveReminderLog({
  userId,
  clientId,
  clientName,
  phone,
  templateType,
  status,
  messageId,
  errorMessage,
}) {
  const { error } = await supabase.from('reminder_logs').insert({
    user_id: userId,
    client_id: clientId,
    client_name: clientName,
    phone,
    template_type: templateType,
    status,
    message_id: messageId || null,
    error_message: errorMessage || null,
    sent_at: new Date().toISOString(),
  });

  if (error) console.error('[reminder_logs] Insert error:', error.message);
}

/**
 * Checks if a reminder was already sent today for a given client + template.
 * @param {string} clientId
 * @param {string} templateType
 * @returns {Promise<boolean>}
 */
async function alreadySentToday(clientId, templateType) {
  const d = new Date();
  const tzDateString = d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  const tzDate = new Date(tzDateString);
  const today = tzDate.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('reminder_logs')
    .select('id')
    .eq('client_id', clientId)
    .eq('template_type', templateType)
    .eq('status', 'success')
    .gte('sent_at', `${today}T00:00:00.000Z`)
    .lte('sent_at', `${today}T23:59:59.999Z`)
    .limit(1);

  if (error) return false;
  return data && data.length > 0;
}

module.exports = {
  getUserSettings,
  buildMessage,
  sendMessage,
  saveReminderLog,
  alreadySentToday,
};
