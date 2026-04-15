const { supabase } = require('../lib/supabase');
const {
  getUserSettings,
  buildMessage,
  sendMessage,
  saveReminderLog,
  alreadySentToday,
} = require('./evolutionService');

/**
 * Returns a date string (YYYY-MM-DD) offset by `days` from today.
 * @param {number} days - Positive = future, negative = past
 * @returns {string}
 */
function getDateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
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
        summary.errors.push(`Client ${client.id} (${client.name}): ${err.message}`);

        await saveReminderLog({
          userId,
          clientId: client.id,
          clientName: client.name,
          phone: client.phone,
          templateType: type,
          status: 'failed',
          errorMessage: err.message,
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
    console.error('[scheduler] Error fetching active users:', error.message);
    return results;
  }

  console.log(`[scheduler] Running job for ${allSettings?.length || 0} connected user(s)`);

  for (const row of allSettings || []) {
    try {
      results[row.user_id] = await runJobForUser(row.user_id);
      console.log(`[scheduler] User ${row.user_id}:`, results[row.user_id]);
    } catch (err) {
      results[row.user_id] = { error: err.message };
      console.error(`[scheduler] User ${row.user_id} failed:`, err.message);
    }
  }

  return results;
}

module.exports = { runJobForUser, runJobForAllUsers };
