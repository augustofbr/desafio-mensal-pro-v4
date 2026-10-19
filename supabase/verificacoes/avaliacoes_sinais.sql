-- Verificacao de 20261019120100_avaliacoes_sinais.sql (RPC public.avaliacoes_sinais).
--
-- Fica em supabase/verificacoes/ (supabase/tests/ e tratado como pgTAP pelo CLI).
-- Roda INTEIRO dentro de begin ... rollback: nada persiste. Execute com o MCP
-- execute_sql (papel postgres). Requer 20261019120000 e 20261019120100 aplicadas.
-- Qualquer assert que falhe aborta a transacao com erro; sucesso = sem erro.
--
-- Fixtures (ids que nao existem em producao):
--   profissionais 999011..999014 (profissionais_ativos)
--   trinks_services ids negativos -999011001.. ; `professional` NULL (nao dispara
--   trigger_sync_new_professional)
--   estrelas inseridas como postgres (uma precisa ser 'aprovada'); a RPC roda como
--   authenticated. Os nomes do Google das fixtures foram escolhidos para nao terem
--   similarity >= 0.7 com nenhuma estrela real (a duplicata compara com TODAS).

begin;

-- 1. Permissoes e forma -----------------------------------------------------
do $$
begin
  assert has_function_privilege('authenticated', 'public.avaliacoes_sinais(uuid[])', 'execute'),
    'authenticated deve executar avaliacoes_sinais';
  assert not has_function_privilege('anon', 'public.avaliacoes_sinais(uuid[])', 'execute'),
    'anon NAO pode executar avaliacoes_sinais';
  assert not (select prosecdef from pg_proc where oid = 'public.avaliacoes_sinais(uuid[])'::regprocedure),
    'avaliacoes_sinais deve ser security invoker';
  assert (select proconfig from pg_proc where oid = 'public.avaliacoes_sinais(uuid[])'::regprocedure)
         = array['search_path=""'], 'avaliacoes_sinais: search_path vazio';
end $$;

-- 2. Fixtures (papel padrao) ------------------------------------------------
insert into public.profissionais_ativos ("profissionalId", nome_profissional, ativo) values
  (999011, 'Fixture Sinais A', true),
  (999012, 'Fixture Sinais B', true),
  (999013, 'Fixture Sinais C', true),
  (999014, 'Fixture Sinais D', true);

create temp table _d on commit drop as
select (now() at time zone 'America/Manaus')::date as hoje;

insert into public.trinks_services (id, service_date, professional, profissionalid, service_name, category, client_name, clienteid, value)
select v.id, to_char(d.hoje + v.delta, 'DD/MM/YYYY'), null, v.prof, v.serv, 'Fixture', v.cli, v.cid, 0
from _d d, (values
  -- prof A: cliente 7001 atendida em hoje-2 (dois servicos + repetido)
  (-999011001, -2, '999011', 'Corte Fixture',  'Cliente Sete Fixture', '7001'),
  (-999011002, -2, '999011', 'Escova Fixture', 'Cliente Sete Fixture', '7001'),
  (-999011003, -2, '999011', 'Corte Fixture',  'Cliente Sete Fixture', '7001'),
  -- mesmo id/dia, OUTRA profissional -> nao conta para a 7001 de outra profissional
  (-999011004, -5, '999012', 'Corte Fixture',  'Cliente Oito Fixture', '7002'),
  -- prof A: 7002 em hoje-4 (dia diferente das estrelas de 7002)
  (-999011005, -4, '999011', 'Corte Fixture',  'Cliente Oito Fixture', '7002'),
  -- prof A: clienteid nao numerico nao derruba nada
  (-999011006, -2, '999011', 'Corte Fixture',  'Cliente Lixo Fixture', 'abc'),
  -- prof B: cliente legada "MARIA JOSE  SOUZA" 3 dias antes do cadastro
  (-999012001, -3, '999012', 'Manicure Fixture', 'MARIA JOSE  SOUZA', '7101'),
  -- prof B: digitada "Zeca Fixture Digitado" em hoje-1
  (-999012002, -1, '999012', 'Pedicure Fixture', 'Zeca Fixture Digitado', '7102'),
  -- prof C: "Maria J. Souza Lima" em hoje-2 (parecida, nao igual)
  (-999013001, -2, '999013', 'Escova Fixture', 'Maria J. Souza Lima', '7201'),
  -- prof D: nome igual ao alvo, mas fora da janela (hoje-25, cadastro hoje sem data_atendimento)
  (-999014001, -25, '999014', 'Corte Fixture', 'Qwk Fixture Fora Janela', '7301'),
  -- prof D: candidata fraca no dia do cadastro
  (-999014002, 0, '999014', 'Corte Fixture', 'Totalmente Outra Pessoa', '7302')
) as v(id, delta, prof, serv, cli, cid);

-- estrelas: (chave, profissional, nome Google, status, cadastro relativo, nome Trinks, id Trinks,
--           data atendimento relativa a hoje, origem). (nome Google, profissional) e unico aqui.
create temp table _fx on commit drop as
select * from (values
    ('id_atendida',  999011, 'Hpq Alfa Vrz',              'pendente', interval '0', 'Cliente Sete Fixture', 7001::bigint, -2,   'lista'),
    ('id_hoje',      999011, 'Jmt Bravo Lwk',             'pendente', interval '0', 'Cliente Oito Fixture', 7002::bigint,  0,   'lista'),
    ('id_ontem',     999011, 'Ncx Delta Rfo',             'pendente', interval '0', 'Cliente Oito Fixture', 7002::bigint, -1,   'lista'),
    ('id_velha',     999011, 'Bvy Kilo Tgu',              'pendente', interval '0', 'Cliente Oito Fixture', 7002::bigint, -5,   'lista'),
    ('legada_igual', 999012, 'Maria José Souza',          'pendente', interval '0', null, null::bigint, null, null),
    ('digitada',     999012, 'Zeca no Google Fixture',    'pendente', interval '0', 'Zeca Fixture Digitado', null::bigint, -1, 'digitado'),
    ('legada_prov',  999013, 'Maria José Souza',          'pendente', interval '0', null, null::bigint, null, null),
    ('fora_janela',  999014, 'Qwk Fixture Fora Janela',   'pendente', interval '0', null, null::bigint, null, null),
    ('fraca_hoje',   999014, 'Qkz Ninguem Parecido',      'pendente', interval '0', null, null::bigint, null, null),
    ('fraca_velha',  999014, 'Wvd Outro Sumido',          'pendente', interval '-20 days', null, null::bigint, null, null),
    ('loja_pend',    999011, 'Loja Bella Moda',           'pendente', interval '0', 'Cliente Sete Fixture', 7001::bigint, -2, 'lista'),
    ('loja_aprov',   999012, 'Loja Bella Moda',           'aprovada', interval '-3 days', null, null::bigint, null, null),
    ('loja_trinks',  999013, 'Qzx Fixture Unica Wyk',     'pendente', interval '0', 'Loja Bella Moda', null::bigint, -1, 'digitado'),
    ('sim_a',        999011, 'Qwfixture Antonieta Zzz',   'pendente', interval '0', null, null::bigint, null, null),
    ('sim_b',        999012, 'Qwfixture Antonietta Zzz',  'rejeitada', interval '-1 day', null, null::bigint, null, null),
    ('fraco_a',      999011, 'Qwfixture Ariane Kkk',      'pendente', interval '0', null, null::bigint, null, null),
    ('fraco_b',      999012, 'Qwfixture Mariane Ppp',     'pendente', interval '0', null, null::bigint, null, null)
  ) as v(k, prof, google, status, cad, trinks, cid, da, origem)
union all
-- 7 repetidas (limite de 5 e ordem): rep_1 e a mais recente
select 'rep_' || g, 999014, 'Qrepetida Fixture Xkq', 'pendente', -(g || ' days')::interval, null, null::bigint, null, null
from generate_series(1, 7) g;

insert into public.avaliacoes_cadastradas
  (profissional_id, nome_profissional, nome_cliente, status, data_hora_cadastro,
   aprovado_por, data_aprovacao,
   nome_cliente_trinks, cliente_trinks_id, data_atendimento, origem_cliente_trinks)
select f.prof, 'Fixture Sinais', f.google, f.status, now() + f.cad,
       null, case when f.status = 'aprovada' then now() end,
       f.trinks, f.cid, d.hoje + f.da, f.origem
from _fx f, _d d;

create temp table _ids on commit drop as
select f.k, a.id
from _fx f
join public.avaliacoes_cadastradas a
  on a.nome_profissional = 'Fixture Sinais'
 and a.profissional_id   = f.prof
 and a.nome_cliente      = f.google
 and a.data_hora_cadastro = now() + f.cad;

create temp table _r (k text, avaliacao_id uuid, atendida text, atendida_nome text,
                      atendida_data date, atendida_servico text, duplicatas jsonb) on commit drop;

grant select on _ids, _d to authenticated;
grant select, insert on _r to authenticated;

-- 3. Asserts como authenticated ---------------------------------------------
set local role authenticated;

do $$
declare
  v_hoje date := (select hoje from _d);
  r      record;
  ids    uuid[] := (select array_agg(id) from _ids);
  n      int;
  dup    jsonb;
begin
  -- precondicoes das fixtures de similaridade
  assert public.similarity('qwfixture antonieta zzz', 'qwfixture antonietta zzz') >= 0.7, 'pre: sim_a/sim_b >= 0.7';
  assert public.similarity('qwfixture ariane kkk', 'qwfixture mariane ppp') < 0.7, 'pre: fraco_a/fraco_b < 0.7';

  insert into _r
    select k.k, s.* from public.avaliacoes_sinais(ids) s join _ids k on k.id = s.avaliacao_id;
  assert (select count(*) from _ids) = 24, format('fixtures: %s estrelas', (select count(*) from _ids));

  select count(*) into n from _r;
  assert n = (select count(*) from _ids), format('uma linha por id pedido: %s', n);

  -- id servido no dia -> atendida, com nome, data e servicos
  select * into r from _r where k = 'id_atendida';
  assert r.atendida = 'atendida', format('id_atendida: %s', r.atendida);
  assert r.atendida_data = v_hoje - 2, format('id_atendida data: %s', r.atendida_data);
  assert r.atendida_servico = 'Corte Fixture, Escova Fixture', format('id_atendida servico: %s', r.atendida_servico);
  assert r.atendida_nome = 'Cliente Sete Fixture', format('id_atendida nome: %s', r.atendida_nome);

  -- id sem linha no dia: hoje e ontem -> aguardando; hoje-5 -> nao_encontrada
  select * into r from _r where k = 'id_hoje';
  assert r.atendida = 'aguardando_espelho', format('id_hoje: %s', r.atendida);
  assert r.atendida_nome is null and r.atendida_data is null and r.atendida_servico is null, 'id_hoje: sem detalhes';
  select * into r from _r where k = 'id_ontem';
  assert r.atendida = 'aguardando_espelho', format('id_ontem: %s', r.atendida);
  select * into r from _r where k = 'id_velha';
  assert r.atendida = 'nao_encontrada', format('id_velha (linha de outra profissional no dia nao conta): %s', r.atendida);
  assert r.atendida_nome is null, 'id_velha: sem nome';

  -- legada igual apos normalizar -> atendida
  select * into r from _r where k = 'legada_igual';
  assert r.atendida = 'atendida', format('legada_igual: %s', r.atendida);
  assert r.atendida_nome = 'MARIA JOSE  SOUZA', format('legada_igual nome: %s', r.atendida_nome);
  assert r.atendida_data = v_hoje - 3, format('legada_igual data: %s', r.atendida_data);
  assert r.atendida_servico = 'Manicure Fixture', format('legada_igual servico: %s', r.atendida_servico);

  -- legada parecida -> provavel
  select * into r from _r where k = 'legada_prov';
  assert r.atendida = 'provavel', format('legada_prov: %s', r.atendida);
  assert r.atendida_nome = 'Maria J. Souza Lima', format('legada_prov nome: %s', r.atendida_nome);
  assert r.atendida_data = v_hoje - 2, format('legada_prov data: %s', r.atendida_data);

  -- digitada: usa o nome do Trinks, nao o do Google
  select * into r from _r where k = 'digitada';
  assert r.atendida = 'atendida', format('digitada: %s', r.atendida);
  assert r.atendida_nome = 'Zeca Fixture Digitado', format('digitada nome: %s', r.atendida_nome);

  -- nome igual fora da janela nao conta; cadastro de hoje -> aguardando
  select * into r from _r where k = 'fora_janela';
  assert r.atendida = 'aguardando_espelho', format('fora_janela: %s', r.atendida);
  assert r.atendida_nome is null, 'fora_janela: sem nome';

  -- candidata fraca: hoje -> aguardando; cadastro de 20 dias atras -> nao_encontrada
  select * into r from _r where k = 'fraca_hoje';
  assert r.atendida = 'aguardando_espelho', format('fraca_hoje: %s', r.atendida);
  assert r.atendida_nome is null, 'fraca_hoje: candidata fraca nao aparece';
  select * into r from _r where k = 'fraca_velha';
  assert r.atendida = 'nao_encontrada', format('fraca_velha: %s', r.atendida);

  -- duplicatas: as duas "Loja Bella Moda" listam uma a outra, com o status certo
  select duplicatas into dup from _r where k = 'loja_pend';
  assert jsonb_array_length(dup) = 1, format('loja_pend duplicatas: %s', dup);
  assert (dup->0->>'id')::uuid = (select id from _ids where k = 'loja_aprov'), 'loja_pend lista loja_aprov';
  assert dup->0->>'status' = 'aprovada', 'loja_pend: status aprovada';
  assert dup->0->>'nome_profissional' = 'Fixture Sinais', 'loja_pend: nome_profissional';
  assert dup->0->>'nome_cliente' = 'Loja Bella Moda', 'loja_pend: nome_cliente';
  assert dup->0 ? 'data_hora_cadastro', 'loja_pend: data_hora_cadastro';

  select duplicatas into dup from _r where k = 'loja_aprov';
  assert jsonb_array_length(dup) = 1, format('loja_aprov duplicatas: %s', dup);
  assert (dup->0->>'id')::uuid = (select id from _ids where k = 'loja_pend'), 'loja_aprov lista loja_pend';
  assert dup->0->>'status' = 'pendente', 'loja_aprov: status pendente';

  -- nome do Trinks igual, Google diferente -> nao e duplicata
  select duplicatas into dup from _r where k = 'loja_trinks';
  assert dup = '[]'::jsonb, format('loja_trinks duplicatas: %s', dup);

  -- similaridade >= 0.7 lista; < 0.7 nao
  select duplicatas into dup from _r where k = 'sim_a';
  assert jsonb_array_length(dup) = 1 and dup->0->>'status' = 'rejeitada', format('sim_a duplicatas: %s', dup);
  select duplicatas into dup from _r where k = 'fraco_a';
  assert dup = '[]'::jsonb, format('fraco_a duplicatas: %s', dup);

  -- sem duplicata -> [] (nunca null)
  select duplicatas into dup from _r where k = 'id_atendida';
  assert dup = '[]'::jsonb, format('id_atendida duplicatas: %s', dup);

  -- limite 5, mais recentes primeiro (rep_1 e a mais nova; rep_1 ve rep_2..rep_6)
  select duplicatas into dup from _r where k = 'rep_1';
  assert jsonb_array_length(dup) = 5, format('rep_1: limite 5, veio %s', jsonb_array_length(dup));
  assert (select array_agg((e->>'id')::uuid order by o) from jsonb_array_elements(dup) with ordinality as t(e, o))
         = (select array_agg(id order by k) from _ids where k in ('rep_2','rep_3','rep_4','rep_5','rep_6')),
    'rep_1: ordem por data_hora_cadastro desc';
  select duplicatas into dup from _r where k = 'rep_7';
  assert (dup->0->>'id')::uuid = (select id from _ids where k = 'rep_1'), 'rep_7: a mais recente primeiro';
  assert not exists (select 1 from jsonb_array_elements(dup) e where (e->>'id')::uuid = (select id from _ids where k = 'rep_7')),
    'rep_7: nunca lista a si mesma';

  -- ids desconhecidos/nulos/duplicados
  select count(*) into n from public.avaliacoes_sinais(array['00000000-0000-0000-0000-000000000000'::uuid]);
  assert n = 0, 'id inexistente -> 0 linhas';
  select count(*) into n from public.avaliacoes_sinais(null);
  assert n = 0, 'p_ids null -> 0 linhas';
  select count(*) into n from public.avaliacoes_sinais(array[(select id from _ids where k='id_atendida'),
                                                            (select id from _ids where k='id_atendida')]);
  assert n = 1, 'id repetido -> 1 linha';
end $$;

reset role;

-- anon nao executa
set local role anon;
do $$
begin
  perform * from public.avaliacoes_sinais(array[]::uuid[]);
  raise exception 'anon nao deveria executar avaliacoes_sinais';
exception when insufficient_privilege then null;
end $$;
reset role;

select 'avaliacoes_sinais: todos os asserts passaram' as resultado;

rollback;
