-- ================================================================
-- OmniCore — Migration: Backup Automático no Google Drive
-- Data: 2026-11-26
-- ================================================================

CREATE TABLE IF NOT EXISTS public.backup_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  frequency text NOT NULL DEFAULT 'weekly', -- 'daily' | 'weekly' | 'biweekly' | 'monthly'
  send_time text NOT NULL DEFAULT '03:00',
  timezone text NOT NULL DEFAULT 'America/Manaus',
  retention_count integer NOT NULL DEFAULT 14,

  -- Credenciais OAuth2 (client_secret e refresh_token criptografados com AES-256-GCM no backend)
  google_client_id text,
  google_client_secret text,
  google_refresh_token text,
  google_email text,
  gdrive_folder_id text,

  last_backup_at timestamptz,
  last_backup_date text,
  last_backup_status text,
  last_backup_error text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.backup_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'manual', -- 'manual' | 'auto'
  status text NOT NULL, -- 'success' | 'failed'
  file_name text,
  file_size_bytes bigint,
  gdrive_file_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS backup_logs_user_created_idx
  ON public.backup_logs (user_id, created_at DESC);

ALTER TABLE public.backup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "backup_settings: shared access" ON public.backup_settings;
  CREATE POLICY "backup_settings: shared access" ON public.backup_settings FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));

  DROP POLICY IF EXISTS "backup_logs: shared access" ON public.backup_logs;
  CREATE POLICY "backup_logs: shared access" ON public.backup_logs FOR ALL
    USING (public.check_shared_access(auth.uid(), user_id))
    WITH CHECK (public.check_shared_access(auth.uid(), user_id));
END $$;
