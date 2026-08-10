-- ================================================================
-- OmniCore — Índices de performance adicionados em 2026-08-10
-- Migração de correção baseada em análise de código.
-- Objetivo: otimizar queries do Dashboard, Scheduler, e Clients.
-- ================================================================

-- 1. clients: query por user_id + due_date (Dashboard/Scheduler)
create index if not exists idx_clients_user_due
  on public.clients (user_id, due_date);

-- 2. clients: query por user_id + status (Dashboard/Filtros)
create index if not exists idx_clients_user_status
  on public.clients (user_id, status);

-- 3. transactions: query por user_id + status + paid_at (Dashboard métricas)
create index if not exists idx_transactions_user_status_paid
  on public.transactions (user_id, status, paid_at);

-- 4. transactions: dedup por user_id + client_id + due_date + type
create index if not exists idx_transactions_dedup
  on public.transactions (user_id, client_id, due_date, type);

-- 5. reminder_logs: dedup diário por client_id + template_type + status
create index if not exists idx_reminder_logs_dedup
  on public.reminder_logs (client_id, template_type, status, sent_at);

-- 6. settings: lookup por evolution_status + reminder_time
create index if not exists idx_settings_status_time
  on public.settings (evolution_status, reminder_time)
  where reminder_time is not null;
