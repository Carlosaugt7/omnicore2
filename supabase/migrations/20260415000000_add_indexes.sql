-- ============================================================
-- OmniCore: performance indexes for production
-- ============================================================

-- clients: most queries filter by user_id + status + due_date
CREATE INDEX IF NOT EXISTS clients_user_id_idx
  ON public.clients (user_id);

CREATE INDEX IF NOT EXISTS clients_user_id_status_due_date_idx
  ON public.clients (user_id, status, due_date);

-- transactions: filter by user_id + status + paid_at
CREATE INDEX IF NOT EXISTS transactions_user_id_idx
  ON public.transactions (user_id);

CREATE INDEX IF NOT EXISTS transactions_user_id_status_paid_at_idx
  ON public.transactions (user_id, status, paid_at DESC);

-- reminder_logs: filter by user_id + created_at (history view)
CREATE INDEX IF NOT EXISTS reminder_logs_user_id_created_at_idx
  ON public.reminder_logs (user_id, created_at DESC);

-- reminder_logs: deduplication check (client_id + template_type + sent_at)
CREATE INDEX IF NOT EXISTS reminder_logs_dedup_idx
  ON public.reminder_logs (client_id, template_type, sent_at DESC);

-- settings: primary lookup is always by user_id (already UNIQUE, but explicit index helps)
CREATE INDEX IF NOT EXISTS settings_user_id_idx
  ON public.settings (user_id);

-- settings: scheduler queries active users by evolution_status
CREATE INDEX IF NOT EXISTS settings_evolution_status_idx
  ON public.settings (evolution_status);

-- mac_addresses: filter by user_id
CREATE INDEX IF NOT EXISTS mac_addresses_user_id_idx
  ON public.mac_addresses (user_id);

-- notifications: already has index from creation migration, adding user_id alone for simple queries
CREATE INDEX IF NOT EXISTS notifications_user_id_idx
  ON public.notifications (user_id);
