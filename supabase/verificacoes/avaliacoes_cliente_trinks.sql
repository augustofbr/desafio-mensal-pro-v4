-- Verificacao de 20261019120000_avaliacoes_cliente_trinks.sql
--
-- Fica em supabase/verificacoes/ (e nao em supabase/tests/, que o CLI trata como pgTAP).
-- Roda INTEIRO dentro de begin ... rollback: nada persiste (fixtures, linhas de
-- avaliacao inseridas como anon). Execute com o MCP execute_sql (papel postgres).
-- Qualquer assert que falhe aborta a transacao com erro; sucesso = sem erro.
--
-- Fixtures (todas com ids que nao existem em producao):
--   profissional 999001 (profissionais_ativos, exigido pela FK da fila)
--   trinks_services ids negativos -999001001.. (ids reais sao transacao_id*1000+ord, positivos)
--   fila trinks_appointment_id negativos -999001001..
--   `professional` NULL nos servicos para nao disparar trigger_sync_new_professional
--
-- Ordem dos papeis: fixtures como postgres ANTES de `set local role anon`
-- (anon nao escreve em trinks_services); so os INSERTs em avaliacoes_cadastradas
-- e as chamadas da RPC rodam como anon.

begin;

-- 1. Normalizacao de nome --------------------------------------------------
do $$
begin
  assert public.avaliacao_normalizar_nome('  JOSÉ  da  Silva ') = 'jose da silva',
    'normalizar: acento/caixa/espacos';
  assert public.avaliacao_normalizar_nome('Jose da Silva') = public.avaliacao_normalizar_nome('JOSÉ  da silva'),
    'normalizar: variantes do mesmo nome devem coincidir';
  assert public.avaliacao_normalizar_nome(null) is null, 'normalizar: null -> null';
  assert public.avaliacao_normalizar_nome(E'\tAna  Maria\n') = 'ana maria', 'normalizar: tab/quebra de linha';
  assert public.avaliacao_normalizar_nome('Ana' || chr(160) || 'Maria') = 'ana maria', 'normalizar: NBSP no meio';
  assert public.avaliacao_normalizar_nome(chr(160) || 'Ana ' || chr(160)) = 'ana', 'normalizar: NBSP nas pontas';
end $$;

-- 2. Fixtures (papel padrao) ----------------------------------------------
insert into public.profissionais_ativos ("profissionalId", nome_profissional, ativo)
values (999001, 'Fixture Teste Avaliacoes', true);

insert into public.trinks_services (id, service_date, professional, profissionalid, service_name, category, client_name, clienteid, value)
values
  -- ontem: cliente 555 com dois servicos (mais uma linha repetida do mesmo servico)
  (-999001001, to_char((now() at time zone 'America/Manaus')::date - 1, 'DD/MM/YYYY'), null, '999001', 'Corte Fixture',   'Fixture', 'Maria Fixture', '555', 0),
  (-999001002, to_char((now() at time zone 'America/Manaus')::date - 1, 'DD/MM/YYYY'), null, '999001', 'Escova Fixture',  'Fixture', 'Maria Fixture', '555', 0),
  (-999001003, to_char((now() at time zone 'America/Manaus')::date - 1, 'DD/MM/YYYY'), null, '999001', 'Corte Fixture',   'Fixture', 'Maria Fixture', '555', 0),
  -- ontem: linha sem nome de cliente -> fora da lista
  (-999001004, to_char((now() at time zone 'America/Manaus')::date - 1, 'DD/MM/YYYY'), null, '999001', 'Avulso Fixture',  'Fixture', null,            '556', 0),
  -- ontem, OUTRA profissional -> fora da lista de 999001
  (-999001005, to_char((now() at time zone 'America/Manaus')::date - 1, 'DD/MM/YYYY'), null, '999002', 'Corte Fixture',   'Fixture', 'Outra Fixture', '557', 0),
  -- hoje: Ana (id 560) ja no espelho; tambem aparece na fila com caixa/espacos diferentes
  (-999001006, to_char((now() at time zone 'America/Manaus')::date,     'DD/MM/YYYY'), null, '999001', 'Manicure Fixture','Fixture', 'Ana Fixture',   '560', 0),
  -- hoje-2: dois homonimos com ids distintos -> 2 linhas
  (-999001007, to_char((now() at time zone 'America/Manaus')::date - 2, 'DD/MM/YYYY'), null, '999001', 'Corte Fixture',   'Fixture', 'Eva Fixture',   '570', 0),
  (-999001008, to_char((now() at time zone 'America/Manaus')::date - 2, 'DD/MM/YYYY'), null, '999001', 'Escova Fixture',  'Fixture', 'Eva Fixture',   '571', 0),
  -- hoje-3: clienteid nao numerico -> cid NULL, deduplica pelo nome normalizado
  (-999001009, to_char((now() at time zone 'America/Manaus')::date - 3, 'DD/MM/YYYY'), null, '999001', 'Corte Fixture',   'Fixture', 'Fabi Fixture',  'abc', 0),
  (-999001010, to_char((now() at time zone 'America/Manaus')::date - 3, 'DD/MM/YYYY'), null, '999001', 'Escova Fixture',  'Fixture', 'FABI  fixture', 'x1',  0),
  -- hoje-4: clienteid com 19 digitos acima do teto de bigint (o cast antigo daria
  --         22003 e derrubaria a lista) -> id NULL, sem erro;
  --         clienteid com espacos nas pontas -> btrim, id 580
  (-999001011, to_char((now() at time zone 'America/Manaus')::date - 4, 'DD/MM/YYYY'), null, '999001', 'Corte Fixture',   'Fixture', 'Iris Fixture',  '9999999999999999999', 0),
  (-999001012, to_char((now() at time zone 'America/Manaus')::date - 4, 'DD/MM/YYYY'), null, '999001', 'Corte Fixture',   'Fixture', 'Julia Fixture', ' 580 ', 0);

insert into public."gerencia-fila-trinks-appointments"
  (trinks_appointment_id, trinks_client_id, client_name, professional_id, service_name, trinks_status, appointment_date)
values
  -- hoje, atendida -> entra (fonte fila)
  (-999001001, 561, 'Bia Fixture',   999001, 'Pedicure Fixture', 'Em atendimento', (now() at time zone 'America/Manaus')::date),
  -- hoje, cancelada -> NAO entra
  (-999001002, 562, 'Carla Fixture', 999001, 'Pedicure Fixture', 'Cancelado',      (now() at time zone 'America/Manaus')::date),
  -- hoje, mesma cliente do espelho (nome com caixa/espacos diferentes) -> funde com a linha do espelho
  (-999001003, 560, 'ANA   fixture', 999001, 'Esmaltacao Fixture', 'Finalizado',   (now() at time zone 'America/Manaus')::date),
  -- ontem, finalizada -> NAO entra (fila so vale para hoje)
  (-999001004, 563, 'Dora Fixture',  999001, 'Pedicure Fixture', 'Finalizado',     (now() at time zone 'America/Manaus')::date - 1),
  -- hoje, sem service_name -> servicos = '{}'
  (-999001005, 564, 'Gabi Fixture',  999001, null,               'Em atendimento', (now() at time zone 'America/Manaus')::date),
  -- hoje, status com caixa/espacos -> conta
  (-999001006, 565, 'Hana Fixture',  999001, 'Pedicure Fixture', ' FINALIZADO ',   (now() at time zone 'America/Manaus')::date);

-- 3. Inserts como anon (bundle antigo e bundle novo) -----------------------
set local role anon;

do $$
begin
  -- legado: so os campos de hoje
  insert into public.avaliacoes_cadastradas
    (profissional_id, nome_profissional, nome_cliente, status, data_hora_cadastro)
  values (999001, 'Fixture Teste Avaliacoes', 'Cliente Legado Fixture', 'pendente', now());

  -- novo: os 4 campos preenchidos
  insert into public.avaliacoes_cadastradas
    (profissional_id, nome_profissional, nome_cliente, status, data_hora_cadastro,
     nome_cliente_trinks, cliente_trinks_id, data_atendimento, origem_cliente_trinks)
  values (999001, 'Fixture Teste Avaliacoes', 'Maria no Google', 'pendente', now(),
          'Maria Fixture', 555, (now() at time zone 'America/Manaus')::date - 1, 'lista');

  -- novo, digitado a mao
  insert into public.avaliacoes_cadastradas
    (profissional_id, nome_profissional, nome_cliente, status, data_hora_cadastro,
     nome_cliente_trinks, cliente_trinks_id, data_atendimento, origem_cliente_trinks)
  values (999001, 'Fixture Teste Avaliacoes', 'Zeca no Google', 'pendente', now(),
          'Zeca Fixture', null, (now() at time zone 'America/Manaus')::date, 'digitado');

  -- origem invalida -> check
  begin
    insert into public.avaliacoes_cadastradas
      (profissional_id, nome_profissional, nome_cliente, status, data_hora_cadastro, origem_cliente_trinks)
    values (999001, 'Fixture Teste Avaliacoes', 'Origem Invalida', 'pendente', now(), 'outro');
    raise exception 'origem_cliente_trinks=outro deveria violar o check';
  exception when check_violation then
    null; -- esperado
  end;

  -- digitado com id / id 0, como anon: desde a regra 20261019130000 o trigger
  -- BEFORE INSERT anula o id sem linha no espelho (aqui, sem data_atendimento)
  -- ANTES dos checks; o cadastro entra com id NULL. Os checks em si sao provados
  -- como postgres (sem trigger) no bloco 3b.
  insert into public.avaliacoes_cadastradas
    (profissional_id, nome_profissional, nome_cliente, status, data_hora_cadastro,
     nome_cliente_trinks, cliente_trinks_id, origem_cliente_trinks)
  values (999001, 'Fixture Teste Avaliacoes', 'Digitado Com Id', 'pendente', now(), 'Zeca Fixture', 555, 'digitado'),
         (999001, 'Fixture Teste Avaliacoes', 'Id Zero', 'pendente', now(), 'Maria Fixture', 0, 'lista');
end $$;

reset role;

do $$
begin
  assert (select count(*) from public.avaliacoes_cadastradas
           where nome_cliente in ('Digitado Com Id', 'Id Zero') and cliente_trinks_id is null) = 2,
    'anon: trigger deveria anular o id de digitado/id 0';

  -- 3b. checks como postgres (o trigger nao vale para postgres)
  begin
    insert into public.avaliacoes_cadastradas
      (profissional_id, nome_profissional, nome_cliente, status, data_hora_cadastro,
       nome_cliente_trinks, cliente_trinks_id, origem_cliente_trinks)
    values (999001, 'Fixture Teste Avaliacoes', 'Digitado Com Id PG', 'pendente', now(), 'Zeca Fixture', 555, 'digitado');
    raise exception 'digitado com cliente_trinks_id deveria violar o check';
  exception when check_violation then
    null; -- esperado
  end;

  begin
    insert into public.avaliacoes_cadastradas
      (profissional_id, nome_profissional, nome_cliente, status, data_hora_cadastro,
       nome_cliente_trinks, cliente_trinks_id, origem_cliente_trinks)
    values (999001, 'Fixture Teste Avaliacoes', 'Id Zero PG', 'pendente', now(), 'Maria Fixture', 0, 'lista');
    raise exception 'cliente_trinks_id = 0 deveria violar o check';
  exception when check_violation then
    null; -- esperado
  end;
end $$;

set local role anon;

-- 4. RPC avaliacao_clientes_do_dia como anon -------------------------------
do $$
declare
  v_hoje  date := (now() at time zone 'America/Manaus')::date;
  r       record;
  n       int;
begin
  -- ontem: so o espelho; 1 linha deduplicada por id, 2 servicos distintos
  select count(*) into n from public.avaliacao_clientes_do_dia(999001, v_hoje - 1);
  assert n = 1, format('ontem: esperado 1 cliente, veio %s', n);

  select * into r from public.avaliacao_clientes_do_dia(999001, v_hoje - 1);
  assert r.cliente_trinks_id = 555, 'ontem: id 555';
  assert r.nome = 'Maria Fixture', 'ontem: nome';
  assert r.fonte = 'espelho', 'ontem: fonte espelho';
  assert r.servicos @> array['Corte Fixture','Escova Fixture'] and cardinality(r.servicos) = 2,
    format('ontem: servicos %s', r.servicos);

  -- ontem: a Dora da fila (finalizada ontem) nao entra
  assert not exists (select 1 from public.avaliacao_clientes_do_dia(999001, v_hoje - 1) x where x.nome = 'Dora Fixture'),
    'ontem: fila nao entra fora de hoje';

  -- hoje: Ana (espelho+fila, 1 linha), Bia, Gabi e Hana (fila); Carla (cancelada) fora
  select count(*) into n from public.avaliacao_clientes_do_dia(999001, v_hoje);
  assert n = 4, format('hoje: esperado 4 clientes, veio %s', n);

  select * into r from public.avaliacao_clientes_do_dia(999001, v_hoje) x where x.nome = 'Bia Fixture';
  assert found, 'hoje: Bia da fila deve aparecer';
  assert r.fonte = 'fila', 'hoje: Bia fonte fila';
  assert r.cliente_trinks_id is null, 'hoje: id da fila entra NULL (espaco de id nao verificado)';
  assert r.servicos = array['Pedicure Fixture'], 'hoje: servicos da Bia';

  assert not exists (select 1 from public.avaliacao_clientes_do_dia(999001, v_hoje) x
                     where public.avaliacao_normalizar_nome(x.nome) = 'carla fixture'),
    'hoje: cancelada nao entra';

  select * into r from public.avaliacao_clientes_do_dia(999001, v_hoje) x
   where public.avaliacao_normalizar_nome(x.nome) = 'ana fixture';
  assert found, 'hoje: Ana deve aparecer';
  assert r.fonte = 'espelho', 'hoje: Ana fonte espelho';
  assert r.cliente_trinks_id = 560, 'hoje: Ana com id do espelho';
  assert r.nome = 'Ana Fixture', 'hoje: nome vem do espelho';
  assert r.servicos @> array['Manicure Fixture','Esmaltacao Fixture'] and cardinality(r.servicos) = 2,
    format('hoje: servicos da Ana %s', r.servicos);

  -- ordenado por nome
  assert (select array_agg(x.nome order by x.ord)
            from public.avaliacao_clientes_do_dia(999001, v_hoje) with ordinality as x(cliente_trinks_id, nome, servicos, fonte, ord))
         = array['Ana Fixture','Bia Fixture','Gabi Fixture','Hana Fixture'], 'hoje: ordem por nome';

  -- fila sem service_name -> servicos vazio, nao {NULL}
  select * into r from public.avaliacao_clientes_do_dia(999001, v_hoje) x where x.nome = 'Gabi Fixture';
  assert found and r.fonte = 'fila', 'hoje: Gabi da fila';
  assert r.servicos = '{}'::text[], format('hoje: servicos da Gabi %s', r.servicos);

  -- status ' FINALIZADO ' conta
  assert exists (select 1 from public.avaliacao_clientes_do_dia(999001, v_hoje) x where x.nome = 'Hana Fixture'),
    'hoje: status com caixa/espacos deve contar';

  -- homonimos com ids distintos -> 2 linhas, ordenadas por id
  assert (select array_agg(x.cliente_trinks_id order by x.ord)
            from public.avaliacao_clientes_do_dia(999001, v_hoje - 2) with ordinality as x(cliente_trinks_id, nome, servicos, fonte, ord))
         = array[570, 571]::bigint[], 'hoje-2: homonimos com ids distintos ficam separados';

  -- clienteid nao numerico -> cid NULL, 1 linha por nome normalizado
  select count(*) into n from public.avaliacao_clientes_do_dia(999001, v_hoje - 3);
  assert n = 1, format('hoje-3: esperado 1 cliente (dedup por nome), veio %s', n);
  select * into r from public.avaliacao_clientes_do_dia(999001, v_hoje - 3);
  assert r.cliente_trinks_id is null, 'hoje-3: id nao numerico vira NULL';
  assert r.fonte = 'espelho', 'hoje-3: fonte espelho';
  assert r.servicos @> array['Corte Fixture','Escova Fixture'] and cardinality(r.servicos) = 2,
    format('hoje-3: servicos %s', r.servicos);

  -- clienteid de 19 digitos -> id NULL (sem estourar bigint); com espacos -> btrim
  select count(*) into n from public.avaliacao_clientes_do_dia(999001, v_hoje - 4);
  assert n = 2, format('hoje-4: esperado 2 clientes, veio %s', n);
  select * into r from public.avaliacao_clientes_do_dia(999001, v_hoje - 4) x where x.nome = 'Iris Fixture';
  assert found, 'hoje-4: Iris (clienteid 19 digitos) deve aparecer';
  assert r.cliente_trinks_id is null, 'hoje-4: clienteid com 19 digitos vira NULL';
  select * into r from public.avaliacao_clientes_do_dia(999001, v_hoje - 4) x where x.nome = 'Julia Fixture';
  assert found and r.cliente_trinks_id = 580, 'hoje-4: clienteid com espacos vira 580 (btrim)';

  -- limite inferior da janela (hoje-10) e aceito
  perform * from public.avaliacao_clientes_do_dia(999001, v_hoje - 10);

  -- fora da janela -> erro
  begin
    perform * from public.avaliacao_clientes_do_dia(999001, v_hoje - 11);
    raise exception 'p_data = hoje-11 deveria falhar';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform * from public.avaliacao_clientes_do_dia(999001, v_hoje + 1);
    raise exception 'p_data = amanha deveria falhar';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform * from public.avaliacao_clientes_do_dia(999001, null);
    raise exception 'p_data null deveria falhar';
  exception when invalid_parameter_value then null;
  end;
end $$;

reset role;

select 'avaliacoes_cliente_trinks: todos os asserts passaram' as resultado;

rollback;
