-- ================================================================
-- OmniCore — SQL para rodar no Supabase SQL Editor (produção)
-- Execute este arquivo inteiro de uma vez no SQL Editor do Supabase
-- que está instalado no EasyPanel.
--
-- IMPORTANTE: Este banco é compartilhado com outros sistemas.
-- Todas as tabelas ficam no schema "public" com RLS habilitado,
-- garantindo isolamento por user_id.
-- ================================================================

-- ── 1. clients ──────────────────────────────────────────────
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  name        text not null,
  phone       text not null,
  email       text,
  server      text,
  plan        text,
  value       numeric(10,2),
  due_date    date,
  status      text not null default 'ativo',
  notes       text,
  created_at  timestamptz not null default now()
);

alter table public.clients enable row level security;

create policy "clients: owner full access"
  on public.clients for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── 2. services ─────────────────────────────────────────────
create table if not exists public.services (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  plan_name   text not null,
  server_name text not null,
  value       numeric(10,2),
  created_at  timestamptz not null default now()
);

alter table public.services enable row level security;

create policy "services: owner full access"
  on public.services for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── 3. transactions ─────────────────────────────────────────
create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  client_id    uuid references public.clients(id) on delete set null,
  client_name  text,
  plan         text,
  value        numeric(10,2),
  type         text,           -- 'renovacao' | 'saida' | etc.
  status       text,           -- 'pago' | 'pendente'
  due_date     date,
  paid_at      timestamptz,
  description  text,
  created_at   timestamptz not null default now()
);

alter table public.transactions enable row level security;

create policy "transactions: owner full access"
  on public.transactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── 4. mac_addresses ────────────────────────────────────────
create table if not exists public.mac_addresses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  client_id       uuid references public.clients(id) on delete set null,
  client_name     text,
  mac             text not null,
  server          text,
  key             text,
  activation_url  text,
  created_at      timestamptz not null default now()
);

alter table public.mac_addresses enable row level security;

create policy "mac_addresses: owner full access"
  on public.mac_addresses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── 5. settings ─────────────────────────────────────────────
create table if not exists public.settings (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique,
  evolution_api_url   text,
  evolution_api_key   text,
  evolution_instance  text,
  evolution_status    text default 'close',
  evolution_phone     text,
  n8n_url             text,
  n8n_webhook_url     text,
  n8n_configured      boolean default false,
  pix_key             text,
  pix_key_type        text default 'cpf',
  pix_beneficiary     text,
  reminder_time       text default '09:00',
  template_before     text,
  template_today      text,
  template_overdue    text,
  send_before_due     boolean default true,
  send_on_due         boolean default true,
  send_overdue        boolean default true,
  created_at          timestamptz not null default now()
);

alter table public.settings enable row level security;

create policy "settings: owner full access"
  on public.settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── 6. reminder_logs ────────────────────────────────────────
create table if not exists public.reminder_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  client_id      uuid references public.clients(id) on delete set null,
  client_name    text,
  phone          text,
  template_type  text,
  status         text,           -- 'sent' | 'failed'
  message_id     text,
  error_message  text,
  sent_at        timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists reminder_logs_user_sent_idx
  on public.reminder_logs (user_id, sent_at desc);

alter table public.reminder_logs enable row level security;

create policy "reminder_logs: owner read"
  on public.reminder_logs for select
  using (auth.uid() = user_id);

-- Backend (service role) inserts — bypasses RLS automatically

-- ── 7. notifications ────────────────────────────────────────
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  type        text not null,
  title       text not null,
  message     text,
  client_id   uuid references public.clients(id) on delete set null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_read_idx
  on public.notifications (user_id, read, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications: owner read/update/delete"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "notifications: owner update"
  on public.notifications for update
  using (auth.uid() = user_id);

create policy "notifications: owner delete"
  on public.notifications for delete
  using (auth.uid() = user_id);

-- ================================================================
-- FIM — Todas as tabelas criadas com RLS.
-- O service role key do backend ignora RLS e pode operar livremente.
-- Outros sistemas no mesmo Supabase NÃO são afetados pois cada
-- sistema usa seu próprio user_id e as políticas isolam os dados.
-- ================================================================
