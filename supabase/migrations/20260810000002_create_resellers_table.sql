-- ================================================================
-- OmniCore — Tabelas de Revendedores (Resellers)
-- Acesso exclusivo: carlosaugt7@gmail.com e andressanramos@hotmail.com
-- ================================================================

-- 1. Tabela de revendedores
create table if not exists public.resellers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  email text not null,
  phone text,
  plan text not null default 'basic' check (plan in ('basic', 'start', 'advanced')),
  status text not null default 'active' check (status in ('active', 'blocked')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índice para busca por email
create index if not exists idx_resellers_email on public.resellers(email);
-- Índice para contagem de clientes por plano
create index if not exists idx_resellers_user_id on public.resellers(user_id);

-- 2. Tabela de auditoria
create table if not exists public.reseller_audit_logs (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid references public.resellers(id) on delete cascade not null,
  action text not null check (action in ('create', 'update', 'delete', 'block', 'unblock', 'plan_change')),
  admin_email text not null,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_reseller_id on public.reseller_audit_logs(reseller_id);
create index if not exists idx_audit_created_at on public.reseller_audit_logs(created_at);

-- 3. RLS — Apenas admins master acessam
alter table public.resellers enable row level security;
alter table public.reseller_audit_logs enable row level security;

-- Política: Admins master têm acesso total
create policy "master_full_access" on public.resellers
  for all
  using (auth.email() in ('carlosaugt7@gmail.com', 'andressanramos@hotmail.com'))
  with check (auth.email() in ('carlosaugt7@gmail.com', 'andressanramos@hotmail.com'));

create policy "master_full_access_audit" on public.reseller_audit_logs
  for all
  using (auth.email() in ('carlosaugt7@gmail.com', 'andressanramos@hotmail.com'))
  with check (auth.email() in ('carlosaugt7@gmail.com', 'andressanramos@hotmail.com'));

-- 4. Função RPC para verificar limite de clientes por plano
create or replace function public.check_reseller_client_limit(p_user_id uuid)
returns table(
  current_count bigint,
  plan_limit int,
  allowed boolean,
  plan text
)
language plpgsql
security definer
as $$
declare
  _plan text;
  _limit int;
  _count bigint;
  _resolved_user_id uuid;
begin
  -- Resolve Andressa para o ID do Carlos para compartilhamento de base
  _resolved_user_id := p_user_id;
  if p_user_id = 'd267b748-8f3b-4684-85e9-589dc9a79a93' then
    _resolved_user_id := 'd9919cb5-c4a4-43c3-8614-878495d18c37';
  end if;

  -- Busca o plano do revendedor
  select r.plan into _plan
  from public.resellers r
  where r.user_id = _resolved_user_id and r.status = 'active';

  -- Se não for revendedor cadastrado, sem limite
  if _plan is null then
    return query select 0::bigint, 0::int, true, null::text;
    return;
  end if;

  -- Mapeia plano → limite
  case _plan
    when 'basic' then _limit := 40;
    when 'start' then _limit := 100;
    when 'advanced' then _limit := 500;
    else _limit := 999999;
  end case;

  -- Conta clientes atuais
  select count(*) into _count
  from public.clients
  where user_id = _resolved_user_id;

  return query select _count, _limit, _count < _limit, _plan;
end;
$$;
