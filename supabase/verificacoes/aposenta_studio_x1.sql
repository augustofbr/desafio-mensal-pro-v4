-- Verificação de 20261021130000_aposenta_studio_x1_fecha_acesso.sql
--
-- Fica em supabase/verificacoes/ (supabase/tests/ é tratado como pgTAP pelo CLI).
-- Dois usos:
--   a) DEPOIS de aplicar a migração: rode este arquivo inteiro (papel postgres).
--   b) ENSAIO ANTES de aplicar: cole a migração inteira logo depois do `begin;` abaixo (no
--      lugar do marcador) e rode tudo junto. O script de ensaio pronto, com a migração já
--      colada, é gerado à parte para o SQL Editor.
-- Nos dois casos NADA persiste: o último comando é um RAISE EXCEPTION que aborta a transação.
-- Sucesso = erro P0001 com a mensagem 'ENSAIO OK: ...'. Qualquer outro erro = falha (a
-- mensagem diz qual passo).
--
-- O que prova:
--   1) anon e authenticated recebem 42501 ao ler/escrever cada uma das 16 relações e ao
--      executar cada uma das 22 funções do studio;
--   2) service_role continua lendo as 16 relações e executando as funções;
--   3) INSERT em trinks_services como service_role E como postgres (os papéis do n8n) dispara
--      trigger_sync_new_professional sem erro e cria a linha em public.professionals;
--   4) INSERT em auth.users (papel postgres) dispara on_auth_user_created e cria a linha em
--      public.profiles sem erro;
--   5) os 2 triggers quebrados não disparam mais: UPDATE do role em profiles e INSERT em
--      user_permissions passam (antes da migração, os dois davam 42P01 permission_audit_log,
--      conferido em 2026-10-20), e DELETE em auth.users com linha em user_permissions passa
--      (antes, a cascata disparava o trigger e falhava).
--
-- Fixtures (ids que não existem em produção; conferido no passo 0):
--   trinks_services ids -990771/-990772 (id explícito: não consome a sequence),
--   profissionalid '999990771'/'999990772'; auth.users 00000000-0000-4000-8000-0000099b0771,
--   e-mail fixture-aposenta-x1@invalid.local.
-- Efeito colateral enquanto roda: a migração colada (uso b) segura ACCESS EXCLUSIVE em
-- profiles e user_permissions até o fim (~1s); o INSERT em auth.users/trinks_services segura
-- só as linhas de fixture.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local idle_in_transaction_session_timeout = '30s';

-- >>> (uso b) cole aqui a migração 20261021130000 inteira <<<

-- 0. Fixtures livres -----------------------------------------------------------
do $$
begin
  if exists (select 1 from public.trinks_services where id in (-990771, -990772)
                or profissionalid in ('999990771', '999990772'))
     or exists (select 1 from public.professionals where id in ('999990771', '999990772'))
     or exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000099b0771'
                   or email = 'fixture-aposenta-x1@invalid.local') then
    raise exception 'passo 0: fixture já existe em produção — escolha outros ids';
  end if;
end $$;

-- 1. anon e authenticated: 42501 em tudo ----------------------------------------
create temp table aposenta_x1_chamadas on commit drop as
select unnest(array[
  'select public.reset_daily_queue()',
  'select public.revert_start_attendance(null::uuid)',
  'select public.revert_finish_attendance(null::uuid)',
  'select public.revert_cancel_attendance(null::uuid)',
  'select public.revert_presence_confirmation(null::text)',
  'select public.revert_toggle_external(null::text)',
  'select * from public.get_queue_metrics()',
  'select * from public.get_professional_performance_by_period(null::integer, null::integer)',
  'select public.sync_missing_professionals()',
  'select public.get_user_filters(null::uuid)',
  'select public.upsert_user_filters(null::uuid, null::public.service_category[], null::integer, null::integer)',
  'select public.get_user_role()',
  'select public.get_supervisor_goal_config()',
  'select public.update_supervisor_goal_config(null::integer, null::numeric, null::integer, null::numeric, null::integer, null::numeric)',
  'select public.is_supervisor_or_admin()',
  'select public.log_permission_change(null::uuid, null::public.permission_audit_action, null::text, null::text, null::text, null::text, null::jsonb)',
  'select public.get_worked_days_current_month()',
  'select public.get_remaining_days_current_month()',
  'select public.get_total_working_days_current_month()',
  'select public.is_admin()',
  'select public.is_admin_user()',
  'select public.is_own_professional(null::text)'
]) as sql
union all
select format('select 1 from public.%I limit 0', r) from unnest(array[
  'monthly_goals','system_config','supervisor_goal_config','user_filters','user_permissions',
  'queue_attendances','queue_professionals','queue_events','queue_config',
  'queue_automation_config','professionals','profiles','professional_performance',
  'professional_forecast_details','supervisor_performance','supervisor_performance_with_forecast']) r
union all
select format('delete from public.%I where false', r) from unnest(array[
  'monthly_goals','system_config','supervisor_goal_config','user_filters','user_permissions',
  'queue_attendances','queue_professionals','queue_events','queue_config',
  'queue_automation_config','professionals','profiles']) r;

grant select on aposenta_x1_chamadas to anon, authenticated, service_role;

create temp table aposenta_x1_resultado (passo text, sql text, resultado text) on commit drop;
grant insert on aposenta_x1_resultado to anon, authenticated, service_role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare c record;
begin
  for c in select sql from aposenta_x1_chamadas loop
    begin
      execute c.sql;
      insert into aposenta_x1_resultado values ('anon', c.sql, 'PASSOU');
    exception when insufficient_privilege then
      null;
    when others then
      insert into aposenta_x1_resultado values ('anon', c.sql, sqlstate || ' ' || sqlerrm);
    end;
  end loop;
end $$;
reset role;

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000099b0771"}', true);
set local role authenticated;
do $$
declare c record;
begin
  for c in select sql from aposenta_x1_chamadas loop
    begin
      execute c.sql;
      insert into aposenta_x1_resultado values ('authenticated', c.sql, 'PASSOU');
    exception when insufficient_privilege then
      null;
    when others then
      insert into aposenta_x1_resultado values ('authenticated', c.sql, sqlstate || ' ' || sqlerrm);
    end;
  end loop;
end $$;
reset role;

do $$
declare v text;
begin
  select string_agg(passo || ': ' || sql || ' -> ' || resultado, ' | ') into v from aposenta_x1_resultado;
  if v is not null then
    raise exception 'passo 1: anon/authenticated não receberam 42501: %', v;
  end if;
end $$;

-- 2. service_role continua lendo e executando -----------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
do $$
declare r text;
begin
  foreach r in array array['monthly_goals','system_config','supervisor_goal_config','user_filters',
    'user_permissions','queue_attendances','queue_professionals','queue_events','queue_config',
    'queue_automation_config','professionals','profiles','professional_performance',
    'professional_forecast_details','supervisor_performance','supervisor_performance_with_forecast'] loop
    execute format('select count(*) from public.%I', r);
  end loop;
  perform public.get_worked_days_current_month();
  perform public.get_total_working_days_current_month();
  perform public.is_admin();
  perform * from public.get_queue_metrics();
exception when others then
  raise exception 'passo 2: service_role perdeu acesso: % %', sqlstate, sqlerrm;
end $$;

-- 3a. trinks_services como service_role: trigger cria a linha em professionals ----
insert into public.trinks_services (id, service_date, professional, profissionalid, service_name, client_name)
values (-990771, '01/01/1999', 'Fixture Aposenta X1 SR', '999990771', 'Fixture', 'Fixture');
do $$
begin
  if not exists (select 1 from public.professionals where id = '999990771' and name = 'Fixture Aposenta X1 SR') then
    raise exception 'passo 3a: INSERT em trinks_services (service_role) não criou a linha em professionals';
  end if;
end $$;
reset role;

-- 3b. trinks_services como postgres -------------------------------------------------
select set_config('request.jwt.claims', '', true);
insert into public.trinks_services (id, service_date, professional, profissionalid, service_name, client_name)
values (-990772, '01/01/1999', 'Fixture Aposenta X1 PG', '999990772', 'Fixture', 'Fixture');
do $$
begin
  if not exists (select 1 from public.professionals where id = '999990772' and name = 'Fixture Aposenta X1 PG') then
    raise exception 'passo 3b: INSERT em trinks_services (postgres) não criou a linha em professionals';
  end if;
end $$;

-- 4. auth.users: on_auth_user_created cria a linha em profiles ----------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-0000099b0771', 'authenticated', 'authenticated',
        'fixture-aposenta-x1@invalid.local', '{"name":"Fixture Aposenta X1"}');
do $$
begin
  if not exists (select 1 from public.profiles
                  where id = '00000000-0000-4000-8000-0000099b0771'
                    and name = 'Fixture Aposenta X1' and role = 'professional') then
    raise exception 'passo 4: INSERT em auth.users não criou a linha em profiles';
  end if;
end $$;

-- 5. triggers de auditoria não disparam mais -----------------------------------------
update public.profiles set role = 'admin', can_enter_queue = not can_enter_queue
 where id = '00000000-0000-4000-8000-0000099b0771';
insert into public.user_permissions (user_id) values ('00000000-0000-4000-8000-0000099b0771');
update public.user_permissions set can_enter_queue = true
 where user_id = '00000000-0000-4000-8000-0000099b0771';
-- exclusão do usuário do Auth com linha em user_permissions: cascata profiles -> user_permissions
delete from auth.users where id = '00000000-0000-4000-8000-0000099b0771';
do $$
begin
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-0000099b0771')
     or exists (select 1 from public.user_permissions where user_id = '00000000-0000-4000-8000-0000099b0771') then
    raise exception 'passo 5: a exclusão do usuário do Auth não cascateou';
  end if;
end $$;

-- Fim: aborta de propósito (nada persiste) -----------------------------------------
do $$
begin
  raise exception 'ENSAIO OK: 100 tentativas (50 por papel) de anon/authenticated barradas (42501), service_role ok, trinks_services -> professionals ok (service_role e postgres), auth.users -> profiles ok, triggers de auditoria removidos (update/insert/delete passam). Transação abortada de propósito.';
end $$;

rollback;
