const { supabase } = require('../lib/supabase');
const { logger } = require('../lib/logger');
const {
  getUserSettings,
  buildMessage,
  sendMessage,
  saveReminderLog,
} = require('./evolutionService');

const CONCURRENCY_LIMIT = 5;

/**
 * Executa uma lista de tarefas assíncronas com limite de concorrência.
 */
async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let idx = 0;

  async function next() {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await worker(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(workers);
  return results;
}

/**
 * Returns a date string (YYYY-MM-DD) offset by `days` from today, using user's timezone.
 * @param {number} days - Positive = future, negative = past
 * @param {string} [tz] - IANA timezone
 * @returns {string}
 */
function getDateOffset(days, tz = 'America/Sao_Paulo') {
  const d = new Date();
  let tzDateString;
  try {
    tzDateString = d.toLocaleString('en-US', { timeZone: tz || 'America/Sao_Paulo' });
  } catch {
    tzDateString = d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  }
  const tzDate = new Date(tzDateString);
  tzDate.setDate(tzDate.getDate() + days);

  const year = tzDate.getFullYear();
  const month = String(tzDate.getMonth() + 1).padStart(2, '0');
  const day = String(tzDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Busca em 1 única query todos os envios com sucesso de hoje para o usuário (elimina N+1).
 */
async function getSentTodaySet(userId, todayStr) {
  const sentSet = new Set();
  const { data, error } = await supabase
    .from('reminder_logs')
    .select('client_id, template_type')
    .eq('user_id', userId)
    .eq('status', 'success')
    .gte('sent_at', `${todayStr}T00:00:00.000Z`)
    .lte('sent_at', `${todayStr}T23:59:59.999Z`);

  if (error) {
    logger.warn({ userId, error: error.message }, 'scheduler: failed to prefetch reminder_logs');
    return sentSet;
  }

  for (const row of data || []) {
    if (row.client_id && row.template_type) {
      sentSet.add(`${row.client_id}|${row.template_type}`);
    }
  }
  return sentSet;
}

/**
 * Busca todos os clientes ativos de uma data de vencimento paginando em lotes de 1000.
 */
async function fetchClientsForDate(userId, date) {
  const all = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', userId)
      .eq('due_date', date)
      .eq('status', 'ativo')
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`DB error fetching clients for ${date}: ${error.message}`);
    if (!data || data.length === 0) break;

    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
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

  const tz = settings.reminder_timezone || 'America/Sao_Paulo';
  const tomorrow = getDateOffset(1, tz);
  const today = getDateOffset(0, tz);
  const yesterday = getDateOffset(-1, tz);

  // Build the list of (due_date → templateType) pairs based on user preferences
  const targets = [];
  if (settings.send_before_due !== false) targets.push({ date: tomorrow, type: 'template_before' });
  if (settings.send_on_due !== false)     targets.push({ date: today,    type: 'template_today' });
  if (settings.send_overdue !== false)    targets.push({ date: yesterday, type: 'template_overdue' });

  // Prefetch em 1 query todos os envios já realizados hoje (elimina N+1)
  const sentTodaySet = await getSentTodaySet(userId, today);

  for (const { date, type } of targets) {
    const template = settings[type];
    if (!template) continue; // skip if template not configured

    let clients;
    try {
      clients = await fetchClientsForDate(userId, date);
    } catch (err) {
      summary.errors.push(err.message);
      continue;
    }

    for (const client of clients) {
      try {
        // Deduplication em memória usando o Set pré-carregado
        if (sentTodaySet.has(`${client.id}|${type}`)) {
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

        sentTodaySet.add(`${client.id}|${type}`);
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
 * Runs the reminder job for ALL users with evolution_status = 'open' in parallel batches.
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

  const users = allSettings || [];
  logger.info({ count: users.length, concurrency: CONCURRENCY_LIMIT }, 'scheduler: running job for connected users');

  await runWithConcurrency(users, CONCURRENCY_LIMIT, async (row) => {
    try {
      results[row.user_id] = await runJobForUser(row.user_id);
      logger.info({ userId: row.user_id, result: results[row.user_id] }, 'scheduler: job completed');
    } catch (err) {
      results[row.user_id] = { error: err.message };
      logger.error({ userId: row.user_id, err }, 'scheduler: user job failed');
    }
  });

  return results;
}

module.exports = { runJobForUser, runJobForAllUsers, runWithConcurrency };
