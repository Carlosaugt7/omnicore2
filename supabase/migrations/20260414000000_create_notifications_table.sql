-- ============================================================
-- OmniCore: notifications table
-- Stores internal alerts (e.g. payment detected via WhatsApp)
-- ============================================================

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  type        text not null,                        -- e.g. 'payment_detected'
  title       text not null,
  message     text,
  client_id   uuid references public.clients(id) on delete set null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Index for fast per-user queries (unread first)
create index if not exists notifications_user_id_read_idx
  on public.notifications (user_id, read, created_at desc);

-- Row Level Security: each user sees only their own notifications
alter table public.notifications enable row level security;

create policy "Users can view own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Users can update own notifications"
  on public.notifications for update
  using (auth.uid() = user_id);

create policy "Users can delete own notifications"
  on public.notifications for delete
  using (auth.uid() = user_id);

-- Backend (service role) can insert on behalf of any user
-- No INSERT policy needed for service role — it bypasses RLS
