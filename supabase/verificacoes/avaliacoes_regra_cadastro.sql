-- Verificacao de 20261019130000_avaliacoes_regra_cadastro.sql
--
-- Fica em supabase/verificacoes/ (supabase/tests/ e tratado como pgTAP pelo CLI).
-- Roda INTEIRO dentro de begin ... rollback: nada persiste. O DDL da migracao e
-- aplicado DENTRO da transacao (copia fiel), entao o script funciona antes e depois
-- de a migracao ser aplicada. Execute com o MCP execute_sql (papel postgres).
-- Requer 20261019120000 e 20261020130000 aplicadas (a funcao copiada zera motivo_recusa,
-- que so existe depois de 20261020130000). Desde 20261020130000 anon nao tem SELECT de
-- tabela em avaliacoes_cadastradas (so por coluna, sem motivo_recusa): os SELECTs feitos
-- como anon listam colunas. Qualquer assert que falhe aborta com erro;
-- sucesso = sem erro (plpgsql.check_asserts precisa estar on: conferido no passo 0).
--
-- Fixtures (ids que nao existem em producao):
--   profissional 999021 (profissionais_ativos, exigido pela FK)
--   trinks_services ids negativos -999021001..; `professional` NULL (nao dispara
--   trigger_sync_new_professional)
-- Fixtures como postgres ANTES de `set local role anon`; os INSERTs de avaliacao
-- rodam como anon (e um como authenticated). Dentro da transacao now() e fixo,
-- entao "gravado = now()" e comparacao exata.

begin;

-- Travas de seguranca em producao (mesmas de avaliacoes_motivo_recusa.sql): o create or
-- replace trigger abaixo pega lock na tabela ate o rollback.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
set local idle_in_transaction_session_timeout = '30s';

-- 0. Asserts ligados --------------------------------------------------------
do $$
begin
  if coalesce(current_setting('plpgsql.check_asserts', true), 'on') <> 'on' then
    raise exception 'plpgsql.check_asserts esta off: os asserts abaixo nao valeriam';
  end if;
end $$;

-- 1. DDL da migracao (copia de 20261019130000_avaliacoes_regra_cadastro.sql, com a linha "d."
--    de 20261020130000_avaliacoes_motivo_recusa.sql: a versao vigente da funcao) --
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

create or replace trigger avaliacoes_cadastradas_antes_inserir
  before insert on public.avaliacoes_cadastradas
  for each row
  execute function public.avaliacoes_cadastradas_antes_inserir();

alter table public.avaliacoes_cadastradas
  alter column data_hora_cadastro set default pg_catalog.now();

-- 2. Forma ------------------------------------------------------------------
do $$
begin
  assert (select pg_get_expr(d.adbin, d.adrelid)
            from pg_attrdef d
            join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
           where d.adrelid = 'public.avaliacoes_cadastradas'::regclass
             and a.attname = 'data_hora_cadastro') = 'now()',
    'default de data_hora_cadastro deve ser now()';
  assert not (select prosecdef from pg_proc
               where oid = 'public.avaliacoes_cadastradas_antes_inserir()'::regprocedure),
    'funcao de trigger deve ser security invoker';
  assert (select proconfig from pg_proc
           where oid = 'public.avaliacoes_cadastradas_antes_inserir()'::regprocedure)
         = array['search_path=""'], 'funcao de trigger: search_path vazio';
  assert exists (select 1 from pg_trigger
                  where tgrelid = 'public.avaliacoes_cadastradas'::regclass
                    and tgname = 'avaliacoes_cadastradas_antes_inserir'
                    and not tgisinternal),
    'trigger deve existir';
end $$;

-- 3. Fixtures (papel padrao) ------------------------------------------------
insert into public.profissionais_ativos ("profissionalId", nome_profissional, ativo)
values (999021, 'Fixture Regra Cadastro', true);

insert into public.trinks_services (id, service_date, professional, profissionalid, service_name, category, client_name, clienteid, value)
values
  -- ontem: cliente 7771 (com espacos, como pode vir do espelho)
  (-999021001, to_char((now() at time zone 'America/Manaus')::date - 1, 'DD/MM/YYYY'), null, '999021', 'Corte Fixture', 'Fixture', 'Ana Regra Fixture', ' 7771 ', 0),
  -- hoje: cliente 7772
  (-999021002, to_char((now() at time zone 'America/Manaus')::date, 'DD/MM/YYYY'), null, '999021', 'Escova Fixture', 'Fixture', 'Bia Regra Fixture', '7772', 0),
  -- clienteid com 19 digitos: nunca casa e nao pode derrubar o insert
  (-999021003, to_char((now() at time zone 'America/Manaus')::date - 1, 'DD/MM/YYYY'), null, '999021', 'Corte Fixture', 'Fixture', 'Cid Regra Fixture', '1234567890123456789', 0);

-- 4. Como postgres: regra NAO vale (manutencao) -----------------------------
insert into public.avaliacoes_cadastradas
  (profissional_id, nome_profissional, nome_cliente, status, data_hora_cadastro, created_at,
   cliente_trinks_id, data_atendimento, origem_cliente_trinks)
values (999021, 'Fixture Regra Cadastro', 'RegraFx Postgres', 'pendente',
        '2020-01-01 10:00:00-04', '2020-01-01 10:00:00-04',
        424242, '2020-01-01', 'lista');

do $$
declare r record;
begin
  select * into r from public.avaliacoes_cadastradas where nome_cliente = 'RegraFx Postgres';
  assert r.data_hora_cadastro = '2020-01-01 10:00:00-04'::timestamptz, 'postgres: data_hora_cadastro preservada';
  assert r.created_at = '2020-01-01 10:00:00-04'::timestamptz, 'postgres: created_at preservado';
  assert r.cliente_trinks_id = 424242, 'postgres: id preservado';
  assert r.data_atendimento = '2020-01-01'::date, 'postgres: data antiga aceita';
end $$;

-- 5. Como anon ---------------------------------------------------------------
set local role anon;

do $$
declare
  v_hoje date := (now() at time zone 'America/Manaus')::date;
  r record;
  v_ok boolean;
begin
  assert current_user = 'anon', 'deveria estar como anon';

  -- a. relogio do cliente ignorado
  insert into public.avaliacoes_cadastradas
    (profissional_id, nome_profissional, nome_cliente, status, data_hora_cadastro, created_at)
  values (999021, 'Fixture Regra Cadastro', 'RegraFx Relogio', 'pendente',
          '2020-01-01 00:00:00-04', '2020-01-01 00:00:00-04');
  select data_hora_cadastro, created_at, status, aprovado_por, data_aprovacao, data_atendimento, cliente_trinks_id, nome_cliente_trinks, origem_cliente_trinks into r from public.avaliacoes_cadastradas where nome_cliente = 'RegraFx Relogio';
  assert r.data_hora_cadastro = now(), 'anon: data_hora_cadastro deve ser now()';
  assert r.created_at = now(), 'anon: created_at deve ser now()';
  assert r.status = 'pendente' and r.aprovado_por is null and r.data_aprovacao is null,
    'anon: status/aprovacao intocados';

  -- legado: so campos antigos, sem data_hora_cadastro
  insert into public.avaliacoes_cadastradas (profissional_id, nome_profissional, nome_cliente, status)
  values (999021, 'Fixture Regra Cadastro', 'RegraFx Legado', 'pendente');
  select data_hora_cadastro, created_at, status, aprovado_por, data_aprovacao, data_atendimento, cliente_trinks_id, nome_cliente_trinks, origem_cliente_trinks into r from public.avaliacoes_cadastradas where nome_cliente = 'RegraFx Legado';
  assert r.data_hora_cadastro = now(), 'legado: data_hora_cadastro = now()';
  assert r.data_atendimento is null and r.cliente_trinks_id is null, 'legado: campos novos NULL';

  -- b. janela: hoje-11 e amanha recusados com 22023 e a mensagem pt-BR
  foreach v_ok in array array[true, false] loop
    begin
      insert into public.avaliacoes_cadastradas
        (profissional_id, nome_profissional, nome_cliente, status, data_atendimento, origem_cliente_trinks)
      values (999021, 'Fixture Regra Cadastro', 'RegraFx Fora', 'pendente',
              case when v_ok then v_hoje - 11 else v_hoje + 1 end, 'digitado');
      raise exception 'data_atendimento fora da janela deveria falhar (hoje-11=%)', v_ok;
    exception when sqlstate '22023' then
      assert sqlerrm = 'O dia do atendimento precisa estar entre hoje e 10 dias atrás.',
        'mensagem do 22023 diferente: ' || sqlerrm;
    end;
  end loop;
  assert not exists (select 1 from public.avaliacoes_cadastradas where nome_cliente = 'RegraFx Fora'),
    'nenhuma linha fora da janela pode ter sido gravada';

  -- b. limites aceitos: hoje-10 e hoje
  insert into public.avaliacoes_cadastradas
    (profissional_id, nome_profissional, nome_cliente, status, data_atendimento, origem_cliente_trinks)
  values (999021, 'Fixture Regra Cadastro', 'RegraFx Limite10', 'pendente', v_hoje - 10, 'digitado'),
         (999021, 'Fixture Regra Cadastro', 'RegraFx LimiteHoje', 'pendente', v_hoje, 'digitado');
  assert (select count(*) from public.avaliacoes_cadastradas
           where nome_cliente in ('RegraFx Limite10', 'RegraFx LimiteHoje')) = 2,
    'hoje-10 e hoje devem ser aceitos';

  -- c. id confirmado pelo espelho (profissional + dia + clienteid com espacos) -> mantido
  insert into public.avaliacoes_cadastradas
    (profissional_id, nome_profissional, nome_cliente, status, nome_cliente_trinks,
     cliente_trinks_id, data_atendimento, origem_cliente_trinks)
  values (999021, 'Fixture Regra Cadastro', 'RegraFx IdOk', 'pendente', 'Ana Regra Fixture',
          7771, v_hoje - 1, 'lista');
  select data_hora_cadastro, created_at, status, aprovado_por, data_aprovacao, data_atendimento, cliente_trinks_id, nome_cliente_trinks, origem_cliente_trinks into r from public.avaliacoes_cadastradas where nome_cliente = 'RegraFx IdOk';
  assert r.cliente_trinks_id = 7771, 'id existente no espelho deve ser mantido';
  assert r.origem_cliente_trinks = 'lista', 'origem mantida (id ok)';

  -- c. id que existe, mas em OUTRO dia -> NULL
  insert into public.avaliacoes_cadastradas
    (profissional_id, nome_profissional, nome_cliente, status, nome_cliente_trinks,
     cliente_trinks_id, data_atendimento, origem_cliente_trinks)
  values (999021, 'Fixture Regra Cadastro', 'RegraFx IdOutroDia', 'pendente', 'Bia Regra Fixture',
          7772, v_hoje - 1, 'lista');
  select data_hora_cadastro, created_at, status, aprovado_por, data_aprovacao, data_atendimento, cliente_trinks_id, nome_cliente_trinks, origem_cliente_trinks into r from public.avaliacoes_cadastradas where nome_cliente = 'RegraFx IdOutroDia';
  assert r.cliente_trinks_id is null, 'id de outro dia deve virar NULL';

  -- c. id inexistente -> NULL, origem 'lista' mantida
  insert into public.avaliacoes_cadastradas
    (profissional_id, nome_profissional, nome_cliente, status, nome_cliente_trinks,
     cliente_trinks_id, data_atendimento, origem_cliente_trinks)
  values (999021, 'Fixture Regra Cadastro', 'RegraFx IdFalso', 'pendente', 'Ana Regra Fixture',
          999999999, v_hoje - 1, 'lista');
  select data_hora_cadastro, created_at, status, aprovado_por, data_aprovacao, data_atendimento, cliente_trinks_id, nome_cliente_trinks, origem_cliente_trinks into r from public.avaliacoes_cadastradas where nome_cliente = 'RegraFx IdFalso';
  assert r.cliente_trinks_id is null, 'id inexistente deve virar NULL';
  assert r.origem_cliente_trinks = 'lista', 'origem lista mantida com id NULL';
  assert r.nome_cliente_trinks = 'Ana Regra Fixture', 'nome do Trinks mantido';

  -- c. id com data_atendimento NULL -> NULL
  insert into public.avaliacoes_cadastradas
    (profissional_id, nome_profissional, nome_cliente, status, nome_cliente_trinks,
     cliente_trinks_id, data_atendimento, origem_cliente_trinks)
  values (999021, 'Fixture Regra Cadastro', 'RegraFx IdSemData', 'pendente', 'Ana Regra Fixture',
          7771, null, 'lista');
  select data_hora_cadastro, created_at, status, aprovado_por, data_aprovacao, data_atendimento, cliente_trinks_id, nome_cliente_trinks, origem_cliente_trinks into r from public.avaliacoes_cadastradas where nome_cliente = 'RegraFx IdSemData';
  assert r.cliente_trinks_id is null, 'id com data nula deve virar NULL';

  -- c. espelho com clienteid de 19 digitos no mesmo dia nao derruba o insert
  insert into public.avaliacoes_cadastradas
    (profissional_id, nome_profissional, nome_cliente, status, nome_cliente_trinks,
     cliente_trinks_id, data_atendimento, origem_cliente_trinks)
  values (999021, 'Fixture Regra Cadastro', 'RegraFx Id19', 'pendente', 'Cid Regra Fixture',
          123456789012345678, v_hoje - 1, 'lista');
  select data_hora_cadastro, created_at, status, aprovado_por, data_aprovacao, data_atendimento, cliente_trinks_id, nome_cliente_trinks, origem_cliente_trinks into r from public.avaliacoes_cadastradas where nome_cliente = 'RegraFx Id19';
  assert r.cliente_trinks_id is null, 'clienteid de 19 digitos nunca casa';

  -- d. a policy de INSERT continua barrando aprovada
  begin
    insert into public.avaliacoes_cadastradas (profissional_id, nome_profissional, nome_cliente, status)
    values (999021, 'Fixture Regra Cadastro', 'RegraFx Aprovada', 'aprovada');
    raise exception 'anon nao pode inserir aprovada';
  exception when insufficient_privilege then
    null; -- esperado (RLS)
  end;
end $$;

reset role;

-- 6. Como authenticated: mesma regra ----------------------------------------
set local role authenticated;

insert into public.avaliacoes_cadastradas
  (profissional_id, nome_profissional, nome_cliente, status, data_hora_cadastro)
values (999021, 'Fixture Regra Cadastro', 'RegraFx Auth', 'pendente', '2020-01-01 00:00:00-04');

do $$
begin
  assert (select data_hora_cadastro from public.avaliacoes_cadastradas
           where nome_cliente = 'RegraFx Auth') = now(),
    'authenticated: data_hora_cadastro deve ser now()';
end $$;

reset role;

-- 7. Como postgres sem informar a data: default novo = now() ----------------
insert into public.avaliacoes_cadastradas (profissional_id, nome_profissional, nome_cliente, status)
values (999021, 'Fixture Regra Cadastro', 'RegraFx PostgresDefault', 'pendente');

do $$
begin
  assert (select data_hora_cadastro from public.avaliacoes_cadastradas
           where nome_cliente = 'RegraFx PostgresDefault') = now(),
    'default novo deve gravar now() (sem deslocar 4h)';
end $$;

select 'ok: todas as verificacoes passaram' as resultado;

rollback;
