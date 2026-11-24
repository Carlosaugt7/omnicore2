-- ================================================================
-- OmniCore — Migration: Compartilhamento Bidirecional de Admins e Painéis de Serviços
-- Data: 2026-11-24
-- ================================================================

-- 1. Adicionar colunas de suporte a painéis na tabela services
ALTER TABLE public.services 
  ADD COLUMN IF NOT EXISTS panel_url TEXT,
  ADD COLUMN IF NOT EXISTS panel_username TEXT,
  ADD COLUMN IF NOT EXISTS panel_password TEXT;

-- 2. Atualizar a função de segurança para compartilhamento BIDIRECIONAL
-- Permite que Carlos e Andressa tenham acesso total e espelhado à base um do outro
CREATE OR REPLACE FUNCTION public.check_shared_access(uid uuid, row_owner uuid)
RETURNS boolean AS $$
BEGIN
  -- 1) Se o usuário for o próprio dono da linha, acesso liberado
  -- 2) Se ambos pertencerem aos admins master (Carlos e Andressa), acesso mútuo liberado
  RETURN uid = row_owner OR 
         (uid IN ('d267b748-8f3b-4684-85e9-589dc9a79a93', 'd9919cb5-c4a4-43c3-8614-878495d18c37') 
          AND row_owner IN ('d267b748-8f3b-4684-85e9-589dc9a79a93', 'd9919cb5-c4a4-43c3-8614-878495d18c37'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Atualizar políticas de RLS em todas as tabelas compartilhadas
DO $$ 
BEGIN
  -- Clients
  DROP POLICY IF EXISTS "clients: owner full access" ON public.clients;
  DROP POLICY IF EXISTS "clients: owner full access (shared)" ON public.clients;
  DROP POLICY IF EXISTS "clients: shared access" ON public.clients;
  CREATE POLICY "clients: shared access" ON public.clients FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));

  -- Services
  DROP POLICY IF EXISTS "services: owner full access" ON public.services;
  DROP POLICY IF EXISTS "services: shared access" ON public.services;
  CREATE POLICY "services: shared access" ON public.services FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));

  -- Transactions
  DROP POLICY IF EXISTS "transactions: owner full access" ON public.transactions;
  DROP POLICY IF EXISTS "transactions: owner full access (shared)" ON public.transactions;
  DROP POLICY IF EXISTS "transactions: shared access" ON public.transactions;
  CREATE POLICY "transactions: shared access" ON public.transactions FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));

  -- Settings
  DROP POLICY IF EXISTS "settings: owner full access" ON public.settings;
  DROP POLICY IF EXISTS "settings: shared access" ON public.settings;
  CREATE POLICY "settings: shared access" ON public.settings FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));

  -- Reminder Logs
  DROP POLICY IF EXISTS "reminder_logs: owner read" ON public.reminder_logs;
  DROP POLICY IF EXISTS "reminder_logs: shared access" ON public.reminder_logs;
  CREATE POLICY "reminder_logs: shared access" ON public.reminder_logs FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));

  -- Notifications
  DROP POLICY IF EXISTS "notifications: owner select" ON public.notifications;
  DROP POLICY IF EXISTS "notifications: owner update" ON public.notifications;
  DROP POLICY IF EXISTS "notifications: owner delete" ON public.notifications;
  DROP POLICY IF EXISTS "notifications: shared access" ON public.notifications;
  CREATE POLICY "notifications: shared access" ON public.notifications FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));

  -- Mac Addresses
  DROP POLICY IF EXISTS "mac_addresses: owner full access" ON public.mac_addresses;
  DROP POLICY IF EXISTS "mac_addresses: shared access" ON public.mac_addresses;
  CREATE POLICY "mac_addresses: shared access" ON public.mac_addresses FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));
END $$;
