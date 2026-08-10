-- ================================================================
-- OmniCore — Fix RLS para shared access em referrals
-- Andressa (d267b748) e Carlos (d9919cb5) devem ver os mesmos dados
-- ================================================================

-- Replace referrals policy com shared access
drop policy if exists "Users manage own referrals" on public.referrals;

create policy "Users manage own referrals (shared)" 
  on public.referrals 
  for all
  using (
    auth.uid() = user_id 
    or auth.uid() in (
      'd267b748-8f3b-4684-85e9-589dc9a79a93',  -- Andressa
      'd9919cb5-c4a4-43c3-8614-878495d18c37'   -- Carlos
    )
  )
  with check (
    auth.uid() = user_id
    or auth.uid() in (
      'd267b748-8f3b-4684-85e9-589dc9a79a93',
      'd9919cb5-c4a4-43c3-8614-878495d18c37'
    )
  );

-- Também atualiza RLS de clients para shared access (caso ainda não tenha sido feito)
drop policy if exists "clients: owner full access" on public.clients;

create policy "clients: owner full access (shared)"
  on public.clients
  for all
  using (
    auth.uid() = user_id
    or auth.uid() in (
      'd267b748-8f3b-4684-85e9-589dc9a79a93',
      'd9919cb5-c4a4-43c3-8614-878495d18c37'
    )
  )
  with check (
    auth.uid() = user_id
    or auth.uid() in (
      'd267b748-8f3b-4684-85e9-589dc9a79a93',
      'd9919cb5-c4a4-43c3-8614-878495d18c37'
    )
  );

-- Atualiza RLS de transactions para shared access
drop policy if exists "transactions: owner full access" on public.transactions;

create policy "transactions: owner full access (shared)"
  on public.transactions
  for all
  using (
    auth.uid() = user_id
    or auth.uid() in (
      'd267b748-8f3b-4684-85e9-589dc9a79a93',
      'd9919cb5-c4a4-43c3-8614-878495d18c37'
    )
  )
  with check (
    auth.uid() = user_id
    or auth.uid() in (
      'd267b748-8f3b-4684-85e9-589dc9a79a93',
      'd9919cb5-c4a4-43c3-8614-878495d18c37'
    )
  );
