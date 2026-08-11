-- ================================================================
-- OmniCore — Auto-cadastro de revendedor no sign-up + soft-delete
-- ================================================================

-- 1. Adiciona coluna soft-delete
alter table public.resellers 
  add column if not exists deleted boolean not null default false;

create index if not exists idx_resellers_deleted on public.resellers(deleted);

-- 2. Trigger function: auto-cria reseller quando novo usuário se cadastra
create or replace function public.handle_new_user_reseller()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _is_master boolean;
begin
  -- Não cria para admins master
  _is_master := new.email in ('carlosaugt7@gmail.com', 'andressanramos@hotmail.com');
  if _is_master then
    return new;
  end if;

  -- Auto-cadastra como revendedor Basic
  insert into public.resellers (user_id, name, email, plan, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    'basic',
    'active'
  );

  return new;
end;
$$;

-- 3. Trigger no auth.users (roda no sign-up)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user_reseller();
