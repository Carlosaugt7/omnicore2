-- ================================================================
-- OmniCore — Schema completo para Supabase Self-Hosted (VPS)
-- 
-- COMO USAR:
--   1. Via Studio: Copie e cole no SQL Editor do Supabase Studio
--      (https://supabase.rsconsultoria.pro)
--   2. Via CLI: docker exec -i supabase-db psql -U postgres -d postgres < init-schema.sql
--
-- SEGURO para re-executar (usa IF NOT EXISTS em tudo)
-- ================================================================

-- ── 0. Garantir que roles do Supabase existem ──────────────────
-- O PostgREST precisa do role "authenticator" com login e do
-- role "anon" para requests não autenticados
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
    COMMENT ON ROLE anon IS 'Anonymous role for PostgREST';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
    COMMENT ON ROLE authenticated IS 'Authenticated users role for PostgREST';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    COMMENT ON ROLE service_role IS 'Service role with RLS bypass';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN NOINHERIT;
    COMMENT ON ROLE authenticator IS 'PostgREST authenticator role';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin LOGIN;
    COMMENT ON ROLE supabase_auth_admin IS 'GoTrue auth admin role';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
    CREATE ROLE supabase_storage_admin LOGIN;
    COMMENT ON ROLE supabase_storage_admin IS 'Storage admin role';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin LOGIN BYPASSRLS;
    COMMENT ON ROLE supabase_admin IS 'Supabase admin role';
  END IF;
END $$;

-- Definir senhas dos roles (mesma senha do compose)
ALTER ROLE authenticator WITH PASSWORD 'adm0418supa';
ALTER ROLE supabase_auth_admin WITH PASSWORD 'adm0418supa';
ALTER ROLE supabase_storage_admin WITH PASSWORD 'adm0418supa';
ALTER ROLE supabase_admin WITH PASSWORD 'adm0418supa';

-- Grants de herança
GRANT anon TO authenticator;
GRANT authenticated TO authenticator;
GRANT service_role TO authenticator;
GRANT supabase_admin TO authenticator;

-- ── 0.1 Schema auth (necessário para GoTrue) ──────────────────
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;

-- Tabela mínima de users do auth (GoTrue cria automaticamente,
-- mas precisamos garantir que o FK funcione)
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token varchar(255),
  confirmation_sent_at timestamptz,
  recovery_token varchar(255),
  recovery_sent_at timestamptz,
  email_change_token_new varchar(255),
  email_change varchar(255),
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  created_at timestamptz,
  updated_at timestamptz,
  phone text DEFAULT NULL,
  phone_confirmed_at timestamptz,
  phone_change text DEFAULT '',
  phone_change_token varchar(255) DEFAULT '',
  phone_change_sent_at timestamptz,
  confirmed_at timestamptz GENERATED ALWAYS AS (
    LEAST(email_confirmed_at, phone_confirmed_at)
  ) STORED,
  email_change_token_current varchar(255) DEFAULT '',
  email_change_confirm_status smallint DEFAULT 0,
  banned_until timestamptz,
  reauthentication_token varchar(255) DEFAULT '',
  reauthentication_sent_at timestamptz,
  is_sso_user boolean NOT NULL DEFAULT false,
  deleted_at timestamptz
);

-- Função auth.uid() para RLS
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
$$;

-- Função auth.role() para RLS
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    )::text
$$;

-- Função auth.email() para RLS
CREATE OR REPLACE FUNCTION auth.email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(
      nullif(current_setting('request.jwt.claim.email', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
    )::text
$$;

-- ── 0.2 Grants no schema public ────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- Para tabelas futuras
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- ── 1. clients ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  name        text NOT NULL,
  phone       text NOT NULL,
  email       text,
  server      text,
  plan        text,
  value       numeric(10,2),
  due_date    date,
  status      text NOT NULL DEFAULT 'ativo',
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "clients: owner full access"
    ON public.clients FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. services ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.services (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  plan_name   text NOT NULL,
  server_name text NOT NULL,
  value       numeric(10,2),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "services: owner full access"
    ON public.services FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. transactions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  client_id    uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name  text,
  plan         text,
  value        numeric(10,2),
  type         text,
  status       text,
  due_date     date,
  paid_at      timestamptz,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "transactions: owner full access"
    ON public.transactions FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 4. mac_addresses ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mac_addresses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  client_id       uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name     text,
  mac             text NOT NULL,
  server          text,
  key             text,
  activation_url  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mac_addresses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "mac_addresses: owner full access"
    ON public.mac_addresses FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 5. settings ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.settings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL UNIQUE,
  evolution_api_url   text,
  evolution_api_key   text,
  evolution_instance  text,
  evolution_status    text DEFAULT 'close',
  evolution_phone     text,
  n8n_url             text,
  n8n_webhook_url     text,
  n8n_configured      boolean DEFAULT false,
  pix_key             text,
  pix_key_type        text DEFAULT 'cpf',
  pix_beneficiary     text,
  reminder_time       text DEFAULT '09:00',
  template_before     text,
  template_today      text,
  template_overdue    text,
  send_before_due     boolean DEFAULT true,
  send_on_due         boolean DEFAULT true,
  send_overdue        boolean DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "settings: owner full access"
    ON public.settings FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 6. reminder_logs ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reminder_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  client_id      uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name    text,
  phone          text,
  template_type  text,
  status         text,
  message_id     text,
  error_message  text,
  sent_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "reminder_logs: owner read"
    ON public.reminder_logs FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 7. notifications ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  type        text NOT NULL,
  title       text NOT NULL,
  message     text,
  client_id   uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "notifications: owner select"
    ON public.notifications FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "notifications: owner update"
    ON public.notifications FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "notifications: owner delete"
    ON public.notifications FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 8. Indexes ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS clients_user_id_idx
  ON public.clients (user_id);

CREATE INDEX IF NOT EXISTS clients_user_id_status_due_date_idx
  ON public.clients (user_id, status, due_date);

CREATE INDEX IF NOT EXISTS transactions_user_id_idx
  ON public.transactions (user_id);

CREATE INDEX IF NOT EXISTS transactions_user_id_status_paid_at_idx
  ON public.transactions (user_id, status, paid_at DESC);

CREATE INDEX IF NOT EXISTS reminder_logs_user_id_created_at_idx
  ON public.reminder_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS reminder_logs_dedup_idx
  ON public.reminder_logs (client_id, template_type, sent_at DESC);

CREATE INDEX IF NOT EXISTS reminder_logs_user_sent_idx
  ON public.reminder_logs (user_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS settings_user_id_idx
  ON public.settings (user_id);

CREATE INDEX IF NOT EXISTS settings_evolution_status_idx
  ON public.settings (evolution_status);

CREATE INDEX IF NOT EXISTS mac_addresses_user_id_idx
  ON public.mac_addresses (user_id);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx
  ON public.notifications (user_id);

CREATE INDEX IF NOT EXISTS notifications_user_id_read_idx
  ON public.notifications (user_id, read, created_at DESC);

-- ── 9. Re-grant após criação das tabelas ────────────────────
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- ================================================================
-- FIM — Schema completo aplicado com sucesso!
-- ================================================================
