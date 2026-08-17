-- ================================================================
-- OmniCore — Correção RPC check_reseller_client_limit e trigger enforce_client_limit
-- Garante resolução de contas compartilhadas e suporte ao plano Advanced (500)
-- ================================================================

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
  where (r.user_id = _resolved_user_id or r.user_id = p_user_id) and r.status = 'active'
  order by case when r.plan = 'advanced' then 1 when r.plan = 'start' then 2 else 3 end
  limit 1;

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

create or replace function public.enforce_client_limit()
returns trigger
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
  _resolved_user_id := new.user_id;
  if new.user_id = 'd267b748-8f3b-4684-85e9-589dc9a79a93' then
    _resolved_user_id := 'd9919cb5-c4a4-43c3-8614-878495d18c37';
  end if;

  -- Busca o plano do revendedor (apenas ativos)
  select r.plan into _plan
  from public.resellers r
  where (r.user_id = _resolved_user_id or r.user_id = new.user_id) and r.status = 'active'
  order by case when r.plan = 'advanced' then 1 when r.plan = 'start' then 2 else 3 end
  limit 1;

  -- Se não for revendedor (ex: master admin), permite sem limite
  if _plan is null then
    return new;
  end if;

  -- Mapeia plano → limite
  case _plan
    when 'basic' then _limit := 40;
    when 'start' then _limit := 100;
    when 'advanced' then _limit := 500;
    else return new; -- plano desconhecido, permite
  end case;

  -- Conta clientes existentes do mesmo user_id
  select count(*) into _count
  from public.clients
  where user_id = _resolved_user_id;

  -- Bloqueia se já atingiu o limite
  if _count >= _limit then
    raise exception 'Limite de clientes atingido. Plano % permite até % clientes. Você já possui %.', _plan, _limit, _count;
  end if;

  return new;
end;
$$;
