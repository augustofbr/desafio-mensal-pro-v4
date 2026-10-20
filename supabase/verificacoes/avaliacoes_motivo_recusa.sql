-- Verificacao de 20261020130000_avaliacoes_motivo_recusa.sql
--
-- Fica em supabase/verificacoes/ (supabase/tests/ e tratado como pgTAP pelo CLI).
-- Roda INTEIRO dentro de begin ... rollback: nada persiste. O DDL da migracao e
-- aplicado DENTRO da transacao (copia fiel do passo 1 ao 5; so o notify fica de fora), entao
-- o script funciona antes e depois de a migracao ser aplicada. Execute com o MCP execute_sql
-- (papel postgres). Requer 20261019130000 (trigger antes_inserir) e o auth-kit
-- (destaque_users_app / destaque_perfis / destaque_can_*_page).
-- Qualquer assert que falhe aborta com erro; sucesso = a linha final 'ok' (asserts precisam
-- de plpgsql.check_asserts on: conferido no passo 0).
--
-- Efeito colateral enquanto roda: ADD COLUMN/ADD CONSTRAINT da copia pegam ACCESS EXCLUSIVE em
-- avaliacoes_cadastradas ate o rollback (o dashboard espera esse tempo, ~1s).
--
-- Papeis simulados (claims via set_config(..., true) ANTES de `set local role`):
--   anon                          request.jwt.claims = {"role":"anon"}
--   authenticated sem perfil      sub 00000000-0000-4000-8000-0000099a0002 (sem linha no kit)
--   admin (perfil fixture write)  sub 00000000-0000-4000-8000-0000099a0001
--   leitura (perfil fixture read) sub 00000000-0000-4000-8000-0000099a0003
-- O admin do kit e uma linha em destaque_users_app (FK para auth.users) com um perfil cuja
-- matriz da 'admin' = write; destaque_can_*_page olham auth.uid() (= claim sub). As linhas de
-- auth.users das fixtures disparam handle_new_user (insere em public.profiles): tudo some no
-- rollback. O guard anti-lockout do kit e DEFERRABLE INITIALLY DEFERRED: so roda no commit,
-- que nunca acontece aqui.
--
-- Fixtures (ids que nao existem em producao; conferido no passo 0):
--   profissional 999031; estrelas com nome_profissional 'Fixture Motivo Recusa' e
--   nome_cliente 'MotivoFx ...'; perfis 00000000-0000-4000-8000-0000099a0101/0102.

begin;

-- Travas de seguranca em producao: nao enfileira atras de lock (o dashboard esperaria),
-- nao roda para sempre e nao fica aberta segurando lock se a sessao for esquecida.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
set local idle_in_transaction_session_timeout = '30s';

-- 0. Asserts ligados e fixtures livres --------------------------------------
do $$
begin
  if coalesce(current_setting('plpgsql.check_asserts', true), 'on') <> 'on' then
    raise exception 'plpgsql.check_asserts esta off: os asserts abaixo nao valeriam';
  end if;
  assert current_user = 'postgres', 'rode como postgres (MCP execute_sql)';
  assert not exists (select 1 from auth.users where id in (
           '00000000-0000-4000-8000-0000099a0001', '00000000-0000-4000-8000-0000099a0002',
           '00000000-0000-4000-8000-0000099a0003')), 'uuids de fixture ja existem em auth.users';
  assert not exists (select 1 from public.profissionais_ativos where "profissionalId" = 999031),
    'profissional 999031 ja existe';
end $$;

-- 1. DDL da migracao (copia de 20261020130000_avaliacoes_motivo_recusa.sql, passos 1 a 5) --
-- 1. Coluna e tamanho ---------------------------------------------------------
alter table public.avaliacoes_cadastradas
  add column if not exists motivo_recusa text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.avaliacoes_cadastradas'::regclass
      and conname = 'avaliacoes_motivo_recusa_tamanho_chk'
  ) then
    alter table public.avaliacoes_cadastradas
      add constraint avaliacoes_motivo_recusa_tamanho_chk
      check (pg_catalog.char_length(motivo_recusa) <= 500);
  end if;

  -- invariante: so recusa guarda motivo (recusa legada = rejeitada com motivo NULL, valida)
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.avaliacoes_cadastradas'::regclass
      and conname = 'avaliacoes_motivo_recusa_so_rejeitada_chk'
  ) then
    alter table public.avaliacoes_cadastradas
      add constraint avaliacoes_motivo_recusa_so_rejeitada_chk
      check (motivo_recusa is null or status = 'rejeitada');
  end if;
end $$;

comment on column public.avaliacoes_cadastradas.motivo_recusa is
  'Motivo da recusa (obrigatorio quando status = rejeitada, exceto recusas legadas; max. 500 caracteres; NULL em qualquer outro status). Nao e legivel por anon/authenticated: o admin le pela RPC avaliacoes_motivos_recusa.';

-- 2. Trigger BEFORE UPDATE ----------------------------------------------------
create or replace function public.avaliacoes_cadastradas_antes_atualizar()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- btrim de espaco E das quebras/tabs/nbsp: um motivo so de "\n" nao pode passar
  new.motivo_recusa := nullif(
    pg_catalog.btrim(new.motivo_recusa,
                     E' \t\n\r\f' || pg_catalog.chr(11) || pg_catalog.chr(160)),
    '');

  -- aprovar ou devolver para a fila zera o motivo
  if new.status is distinct from 'rejeitada' then
    new.motivo_recusa := null;
    return new;
  end if;

  -- recusar exige motivo; editar uma recusa nao pode esvaziar o motivo.
  -- Recusa legada (ja rejeitada e sem motivo) segue aceitando UPDATE de outras colunas.
  if new.motivo_recusa is null
     and (old.status is distinct from 'rejeitada' or old.motivo_recusa is not null) then
    raise exception 'Informe o motivo da recusa.'
      using errcode = '23514';  -- check_violation
  end if;

  return new;
end
$$;

comment on function public.avaliacoes_cadastradas_antes_atualizar() is
  'BEFORE UPDATE em avaliacoes_cadastradas, todos os papeis: motivo_recusa = nullif(btrim de espaco/tab/quebra/nbsp, ''''); status <> rejeitada -> motivo NULL; status = rejeitada sem motivo -> erro 23514 ''Informe o motivo da recusa.'', salvo recusa legada (ja rejeitada e sem motivo).';

create or replace trigger avaliacoes_cadastradas_antes_atualizar
  before update on public.avaliacoes_cadastradas
  for each row
  execute function public.avaliacoes_cadastradas_antes_atualizar();

-- 3. INSERT: motivo nunca nasce preenchido para anon/authenticated ------------
-- Corpo de 20261019130000 + a linha "d." abaixo.
create or replace function public.avaliacoes_cadastradas_antes_inserir()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_hoje date;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  -- a. relogio do servidor, nunca o do celular
  new.data_hora_cadastro := pg_catalog.now();
  new.created_at := pg_catalog.now();

  -- b. janela do dia do atendimento
  v_hoje := (pg_catalog.now() at time zone 'America/Manaus')::date;
  if new.data_atendimento is not null
     and (new.data_atendimento < v_hoje - 10 or new.data_atendimento > v_hoje) then
    raise exception 'O dia do atendimento precisa estar entre hoje e 10 dias atrás.'
      using errcode = '22023';  -- invalid_parameter_value
  end if;

  -- c. id da cliente so fica se o espelho confirma profissional + dia + cliente
  if new.cliente_trinks_id is not null then
    if new.data_atendimento is null
       or not exists (
         select 1
         from public.trinks_services t
         where t.profissionalid = new.profissional_id::text
           and t.service_date   = pg_catalog.to_char(new.data_atendimento, 'DD/MM/YYYY')
           and pg_catalog.btrim(t.clienteid) ~ '^[0-9]{1,18}$'
           and pg_catalog.btrim(t.clienteid)::bigint = new.cliente_trinks_id
       ) then
      new.cliente_trinks_id := null;
    end if;
  end if;

  -- d. motivo da recusa e do admin, nunca do cadastro publico
  new.motivo_recusa := null;

  return new;
end
$$;

comment on function public.avaliacoes_cadastradas_antes_inserir() is
  'BEFORE INSERT em avaliacoes_cadastradas, so para anon/authenticated: data_hora_cadastro/created_at = now(); data_atendimento fora de hoje-10..hoje (Manaus) = erro 22023; cliente_trinks_id sem linha no espelho (profissional+dia+clienteid) vira NULL; motivo_recusa vira NULL.';

-- 4. Leitura por coluna, sem motivo_recusa ------------------------------------
revoke select on table public.avaliacoes_cadastradas from anon, authenticated;

grant select (
  id,
  profissional_id,
  nome_profissional,
  nome_cliente,
  data_hora_cadastro,
  status,
  aprovado_por,
  data_aprovacao,
  created_at,
  nome_cliente_trinks,
  cliente_trinks_id,
  data_atendimento,
  origem_cliente_trinks
) on public.avaliacoes_cadastradas to anon, authenticated;

-- 5. RPC do admin --------------------------------------------------------------
create or replace function public.avaliacoes_motivos_recusa(p_ids uuid[])
returns table (id uuid, motivo_recusa text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.destaque_can_read_page('admin') then
    raise exception 'avaliacoes_motivos_recusa: acesso restrito ao admin'
      using errcode = '42501';  -- insufficient_privilege
  end if;

  if p_ids is null or pg_catalog.cardinality(p_ids) = 0 then
    return;
  end if;

  if pg_catalog.cardinality(p_ids) > 500 then
    raise exception 'avaliacoes_motivos_recusa: no maximo 500 ids por chamada (recebidos %)',
      pg_catalog.cardinality(p_ids)
      using errcode = '22023';  -- invalid_parameter_value
  end if;

  return query
  select a.id, a.motivo_recusa
  from public.avaliacoes_cadastradas a
  where a.id = any (p_ids)
    and a.status = 'rejeitada';
end
$$;

comment on function public.avaliacoes_motivos_recusa(uuid[]) is
  'Motivo da recusa das estrelas pedidas (max. 500 ids; so as com status rejeitada; recusa legada vem com motivo NULL). So para quem le a pagina admin do auth-kit (destaque_can_read_page), senao erro 42501. SECURITY DEFINER (motivo_recusa nao e legivel por anon/authenticated), search_path vazio. EXECUTE: authenticated e service_role (anon e public revogados).';

revoke all on function public.avaliacoes_motivos_recusa(uuid[]) from public;
revoke all on function public.avaliacoes_motivos_recusa(uuid[]) from anon;
grant execute on function public.avaliacoes_motivos_recusa(uuid[]) to authenticated, service_role;


-- 2. Forma, privilegios e policies --------------------------------------------
do $$
declare
  c   name;
  r   record;
  tbl constant text := 'public.avaliacoes_cadastradas';
begin
  -- coluna e check
  assert exists (select 1 from pg_attribute
                  where attrelid = tbl::regclass and attname = 'motivo_recusa'
                    and not attisdropped and atttypid = 'text'::regtype and not attnotnull),
    'motivo_recusa deve existir: text null';
  assert exists (select 1 from pg_constraint
                  where conrelid = tbl::regclass and conname = 'avaliacoes_motivo_recusa_tamanho_chk'
                    and contype = 'c' and convalidated
                    and pg_get_constraintdef(oid) ilike '%char_length(motivo_recusa) <= 500%'),
    'check avaliacoes_motivo_recusa_tamanho_chk (<= 500) deve existir e estar validado';
  assert exists (select 1 from pg_constraint
                  where conrelid = tbl::regclass and conname = 'avaliacoes_motivo_recusa_so_rejeitada_chk'
                    and contype = 'c' and convalidated
                    and pg_get_constraintdef(oid) ilike '%motivo_recusa IS NULL%'
                    and pg_get_constraintdef(oid) ilike '%rejeitada%'),
    'check avaliacoes_motivo_recusa_so_rejeitada_chk deve existir e estar validado';

  -- trigger BEFORE UPDATE, por linha, so UPDATE (tgtype: 1 row, 2 before, 4 insert, 8 delete, 16 update)
  select * into r from pg_trigger
   where tgrelid = tbl::regclass and tgname = 'avaliacoes_cadastradas_antes_atualizar' and not tgisinternal;
  assert found, 'trigger avaliacoes_cadastradas_antes_atualizar deve existir';
  assert r.tgenabled = 'O', 'trigger deve estar habilitado';
  assert (r.tgtype & 1) = 1 and (r.tgtype & 2) = 2 and (r.tgtype & 16) = 16
     and (r.tgtype & 4) = 0 and (r.tgtype & 8) = 0, format('trigger deve ser BEFORE UPDATE FOR EACH ROW (tgtype %s)', r.tgtype);
  assert pg_get_triggerdef(r.oid) not ilike '% UPDATE OF %', 'trigger deve valer para UPDATE de qualquer coluna';
  assert not (select prosecdef from pg_proc where oid = 'public.avaliacoes_cadastradas_antes_atualizar()'::regprocedure),
    'funcao do trigger de UPDATE deve ser security invoker';
  assert (select proconfig from pg_proc where oid = 'public.avaliacoes_cadastradas_antes_atualizar()'::regprocedure)
         = array['search_path=""'], 'funcao do trigger de UPDATE: search_path vazio';
  assert (select prosrc from pg_proc where oid = 'public.avaliacoes_cadastradas_antes_inserir()'::regprocedure)
         ilike '%new.motivo_recusa := null%', 'trigger de INSERT deve zerar motivo_recusa';

  -- RPC
  select prosecdef, proconfig, provolatile, proacl into r
    from pg_proc where oid = 'public.avaliacoes_motivos_recusa(uuid[])'::regprocedure;
  assert r.prosecdef, 'RPC deve ser security definer';
  assert r.proconfig = array['search_path=""'], 'RPC: search_path vazio';
  assert r.provolatile = 's', 'RPC deve ser stable';
  assert r.proacl is not null
     and not exists (select 1 from aclexplode(r.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'),
    'PUBLIC nao pode ter EXECUTE na RPC';
  assert not has_function_privilege('anon', 'public.avaliacoes_motivos_recusa(uuid[])', 'execute'),
    'anon NAO pode executar a RPC';
  assert has_function_privilege('authenticated', 'public.avaliacoes_motivos_recusa(uuid[])', 'execute'),
    'authenticated deve executar a RPC';
  assert has_function_privilege('service_role', 'public.avaliacoes_motivos_recusa(uuid[])', 'execute'),
    'service_role deve executar a RPC';

  -- leitura: sem SELECT de tabela, SELECT em toda coluna MENOS motivo_recusa
  assert not has_table_privilege('anon', tbl, 'select'), 'anon nao pode ter SELECT de tabela';
  assert not has_table_privilege('authenticated', tbl, 'select'), 'authenticated nao pode ter SELECT de tabela';
  assert not has_column_privilege('anon', tbl, 'motivo_recusa', 'select'), 'anon nao pode ler motivo_recusa';
  assert not has_column_privilege('authenticated', tbl, 'motivo_recusa', 'select'), 'authenticated nao pode ler motivo_recusa';
  for c in
    select attname from pg_attribute
     where attrelid = tbl::regclass and attnum > 0 and not attisdropped and attname <> 'motivo_recusa'
  loop
    assert has_column_privilege('anon', tbl, c, 'select'), format('anon deve ler %s', c);
    assert has_column_privilege('authenticated', tbl, c, 'select'), format('authenticated deve ler %s', c);
  end loop;
  assert has_table_privilege('service_role', tbl, 'select'), 'service_role mantem SELECT de tabela';

  -- escrita intocada
  assert has_table_privilege('anon', tbl, 'insert'), 'anon mantem INSERT (cadastro publico)';
  assert not has_table_privilege('anon', tbl, 'update'), 'anon continua sem UPDATE';
  assert has_table_privilege('authenticated', tbl, 'insert') and has_table_privilege('authenticated', tbl, 'update'),
    'authenticated mantem INSERT/UPDATE de tabela';
  assert has_column_privilege('authenticated', tbl, 'motivo_recusa', 'update'),
    'authenticated (admin, pela policy) deve poder atualizar motivo_recusa';

  -- policies intocadas
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'avaliacoes_cadastradas') = 3,
    'deve continuar com 3 policies';
  assert exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'avaliacoes_cadastradas'
                  and policyname = 'avaliacoes_cadastradas_update_admin' and cmd = 'UPDATE'),
    'policy de UPDATE do admin deve existir';
  assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'avaliacoes_cadastradas'
                      and cmd in ('DELETE', 'ALL')), 'nao pode haver policy de DELETE';
end $$;

-- 3. Fixtures (postgres) -------------------------------------------------------
insert into public.profissionais_ativos ("profissionalId", nome_profissional, ativo)
values (999031, 'Fixture Motivo Recusa', true);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-0000099a0001', 'authenticated', 'authenticated', 'fixture-motivo-admin@invalid.local'),
  ('00000000-0000-4000-8000-0000099a0003', 'authenticated', 'authenticated', 'fixture-motivo-leitura@invalid.local');

insert into public.destaque_perfis (id, nome, paginas) values
  ('00000000-0000-4000-8000-0000099a0101', 'Fixture Motivo Recusa Admin',   '{"admin": "write", "usuarios": "none"}'),
  ('00000000-0000-4000-8000-0000099a0102', 'Fixture Motivo Recusa Leitura', '{"admin": "read",  "usuarios": "none"}');

insert into public.destaque_users_app (id, nome, perfil_id, ativo) values
  ('00000000-0000-4000-8000-0000099a0001', 'Fixture Motivo Admin',   '00000000-0000-4000-8000-0000099a0101', true),
  ('00000000-0000-4000-8000-0000099a0003', 'Fixture Motivo Leitura', '00000000-0000-4000-8000-0000099a0102', true);

-- p1..p4 pendentes; 'legado' = recusa antiga sem motivo (postgres nao passa pelo trigger de INSERT)
insert into public.avaliacoes_cadastradas (profissional_id, nome_profissional, nome_cliente, status)
values (999031, 'Fixture Motivo Recusa', 'MotivoFx p1', 'pendente'),
       (999031, 'Fixture Motivo Recusa', 'MotivoFx p2', 'pendente'),
       (999031, 'Fixture Motivo Recusa', 'MotivoFx p3', 'pendente'),
       (999031, 'Fixture Motivo Recusa', 'MotivoFx p4', 'pendente'),
       (999031, 'Fixture Motivo Recusa', 'MotivoFx legado', 'rejeitada');

create temp table _fx (k text primary key, id uuid not null) on commit drop;
insert into _fx
  select replace(nome_cliente, 'MotivoFx ', ''), id
  from public.avaliacoes_cadastradas
  where nome_profissional = 'Fixture Motivo Recusa';
grant select on _fx to anon, authenticated;

do $$
begin
  assert (select count(*) from _fx) = 5, 'fixtures: 5 estrelas';
  assert not exists (select 1 from public.avaliacoes_cadastradas a join _fx f on f.id = a.id
                      where a.motivo_recusa is not null), 'fixtures nascem sem motivo';
end $$;

-- 4. anon ----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;

do $$
declare
  v_hoje date := (now() at time zone 'America/Manaus')::date;
  n int;
begin
  assert current_user = 'anon', 'deveria estar como anon';

  -- motivo_recusa e select * -> 42501
  begin
    perform a.motivo_recusa from public.avaliacoes_cadastradas a limit 1;
    raise exception 'anon NAO pode ler motivo_recusa';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.avaliacoes_cadastradas limit 1;
    raise exception 'anon: select * deveria dar 42501';
  exception when insufficient_privilege then null;
  end;

  -- leituras do app (useStarsData; ranking; /minhas-avaliacoes; useEstrelasPendentes)
  perform profissional_id, data_hora_cadastro
    from public.avaliacoes_cadastradas where status = 'aprovada' and data_aprovacao is not null limit 1;
  perform nome_profissional, profissional_id, status, data_aprovacao, data_hora_cadastro
    from public.avaliacoes_cadastradas where status = 'aprovada' and data_aprovacao is not null limit 1;
  select count(*) into n from (
    select id, nome_profissional, nome_cliente, nome_cliente_trinks, status, data_hora_cadastro, data_aprovacao
    from public.avaliacoes_cadastradas
    where profissional_id = 999031
    order by data_hora_cadastro desc) x;
  assert n = 5, format('anon (/minhas-avaliacoes) deve ver as 5 fixtures: %s', n);
  perform profissional_id from public.avaliacoes_cadastradas
    where status = 'pendente' and data_hora_cadastro >= now() - interval '31 days'
      and data_hora_cadastro < now() + interval '1 day';

  -- INSERT como o modal (montarInsertAvaliacao, sem .select() -> sem RETURNING de coluna)
  insert into public.avaliacoes_cadastradas
    (profissional_id, nome_profissional, nome_cliente, nome_cliente_trinks, cliente_trinks_id,
     data_atendimento, origem_cliente_trinks, status, data_hora_cadastro)
  values (999031, 'Fixture Motivo Recusa', 'MotivoFx AnonModal', 'Ana Motivo Fixture', null,
          v_hoje, 'digitado', 'pendente', now());
  insert into public.avaliacoes_cadastradas
    (profissional_id, nome_profissional, nome_cliente, nome_cliente_trinks, cliente_trinks_id,
     data_atendimento, origem_cliente_trinks, status, data_hora_cadastro)
  values (999031, 'Fixture Motivo Recusa', 'MotivoFx AnonModalLista', 'Bia Motivo Fixture', 987654,
          v_hoje - 1, 'lista', 'pendente', now());
  -- bundle antigo (so os campos de antes)
  insert into public.avaliacoes_cadastradas (profissional_id, nome_profissional, nome_cliente, status)
  values (999031, 'Fixture Motivo Recusa', 'MotivoFx AnonLegado', 'pendente');
  -- tentando gravar motivo -> entra, motivo zerado pelo trigger
  insert into public.avaliacoes_cadastradas (profissional_id, nome_profissional, nome_cliente, status, motivo_recusa)
  values (999031, 'Fixture Motivo Recusa', 'MotivoFx AnonComMotivo', 'pendente', 'motivo forjado');

  -- ja recusada: continua barrada pela policy de INSERT
  begin
    insert into public.avaliacoes_cadastradas (profissional_id, nome_profissional, nome_cliente, status, motivo_recusa)
    values (999031, 'Fixture Motivo Recusa', 'MotivoFx AnonRecusada', 'rejeitada', 'x');
    raise exception 'anon nao pode inserir rejeitada';
  exception when insufficient_privilege then null;
  end;

  -- RPC: sem EXECUTE
  begin
    perform * from public.avaliacoes_motivos_recusa(array[]::uuid[]);
    raise exception 'anon nao deveria executar avaliacoes_motivos_recusa';
  exception when insufficient_privilege then null;
  end;

  -- UPDATE: sem privilegio
  begin
    update public.avaliacoes_cadastradas set status = 'rejeitada', motivo_recusa = 'x'
     where id = (select id from _fx where k = 'p4');
    raise exception 'anon nao pode atualizar';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

do $$
begin
  assert (select count(*) from public.avaliacoes_cadastradas
           where nome_profissional = 'Fixture Motivo Recusa'
             and nome_cliente in ('MotivoFx AnonModal', 'MotivoFx AnonModalLista',
                                  'MotivoFx AnonLegado', 'MotivoFx AnonComMotivo')
             and status = 'pendente' and motivo_recusa is null
             and data_hora_cadastro = now()) = 4,
    'anon: os 4 cadastros entram pendentes, com now() e motivo NULL';
  assert (select cliente_trinks_id from public.avaliacoes_cadastradas
           where nome_cliente = 'MotivoFx AnonModalLista') is null,
    'anon: id sem espelho continua virando NULL (trigger de INSERT intacto)';
  assert not exists (select 1 from public.avaliacoes_cadastradas where nome_cliente = 'MotivoFx AnonRecusada'),
    'anon: rejeitada nao entrou';
end $$;

-- 5. authenticated sem perfil no kit -------------------------------------------
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-0000099a0002", "role": "authenticated"}', true);
set local role authenticated;

do $$
declare
  n int;
begin
  assert current_user = 'authenticated', 'deveria estar como authenticated';
  assert auth.uid() = '00000000-0000-4000-8000-0000099a0002'::uuid, 'claim sub da fixture sem perfil';
  assert not public.destaque_can_read_page('admin'), 'sem perfil nao le a pagina admin';

  begin
    perform a.motivo_recusa from public.avaliacoes_cadastradas a limit 1;
    raise exception 'authenticated sem perfil NAO pode ler motivo_recusa';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.avaliacoes_cadastradas limit 1;
    raise exception 'authenticated: select * deveria dar 42501';
  exception when insufficient_privilege then null;
  end;

  -- colunas do painel (COLUNAS de useAdminAvaliacoes) continuam legiveis
  perform id, profissional_id, nome_profissional, nome_cliente, status, data_hora_cadastro,
          aprovado_por, data_aprovacao, nome_cliente_trinks, cliente_trinks_id,
          data_atendimento, origem_cliente_trinks
    from public.avaliacoes_cadastradas where status = 'pendente' order by data_hora_cadastro limit 1;

  -- RPC -> 42501 (com ids, vazio ou NULL)
  begin
    perform * from public.avaliacoes_motivos_recusa(array[(select id from _fx where k = 'legado')]);
    raise exception 'sem perfil nao pode ler motivos pela RPC';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.avaliacoes_motivos_recusa(null);
    raise exception 'sem perfil: RPC com NULL tambem e 42501';
  exception when insufficient_privilege then null;
  end;

  -- UPDATE barrado pela RLS (zero linhas, sem erro)
  update public.avaliacoes_cadastradas set status = 'rejeitada', motivo_recusa = 'tentativa'
   where id = (select id from _fx where k = 'p4');
  get diagnostics n = row_count;
  assert n = 0, format('sem perfil nao pode recusar: %s linha(s)', n);

  -- INSERT com motivo -> motivo zerado
  insert into public.avaliacoes_cadastradas (profissional_id, nome_profissional, nome_cliente, status, motivo_recusa)
  values (999031, 'Fixture Motivo Recusa', 'MotivoFx AuthComMotivo', 'pendente', 'motivo forjado');
end $$;

reset role;

do $$
begin
  assert (select motivo_recusa is null and status = 'pendente' from public.avaliacoes_cadastradas
           where nome_cliente = 'MotivoFx AuthComMotivo'), 'authenticated: INSERT com motivo grava NULL';
  assert (select status = 'pendente' and motivo_recusa is null from public.avaliacoes_cadastradas
           where id = (select id from _fx where k = 'p4')), 'p4 intocada pelo sem-perfil';
end $$;

-- 6. admin (perfil fixture com admin = write) ----------------------------------
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-0000099a0001", "role": "authenticated"}', true);
set local role authenticated;

do $$
declare
  v_p1 uuid := (select id from _fx where k = 'p1');
  v_p2 uuid := (select id from _fx where k = 'p2');
  v_p3 uuid := (select id from _fx where k = 'p3');
  v_p4 uuid := (select id from _fx where k = 'p4');
  v_lg uuid := (select id from _fx where k = 'legado');
  v_id uuid;
  v_m  text;
  v_msg text;
  v_con text;
  v_vazio text;
  n int;
begin
  assert auth.uid() = '00000000-0000-4000-8000-0000099a0001'::uuid, 'claim sub do admin';
  assert public.destaque_can_write_page('admin') and public.destaque_can_read_page('admin'),
    'fixture admin deve ter write em admin';

  -- a/b. recusar sem motivo, so espacos, vazio, so quebras -> 23514 'Informe o motivo da recusa.'
  foreach v_vazio in array array[null, '', '   ', E'\n\t \r\n', ' ' || chr(160) || ' '] loop
    begin
      update public.avaliacoes_cadastradas
         set status = 'rejeitada', motivo_recusa = v_vazio
       where id = any (array[v_p1]) and status = 'pendente';
      raise exception 'recusar com motivo % deveria falhar', coalesce(quote_literal(v_vazio), 'NULL');
    exception when check_violation then
      get stacked diagnostics v_msg = message_text, v_con = constraint_name;
      assert v_msg = 'Informe o motivo da recusa.', 'mensagem do 23514 diferente: ' || v_msg;
      assert coalesce(v_con, '') = '', 'erro do trigger nao traz constraint: ' || v_con;
    end;
  end loop;
  assert (select status from public.avaliacoes_cadastradas where id = v_p1) = 'pendente',
    'p1 continua pendente apos as tentativas';

  -- c. recusar com motivo -> grava aparado (RETURNING id, como o PostgREST)
  update public.avaliacoes_cadastradas
     set status = 'rejeitada', motivo_recusa = E'  Nome não confere \n'
   where id = any (array[v_p1]) and status = 'pendente'
  returning id into v_id;
  assert v_id = v_p1, 'UPDATE ... RETURNING id deve devolver p1';
  select motivo_recusa into v_m from public.avaliacoes_motivos_recusa(array[v_p1]);
  assert v_m = 'Nome não confere', format('motivo aparado: %L', v_m);

  -- d. lote: 2 ids, mesmo motivo (WITH ... RETURNING id, como o .in().select('id'))
  with u as (
    update public.avaliacoes_cadastradas
       set status = 'rejeitada', motivo_recusa = 'Cliente não encontrada no Google'
     where id = any (array[v_p2, v_p3]) and status = 'pendente'
    returning id)
  select count(*) into n from u;
  assert n = 2, format('lote deve recusar 2: %s', n);
  assert (select count(*) from public.avaliacoes_motivos_recusa(array[v_p2, v_p3])
           where motivo_recusa = 'Cliente não encontrada no Google') = 2, 'lote: motivo nas duas';

  -- e. editar o motivo de uma recusada (.eq('status','rejeitada'))
  update public.avaliacoes_cadastradas set motivo_recusa = 'Motivo editado'
   where id = any (array[v_p1]) and status = 'rejeitada';
  get diagnostics n = row_count;
  assert n = 1, 'edicao do motivo: 1 linha';
  select motivo_recusa into v_m from public.avaliacoes_motivos_recusa(array[v_p1]);
  assert v_m = 'Motivo editado', format('motivo editado: %L', v_m);

  -- f. editar para vazio/NULL/espacos -> 23514; motivo preservado
  foreach v_vazio in array array['', null, '   '] loop
    begin
      update public.avaliacoes_cadastradas set motivo_recusa = v_vazio
       where id = v_p1 and status = 'rejeitada';
      raise exception 'esvaziar o motivo (%) deveria falhar', coalesce(quote_literal(v_vazio), 'NULL');
    exception when check_violation then
      get stacked diagnostics v_msg = message_text;
      assert v_msg = 'Informe o motivo da recusa.', 'mensagem diferente: ' || v_msg;
    end;
  end loop;
  select motivo_recusa into v_m from public.avaliacoes_motivos_recusa(array[v_p1]);
  assert v_m = 'Motivo editado', 'motivo preservado apos tentativas de esvaziar';

  -- g. 501 caracteres -> check de tamanho; 500 (multibyte, com espacos em volta) -> ok
  begin
    update public.avaliacoes_cadastradas set motivo_recusa = repeat('x', 501) where id = v_p1;
    raise exception 'motivo de 501 caracteres deveria violar o check';
  exception when check_violation then
    get stacked diagnostics v_con = constraint_name;
    assert v_con = 'avaliacoes_motivo_recusa_tamanho_chk', 'constraint esperada, veio: ' || coalesce(v_con, 'NULL');
  end;
  update public.avaliacoes_cadastradas set motivo_recusa = '  ' || repeat('ç', 500) || E'\n' where id = v_p1;
  select motivo_recusa into v_m from public.avaliacoes_motivos_recusa(array[v_p1]);
  assert char_length(v_m) = 500 and v_m = repeat('ç', 500), format('500 caracteres aparados: %s', char_length(v_m));

  -- h. aprovar -> motivo NULL (some da RPC)
  update public.avaliacoes_cadastradas
     set status = 'aprovada', aprovado_por = auth.uid(), data_aprovacao = now()
   where id = any (array[v_p2])
  returning id into v_id;
  assert v_id = v_p2, 'aprovar p2';
  assert not exists (select 1 from public.avaliacoes_motivos_recusa(array[v_p2])), 'aprovada nao sai na RPC';

  -- i. devolver para a fila -> motivo NULL; recusar de novo exige motivo novo
  update public.avaliacoes_cadastradas
     set status = 'pendente', aprovado_por = null, data_aprovacao = null
   where id = any (array[v_p3]) and status = 'rejeitada'
  returning id into v_id;
  assert v_id = v_p3, 'devolver p3';
  begin
    update public.avaliacoes_cadastradas set status = 'rejeitada' where id = v_p3;
    raise exception 're-recusar sem motivo deveria falhar (motivo antigo foi zerado)';
  exception when check_violation then null;
  end;

  -- j. recusa legada (rejeitada sem motivo): UPDATE de outras colunas passa
  update public.avaliacoes_cadastradas set nome_cliente_trinks = 'Legado editado' where id = v_lg;
  get diagnostics n = row_count;
  assert n = 1, 'legado: UPDATE de outra coluna';
  update public.avaliacoes_cadastradas set status = 'rejeitada', motivo_recusa = '   ' where id = v_lg;
  get diagnostics n = row_count;
  assert n = 1, 'legado: reafirmar rejeitada sem motivo nao falha';
  select count(*), max(motivo_recusa) into n, v_m from public.avaliacoes_motivos_recusa(array[v_lg]);
  assert n = 1 and v_m is null, 'legado: RPC devolve a linha com motivo NULL';

  -- k. RPC: so rejeitadas, sem repeticao; NULL/vazio -> 0 linhas; 500 ok; 501 -> 22023
  select count(*) into n
    from public.avaliacoes_motivos_recusa(array[v_p1, v_p2, v_p3, v_p4, v_lg, gen_random_uuid(), v_p1]);
  assert n = 2, format('RPC deve devolver so p1 e legado: %s', n);
  assert (select count(*) from public.avaliacoes_motivos_recusa(null)) = 0, 'RPC(NULL) -> 0 linhas';
  assert (select count(*) from public.avaliacoes_motivos_recusa(array[]::uuid[])) = 0, 'RPC({}) -> 0 linhas';
  assert (select count(*) from public.avaliacoes_motivos_recusa(
            array(select gen_random_uuid() from generate_series(1, 500)))) = 0, 'RPC com 500 ids aceita';
  begin
    perform * from public.avaliacoes_motivos_recusa(array(select gen_random_uuid() from generate_series(1, 501)));
    raise exception 'RPC com 501 ids deveria falhar';
  exception when sqlstate '22023' then null;
  end;

  -- l. nem o admin le a coluna direto (so pela RPC)
  begin
    perform a.motivo_recusa from public.avaliacoes_cadastradas a where a.id = v_p1;
    raise exception 'admin tambem nao le motivo_recusa direto';
  exception when insufficient_privilege then null;
  end;

  -- m. avaliacoes_sinais continua funcionando como admin
  select count(*) into n from public.avaliacoes_sinais(array[v_p1, v_p2, v_p3, v_p4, v_lg]);
  assert n = 5, format('avaliacoes_sinais: uma linha por id (%s)', n);

  -- n. legado que ganha motivo passa a nao poder esvazia-lo
  update public.avaliacoes_cadastradas set motivo_recusa = 'Motivo tardio' where id = v_lg;
  begin
    update public.avaliacoes_cadastradas set motivo_recusa = '' where id = v_lg;
    raise exception 'legado com motivo nao pode voltar a vazio';
  exception when check_violation then null;
  end;
end $$;

reset role;

do $$
declare r record;
begin
  select * into r from public.avaliacoes_cadastradas where id = (select id from _fx where k = 'p1');
  assert r.status = 'rejeitada' and r.motivo_recusa = repeat('ç', 500), 'final p1';
  select * into r from public.avaliacoes_cadastradas where id = (select id from _fx where k = 'p2');
  assert r.status = 'aprovada' and r.motivo_recusa is null
     and r.aprovado_por = '00000000-0000-4000-8000-0000099a0001'::uuid and r.data_aprovacao = now(), 'final p2 (aprovada)';
  select * into r from public.avaliacoes_cadastradas where id = (select id from _fx where k = 'p3');
  assert r.status = 'pendente' and r.motivo_recusa is null and r.aprovado_por is null, 'final p3 (devolvida)';
  select * into r from public.avaliacoes_cadastradas where id = (select id from _fx where k = 'p4');
  assert r.status = 'pendente' and r.motivo_recusa is null, 'final p4 (intocada)';
  select * into r from public.avaliacoes_cadastradas where id = (select id from _fx where k = 'legado');
  assert r.status = 'rejeitada' and r.motivo_recusa = 'Motivo tardio'
     and r.nome_cliente_trinks = 'Legado editado', 'final legado';
end $$;

-- 7. perfil so leitura: le os motivos, nao recusa -------------------------------
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-0000099a0003", "role": "authenticated"}', true);
set local role authenticated;

do $$
declare n int;
begin
  assert public.destaque_can_read_page('admin') and not public.destaque_can_write_page('admin'),
    'fixture leitura: read em admin';
  select count(*) into n from public.avaliacoes_motivos_recusa(array[(select id from _fx where k = 'p1')]);
  assert n = 1, 'leitura le o motivo pela RPC';
  update public.avaliacoes_cadastradas set status = 'rejeitada', motivo_recusa = 'leitura'
   where id = (select id from _fx where k = 'p4');
  get diagnostics n = row_count;
  assert n = 0, 'leitura nao recusa (RLS)';
end $$;

reset role;

-- 8. o trigger de UPDATE vale para postgres e service_role tambem ---------------
do $$
begin
  update public.avaliacoes_cadastradas set status = 'rejeitada' where id = (select id from _fx where k = 'p4');
  raise exception 'postgres: recusar sem motivo deveria falhar';
exception when check_violation then null;
end $$;

-- 8b. invariante na tabela: postgres (sem trigger de INSERT) nao grava motivo fora de recusa
do $$
declare v_con text;
begin
  begin
    insert into public.avaliacoes_cadastradas (profissional_id, nome_profissional, nome_cliente, status, motivo_recusa)
    values (999031, 'Fixture Motivo Recusa', 'MotivoFx PostgresPendenteComMotivo', 'pendente', 'motivo em pendente');
    raise exception 'postgres: pendente com motivo deveria violar o check';
  exception when check_violation then
    get stacked diagnostics v_con = constraint_name;
    assert v_con = 'avaliacoes_motivo_recusa_so_rejeitada_chk', 'constraint esperada, veio: ' || coalesce(v_con, 'NULL');
  end;
  -- recusa com motivo, como postgres, e valida; recusa legada sem motivo tambem
  insert into public.avaliacoes_cadastradas (profissional_id, nome_profissional, nome_cliente, status, motivo_recusa)
  values (999031, 'Fixture Motivo Recusa', 'MotivoFx PostgresRecusadaComMotivo', 'rejeitada', 'importado'),
         (999031, 'Fixture Motivo Recusa', 'MotivoFx PostgresRecusadaSemMotivo', 'rejeitada', null);
end $$;

grant select on _fx to service_role;
set local role service_role;
do $$
begin
  update public.avaliacoes_cadastradas set status = 'rejeitada' where id = (select id from _fx where k = 'p4');
  raise exception 'service_role: recusar sem motivo deveria falhar';
exception when check_violation then null;
end $$;
reset role;

select 'ok: todas as verificacoes de motivo_recusa passaram' as resultado;

rollback;
