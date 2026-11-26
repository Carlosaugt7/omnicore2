const { supabase } = require('../lib/supabase');
const { logger } = require('../lib/logger');
const { getUserSettings, sendMessage } = require('./evolutionService');

const WEEKDAY_MAP = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const WEEKDAY_NAMES_PT = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

/**
 * Formata valor numérico para Real brasileiro (R$ X.XXX,XX)
 */
function formatBRL(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Retorna data, hora, dia da semana e limites do mês no fuso horário informado.
 */
function getDateInfoInTZ(tz) {
  const safeTz = tz || 'America/Manaus';
  const now = new Date();

  let parts;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: safeTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    });
    parts = formatter.formatToParts(now);
  } catch {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    });
    parts = formatter.formatToParts(now);
  }

  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour') === '24' ? '00' : get('hour');
  const minute = get('minute');
  const weekdayShort = get('weekday');

  const dateStr = `${year}-${month}-${day}`;
  const hhmm = `${hour}:${minute}`;
  const dayOfWeek = WEEKDAY_MAP[weekdayShort] ?? 0;

  const yNum = Number(year);
  const mNum = Number(month);
  const monthStart = `${year}-${month}-01`;
  const nextM = mNum === 12 ? 1 : mNum + 1;
  const nextY = mNum === 12 ? yNum + 1 : yNum;
  const nextMonth = `${nextY}-${String(nextM).padStart(2, '0')}-01`;

  return {
    dateStr,
    dateBR: `${day}-${month}-${year}`,
    hhmm,
    dayOfWeek,
    dayName: WEEKDAY_NAMES_PT[dayOfWeek] || '',
    monthStart,
    nextMonth,
  };
}

/**
 * Adiciona dias a uma data YYYY-MM-DD e retorna YYYY-MM-DD.
 */
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().split('T')[0];
}

/**
 * Busca todas as linhas de uma tabela paginando em lotes de 1000 (fallback caso RPC não exista).
 */
async function fetchAllRows(table, userId) {
  const all = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Erro ao buscar ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/**
 * Calcula todas as métricas de Dashboard e Financeiro para o usuário.
 * Usa a RPC get_omnicore_metrics no PostgreSQL (sem limite de 1000 linhas).
 */
async function calculateReportMetrics(userId, timezone) {
  const info = getDateInfoInTZ(timezone);
  const todayStr = info.dateStr;

  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_omnicore_metrics', {
    p_user_id: userId,
    p_today: todayStr,
    p_month_start: info.monthStart,
  });

  if (!rpcErr && rpcData) {
    return {
      info,
      dashboard: {
        revenueThisMonth: Number(rpcData.revenueThisMonth || 0),
        toRenewCount: Number(rpcData.toRenewCount || 0),
        toRenewValue: Number(rpcData.toRenewValue || 0),
        clientsOverdueCount: Number(rpcData.overdueCount || 0),
        clientsOverdueValue: Number(rpcData.overdueValue || 0),
        renewalRate: Number(rpcData.renewalRate || 0),
        activeCount: Number(rpcData.activeCount || 0),
        nextRevenue: Number(rpcData.nextRevenue || 0),
      },
      financial: {
        finToReceive: Number(rpcData.finToReceive || 0),
        finOverdue: Number(rpcData.finOverdue || 0),
        finExpenses: Number(rpcData.finExpenses || 0),
      },
    };
  }

  const in5Str = addDays(todayStr, 5);
  const in7Str = addDays(todayStr, 7);
  const in30Str = addDays(todayStr, 30);
  const last30Str = addDays(todayStr, -30);

  const [clients, transactions] = await Promise.all([
    fetchAllRows('clients', userId),
    fetchAllRows('transactions', userId),
  ]);

  // ── Métricas do Dashboard ──
  const grossThisMonth = transactions
    .filter(
      (t) =>
        t.status === 'pago' &&
        t.type !== 'saida' &&
        t.paid_at &&
        t.paid_at >= info.monthStart &&
        t.paid_at < info.nextMonth
    )
    .reduce((sum, t) => sum + Number(t.value || 0), 0);

  const paidExpensesThisMonth = transactions
    .filter(
      (t) =>
        t.status === 'pago' &&
        t.type === 'saida' &&
        t.paid_at &&
        t.paid_at >= info.monthStart &&
        t.paid_at < info.nextMonth
    )
    .reduce((sum, t) => sum + Number(t.value || 0), 0);

  const revenueThisMonth = grossThisMonth - paidExpensesThisMonth;

  const toRenewClients = clients.filter(
    (c) => c.status === 'ativo' && c.due_date && c.due_date >= todayStr && c.due_date <= in7Str
  );
  const toRenewCount = toRenewClients.length;
  const toRenewValue = toRenewClients.reduce((sum, c) => sum + Number(c.value || 0), 0);

  const overdueClients = clients.filter(
    (c) => c.status !== 'cancelado' && c.due_date && c.due_date < todayStr
  );
  const clientsOverdueCount = overdueClients.length;
  const clientsOverdueValue = overdueClients.reduce((sum, c) => sum + Number(c.value || 0), 0);

  const activeClients = clients.filter((c) => c.status === 'ativo');
  const activeCount = activeClients.length;

  const paidLast30 = new Set(
    transactions
      .filter(
        (t) =>
          t.status === 'pago' &&
          t.type !== 'saida' &&
          t.paid_at &&
          t.paid_at >= last30Str &&
          t.client_id
      )
      .map((t) => t.client_id)
  );
  const renewalRate = activeCount > 0 ? Math.round((paidLast30.size / activeCount) * 100) : 0;

  const nextRevenue = clients
    .filter((c) => c.status === 'ativo' && c.due_date && c.due_date <= in30Str)
    .reduce((sum, c) => sum + Number(c.value || 0), 0);

  // ── Métricas do Financeiro ──
  const finToReceive = clients
    .filter((c) => c.status === 'ativo' && c.due_date && c.due_date >= todayStr && c.due_date <= in5Str)
    .reduce((sum, c) => sum + Number(c.value || 0), 0);

  const finOverdue = overdueClients.reduce((sum, c) => sum + Number(c.value || 0), 0);

  const finExpenses = transactions
    .filter(
      (t) =>
        t.type === 'saida' &&
        t.created_at &&
        t.created_at >= info.monthStart &&
        t.created_at < info.nextMonth
    )
    .reduce((sum, t) => sum + Number(t.value || 0), 0);

  return {
    info,
    dashboard: {
      revenueThisMonth,
      toRenewCount,
      toRenewValue,
      clientsOverdueCount,
      clientsOverdueValue,
      renewalRate,
      activeCount,
      nextRevenue,
    },
    financial: {
      finToReceive,
      finOverdue,
      finExpenses,
    },
  };
}

/**
 * Monta o texto formatado para envio no WhatsApp conforme as opções marcadas.
 */
function buildReportMessage(config, metrics) {
  const { info, dashboard, financial } = metrics;
  const lines = [
    `📊 *RELATÓRIO SEMANAL - OMNICORE*`,
    `📅 ${info.dayName}, ${info.dateBR} às ${info.hhmm}`,
    '',
  ];

  const dashLines = [];
  if (config.include_revenue_month) {
    dashLines.push(`• *Receita do Mês:* ${formatBRL(dashboard.revenueThisMonth)}`);
  }
  if (config.include_to_renew) {
    dashLines.push(`• *A Renovar (7 dias):* ${dashboard.toRenewCount} clientes (${formatBRL(dashboard.toRenewValue)})`);
  }
  if (config.include_clients_overdue) {
    dashLines.push(`• *Em Atraso:* ${dashboard.clientsOverdueCount} clientes (${formatBRL(dashboard.clientsOverdueValue)})`);
  }
  if (config.include_renewal_rate) {
    dashLines.push(`• *Taxa de Renovação:* ${dashboard.renewalRate}%`);
  }
  if (config.include_active_clients) {
    dashLines.push(`• *Clientes Ativos:* ${dashboard.activeCount}`);
  }
  if (config.include_next_revenue) {
    dashLines.push(`• *Próxima Receita (30d):* ${formatBRL(dashboard.nextRevenue)}`);
  }

  if (dashLines.length > 0) {
    lines.push('📌 *DASHBOARD*');
    lines.push(...dashLines);
    lines.push('');
  }

  const finLines = [];
  if (config.include_fin_to_receive) {
    finLines.push(`• *A Receber (5 dias):* ${formatBRL(financial.finToReceive)}`);
  }
  if (config.include_fin_overdue) {
    finLines.push(`• *Em Atraso (Valor):* ${formatBRL(financial.finOverdue)}`);
  }
  if (config.include_fin_expenses) {
    finLines.push(`• *Despesas (Mês):* ${formatBRL(financial.finExpenses)}`);
  }

  if (finLines.length > 0) {
    lines.push('💰 *FINANCEIRO*');
    lines.push(...finLines);
    lines.push('');
  }

  if (dashLines.length === 0 && finLines.length === 0) {
    lines.push('⚠️ Nenhuma métrica foi selecionada para exibição neste relatório.');
  }

  return lines.join('\n').trim();
}

/**
 * Envia o relatório semanal para os até 2 números configurados.
 */
async function sendWeeklyReportForUser(userId, { manual = false } = {}) {
  const { data: config, error: cfgErr } = await supabase
    .from('report_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (cfgErr) throw new Error(cfgErr.message);
  if (!config) throw new Error('Configuração de relatório não encontrada. Salve as configurações primeiro.');

  const phones = [config.phone_1, config.phone_2]
    .map((p) => (p || '').trim())
    .filter(Boolean);

  if (phones.length === 0) {
    throw new Error('Nenhum número de WhatsApp configurado para receber o relatório.');
  }

  const settings = await getUserSettings(userId);
  if (settings.evolution_status !== 'open') {
    throw new Error('WhatsApp não conectado (evolution_status != open).');
  }

  const metrics = await calculateReportMetrics(userId, config.timezone);
  const messageText = buildReportMessage(config, metrics);

  const results = [];
  for (const phone of phones) {
    try {
      await sendMessage(settings, phone, messageText);
      results.push({ phone, success: true });
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      results.push({ phone, success: false, error: msg });
      logger.error({ userId, phone, err: msg }, 'reportService: falha ao enviar relatório');
    }
  }

  const anySuccess = results.some((r) => r.success);

  // Atualiza last_sent_date apenas no disparo automático para evitar duplicidade no mesmo dia
  if (!manual && anySuccess) {
    await supabase
      .from('report_settings')
      .update({
        last_sent_date: metrics.info.dateStr,
        updated_at: new Date().toISOString(),
      })
      .eq('id', config.id);
  }

  return {
    success: anySuccess,
    results,
    preview: messageText,
  };
}

/**
 * Executado a cada minuto pelo cron do servidor para verificar envios semanais agendados.
 */
async function processScheduledReports() {
  const { data: configs, error } = await supabase
    .from('report_settings')
    .select('*')
    .eq('enabled', true);

  if (error) {
    logger.error({ error: error.message }, 'reportService: erro ao buscar configurações de relatório');
    return;
  }

  if (!configs || configs.length === 0) return;

  for (const config of configs) {
    try {
      const info = getDateInfoInTZ(config.timezone);
      const isTargetDay = Number(config.day_of_week) === info.dayOfWeek;
      const isTargetTime = config.send_time === info.hhmm;
      const alreadySentToday = config.last_sent_date === info.dateStr;

      if (isTargetDay && isTargetTime && !alreadySentToday) {
        logger.info(
          { userId: config.user_id, day: info.dayName, time: info.hhmm, tz: config.timezone },
          'reportService: disparando relatório semanal agendado'
        );
        const res = await sendWeeklyReportForUser(config.user_id, { manual: false });
        logger.info({ userId: config.user_id, res }, 'reportService: envio semanal finalizado');
      }
    } catch (err) {
      logger.error({ userId: config.user_id, err: err.message }, 'reportService: erro no processamento agendado');
    }
  }
}

module.exports = {
  calculateReportMetrics,
  buildReportMessage,
  sendWeeklyReportForUser,
  processScheduledReports,
};
