-- ================================================================
-- OmniCore — Trigger para enforcement de limite de clientes por plano
-- Camada extra de segurança: impede INSERT quando o limite for atingido
-- ================================================================

-- Função trigger: executada antes de INSERT na tabela clients
create or replace function public.enforce_client_limit()
returns trigger
language plpgsql
security definer
as $$
declare
  _plan text;
  _limit int;
  _count bigint;
begin
  -- Busca o plano do revendedor (apenas ativos)
  select r.plan into _plan
  from public.resellers r
  where r.user_id = new.user_id and r.status = 'active';

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
  where user_id = new.user_id;

  -- Bloqueia se já atingiu o limite
  if _count >= _limit then
    raise exception 'Limite de clientes atingido. Plano % permite até % clientes. Você já possui %.', _plan, _limit, _count;
  end if;

  return new;
end;
$$;

-- Aplica o trigger
drop trigger if exists trg_enforce_client_limit on public.clients;
create trigger trg_enforce_client_limit
  before insert on public.clients
  for each row
  execute function public.enforce_client_limit();
