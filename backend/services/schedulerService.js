const { supabase } = require('../lib/supabase');
const { logger } = require('../lib/logger');
const {
  getUserSettings,
  buildMessage,
  sendMessage,
  saveReminderLog,
  alreadySentToday,
} = require('./evolutionService');

/**
 * Returns a date string (YYYY-MM-DD) offset by `days` from today, using local Brazilian timezone.
 * @param {number} days - Positive = future, negative = past
 * @returns {string}
 */
function getDateOffset(days) {
  const d = new Date();
  const tzDateString = d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  const tzDate = new Date(tzDateString);
  tzDate.setDate(tzDate.getDate() + days);
  
  const year = tzDate.getFullYear();
  const month = String(tzDate.getMonth() + 1).padStart(2, '0');
  const day = String(tzDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Runs the reminder job for a single user.
 * Sends messages to clients based on their due_date relative to today.
 * @param {string} userId
 * @returns {Promise<object>} Summary of sent/skipped/failed
 */
async function runJobForUser(userId) {
  const summary = { sent: 0, skipped: 0, failed: 0, errors: [] };

  let settings;
  try {
    settings = await getUserSettings(userId);
  } catch (err) {
    summary.errors.push(`Settings error: ${err.message}`);
    return summary;
  }

  // Only run if WhatsApp is connected
  if (settings.evolution_status !== 'open') {
    summary.errors.push('WhatsApp not connected (evolution_status != open)');
    return summary;
  }

  const tomorrow = getDateOffset(1);
  const today = getDateOffset(0);
  const yesterday = getDateOffset(-1);

  // Build the list of (due_date → templateType) pairs based on user preferences
  const targets = [];
  if (settings.send_before_due !== false) targets.push({ date: tomorrow, type: 'template_before' });
  if (settings.send_on_due !== false)     targets.push({ date: today,    type: 'template_today' });
  if (settings.send_overdue !== false)    targets.push({ date: yesterday, type: 'template_overdue' });

  for (const { date, type } of targets) {
    const template = settings[type];
    if (!template) continue; // skip if template not configured

    // Fetch active clients with matching due_date
    const { data: clients, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', userId)
      .eq('due_date', date)
      .eq('status', 'ativo');

    if (error) {
      summary.errors.push(`DB error fetching clients for ${date}: ${error.message}`);
      continue;
    }

    for (const client of clients || []) {
      try {
        // Deduplication: skip if already sent today
        const sent = await alreadySentToday(client.id, type);
        if (sent) {
          summary.skipped++;
          continue;
        }

        const text = buildMessage(template, client, settings);
        const result = await sendMessage(settings, client.phone, text);

        if (settings.send_pix_separately && settings.pix_key) {
          await sendMessage(settings, client.phone, settings.pix_key);
        }

        await saveReminderLog({
          userId,
          clientId: client.id,
          clientName: client.name,
          phone: client.phone,
          templateType: type,
          status: 'success',
          messageId: result?.key?.id || result?.messageId || null,
        });

        summary.sent++;
      } catch (err) {
        summary.failed++;
        const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message;
        summary.errors.push(`Client ${client.id} (${client.name}): ${errorMsg}`);

        await saveReminderLog({
          userId,
          clientId: client.id,
          clientName: client.name,
          phone: client.phone,
          templateType: type,
          status: 'failed',
          errorMessage: errorMsg,
        });
      }
    }
  }

  return summary;
}

/**
 * Runs the reminder job for ALL users with evolution_status = 'open'.
 * @returns {Promise<object>} Results per userId
 */
async function runJobForAllUsers() {
  const results = {};

  const { data: allSettings, error } = await supabase
    .from('settings')
    .select('user_id')
    .eq('evolution_status', 'open');

  if (error) {
    logger.error({ error }, 'scheduler: error fetching active users');
    return results;
  }

  logger.info({ count: allSettings?.length || 0 }, 'scheduler: running job for connected users');

  for (const row of allSettings || []) {
    try {
      results[row.user_id] = await runJobForUser(row.user_id);
      logger.info({ userId: row.user_id, result: results[row.user_id] }, 'scheduler: job completed');
    } catch (err) {
      results[row.user_id] = { error: err.message };
      logger.error({ userId: row.user_id, err }, 'scheduler: user job failed');
    }
  }

  return results;
}

module.exports = { runJobForUser, runJobForAllUsers };
