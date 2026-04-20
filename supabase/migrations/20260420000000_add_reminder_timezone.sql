-- Add reminder_timezone column to settings table
-- Stores the user's IANA timezone for scheduling reminders correctly
alter table public.settings
  add column if not exists reminder_timezone text default 'America/Sao_Paulo';

-- Add send_pix_separately column if not exists
alter table public.settings
  add column if not exists send_pix_separately boolean default false;
