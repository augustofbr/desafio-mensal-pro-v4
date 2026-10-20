-- Verificacao de 20261021100000_login_fase_a.sql (login em todas as rotas, migracao A).
-- Roda INTEIRO em begin ... rollback (nada persiste), como postgres (MCP execute_sql), DEPOIS
-- de aplicar a migracao. Sem ela, o passo 0 aborta ("funcoes da migracao A inexistentes").
-- O MCP recusa lotes grandes/sensiveis: mande o arquivo sem as linhas de comentario.
--
-- Fases: A = estado real pos-migracao (policies publicas antigas ainda valem);
-- pos_C_simulado = DROP, so nesta transacao, das policies publicas de SELECT de trinks_services,
-- regras_desafio, avaliacoes_cadastradas e do INSERT publico de avaliacoes (o que a migracao C
-- fara): prova o recorte das policies novas por papel. Essa fase pega ACCESS EXCLUSIVE nessas
-- tabelas ate o rollback (~1 s; lock_timeout 3s).
-- Papeis (ordem das listas de esperado):
--   1 anon
--   2 prof_ligada        perfil Profissional; email do Auth = email da Aline (885975); o vinculo
--                        vem do TRIGGER de destaque_users_app (verificacao 00a)
--   3 prof_sem_vinculo   Profissional, email de fixture (trigger deixa NULL, 00b)
--   4 recepcao   5 admin
--   6 inativo            perfil Admin, users_app.ativo = false, ligado (pelo trigger) a OUTRA
--                        profissional ativa: o vinculo tem de cair por estar desativado
--   7 spoof              Profissional ativo SEM vinculo, mas com claim email = email da Aline
--                        (simula updateUser({email}) com autoconfirm): nao pode virar a Aline
--   8 ligada_email_trocado  a MESMA conta da prof_ligada com claim email diferente: continua 885975
-- Fixtures so do trigger: "ocupante" ligada explicitamente a uma 3a profissional X e
-- "duplicado" com o email de X no Auth: o trigger deixa NULL (00c, id ja ligado);
-- "nao_confirmado" (email de outra livre, email_confirmed_at NULL) e "troca_pendente" (email de
-- outra livre, email_change preenchido): o trigger deixa NULL (00f, 00g). "convidado" (email de
-- outra livre, invited_at preenchido e email_confirmed_at NULL): o trigger LIGA (00h). "outro_app": auth user
-- confirmado com o email de outra livre e FORA de destaque_users_app: sem_conta mostra
-- ja_tem_login = true para ela (15). Todo auth user de fixture nasce com email_confirmed_at,
-- salvo o "nao_confirmado".
-- Claims via set_config('request.jwt.claims') antes de `set local role`. auth.users dispara
-- handle_new_user (public.profiles): some no rollback.
-- Esperados: "a|b|...|h" na ordem dos papeis (valor unico = todos); 1a lista = fase A,
-- 2a = pos_C (ausente = igual). Tokens (contagem direta como postgres): N estrelas
-- aprovadas+pendentes do mes (Manaus), T linhas de avaliacoes, L linhas da Aline, A/O
-- "linhas=.. motivos=.." da Aline/da outra profissional, Z "linhas=0 motivos=0", S profissionais
-- sem conta. Na fase A, se o esperado pos_C difere, a linha ganha nota "esperado_apos_C: <valor>".
-- INSERTs/UPDATEs de teste se desfazem num sub-bloco (errcode LFA01): contagens nao mudam.
-- Saida: _resultado (fase, papel, verificacao, esperado, obtido, ok, nota); aborta se ok=false.
-- Opcional: set_config('lfa.so', '<regex>', true) antes do passo 3 roda so as verificacoes que
-- casam (usado no ensaio dividido).

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';
set local idle_in_transaction_session_timeout = '30s';

-- 0. Pre-condicoes
do $$
begin
  if to_regprocedure('public.destaque_minha_profissional()') is null
     or to_regprocedure('public.destaque_estrelas_periodo(timestamptz, timestamptz)') is null
     or to_regprocedure('public.destaque_minhas_avaliacoes(integer)') is null
     or to_regprocedure('public.destaque_profissionais_sem_conta()') is null
     or to_regprocedure('public.avaliacao_espelho_tem_cliente(integer, date, bigint)') is null
     or to_regprocedure('public.vincular_profissional_usuario_destaque()') is null then
    raise exception 'funcoes da migracao A inexistentes: aplique 20261021100000_login_fase_a.sql antes';
  end if;
  if current_user <> 'postgres'
     or (select count(*) from public.destaque_perfis
          where nome in ('Admin', 'Recepção', 'Profissional', 'Somente Leitura')) <> 4
     or exists (select 1 from auth.users where id::text like '00000000-0000-4000-8000-0000106a000_')
     or not exists (select 1 from public.profissionais_ativos
                     where "profissionalId" = 885975 and ativo is not false and email is not null)
     or exists (select 1 from auth.users a join public.profissionais_ativos p on p.email = lower(a.email)
                 where p."profissionalId" = 885975)
     or exists (select 1 from public.destaque_users_app where profissional_id = 885975) then
    raise exception 'pre-condicao: postgres, 4 perfis, uuids de fixture livres, Aline ativa com email, sem usuario de Auth e sem vinculo';
  end if;
end $$;

-- 1. Fixtures (postgres)
create temp table _fx on commit drop as
with e as (  -- atendimento real da Aline no espelho, na janela do trigger (hoje-10..hoje)
  select to_date(service_date, 'DD/MM/YYYY') dia, btrim(clienteid)::bigint cli
    from public.trinks_services
   where profissionalid = '885975' and btrim(clienteid) ~ '^[0-9]{1,18}$'
     and service_date ~ '^\d\d/\d\d/\d{4}$'
     and to_date(service_date, 'DD/MM/YYYY') >= (now() at time zone 'America/Manaus')::date - 10
     and to_date(service_date, 'DD/MM/YYYY') <= (now() at time zone 'America/Manaus')::date
   order by 1 desc, 2 limit 1),
livres as (  -- ativas com email, sem usuario de Auth e sem vinculo (para inativo e X)
  select "profissionalId" id, email from public.profissionais_ativos p
   where ativo is not false and email is not null and "profissionalId" <> 885975
     and not exists (select 1 from auth.users a where lower(a.email) = p.email)
     and not exists (select 1 from public.destaque_users_app u where u.profissional_id = p."profissionalId")
   order by 1 limit 6)
select (select email from public.profissionais_ativos where "profissionalId" = 885975) aline,
       (select id from livres order by id limit 1) inativo_id,
       (select email from livres order by id limit 1) inativo_email,
       (select id from livres order by id offset 1 limit 1) x_id,
       (select email from livres order by id offset 1 limit 1) x_email,
       (select email from livres order by id offset 2 limit 1) nc_email,
       (select email from livres order by id offset 3 limit 1) ec_email,
       (select id from livres order by id offset 4 limit 1) oa_id,
       (select email from livres order by id offset 4 limit 1) oa_email,
       (select id from livres order by id offset 5 limit 1) cv_id,
       (select email from livres order by id offset 5 limit 1) cv_email,
       (select profissional_id from public.avaliacoes_cadastradas where profissional_id <> 885975
         group by 1 order by count(*) desc, 1 limit 1) outra,
       (select count(*) from public.destaque_profissionais_sem_conta()) s_real_rpc_postgres,
       (select count(*) from public.profissionais_ativos p
         where ativo is not false and email is not null
           and not exists (select 1 from auth.users au join public.destaque_users_app u on u.id = au.id
                            where lower(au.email) = p.email)
           and not exists (select 1 from public.destaque_users_app l where l.profissional_id = p."profissionalId")) s_real,
       date_trunc('month', now() at time zone 'America/Manaus') at time zone 'America/Manaus' ini,
       (date_trunc('month', now() at time zone 'America/Manaus') + interval '1 month') at time zone 'America/Manaus' fim,
       (select dia from e) dia, (select cli from e) cli;

create temp table _p on commit drop as
select * from (values
  (1, 'anon',                 null::uuid, null::text, null::text, null::text, null::boolean),
  (2, 'prof_ligada',          '00000000-0000-4000-8000-0000106a0001', (select aline from _fx), (select aline from _fx), 'Profissional', true),
  (3, 'prof_sem_vinculo',     '00000000-0000-4000-8000-0000106a0002', 'fx-login-semvinculo@invalid.local', 'fx-login-semvinculo@invalid.local', 'Profissional', true),
  (4, 'recepcao',             '00000000-0000-4000-8000-0000106a0003', 'fx-login-recepcao@invalid.local', 'fx-login-recepcao@invalid.local', 'Recepção', true),
  (5, 'admin',                '00000000-0000-4000-8000-0000106a0004', 'fx-login-admin@invalid.local', 'fx-login-admin@invalid.local', 'Admin', true),
  (6, 'inativo',              '00000000-0000-4000-8000-0000106a0005', (select inativo_email from _fx), (select inativo_email from _fx), 'Admin', false),
  (7, 'spoof',                '00000000-0000-4000-8000-0000106a0006', 'fx-login-spoof@invalid.local', (select aline from _fx), 'Profissional', true),
  (8, 'ligada_email_trocado', '00000000-0000-4000-8000-0000106a0001', null, 'fx-login-outro@invalid.local', null, null)
) x(o, papel, uid, auth_email, claim_email, perfil, ativo);

insert into auth.users (id, aud, role, email, email_confirmed_at, email_change, invited_at)
select uid, 'authenticated', 'authenticated', auth_email, now(), '', null::timestamptz from _p where auth_email is not null
union all select '00000000-0000-4000-8000-0000106a0007', 'authenticated', 'authenticated', 'fx-login-ocupante@invalid.local', now(), '', null
union all select '00000000-0000-4000-8000-0000106a0008', 'authenticated', 'authenticated', (select x_email from _fx), now(), '', null
union all select '00000000-0000-4000-8000-0000106a0009', 'authenticated', 'authenticated', (select nc_email from _fx), null, '', null
union all select '00000000-0000-4000-8000-0000106a000a', 'authenticated', 'authenticated', (select ec_email from _fx), now(), 'fx-login-troca@invalid.local', null
union all select '00000000-0000-4000-8000-0000106a000b', 'authenticated', 'authenticated', (select oa_email from _fx), now(), '', null
union all select '00000000-0000-4000-8000-0000106a000c', 'authenticated', 'authenticated', (select cv_email from _fx), null, '', now();

-- vinculos pelo TRIGGER (profissional_id omitido), exceto o ocupante (explicito, ANTES do duplicado)
insert into public.destaque_users_app (id, nome, perfil_id, ativo)
select x.uid, 'LoginFx ' || x.papel, p.id, x.ativo
  from _p x join public.destaque_perfis p on p.nome = x.perfil;
insert into public.destaque_users_app (id, nome, perfil_id, ativo, profissional_id)
select '00000000-0000-4000-8000-0000106a0007', 'LoginFx ocupante', id, true, (select x_id from _fx)
  from public.destaque_perfis where nome = 'Somente Leitura';
insert into public.destaque_users_app (id, nome, perfil_id, ativo)
select v.id::uuid, v.nome, p.id, true
  from (values ('00000000-0000-4000-8000-0000106a0008', 'LoginFx duplicado'),
               ('00000000-0000-4000-8000-0000106a0009', 'LoginFx nao_confirmado'),
               ('00000000-0000-4000-8000-0000106a000a', 'LoginFx troca_pendente'),
               ('00000000-0000-4000-8000-0000106a000c', 'LoginFx convidado')) v(id, nome)
  join public.destaque_perfis p on p.nome = 'Somente Leitura';
-- 0b ("outro_app") fica FORA de destaque_users_app de proposito

-- recusa da Aline com motivo (postgres nao passa pelo trigger de INSERT)
insert into public.avaliacoes_cadastradas (profissional_id, nome_profissional, nome_cliente, status, motivo_recusa)
values (885975, 'Aline', 'LoginFx motivo', 'rejeitada', 'LoginFx: motivo de teste');

create temp table _tok on commit drop as
select (select count(*) from public.avaliacoes_cadastradas
         where status in ('aprovada', 'pendente') and data_hora_cadastro >= f.ini and data_hora_cadastro < f.fim)::text n,
       (select count(*) from public.avaliacoes_cadastradas)::text t,
       (select count(*) from public.avaliacoes_cadastradas where profissional_id = 885975)::text l,
       (select format('linhas=%s motivos=%s', count(*), count(motivo_recusa))
          from public.avaliacoes_cadastradas where profissional_id = 885975) a,
       (select format('linhas=%s motivos=%s', count(*), count(motivo_recusa))
          from public.avaliacoes_cadastradas where profissional_id = f.outra) o,
       (select format('%s/%s', count(*), count(*) filter (where exists (
                 select 1 from auth.users au where lower(au.email) = p.email
                    and not exists (select 1 from public.destaque_users_app u where u.id = au.id))))
          from public.profissionais_ativos p
         where ativo is not false and email is not null
           and not exists (select 1 from auth.users au join public.destaque_users_app u on u.id = au.id
                            where lower(au.email) = p.email)
           and not exists (select 1 from public.destaque_users_app l where l.profissional_id = p."profissionalId")) s
  from _fx f;

do $$
begin
  if exists (select 1 from _fx where aline is null or inativo_id is null or x_id is null or nc_email is null
                                   or ec_email is null or oa_id is null or cv_id is null
                                   or outra is null or dia is null or s_real < 19 or s_real_rpc_postgres <> 0)
     or exists (select 1 from _tok where n = '0' or a like '% motivos=0' or o like 'linhas=0 %'
                                   or s like '0/%' or s like '%/0') then
    raise exception 'fixtures nao provam nada: % %', (select row_to_json(f) from _fx f), (select row_to_json(t) from _tok t);
  end if;
end $$;

-- 2. Checagem
create temp table _r (fase text, o int, papel text, verificacao text, esperado text, obtido text, nota text)
  on commit drop;

-- trigger de vinculo e backfill (postgres)
insert into _r
select 'A', 0, 'postgres', v.k, v.esp, v.obt, null from (values
  ('00a trigger: email casa -> id', '885975',
   (select coalesce(profissional_id::text, 'NULL') from public.destaque_users_app where id = '00000000-0000-4000-8000-0000106a0001')),
  ('00b trigger: sem casamento -> NULL', 'NULL',
   (select coalesce(profissional_id::text, 'NULL') from public.destaque_users_app where id = '00000000-0000-4000-8000-0000106a0002')),
  ('00c trigger: id ja ligado -> NULL', 'NULL',
   (select coalesce(profissional_id::text, 'NULL') from public.destaque_users_app where id = '00000000-0000-4000-8000-0000106a0008')),
  ('00d trigger: liga mesmo com a conta inativa', 'ligado',
   (select case when profissional_id = f.inativo_id then 'ligado' else coalesce(profissional_id::text, 'NULL') end
      from public.destaque_users_app, _fx f where id = '00000000-0000-4000-8000-0000106a0005')),
  ('00f trigger: email nao confirmado -> NULL', 'NULL',
   (select coalesce(profissional_id::text, 'NULL') from public.destaque_users_app where id = '00000000-0000-4000-8000-0000106a0009')),
  ('00g trigger: troca de email pendente -> NULL', 'NULL',
   (select coalesce(profissional_id::text, 'NULL') from public.destaque_users_app where id = '00000000-0000-4000-8000-0000106a000a')),
  ('00h trigger: convidado ainda nao confirmado -> liga', 'ligado',
   (select case when profissional_id = f.cv_id then 'ligado' else coalesce(profissional_id::text, 'NULL') end
      from public.destaque_users_app, _fx f where id = '00000000-0000-4000-8000-0000106a000c')),
  ('00e backfill: contas reais com email casavel e sem vinculo', '0',
   (select count(*)::text from public.destaque_users_app u join auth.users au on au.id = u.id
      join public.profissionais_ativos pa on pa.email = lower(au.email)
     where u.nome not like 'LoginFx %' and u.profissional_id is null and pa.ativo is not false
       and not exists (select 1 from public.destaque_users_app o where o.profissional_id = pa."profissionalId")))
) v(k, esp, obt);

grant select on _fx, _p, _tok to anon, authenticated;
grant insert, select on _r to anon, authenticated;

create function pg_temp.esp(p_lista text) returns text language sql as $$
  select case v when 'N' then t.n when 'T' then t.t when 'L' then t.l when 'A' then t.a when 'O' then t.o
                when 'Z' then 'linhas=0 motivos=0' when 'S' then t.s else v end
    from pg_temp._tok t,
         lateral (select case when p_lista like '%|%'
                              then split_part(p_lista, '|', current_setting('lfa.o')::int) else p_lista end v) x
$$;

-- r(verificacao, sql, esperado A, esperado pos_C, desfaz)
create function pg_temp.r(p_k text, p_q text, p_a text, p_c text default null, p_desfaz boolean default false)
returns void language plpgsql as $f$
declare
  v text; f text := current_setting('lfa.fase');
  ea text := pg_temp.esp(p_a); ec text := pg_temp.esp(coalesce(p_c, p_a));
begin
  if p_k !~ coalesce(nullif(current_setting('lfa.so', true), ''), '.') then return; end if;
  begin
    execute p_q into v;
    if p_desfaz then raise exception using errcode = 'LFA01'; end if;
  exception when sqlstate 'LFA01' then null; when others then v := sqlstate;
  end;
  insert into pg_temp._r values (f, current_setting('lfa.o')::int, current_setting('lfa.papel'), p_k,
    case f when 'A' then ea else ec end, v,
    case when f = 'A' and ec <> ea then 'esperado_apos_C: ' || ec end);
end $f$;

create function pg_temp.checar() returns void language plpgsql as $f$
declare
  x record;
  ins text := 'insert into public.avaliacoes_cadastradas (profissional_id, nome_profissional, nome_cliente, '
           || 'nome_cliente_trinks, cliente_trinks_id, data_atendimento, origem_cliente_trinks, status, data_hora_cadastro) ';
begin
  select * into x from pg_temp._fx;
  perform pg_temp.r('01 minha_profissional()',
    $q$select coalesce(public.destaque_minha_profissional()::text, 'NULL')$q$,
    '42501|885975|NULL|NULL|NULL|NULL|NULL|885975');
  perform pg_temp.r('02 estrelas_periodo(mes atual) linhas', format(
    $q$select count(*)::text from public.destaque_estrelas_periodo(%L, %L)$q$, x.ini, x.fim), '42501|N|N|N|N|0|N|N');
  perform pg_temp.r('03 minhas_avaliacoes(885975)',
    $q$select format('linhas=%s motivos=%s', count(*), count(motivo_recusa)) from public.destaque_minhas_avaliacoes(885975)$q$,
    '42501|A|Z|A|A|Z|Z|A');
  perform pg_temp.r('04 minhas_avaliacoes(outra)', format(
    $q$select format('linhas=%%s motivos=%%s', count(*), count(motivo_recusa)) from public.destaque_minhas_avaliacoes(%s)$q$, x.outra),
    '42501|Z|Z|O|O|Z|Z|Z');
  perform pg_temp.r('05 profissionais_sem_conta() linhas/ja_tem_login',
    $q$select format('%s/%s', count(*), count(*) filter (where ja_tem_login)) from public.destaque_profissionais_sem_conta()$q$,
    '42501|0/0|0/0|0/0|S|0/0|0/0|0/0');
  perform pg_temp.r('15 sem_conta: ja_tem_login da profissional com login de outro app', format(
    $q$select coalesce((select ja_tem_login::text from public.destaque_profissionais_sem_conta() where "profissionalId" = %s), 'sem linha')$q$,
    x.oa_id), '42501|sem linha|sem linha|sem linha|true|sem linha|sem linha|sem linha');
  perform pg_temp.r('06 select trinks_services',
    $q$select case when exists (select 1 from public.trinks_services) then '>0' else '0' end$q$,
    '>0', '0|>0|>0|>0|>0|0|>0|>0');
  perform pg_temp.r('07 select regras_desafio',
    $q$select case when exists (select 1 from public.regras_desafio) then '>0' else '0' end$q$,
    '>0', '0|>0|>0|>0|>0|0|>0|>0');
  perform pg_temp.r('08 select avaliacoes_cadastradas linhas',
    $q$select count(id)::text from public.avaliacoes_cadastradas$q$, 'T', '0|L|0|T|T|0|0|L');
  -- INSERT como o modal; o RETURNING mostra se o helper do trigger manteve o id confirmado pelo espelho
  perform pg_temp.r('09 insert estrela propria (885975, id do espelho)', ins || format(
    $q$values (885975, 'Aline', 'LoginFx propria', 'LoginFx Trinks', %s, %L, 'lista', 'pendente', now())
       returning case cliente_trinks_id when %s then 'ok id=retido' else 'ok id=' || coalesce(cliente_trinks_id::text, 'NULL') end$q$,
    x.cli, x.dia, x.cli), 'ok id=retido',
    '42501|ok id=retido|42501|ok id=retido|ok id=retido|42501|42501|ok id=retido', true);
  perform pg_temp.r('10 insert estrela de outra profissional', ins || format(
    $q$values (%s, 'LoginFx outra', 'LoginFx outra', 'LoginFx Trinks', null, %L, 'digitado', 'pendente', now())
       returning 'ok id=' || coalesce(cliente_trinks_id::text, 'NULL')$q$,
    x.outra, (now() at time zone 'America/Manaus')::date), 'ok id=NULL',
    '42501|42501|42501|ok id=NULL|ok id=NULL|42501|42501|42501', true);
  perform pg_temp.r('11 espelho_tem_cliente(real)/(falso)', format(
    $q$select public.avaliacao_espelho_tem_cliente(885975, %1$L, %2$s) || '/' || public.avaliacao_espelho_tem_cliente(885975, %1$L, -1)$q$,
    x.dia, x.cli), 'true/false');
  perform pg_temp.r('12 update profissionais_ativos.email',
    $q$with u as (update public.profissionais_ativos set email = email where "profissionalId" = 885975 returning 1)
       select 'ok:' || count(*) from u$q$, '42501', null, true);
  perform pg_temp.r('13 delete avaliacoes_cadastradas',
    $q$with d as (delete from public.avaliacoes_cadastradas where nome_cliente = 'LoginFx motivo' returning 1)
       select 'ok:' || count(*) from d$q$, '42501', null, true);
  perform pg_temp.r('14 update destaque_users_app.profissional_id (auto-vinculo)',
    $q$with u as (update public.destaque_users_app set profissional_id = 885975 where id = auth.uid() returning 1)
       select 'ok:' || count(*) from u$q$, '42501', null, true);
end $f$;

-- 3. Rodadas por papel: fase A, depois pos_C_simulado
do $$
declare f text; x record;
begin
  foreach f in array array['A', 'pos_C_simulado'] loop
    if f = 'pos_C_simulado' then
      perform set_config('request.jwt.claims', '', true);
      drop policy "Public can view trinks_services" on public.trinks_services;
      drop policy "Allow public read on regras_desafio" on public.regras_desafio;
      drop policy "Permitir leitura pública de avaliações" on public.avaliacoes_cadastradas;
      drop policy "Permitir inserção pública com status pendente" on public.avaliacoes_cadastradas;
    end if;
    for x in select * from _p order by o loop
      perform set_config('request.jwt.claims', case when x.uid is null then '{"role":"anon"}'
        else json_build_object('sub', x.uid, 'email', x.claim_email, 'role', 'authenticated')::text end, true);
      perform set_config('lfa.fase', f, true), set_config('lfa.o', x.o::text, true), set_config('lfa.papel', x.papel, true);
      execute format('set local role %I', case when x.uid is null then 'anon' else 'authenticated' end);
      perform pg_temp.checar();
      reset role;
    end loop;
  end loop;
  perform set_config('request.jwt.claims', '', true);
end $$;

-- 4. Resultado
create temp view _resultado as
select fase, papel, verificacao, esperado, obtido, esperado is not distinct from obtido ok, nota
  from _r order by fase, o, verificacao;

do $$
begin
  if exists (select 1 from _resultado where not ok) then
    raise exception 'login_fase_a: falhou: %', (select string_agg(format('[%s %s] %s: esperado %s, obtido %s',
      fase, papel, verificacao, esperado, obtido), ' | ') from _resultado where not ok);
  end if;
end $$;

select * from _resultado;

rollback;
