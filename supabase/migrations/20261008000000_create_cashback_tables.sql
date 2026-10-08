-- ================================================================
-- OmniCore — Tabelas de Cashback para Indicações
-- Permite registrar cashback recorrente a partir da 2ª mensalidade
-- ================================================================

-- 1. Tabela de configurações gerais de cashback
CREATE TABLE IF NOT EXISTS public.cashback_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  default_amount NUMERIC(10, 2) NOT NULL DEFAULT 10.00,
  auto_generate BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_cashback_settings UNIQUE (user_id)
);

-- 2. Tabela de registros de cashback por renovação
CREATE TABLE IF NOT EXISTS public.cashback_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_id UUID REFERENCES public.referrals(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 10.00,
  month_reference TEXT NOT NULL, -- Ex: '2026-10' ou '2º Mês'
  payment_number INT NOT NULL DEFAULT 2, -- 2º mês em diante
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pendente', -- 'pendente', 'pago', 'cancelado'
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_cashback_records_user_id ON public.cashback_records(user_id);
CREATE INDEX IF NOT EXISTS idx_cashback_records_referrer_id ON public.cashback_records(referrer_id);
CREATE INDEX IF NOT EXISTS idx_cashback_records_referred_id ON public.cashback_records(referred_id);
CREATE INDEX IF NOT EXISTS idx_cashback_records_status ON public.cashback_records(status);

-- RLS
ALTER TABLE public.cashback_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashback_records ENABLE ROW LEVEL SECURITY;

-- Políticas com Shared Access (Carlos e Andressa)
DROP POLICY IF EXISTS "cashback_settings: shared access" ON public.cashback_settings;
CREATE POLICY "cashback_settings: shared access"
  ON public.cashback_settings
  FOR ALL
  USING (
    auth.uid() = user_id 
    OR auth.uid() IN (
      'd267b748-8f3b-4684-85e9-589dc9a79a93',
      'd9919cb5-c4a4-43c3-8614-878495d18c37'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR auth.uid() IN (
      'd267b748-8f3b-4684-85e9-589dc9a79a93',
      'd9919cb5-c4a4-43c3-8614-878495d18c37'
    )
  );

DROP POLICY IF EXISTS "cashback_records: shared access" ON public.cashback_records;
CREATE POLICY "cashback_records: shared access"
  ON public.cashback_records
  FOR ALL
  USING (
    auth.uid() = user_id 
    OR auth.uid() IN (
      'd267b748-8f3b-4684-85e9-589dc9a79a93',
      'd9919cb5-c4a4-43c3-8614-878495d18c37'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR auth.uid() IN (
      'd267b748-8f3b-4684-85e9-589dc9a79a93',
      'd9919cb5-c4a4-43c3-8614-878495d18c37'
    )
  );
