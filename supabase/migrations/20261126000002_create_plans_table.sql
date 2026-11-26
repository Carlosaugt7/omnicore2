-- ================================================================
-- OmniCore — Migration: Tabela de Planos Independentes
-- Data: 2026-11-26
-- ================================================================

-- 1. Criar tabela public.plans
CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  value numeric(10,2) NOT NULL DEFAULT 0,
  duration_days integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plans_user_id_idx
  ON public.plans (user_id);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "plans: shared access" ON public.plans;
  CREATE POLICY "plans: shared access" ON public.plans FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));
END $$;

-- 2. Tornar plan_name opcional na tabela services (agora focada nos servidores/painéis)
ALTER TABLE public.services
  ALTER COLUMN plan_name DROP NOT NULL;

-- 3. Migrar automaticamente planos únicos já existentes em services para plans
INSERT INTO public.plans (user_id, name, value)
SELECT DISTINCT ON (s.user_id, s.plan_name)
  s.user_id,
  s.plan_name,
  COALESCE(s.value, 0)
FROM public.services s
WHERE s.plan_name IS NOT NULL
  AND trim(s.plan_name) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.plans p
    WHERE p.user_id = s.user_id AND lower(p.name) = lower(s.plan_name)
  );
