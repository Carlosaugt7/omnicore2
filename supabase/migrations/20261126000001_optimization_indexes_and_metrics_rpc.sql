-- ================================================================
-- OmniCore — Migration: Otimização (Índices Compostos + RPC de Métricas)
-- Data: 2026-11-26
-- ================================================================

-- 1. Índices compostos para acelerar métricas do Dashboard, Financeiro e Relatórios
CREATE INDEX IF NOT EXISTS transactions_user_status_type_paid_at_idx
  ON public.transactions (user_id, status, type, paid_at);

CREATE INDEX IF NOT EXISTS transactions_user_type_created_at_idx
  ON public.transactions (user_id, type, created_at);

CREATE INDEX IF NOT EXISTS reminder_logs_user_sent_at_idx
  ON public.reminder_logs (user_id, sent_at);

-- 2. RPC para cálculo agregado de métricas financeiras e de clientes no servidor
-- Elimina o limite de 1.000 linhas do PostgREST e evita trafegar milhares de linhas ao navegador
CREATE OR REPLACE FUNCTION public.get_omnicore_metrics(
  p_user_id uuid,
  p_today date DEFAULT (now() AT TIME ZONE 'America/Manaus')::date,
  p_month_start date DEFAULT date_trunc('month', (now() AT TIME ZONE 'America/Manaus'))::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next_month date := (p_month_start + interval '1 month')::date;
  v_prev_month_start date := (p_month_start - interval '1 month')::date;
  v_prev_month_end date := (p_month_start - interval '1 day')::date;
  v_in_5_days date := (p_today + interval '5 days')::date;
  v_in_7_days date := (p_today + interval '7 days')::date;
  v_in_30_days date := (p_today + interval '30 days')::date;
  v_last_30_days timestamptz := (p_today - interval '30 days')::timestamptz;

  v_gross_this_month numeric := 0;
  v_paid_expenses_this_month numeric := 0;
  v_gross_prev_month numeric := 0;
  v_paid_expenses_prev_month numeric := 0;
  v_total_expenses_month numeric := 0;

  v_to_renew_count bigint := 0;
  v_to_renew_value numeric := 0;
  v_overdue_count bigint := 0;
  v_overdue_value numeric := 0;
  v_active_count bigint := 0;
  v_next_revenue numeric := 0;
  v_fin_to_receive numeric := 0;
  v_paid_last_30 bigint := 0;
  v_renewal_rate integer := 0;
BEGIN
  -- Verifica permissão (próprio usuário ou acesso compartilhado Carlos/Andressa)
  IF auth.uid() IS NOT NULL AND NOT public.check_shared_access(auth.uid(), p_user_id) THEN
    RAISE EXCEPTION 'Acesso negado às métricas deste usuário';
  END IF;

  -- Transações do mês atual e anterior
  SELECT
    COALESCE(SUM(CASE WHEN status = 'pago' AND COALESCE(type, '') <> 'saida' AND paid_at >= p_month_start::timestamptz AND paid_at < v_next_month::timestamptz THEN value ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'pago' AND type = 'saida' AND paid_at >= p_month_start::timestamptz AND paid_at < v_next_month::timestamptz THEN value ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'pago' AND COALESCE(type, '') <> 'saida' AND paid_at >= v_prev_month_start::timestamptz AND paid_at <= (v_prev_month_end::text || ' 23:59:59')::timestamptz THEN value ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'pago' AND type = 'saida' AND paid_at >= v_prev_month_start::timestamptz AND paid_at <= (v_prev_month_end::text || ' 23:59:59')::timestamptz THEN value ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'saida' AND created_at >= p_month_start::timestamptz AND created_at < v_next_month::timestamptz THEN value ELSE 0 END), 0),
    COUNT(DISTINCT CASE WHEN status = 'pago' AND COALESCE(type, '') <> 'saida' AND paid_at >= v_last_30_days AND client_id IS NOT NULL THEN client_id END)
  INTO
    v_gross_this_month,
    v_paid_expenses_this_month,
    v_gross_prev_month,
    v_paid_expenses_prev_month,
    v_total_expenses_month,
    v_paid_last_30
  FROM public.transactions
  WHERE user_id = p_user_id;

  -- Métricas de Clientes
  SELECT
    COUNT(*) FILTER (WHERE status = 'ativo' AND due_date IS NOT NULL AND due_date >= p_today AND due_date <= v_in_7_days),
    COALESCE(SUM(value) FILTER (WHERE status = 'ativo' AND due_date IS NOT NULL AND due_date >= p_today AND due_date <= v_in_7_days), 0),
    COUNT(*) FILTER (WHERE status <> 'cancelado' AND due_date IS NOT NULL AND due_date < p_today),
    COALESCE(SUM(value) FILTER (WHERE status <> 'cancelado' AND due_date IS NOT NULL AND due_date < p_today), 0),
    COUNT(*) FILTER (WHERE status = 'ativo'),
    COALESCE(SUM(value) FILTER (WHERE status = 'ativo' AND due_date IS NOT NULL AND due_date <= v_in_30_days), 0),
    COALESCE(SUM(value) FILTER (WHERE status = 'ativo' AND due_date IS NOT NULL AND due_date >= p_today AND due_date <= v_in_5_days), 0)
  INTO
    v_to_renew_count,
    v_to_renew_value,
    v_overdue_count,
    v_overdue_value,
    v_active_count,
    v_next_revenue,
    v_fin_to_receive
  FROM public.clients
  WHERE user_id = p_user_id;

  IF v_active_count > 0 THEN
    v_renewal_rate := ROUND((v_paid_last_30::numeric / v_active_count::numeric) * 100)::integer;
  END IF;

  RETURN jsonb_build_object(
    'revenueThisMonth', v_gross_this_month - v_paid_expenses_this_month,
    'revenuePrevMonth', v_gross_prev_month - v_paid_expenses_prev_month,
    'toRenewCount', v_to_renew_count,
    'toRenewValue', v_to_renew_value,
    'overdueCount', v_overdue_count,
    'overdueValue', v_overdue_value,
    'renewalRate', v_renewal_rate,
    'activeCount', v_active_count,
    'nextRevenue', v_next_revenue,
    'finToReceive', v_fin_to_receive,
    'finOverdue', v_overdue_value,
    'finExpenses', v_total_expenses_month
  );
END;
$$;
