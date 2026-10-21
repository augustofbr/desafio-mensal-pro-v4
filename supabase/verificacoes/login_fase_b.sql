-- Verificação de 20261021105000_login_fase_b_colunas_authenticated.sql (login em todas as rotas,
-- migração B: authenticated lê só as 9 colunas do app em profissionais_ativos).
-- Roda INTEIRO numa transação que termina em erro (RAISE), e a transação é desfeita; nada
-- persiste, nem com sucesso. Como postgres (SQL Editor, MCP execute_sql ou psql), DEPOIS de aplicar a migração B. Sem ela, o
-- passo 0 aborta. Resultado esperado: ERRO "LOGIN_FASE_B_OK: 112 linhas, 0 falhas (...)" com a
-- tabela na mensagem. "login_fase_b: falhou: ..." ou qualquer outro erro = reprovação.
-- O MCP recusa lotes grandes/sensíveis: mande o arquivo sem as linhas de comentário, ou em partes.
-- Segura locks até o RAISE (INSERT de fixtures em auth.users, destaque_users_app e user_roles; e
-- UPDATE da linha de destaque_users_app ligada a P, se houver): rode fora do horário de pico.
--
-- Ordem final: B, depois o deploy do front, depois a C (20261021110000_login_fase_c_fecha_anon.sql).
-- Esta verificação vale ANTES ou DEPOIS da C. A C só mexe em anon: o estado dela é lido do
-- catálogo (anon com SELECT em trinks_services = C ainda não aplicada) e decide o esperado de
-- anon: antes da C, as 9 colunas; depois, só as 4 da fila ("profissionalId", nome_profissional,
-- categoria, ativo). Em qualquer caso, nenhuma coluna sensível. A C foi ajustada (commit
-- 0e04fdd) para valer com a B já aplicada: a guarda dela confere as 9 colunas de authenticated,
-- uma a uma, e o item 22 da verificação dela lê do catálogo se authenticated ainda lê `email`.
--
-- Papéis (ordem das listas de esperado):
--   1 anon
--   2 prof_ligada       perfil Profissional, ligada à profissional P (a ativa de menor id; o
--                       vínculo real de P, se houver, sai SÓ nesta transação)
--   3 recepcao          perfil Recepção        4 admin    perfil Admin (usuarios: write)
--   5 somente_leitura   perfil Somente Leitura
--   6 sem_papel         conta no Auth sem destaque_users_app e sem user_roles (sem papel no NFS-e)
--   7 nfse_admin        conta com user_roles.role = 'admin' (papel do NFS-e) e sem destaque_users_app
--   8 service_role
-- Esperados: "a|b|...|h" na ordem dos papéis (valor único = todos). SKIP = não roda para o papel.
-- Tokens (contagem direta como postgres, depois das fixtures): P id de P; R linhas de
-- profissionais_ativos (a policy pública de SELECT mostra todas); A9 = R antes da C, 42501 depois;
-- NC colunas fora das 9; S "linhas=.. emails=.." de destaque_profissionais_sem_conta();
-- Z "linhas=0 emails=0".
-- Saída: _r (papel, verificacao, esperado, obtido, ok) dentro da mensagem do RAISE final.
-- Linhas esperadas: 10 de catálogo (postgres) + 13 verificações x 8 papéis - 2 SKIP = 112.

begin;

set local statement_timeout = '60s';
set local lock_timeout = '3s';
set local idle_in_transaction_session_timeout = '30s';

-- 0. Pré-condições
do $$
begin
  if has_table_privilege('authenticated', 'public.profissionais_ativos', 'select')
     or has_column_privilege('authenticated', 'public.profissionais_ativos', 'cpf', 'select')
     or not has_column_privilege('authenticated', 'public.profissionais_ativos', 'updated_at', 'select') then
    raise exception 'migracao B nao aplicada: aplique 20261021105000_login_fase_b_colunas_authenticated.sql antes';
  end if;
  if current_user <> 'postgres'
     or (select count(*) from public.destaque_perfis
          where nome in ('Admin', 'Recepção', 'Profissional', 'Somente Leitura')) <> 4
     or exists (select 1 from auth.users where id::text like '00000000-0000-4000-8000-0000106b000_')
     or exists (select 1 from auth.users where email like 'fx-loginb-%@invalid.local') then
    raise exception 'pre-condicao: postgres, 4 perfis, uuids e e-mails de fixture livres';
  end if;
end $$;

-- 1. Fixtures (postgres)
create temp table _fx on commit drop as
select (select min("profissionalId") from public.profissionais_ativos where ativo is not false) pid,
       has_table_privilege('anon', 'public.trinks_services', 'select') pre_c,
       0 desligados;

do $$
begin
  if (select pid from _fx) is null then
    raise exception 'fixtures: nenhuma profissional ativa em profissionais_ativos';
  end if;
end $$;

-- vínculo real de P sai SÓ nesta transação (o UNIQUE de profissional_id impediria a fixture)
with u as (
  update public.destaque_users_app set profissional_id = null
   where profissional_id = (select pid from _fx)
  returning 1)
update _fx set desligados = (select count(*) from u);

create temp table _p on commit drop as
select * from (values
  (1, 'anon',            null::uuid, null::text, null::text, null::boolean),
  (2, 'prof_ligada',     '00000000-0000-4000-8000-0000106b0001', 'fx-loginb-ligada@invalid.local', 'Profissional', true),
  (3, 'recepcao',        '00000000-0000-4000-8000-0000106b0002', 'fx-loginb-recepcao@invalid.local', 'Recepção', false),
  (4, 'admin',           '00000000-0000-4000-8000-0000106b0003', 'fx-loginb-admin@invalid.local', 'Admin', false),
  (5, 'somente_leitura', '00000000-0000-4000-8000-0000106b0004', 'fx-loginb-leitura@invalid.local', 'Somente Leitura', false),
  (6, 'sem_papel',       '00000000-0000-4000-8000-0000106b0005', 'fx-loginb-sempapel@invalid.local', null, false),
  (7, 'nfse_admin',      '00000000-0000-4000-8000-0000106b0006', 'fx-loginb-nfse@invalid.local', null, false),
  (8, 'service_role',    null::uuid, null::text, null::text, null::boolean)
) x(o, papel, uid, email, perfil, ligada);

insert into auth.users (id, aud, role, email, email_confirmed_at, email_change)
select uid, 'authenticated', 'authenticated', email, now(), '' from _p where uid is not null;

-- profissional_id explícito só na prof_ligada (o trigger de vínculo respeita); os demais NULL
insert into public.destaque_users_app (id, nome, perfil_id, ativo, profissional_id)
select x.uid, 'LoginFxB ' || x.papel, p.id, true,
       case when x.ligada then (select pid from _fx) end
  from _p x join public.destaque_perfis p on p.nome = x.perfil;

insert into public.user_roles (user_id, role)
select uid, 'admin' from _p where papel = 'nfse_admin';

create temp table _tok on commit drop as
select f.pid::text p,
       (select count(*) from public.profissionais_ativos)::text r,
       case when f.pre_c then (select count(*) from public.profissionais_ativos)::text else '42501' end a9,
       (select count(*) from pg_attribute
         where attrelid = 'public.profissionais_ativos'::regclass and attnum > 0 and not attisdropped
           and attname::text <> all (array['profissionalId', 'nome_profissional', 'categoria', 'apelido', 'ativo',
                                           'dia_aniversario', 'mes_aniversario', 'created_at', 'updated_at']))::text nc,
       -- o mesmo predicado de destaque_profissionais_sem_conta(), sem o gate de usuarios
       (select format('linhas=%s emails=%s', count(*), count(p.email))
          from public.profissionais_ativos p
         where ativo is not false and email is not null
           and not exists (select 1 from auth.users au join public.destaque_users_app u on u.id = au.id
                            where lower(au.email) = p.email)
           and not exists (select 1 from public.destaque_users_app l where l.profissional_id = p."profissionalId")) s,
       case when f.pre_c
            then 'apelido,ativo,categoria,created_at,dia_aniversario,mes_aniversario,nome_profissional,profissionalId,updated_at'
            else 'ativo,categoria,nome_profissional,profissionalId' end anon_cols
  from _fx f;

do $$
begin
  if exists (select 1 from _tok where r = '0' or nc = '0') then
    raise exception 'fixtures nao provam nada: %', (select row_to_json(k) from _tok k);
  end if;
end $$;

-- 2. Checagem
create temp table _r (o int, papel text, verificacao text, esperado text, obtido text)
  on commit drop;

-- catálogo (postgres)
insert into _r
select 0, 'postgres', v.k, v.esp, v.obt from (values
  ('c01 authenticated: colunas legiveis (catalogo)',
   'apelido,ativo,categoria,created_at,dia_aniversario,mes_aniversario,nome_profissional,profissionalId,updated_at',
   (select string_agg(attname::text, ',' order by attname::text collate "C") from pg_attribute
     where attrelid = 'public.profissionais_ativos'::regclass and attnum > 0 and not attisdropped
       and has_column_privilege('authenticated', 'public.profissionais_ativos', attname::text, 'select'))),
  ('c02 authenticated: privilegio de TABELA', 'nenhum',
   (select case when has_table_privilege('authenticated', 'public.profissionais_ativos',
                       'select, insert, update, delete, truncate, references, trigger') then 'tem' else 'nenhum' end)),
  ('c03 authenticated: escrita por coluna', 'nenhum',
   (select case when has_any_column_privilege('authenticated', 'public.profissionais_ativos', 'insert, update, references')
                then 'tem' else 'nenhum' end)),
  ('c04 anon: colunas legiveis (4 depois da C, 9 antes)', (select anon_cols from _tok),
   (select string_agg(attname::text, ',' order by attname::text collate "C") from pg_attribute
     where attrelid = 'public.profissionais_ativos'::regclass and attnum > 0 and not attisdropped
       and has_column_privilege('anon', 'public.profissionais_ativos', attname::text, 'select'))),
  ('c05 anon: privilegio de tabela ou escrita', 'nenhum',
   (select case when has_table_privilege('anon', 'public.profissionais_ativos',
                       'select, insert, update, delete, truncate, references, trigger')
                  or has_any_column_privilege('anon', 'public.profissionais_ativos', 'insert, update, references')
                then 'tem' else 'nenhum' end)),
  ('c06 service_role: select/insert/update/delete (um has_table_privilege por privilegio)', 'true/true/true/true',
   has_table_privilege('service_role', 'public.profissionais_ativos', 'select') || '/' ||
   has_table_privilege('service_role', 'public.profissionais_ativos', 'insert') || '/' ||
   has_table_privilege('service_role', 'public.profissionais_ativos', 'update') || '/' ||
   has_table_privilege('service_role', 'public.profissionais_ativos', 'delete')),
  ('c07 PUBLIC: qualquer privilegio', 'nenhum',
   (select case when has_table_privilege('public', 'public.profissionais_ativos',
                       'select, insert, update, delete, truncate, references, trigger')
                  or has_any_column_privilege('public', 'public.profissionais_ativos', 'select, insert, update, references')
                then 'tem' else 'nenhum' end)),
  ('c08 policy publica de leitura de linhas', '1',
   (select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'profissionais_ativos'
      and policyname = 'Permitir leitura pública de profissionais' and cmd = 'SELECT')),
  ('c09 RPCs da A: definer/definer e EXECUTE de authenticated', 'definer/definer/true/true',
   (select case when a.prosecdef then 'definer' else 'invoker' end || '/'
           || case when b.prosecdef then 'definer' else 'invoker' end || '/'
           || has_function_privilege('authenticated', a.oid, 'execute') || '/'
           || has_function_privilege('authenticated', b.oid, 'execute')
      from pg_proc a, pg_proc b
     where a.oid = 'public.destaque_minha_profissional()'::regprocedure
       and b.oid = 'public.destaque_profissionais_sem_conta()'::regprocedure)),
  ('c10 relacl sem entrada de authenticated', 'sem authenticated',
   (select case when exists (select 1 from pg_class c, aclexplode(c.relacl) x
                              where c.oid = 'public.profissionais_ativos'::regclass
                                and x.grantee = 'authenticated'::regrole)
                then 'com authenticated' else 'sem authenticated' end))
) v(k, esp, obt);

grant select on _fx, _p, _tok to anon, authenticated, service_role;
grant insert, select on _r to anon, authenticated, service_role;

create function pg_temp.esp(p_lista text) returns text language sql as $$
  select case v when 'P' then t.p when 'R' then t.r when 'A9' then t.a9 when 'NC' then t.nc
                when 'S' then t.s when 'Z' then 'linhas=0 emails=0' else v end
    from pg_temp._tok t,
         lateral (select case when p_lista like '%|%'
                              then split_part(p_lista, '|', current_setting('lfb.o')::int) else p_lista end v) x
$$;

-- r(verificacao, sql, esperado)
create function pg_temp.r(p_k text, p_q text, p_esp text)
returns void language plpgsql as $f$
declare
  v text;
  e text := pg_temp.esp(p_esp);
begin
  if e = 'SKIP' then return; end if;
  begin
    execute p_q into v;
  exception when others then v := sqlstate;
  end;
  insert into pg_temp._r values (current_setting('lfb.o')::int, current_setting('lfb.papel'), p_k, e, v);
end $f$;

-- quantas colunas FORA das 9 o papel atual consegue ler (cada uma num SELECT próprio)
create function pg_temp.outras_legiveis() returns text language plpgsql as $f$
declare
  c text;
  n int := 0;
begin
  for c in select attname::text from pg_attribute
            where attrelid = 'public.profissionais_ativos'::regclass and attnum > 0 and not attisdropped
              and attname::text <> all (array['profissionalId', 'nome_profissional', 'categoria', 'apelido', 'ativo',
                                              'dia_aniversario', 'mes_aniversario', 'created_at', 'updated_at']) loop
    begin
      execute format('select count(%I) from public.profissionais_ativos', c);
      n := n + 1;
    exception when insufficient_privilege then null;
    end;
  end loop;
  return n::text;
end $f$;

-- ordem das listas: anon | prof_ligada | recepcao | admin | somente_leitura | sem_papel |
--                   nfse_admin | service_role
create function pg_temp.checar() returns void language plpgsql as $f$
declare
  sens text;
begin
  -- o que o app lê (useActiveProfessionals.ts:21, com updated_at)
  perform pg_temp.r('01 as 9 colunas (linhas)',
    $q$select count(*)::text from (select "profissionalId", nome_profissional, categoria, apelido, ativo,
                                          dia_aniversario, mes_aniversario, created_at, updated_at
                                     from public.profissionais_ativos) s$q$,
    'A9|R|R|R|R|R|R|R');
  -- o que a fila lê (lib/supabase/queries/professionals.ts:16), com e sem login
  perform pg_temp.r('02 4 colunas da fila (filtro categoria/ativo, order nome)',
    $q$select case when count(*) > 0 then '>0' else '0' end
         from (select "profissionalId", nome_profissional, categoria from public.profissionais_ativos
                where categoria is not null and ativo is not false order by nome_profissional) q$q$,
    '>0');
  -- colunas sensíveis, uma a uma
  foreach sens in array array['cpf', 'telefone', 'email', 'documento', 'cnpj', 'endereco',
                              'trinks_id_profissional'] loop
    perform pg_temp.r(format('03 coluna %s', sens),
      format($q$select case when count(%I) >= 0 then 'ok' end from public.profissionais_ativos$q$, sens),
      '42501|42501|42501|42501|42501|42501|42501|ok');
  end loop;
  perform pg_temp.r('04 select *',
    $q$select case when count(*) >= 0 then 'ok' end from (select * from public.profissionais_ativos) s$q$,
    '42501|42501|42501|42501|42501|42501|42501|ok');
  perform pg_temp.r('05 colunas fora das 9 legiveis (uma a uma)',
    $q$select pg_temp.outras_legiveis()$q$,
    '0|0|0|0|0|0|0|NC');
  -- RPCs SECURITY DEFINER da A: continuam lendo e-mail/vínculo pelo dono
  perform pg_temp.r('06 destaque_minha_profissional()',
    $q$select coalesce(public.destaque_minha_profissional()::text, 'NULL')$q$,
    '42501|P|NULL|NULL|NULL|NULL|NULL|SKIP');
  perform pg_temp.r('07 destaque_profissionais_sem_conta() linhas/emails',
    $q$select format('linhas=%s emails=%s', count(*), count(email)) from public.destaque_profissionais_sem_conta()$q$,
    '42501|Z|Z|S|Z|Z|Z|SKIP');
end $f$;

-- 3. Rodadas por papel
do $$
declare x record;
begin
  for x in select * from _p order by o loop
    perform set_config('request.jwt.claims', case
      when x.papel = 'anon' then '{"role":"anon"}'
      when x.papel = 'service_role' then '{"role":"service_role"}'
      else json_build_object('sub', x.uid, 'email', x.email, 'role', 'authenticated')::text end, true);
    perform set_config('lfb.o', x.o::text, true), set_config('lfb.papel', x.papel, true);
    execute format('set local role %I', case when x.papel in ('anon', 'service_role') then x.papel
                                             else 'authenticated' end);
    perform pg_temp.checar();
    reset role;
  end loop;
  perform set_config('request.jwt.claims', '', true);
end $$;

-- 4. Resultado: termina em erro (RAISE), e a transação é desfeita; nada persiste (nem as
--    fixtures nem, no ensaio, a própria migração)
do $$
declare
  v_tab text := (select string_agg(format('%s | %s | %s | %s | %s', papel, verificacao, esperado, obtido,
                                          esperado is not distinct from obtido), E'\n' order by o, verificacao)
                   from _r);
begin
  if exists (select 1 from _r where esperado is distinct from obtido) then
    raise exception 'login_fase_b: falhou: %', (select string_agg(format('[%s] %s: esperado %s, obtido %s',
      papel, verificacao, esperado, obtido), ' | ') from _r where esperado is distinct from obtido);
  end if;
  raise exception E'LOGIN_FASE_B_OK: % linhas, 0 falhas (estado da C: %; vinculos reais desligados so na transacao: %)\n%',
    (select count(*) from _r),
    (select case when pre_c then 'ainda nao aplicada' else 'aplicada' end from _fx),
    (select desligados from _fx), v_tab;
end $$;

rollback;
