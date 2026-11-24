-- Script SQL para ser rodado no Supabase para permitir o compartilhamento

-- 0. Adicionar suporte a campos de painel na tabela services
ALTER TABLE public.services 
  ADD COLUMN IF NOT EXISTS panel_url TEXT,
  ADD COLUMN IF NOT EXISTS panel_username TEXT,
  ADD COLUMN IF NOT EXISTS panel_password TEXT;

-- 1. Função auxiliar de segurança para checar o compartilhamento
CREATE OR REPLACE FUNCTION public.check_shared_access(uid uuid, row_owner uuid)
RETURNS boolean AS $$
BEGIN
  -- Se você for o dono, passa.
  -- Se ambos forem Carlos e Andressa, passa bidirecionalmente.
  RETURN uid = row_owner OR 
         (uid IN ('d267b748-8f3b-4684-85e9-589dc9a79a93', 'd9919cb5-c4a4-43c3-8614-878495d18c37') 
          AND row_owner IN ('d267b748-8f3b-4684-85e9-589dc9a79a93', 'd9919cb5-c4a4-43c3-8614-878495d18c37'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Atualizando as políticas (policies) de todas as 7 tabelas
DO $$ 
DECLARE
  p_name text;
BEGIN
  -- Drop políticas antigas se existirem para recriá-las
  DROP POLICY IF EXISTS "clients: owner full access" ON public.clients;
  DROP POLICY IF EXISTS "services: owner full access" ON public.services;
  DROP POLICY IF EXISTS "transactions: owner full access" ON public.transactions;
  DROP POLICY IF EXISTS "mac_addresses: owner full access" ON public.mac_addresses;
  DROP POLICY IF EXISTS "settings: owner full access" ON public.settings;
  DROP POLICY IF EXISTS "reminder_logs: owner read" ON public.reminder_logs;
  DROP POLICY IF EXISTS "notifications: owner select" ON public.notifications;
  DROP POLICY IF EXISTS "notifications: owner update" ON public.notifications;
  DROP POLICY IF EXISTS "notifications: owner delete" ON public.notifications;

  -- Criando novas políticas que usam a função check_shared_access
  CREATE POLICY "clients: shared access" ON public.clients FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));

  CREATE POLICY "services: shared access" ON public.services FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));

  CREATE POLICY "transactions: shared access" ON public.transactions FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));

  CREATE POLICY "mac_addresses: shared access" ON public.mac_addresses FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));

  CREATE POLICY "settings: shared access" ON public.settings FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));

  CREATE POLICY "reminder_logs: shared access" ON public.reminder_logs FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));

  CREATE POLICY "notifications: shared access" ON public.notifications FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));
END $$;
