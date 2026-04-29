-- ================================================================
-- SCRIPT DE LIMPEZA E RESTAURAÇÃO — OMNICORE EXCLUSIVE
-- Objetivo: Remover resquícios do ZapFlow e restaurar visibilidade
-- ================================================================

-- 1. Remover schemas intrusos (se existirem)
DROP SCHEMA IF EXISTS zf CASCADE;

-- 2. Remover tabelas com prefixo zf_ no schema public
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'zf_%') LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END $$;

-- 3. Restaurar Search Path padrão
-- Isso garante que o OmniCore sempre olhe primeiro para o schema public
ALTER ROLE authenticator SET search_path TO public, extensions;
ALTER ROLE anon SET search_path TO public, extensions;
ALTER ROLE authenticated SET search_path TO public, extensions;

-- 4. Re-garantir permissões básicas no schema public
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- 5. Restaurar Políticas de RLS do OmniCore (Garantia)
-- Vamos garantir que as políticas de compartilhamento (Carlos/Andressa) estejam ativas
DO $$ 
BEGIN
    -- Se a função de compartilhamento não existir, criamos
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_shared_access') THEN
        CREATE FUNCTION public.check_shared_access(uid uuid, row_owner uuid)
        RETURNS boolean AS '
        BEGIN
          RETURN uid = row_owner OR 
                 (uid = ''d267b748-8f3b-4684-85e9-589dc9a79a93'' AND row_owner = ''d9919cb5-c4a4-43c3-8614-878495d18c37'');
        END;
        ' LANGUAGE plpgsql SECURITY DEFINER;
    END IF;
END $$;

-- Atualizar/Recriar políticas para as tabelas principais
-- Clients
DROP POLICY IF EXISTS "clients: owner full access" ON public.clients;
DROP POLICY IF EXISTS "clients: shared access" ON public.clients;
CREATE POLICY "clients: shared access" ON public.clients FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));

-- Settings (Onde estão as configs de WhatsApp)
DROP POLICY IF EXISTS "settings: owner full access" ON public.settings;
DROP POLICY IF EXISTS "settings: shared access" ON public.settings;
CREATE POLICY "settings: shared access" ON public.settings FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));

-- Transactions
DROP POLICY IF EXISTS "transactions: owner full access" ON public.transactions;
DROP POLICY IF EXISTS "transactions: shared access" ON public.transactions;
CREATE POLICY "transactions: shared access" ON public.transactions FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));

-- Mac Addresses
DROP POLICY IF EXISTS "mac_addresses: owner full access" ON public.mac_addresses;
DROP POLICY IF EXISTS "mac_addresses: shared access" ON public.mac_addresses;
CREATE POLICY "mac_addresses: shared access" ON public.mac_addresses FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));

-- 6. Notificar finalização
DO $$ BEGIN
    RAISE NOTICE 'Limpeza concluída. O OmniCore agora é o único dono do schema public.';
END $$;
