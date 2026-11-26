-- ================================================================
-- OmniCore — Migration: Configurações de Relatório Semanal Automático
-- Data: 2026-11-26
-- ================================================================

CREATE TABLE IF NOT EXISTS public.report_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  phone_1 text,
  phone_2 text,
  day_of_week integer NOT NULL DEFAULT 1, -- 0=Domingo, 1=Segunda, ..., 6=Sábado
  send_time text NOT NULL DEFAULT '09:00',
  timezone text NOT NULL DEFAULT 'America/Manaus',

  -- Métricas do Dashboard
  include_revenue_month boolean NOT NULL DEFAULT true,
  include_to_renew boolean NOT NULL DEFAULT true,
  include_clients_overdue boolean NOT NULL DEFAULT true,
  include_renewal_rate boolean NOT NULL DEFAULT true,
  include_active_clients boolean NOT NULL DEFAULT true,
  include_next_revenue boolean NOT NULL DEFAULT true,

  -- Métricas do Financeiro
  include_fin_to_receive boolean NOT NULL DEFAULT true,
  include_fin_overdue boolean NOT NULL DEFAULT true,
  include_fin_expenses boolean NOT NULL DEFAULT true,

  -- Controle de deduplicação diária (YYYY-MM-DD no fuso configurado)
  last_sent_date text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.report_settings ENABLE ROW LEVEL SECURITY;

-- Política de acesso compartilhado entre os admins (Carlos e Andressa)
DO $$
BEGIN
  DROP POLICY IF EXISTS "report_settings: shared access" ON public.report_settings;
  CREATE POLICY "report_settings: shared access" ON public.report_settings FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));
END $$;
