-- Verificação de 20261021110000_login_fase_c_fecha_anon.sql (login em todas as rotas, migração C).
-- Roda INTEIRO em begin ... rollback (nada persiste), como postgres (MCP execute_sql ou SQL
-- Editor), DEPOIS de aplicar a migração C. Sem ela, o passo 0 aborta.
-- O MCP recusa lotes grandes/sensíveis: mande o arquivo sem as linhas de comentário, ou em
-- partes com lfc.so (abaixo).
--
-- Diferente da verificação da A, esta NÃO depende de a Task 5 (contas das profissionais) ter
-- rodado ou não: os vínculos das fixtures são EXPLÍCITOS (profissional_id no INSERT), e se a
-- profissional escolhida já estiver ligada a uma conta real, o vínculo real é desfeito SÓ nesta
-- transação (UPDATE ... set profissional_id = null, desfeito pelo rollback; trava só essas linhas
-- de destaque_users_app até o fim). Por isso as verificações do trigger de vínculo (00a-00j) e de
-- destaque_profissionais_sem_conta com contas de outro app (15, 16) da A ficaram de fora: a C
-- não toca em nada disso, e elas exigem profissionais sem conta, que a T5 esgota.
--
-- Papéis (ordem das listas de esperado):
--   1 anon
--   2 prof_ligada        perfil Profissional, ligada à profissional P (ativa, com e-mail e com
--                        atendimento no espelho na janela hoje-10..hoje; a de mais estrelas).
--                        "outra" = a segunda com esses critérios (tem um atendimento real o_dia/o_cli)
--   3 prof_sem_vinculo   Profissional sem vínculo
--   4 recepcao   5 admin
--   6 inativo            perfil Admin, users_app.ativo = false, ligado à profissional "outra"
--   7 spoof              Profissional sem vínculo, com claim email = e-mail de P
--   8 ligada_email_trocado  a MESMA conta da prof_ligada com claim email diferente: continua P
-- Esperados: "a|b|...|h" na ordem dos papéis (valor único = todos). Tokens (contagem direta como
-- postgres, depois das fixtures): P id de P; N estrelas aprovadas+pendentes do mês (Manaus);
-- T linhas de avaliacoes; L linhas de P; A/O "linhas=.. motivos=.." de P/da outra; Z
-- "linhas=0 motivos=0"; S "linhas/ja_tem_login" de destaque_profissionais_sem_conta; FE, TF, PF
-- linhas de feriados, tratamento_fabricante, profissional_fabricante.
-- INSERTs/UPDATEs de teste se desfazem num sub-bloco (errcode LFC01): contagens não mudam.
-- Saída: _resultado (papel, verificacao, esperado, obtido, ok); aborta se ok=false.
-- Opcional: set_config('lfc.so', '<regex>', true) antes do passo 3 roda só as verificações de
-- papel que casam (as de catálogo, c01-c13, rodam sempre).
-- Linhas esperadas: 13 de catálogo (postgres) + 25 verificações x 8 papéis = 213.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';
set local idle_in_transaction_session_timeout = '30s';

-- 0. Pré-condições
do $$
begin
  if has_table_privilege('anon', 'public.trinks_services', 'select')
     or has_function_privilege('anon', 'public.avaliacao_clientes_do_dia(integer, date)', 'execute')
     or (select prosrc from pg_proc where oid = 'public.avaliacao_clientes_do_dia(integer, date)'::regprocedure)
          not like '%destaque_can_write_page(''estrelas'')%' then
    raise exception 'migracao C nao aplicada: aplique 20261021110000_login_fase_c_fecha_anon.sql antes';
  end if;
  if current_user <> 'postgres'
     or (select count(*) from public.destaque_perfis
          where nome in ('Admin', 'Recepção', 'Profissional', 'Somente Leitura')) <> 4
     or exists (select 1 from auth.users where id::text like '00000000-0000-4000-8000-0000106c000_')
     or exists (select 1 from auth.users where email like 'fx-loginc-%@invalid.local') then
    raise exception 'pre-condicao: postgres, 4 perfis, uuids e e-mails de fixture livres';
  end if;
end $$;

-- 1. Fixtures (postgres)
create temp table _fx on commit drop as
with e as (  -- atendimentos com id numérico, na janela do trigger, de profissionais ativas com e-mail
  select p."profissionalId" pid, to_date(t.service_date, 'DD/MM/YYYY') dia, btrim(t.clienteid)::bigint cli
    from public.trinks_services t
    join public.profissionais_ativos p on p."profissionalId"::text = t.profissionalid
   where p.ativo is not false and p.email is not null
     and btrim(t.clienteid) ~ '^[0-9]{1,18}$'
     and t.service_date ~ '^\d\d/\d\d/\d{4}$'
     and to_date(t.service_date, 'DD/MM/YYYY') >= (now() at time zone 'America/Manaus')::date - 10
     and to_date(t.service_date, 'DD/MM/YYYY') <= (now() at time zone 'America/Manaus')::date),
cand as (
  select c.pid, max(c.dia) dia from e c group by c.pid),
-- P = a de mais estrelas; "outra" = a seguinte (também com atendimento na janela e com estrelas),
-- para o helper do espelho ter um caso real dela (11b, 10b)
rank as (
  select c.pid, c.dia, (select min(e2.cli) from e e2 where e2.pid = c.pid and e2.dia = c.dia) cli,
         row_number() over (order by (select count(*) from public.avaliacoes_cadastradas a
                                       where a.profissional_id = c.pid) desc, c.pid) n
    from cand c
   where exists (select 1 from public.avaliacoes_cadastradas a where a.profissional_id = c.pid))
select s.pid, s.dia, s.cli,
       (select email from public.profissionais_ativos where "profissionalId" = s.pid) p_email,
       o.pid outra, o.dia o_dia, o.cli o_cli,
       date_trunc('month', now() at time zone 'America/Manaus') at time zone 'America/Manaus' ini,
       (date_trunc('month', now() at time zone 'America/Manaus') + interval '1 month') at time zone 'America/Manaus' fim,
       (now() at time zone 'America/Manaus')::date hoje,
       0 desligados
  from rank s left join rank o on o.n = 2
 where s.n = 1;

do $$
begin
  if not exists (select 1 from _fx where pid is not null and dia is not null and cli is not null
                                     and p_email is not null and outra is not null
                                     and o_dia is not null and o_cli is not null) then
    raise exception 'fixtures: sem profissional ativa com e-mail e atendimento na janela, ou sem "outra": %',
      (select row_to_json(f) from _fx f);
  end if;
end $$;

-- vínculos reais de P e da outra saem SÓ nesta transação (o UNIQUE de profissional_id impediria
-- as fixtures)
with u as (
  update public.destaque_users_app set profissional_id = null
   where profissional_id in (select pid from _fx union all select outra from _fx)
  returning 1)
update _fx set desligados = (select count(*) from u);

create temp table _p on commit drop as
select * from (values
  (1, 'anon',                 null::uuid, null::text, null::text, null::text, null::boolean, null::int),
  (2, 'prof_ligada',          '00000000-0000-4000-8000-0000106c0001', 'fx-loginc-ligada@invalid.local', 'fx-loginc-ligada@invalid.local', 'Profissional', true, (select pid from _fx)),
  (3, 'prof_sem_vinculo',     '00000000-0000-4000-8000-0000106c0002', 'fx-loginc-semvinculo@invalid.local', 'fx-loginc-semvinculo@invalid.local', 'Profissional', true, null),
  (4, 'recepcao',             '00000000-0000-4000-8000-0000106c0003', 'fx-loginc-recepcao@invalid.local', 'fx-loginc-recepcao@invalid.local', 'Recepção', true, null),
  (5, 'admin',                '00000000-0000-4000-8000-0000106c0004', 'fx-loginc-admin@invalid.local', 'fx-loginc-admin@invalid.local', 'Admin', true, null),
  (6, 'inativo',              '00000000-0000-4000-8000-0000106c0005', 'fx-loginc-inativo@invalid.local', 'fx-loginc-inativo@invalid.local', 'Admin', false, (select outra from _fx)),
  (7, 'spoof',                '00000000-0000-4000-8000-0000106c0006', 'fx-loginc-spoof@invalid.local', (select p_email from _fx), 'Profissional', true, null),
  (8, 'ligada_email_trocado', '00000000-0000-4000-8000-0000106c0001', null, 'fx-loginc-outro@invalid.local', null, null, null)
) x(o, papel, uid, auth_email, claim_email, perfil, ativo, vinculo);

insert into auth.users (id, aud, role, email, email_confirmed_at, email_change)
select uid, 'authenticated', 'authenticated', auth_email, now(), '' from _p where auth_email is not null;

-- profissional_id explícito (o trigger de vínculo respeita); os demais ficam NULL (e-mail .invalid)
insert into public.destaque_users_app (id, nome, perfil_id, ativo, profissional_id)
select x.uid, 'LoginFxC ' || x.papel, p.id, x.ativo, x.vinculo
  from _p x join public.destaque_perfis p on p.nome = x.perfil;

-- recusa de P com motivo (postgres não passa pelo trigger de INSERT)
insert into public.avaliacoes_cadastradas (profissional_id, nome_profissional, nome_cliente, status, motivo_recusa)
select pid, 'LoginFxC', 'LoginFxC motivo', 'rejeitada', 'LoginFxC: motivo de teste' from _fx;

create temp table _tok on commit drop as
select f.pid::text p,
       (select count(*) from public.avaliacoes_cadastradas
         where status in ('aprovada', 'pendente') and data_hora_cadastro >= f.ini and data_hora_cadastro < f.fim)::text n,
       (select count(*) from public.avaliacoes_cadastradas)::text t,
       (select count(*) from public.avaliacoes_cadastradas where profissional_id = f.pid)::text l,
       (select format('linhas=%s motivos=%s', count(*), count(motivo_recusa))
          from public.avaliacoes_cadastradas where profissional_id = f.pid) a,
       (select format('linhas=%s motivos=%s', count(*), count(motivo_recusa))
          from public.avaliacoes_cadastradas where profissional_id = f.outra) o,
       (select format('%s/%s', count(*), count(*) filter (where ja_tem_login))
          from public.destaque_profissionais_sem_conta()) s_postgres,
       (select format('%s/%s', count(*), count(*) filter (where exists (
                 select 1 from auth.users au where lower(au.email) = p.email
                    and not exists (select 1 from public.destaque_users_app u where u.id = au.id))))
          from public.profissionais_ativos p
         where ativo is not false and email is not null
           and not exists (select 1 from auth.users au join public.destaque_users_app u on u.id = au.id
                            where lower(au.email) = p.email)
           and not exists (select 1 from public.destaque_users_app l where l.profissional_id = p."profissionalId")) s,
       (select count(*) from public.feriados)::text fe,
       (select count(*) from public.tratamento_fabricante)::text tf,
       (select count(*) from public.profissional_fabricante)::text pf
  from _fx f;

do $$
begin
  if exists (select 1 from _tok where n = '0' or a like '% motivos=0' or o like 'linhas=0 %'
                                   or s_postgres <> '0/0' or tf = '0' or pf = '0') then
    raise exception 'fixtures nao provam nada: % %', (select row_to_json(f) from _fx f), (select row_to_json(k) from _tok k);
  end if;
end $$;

-- 2. Checagem
create temp table _r (o int, papel text, verificacao text, esperado text, obtido text)
  on commit drop;

-- catálogo (postgres)
insert into _r
select 0, 'postgres', v.k, v.esp, v.obt from (values
  ('c01 anon: privilegios nas seis tabelas (tabela ou coluna)', 'nenhum',
   (select coalesce(string_agg(t, ','), 'nenhum') from unnest(array[
      'public.trinks_services', 'public.regras_desafio', 'public.feriados', 'public.tratamento_fabricante',
      'public.profissional_fabricante', 'public.avaliacoes_cadastradas']) t
     where has_table_privilege('anon', t, 'select, insert, update, delete, truncate, references, trigger')
        or has_any_column_privilege('anon', t, 'select, insert, update, references'))),
  ('c02 anon: colunas legiveis de profissionais_ativos', 'ativo,categoria,nome_profissional,profissionalId',
   (select string_agg(attname::text, ',' order by attname::text collate "C") from pg_attribute
     where attrelid = 'public.profissionais_ativos'::regclass and attnum > 0 and not attisdropped
       and has_column_privilege('anon', 'public.profissionais_ativos', attname::text, 'select'))),
  ('c03 anon: outros privilegios em profissionais_ativos', 'nenhum',
   (select case when has_table_privilege('anon', 'public.profissionais_ativos', 'select, insert, update, delete, truncate, references, trigger')
                  or has_any_column_privilege('anon', 'public.profissionais_ativos', 'insert, update, references')
                then 'tem' else 'nenhum' end)),
  ('c04 EXECUTE clientes_do_dia/helper: anon', 'false/false',
   has_function_privilege('anon', 'public.avaliacao_clientes_do_dia(integer, date)', 'execute') || '/' ||
   has_function_privilege('anon', 'public.avaliacao_espelho_tem_cliente(integer, date, bigint)', 'execute')),
  ('c05 EXECUTE clientes_do_dia/helper: authenticated', 'true/true',
   has_function_privilege('authenticated', 'public.avaliacao_clientes_do_dia(integer, date)', 'execute') || '/' ||
   has_function_privilege('authenticated', 'public.avaliacao_espelho_tem_cliente(integer, date, bigint)', 'execute')),
  ('c06 policies public/anon nas seis tabelas', '0',
   (select count(*)::text from pg_policies where schemaname = 'public'
      and tablename in ('trinks_services', 'regras_desafio', 'feriados', 'tratamento_fabricante',
                        'profissional_fabricante', 'avaliacoes_cadastradas')
      and (roles @> array['public']::name[] or roles @> array['anon']::name[]))),
  ('c07 policies novas da A (to authenticated)', '7',
   (select count(*)::text from pg_policies where schemaname = 'public' and roles = array['authenticated']::name[]
      and policyname in ('trinks_services_select_painel', 'regras_desafio_select_painel', 'feriados_select_painel',
                         'tratamento_fabricante_select_painel', 'profissional_fabricante_select_painel',
                         'avaliacoes_select_logado', 'avaliacoes_insert_logado'))),
  ('c08 policies de escrita do admin intactas', '5',
   (select count(*)::text from pg_policies where schemaname = 'public' and roles = array['authenticated']::name[]
      and qual like '%destaque_can_write_page%admin%' and with_check like '%destaque_can_write_page%admin%'
      and ((policyname in ('regras_desafio_write_admin', 'feriados_write_admin', 'tratamento_fabricante_write_admin',
                           'profissional_fabricante_write_admin') and cmd = 'ALL')
           or (policyname = 'avaliacoes_cadastradas_update_admin' and cmd = 'UPDATE')))),
  ('c09 authenticated: colunas SELECT de avaliacoes (sem motivo_recusa)', '13/false',
   (select count(*) filter (where has_column_privilege('authenticated', 'public.avaliacoes_cadastradas', attname::text, 'select'))
           || '/' || has_column_privilege('authenticated', 'public.avaliacoes_cadastradas', 'motivo_recusa', 'select')
      from pg_attribute where attrelid = 'public.avaliacoes_cadastradas'::regclass and attnum > 0 and not attisdropped)),
  ('c10 authenticated: INSERT/UPDATE em avaliacoes', 'true/true',
   has_table_privilege('authenticated', 'public.avaliacoes_cadastradas', 'insert') || '/' ||
   has_table_privilege('authenticated', 'public.avaliacoes_cadastradas', 'update')),
  ('c11 policy publica de leitura de profissionais_ativos (fila)', '1',
   (select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'profissionais_ativos'
      and policyname = 'Permitir leitura pública de profissionais' and cmd = 'SELECT')),
  ('c12 trigger antes_inserir: errcode da janela', 'P0D01',
   (select case when prosrc ~ 'errcode = ''P0D01''' and prosrc !~ '''22023''' then 'P0D01' else 'outro' end
      from pg_proc where oid = 'public.avaliacoes_cadastradas_antes_inserir()'::regprocedure)),
  ('c13 helper com gate e definer / trigger invoker', 'gate/definer/invoker',
   (select case when h.prosrc like '%public.destaque_can_write_page(''estrelas'')%public.destaque_minha_profissional()%'
                then 'gate' else 'sem gate' end
           || '/' || case when h.prosecdef then 'definer' else 'invoker' end
           || '/' || case when t.prosecdef then 'definer' else 'invoker' end
      from pg_proc h, pg_proc t
     where h.oid = 'public.avaliacao_espelho_tem_cliente(integer, date, bigint)'::regprocedure
       and t.oid = 'public.avaliacoes_cadastradas_antes_inserir()'::regprocedure))
) v(k, esp, obt);

grant select on _fx, _p, _tok to anon, authenticated;
grant insert, select on _r to anon, authenticated;

create function pg_temp.esp(p_lista text) returns text language sql as $$
  select case v when 'P' then t.p when 'N' then t.n when 'T' then t.t when 'L' then t.l when 'A' then t.a
                when 'O' then t.o when 'Z' then 'linhas=0 motivos=0' when 'S' then t.s
                when 'FE' then t.fe when 'TF' then t.tf when 'PF' then t.pf else v end
    from pg_temp._tok t,
         lateral (select case when p_lista like '%|%'
                              then split_part(p_lista, '|', current_setting('lfc.o')::int) else p_lista end v) x
$$;

-- r(verificacao, sql, esperado, desfaz)
create function pg_temp.r(p_k text, p_q text, p_esp text, p_desfaz boolean default false)
returns void language plpgsql as $f$
declare
  v text;
begin
  if p_k !~ coalesce(nullif(current_setting('lfc.so', true), ''), '.') then return; end if;
  begin
    execute p_q into v;
    if p_desfaz then raise exception using errcode = 'LFC01'; end if;
  exception when sqlstate 'LFC01' then null; when others then v := sqlstate;
  end;
  insert into pg_temp._r values (current_setting('lfc.o')::int, current_setting('lfc.papel'), p_k,
    pg_temp.esp(p_esp), v);
end $f$;

create function pg_temp.checar() returns void language plpgsql as $f$
declare
  x record;
  ins text := 'insert into public.avaliacoes_cadastradas (profissional_id, nome_profissional, nome_cliente, '
           || 'nome_cliente_trinks, cliente_trinks_id, data_atendimento, origem_cliente_trinks, status, data_hora_cadastro) ';
begin
  select * into x from pg_temp._fx;
  -- RPCs da A
  perform pg_temp.r('01 minha_profissional()',
    $q$select coalesce(public.destaque_minha_profissional()::text, 'NULL')$q$,
    '42501|P|NULL|NULL|NULL|NULL|NULL|P');
  perform pg_temp.r('02 estrelas_periodo(mes atual) linhas', format(
    $q$select count(*)::text from public.destaque_estrelas_periodo(%L, %L)$q$, x.ini, x.fim), '42501|N|N|N|N|0|N|N');
  perform pg_temp.r('03 minhas_avaliacoes(P)', format(
    $q$select format('linhas=%%s motivos=%%s', count(*), count(motivo_recusa)) from public.destaque_minhas_avaliacoes(%s)$q$, x.pid),
    '42501|A|Z|A|A|Z|Z|A');
  perform pg_temp.r('04 minhas_avaliacoes(outra)', format(
    $q$select format('linhas=%%s motivos=%%s', count(*), count(motivo_recusa)) from public.destaque_minhas_avaliacoes(%s)$q$, x.outra),
    '42501|Z|Z|O|O|Z|Z|Z');
  perform pg_temp.r('05 profissionais_sem_conta() linhas/ja_tem_login',
    $q$select format('%s/%s', count(*), count(*) filter (where ja_tem_login)) from public.destaque_profissionais_sem_conta()$q$,
    '42501|0/0|0/0|0/0|S|0/0|0/0|0/0');
  -- leitura das seis tabelas
  perform pg_temp.r('06 select trinks_services',
    $q$select case when exists (select 1 from public.trinks_services) then '>0' else '0' end$q$,
    '42501|>0|>0|>0|>0|0|>0|>0');
  perform pg_temp.r('07 select regras_desafio',
    $q$select case when exists (select 1 from public.regras_desafio) then '>0' else '0' end$q$,
    '42501|>0|>0|>0|>0|0|>0|>0');
  perform pg_temp.r('07b select feriados linhas',
    $q$select count(*)::text from public.feriados$q$, '42501|FE|FE|FE|FE|0|FE|FE');
  perform pg_temp.r('07c select tratamento_fabricante linhas',
    $q$select count(*)::text from public.tratamento_fabricante$q$, '42501|TF|TF|TF|TF|0|TF|TF');
  perform pg_temp.r('07d select profissional_fabricante linhas',
    $q$select count(*)::text from public.profissional_fabricante$q$, '42501|PF|PF|PF|PF|0|PF|PF');
  perform pg_temp.r('08 select avaliacoes_cadastradas linhas',
    $q$select count(id)::text from public.avaliacoes_cadastradas$q$, '42501|L|0|T|T|0|0|L');
  -- INSERT como o modal; o RETURNING mostra se o helper do trigger manteve o id confirmado pelo espelho
  perform pg_temp.r('09 insert estrela propria (P, id do espelho)', ins || format(
    $q$values (%s, 'LoginFxC', 'LoginFxC propria', 'LoginFxC Trinks', %s, %L, 'lista', 'pendente', now())
       returning case cliente_trinks_id when %s then 'ok id=retido' else 'ok id=' || coalesce(cliente_trinks_id::text, 'NULL') end$q$,
    x.pid, x.cli, x.dia, x.cli),
    '42501|ok id=retido|42501|ok id=retido|ok id=retido|42501|42501|ok id=retido', true);
  perform pg_temp.r('10 insert estrela de outra profissional', ins || format(
    $q$values (%s, 'LoginFxC outra', 'LoginFxC outra', 'LoginFxC Trinks', null, %L, 'digitado', 'pendente', now())
       returning 'ok id=' || coalesce(cliente_trinks_id::text, 'NULL')$q$,
    x.outra, x.hoje),
    '42501|42501|42501|ok id=NULL|ok id=NULL|42501|42501|42501', true);
  -- Recepção/Admin inserem para a outra com o id real do espelho dela: o helper (gate write) mantém
  perform pg_temp.r('10b insert estrela de outra profissional (id real do espelho dela)', ins || format(
    $q$values (%s, 'LoginFxC outra', 'LoginFxC outra id', 'LoginFxC Trinks', %s, %L, 'lista', 'pendente', now())
       returning case cliente_trinks_id when %s then 'ok id=retido' else 'ok id=' || coalesce(cliente_trinks_id::text, 'NULL') end$q$,
    x.outra, x.o_cli, x.o_dia, x.o_cli),
    '42501|42501|42501|ok id=retido|ok id=retido|42501|42501|42501', true);
  -- helper do espelho com gate: sem permissão = false (não é oráculo); anon nem executa
  perform pg_temp.r('11 espelho_tem_cliente(P, real)/(P, falso)', format(
    $q$select public.avaliacao_espelho_tem_cliente(%1$s, %2$L, %3$s) || '/' || public.avaliacao_espelho_tem_cliente(%1$s, %2$L, -1)$q$,
    x.pid, x.dia, x.cli), '42501|true/false|false/false|true/false|true/false|false/false|false/false|true/false');
  perform pg_temp.r('11b espelho_tem_cliente(outra, real dela)', format(
    $q$select public.avaliacao_espelho_tem_cliente(%s, %L, %s)::text$q$, x.outra, x.o_dia, x.o_cli),
    '42501|false|false|true|true|false|false|false');
  perform pg_temp.r('12 update profissionais_ativos.email', format(
    $q$with u as (update public.profissionais_ativos set email = email where "profissionalId" = %s returning 1)
       select 'ok:' || count(*) from u$q$, x.pid), '42501', true);
  perform pg_temp.r('13 delete avaliacoes_cadastradas',
    $q$with d as (delete from public.avaliacoes_cadastradas where nome_cliente = 'LoginFxC motivo' returning 1)
       select 'ok:' || count(*) from d$q$, '42501', true);
  perform pg_temp.r('14 update destaque_users_app.profissional_id (auto-vinculo)', format(
    $q$with u as (update public.destaque_users_app set profissional_id = %s where id = auth.uid() returning 1)
       select 'ok:' || count(*) from u$q$, x.pid), '42501', true);
  -- novidades da C
  perform pg_temp.r('17 insert com dia fora da janela (errcode do trigger)', ins || format(
    $q$values (%s, 'LoginFxC', 'LoginFxC janela', null, null, %L, 'digitado', 'pendente', now())
       returning 'ok'$q$, x.pid, x.hoje - 11),
    '42501|P0D01|P0D01|P0D01|P0D01|P0D01|P0D01|P0D01', true);
  perform pg_temp.r('18 clientes_do_dia(P, dia do espelho)', format(
    $q$select case when count(*) filter (where cliente_trinks_id = %s) > 0 then 'ok' else 'ok sem a cliente' end
         from public.avaliacao_clientes_do_dia(%s, %L)$q$, x.cli, x.pid, x.dia),
    '42501|ok|42501|ok|ok|42501|42501|ok');
  perform pg_temp.r('19 clientes_do_dia(outra, hoje)', format(
    $q$select 'ok' from (select count(*) from public.avaliacao_clientes_do_dia(%s, %L)) c$q$, x.outra, x.hoje),
    '42501|42501|42501|ok|ok|42501|42501|42501');
  perform pg_temp.r('20 fila: 4 colunas de profissionais_ativos (como a fila le)',
    $q$select case when count(*) > 0 then '>0' else '0' end
         from (select "profissionalId", nome_profissional, categoria, ativo from public.profissionais_ativos
                where categoria is not null and ativo is not false order by nome_profissional) q$q$,
    '>0');
  perform pg_temp.r('21 profissionais_ativos.apelido',
    $q$select case when count(apelido) >= 0 then '>0' end from public.profissionais_ativos$q$,
    '42501|>0|>0|>0|>0|>0|>0|>0');
  perform pg_temp.r('22 profissionais_ativos.email',
    $q$select case when count(email) >= 0 then '>0' end from public.profissionais_ativos$q$,
    '42501|>0|>0|>0|>0|>0|>0|>0');
end $f$;

-- 3. Rodadas por papel
do $$
declare x record;
begin
  for x in select * from _p order by o loop
    perform set_config('request.jwt.claims', case when x.uid is null then '{"role":"anon"}'
      else json_build_object('sub', x.uid, 'email', x.claim_email, 'role', 'authenticated')::text end, true);
    perform set_config('lfc.o', x.o::text, true), set_config('lfc.papel', x.papel, true);
    execute format('set local role %I', case when x.uid is null then 'anon' else 'authenticated' end);
    perform pg_temp.checar();
    reset role;
  end loop;
  perform set_config('request.jwt.claims', '', true);
end $$;

-- 4. Resultado
create temp view _resultado as
select papel, verificacao, esperado, obtido, esperado is not distinct from obtido ok
  from _r order by o, verificacao;

do $$
begin
  if exists (select 1 from _resultado where not ok) then
    raise exception 'login_fase_c: falhou: %', (select string_agg(format('[%s] %s: esperado %s, obtido %s',
      papel, verificacao, esperado, obtido), ' | ') from _resultado where not ok);
  end if;
end $$;

select * from _resultado;

rollback;
