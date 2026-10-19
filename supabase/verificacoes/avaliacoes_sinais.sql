-- Verificacao de 20261019120100_avaliacoes_sinais.sql (RPC public.avaliacoes_sinais).
--
-- Fica em supabase/verificacoes/ (supabase/tests/ e tratado como pgTAP pelo CLI).
-- Roda INTEIRO dentro de begin ... rollback: nada persiste. Execute com o MCP
-- execute_sql (papel postgres). Requer 20261019120000, 20261019120100 e 20261019180000
-- (duplicata por grafia e pelo nome do Trinks) aplicadas.
-- Qualquer assert que falhe aborta a transacao com erro; sucesso = sem erro.
--
-- Fixtures (ids que nao existem em producao):
--   profissionais 999011..999014 (profissionais_ativos)
--   trinks_services ids negativos -999011001.. ; `professional` NULL (nao dispara
--   trigger_sync_new_professional)
--   estrelas inseridas como postgres (uma precisa ser 'aprovada'); a RPC roda como
--   authenticated. Os nomes do Google das fixtures foram escolhidos para nao terem
--   similarity >= 0.7 com nenhuma estrela real (a duplicata compara com TODAS).
--   Casos de 20261019180000: palavras inventadas (Xaviera, Qwrtz, Qmaria, Qlimite...) para
--   que a frequencia no espelho (criterio B) so dependa das fixtures; as clientes
--   'Qmaria/Qlimite Fixture ...' ficam na profissional 999015 (sem estrelas) e so existem
--   para dar frequencia 4 (comum) e 3 (rara, o limite) a uma palavra.

begin;

-- 1. Permissoes e forma -----------------------------------------------------
do $$
begin
  -- helpers de 20261019180000
  assert has_function_privilege('authenticated', 'public.avaliacao_chave_grafia(text)', 'execute')
     and has_function_privilege('authenticated', 'public.avaliacao_palavras_nome(text)', 'execute'),
    'authenticated deve executar as helpers de duplicata';
  assert has_function_privilege('service_role', 'public.avaliacao_chave_grafia(text)', 'execute')
     and has_function_privilege('service_role', 'public.avaliacao_palavras_nome(text)', 'execute'),
    'service_role deve executar as helpers de duplicata';
  assert not has_function_privilege('anon', 'public.avaliacao_chave_grafia(text)', 'execute'),
    'anon NAO pode executar avaliacao_chave_grafia';
  assert not has_function_privilege('anon', 'public.avaliacao_palavras_nome(text)', 'execute'),
    'anon NAO pode executar avaliacao_palavras_nome';
  assert (select proconfig from pg_proc where oid = 'public.avaliacao_chave_grafia(text)'::regprocedure)
         = array['search_path=""'], 'avaliacao_chave_grafia: search_path vazio';
  assert (select proconfig from pg_proc where oid = 'public.avaliacao_palavras_nome(text)'::regprocedure)
         = array['search_path=""'], 'avaliacao_palavras_nome: search_path vazio';
  assert (select array_agg(provolatile) from pg_proc
           where oid in ('public.avaliacao_chave_grafia(text)'::regprocedure,
                         'public.avaliacao_palavras_nome(text)'::regprocedure)) = array['i','i']::"char"[],
    'helpers de duplicata: immutable';
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
  (-999014002, 0, '999014', 'Corte Fixture', 'Totalmente Outra Pessoa', '7302'),
  -- prof A: cliente 7003 com linha (improvavel) em data FUTURA hoje+5
  (-999011007, 5, '999011', 'Corte Fixture', 'Cliente Nove Fixture', '7003'),
  -- prof A: cliente 7004 realmente atendida 40 dias antes do cadastro
  (-999011008, -40, '999011', 'Corte Fixture', 'Cliente Dez Fixture', '7004'),
  -- prof C: nome exato em hoje-45 (dentro de data_atendimento-10, fora da trava de 30 dias)
  (-999013002, -45, '999013', 'Corte Fixture', 'Qtrava Fixture Nome', '7202'),
  -- prof D: "Ana Paula Ribeiro" em hoje-1 (alvo de uma palavra "Ana")
  (-999014003, -1, '999014', 'Corte Fixture', 'Ana Paula Ribeiro', '7303'),
  -- criterio B (raridade): 'qmaria' em 4 nomes distintos (comum), 'qlimite' em 3 (rara)
  (-999015001, -1, '999015', 'Corte Fixture', 'Qmaria Fixture Um',     '7401'),
  (-999015002, -1, '999015', 'Corte Fixture', 'Qmaria Fixture Dois',   '7402'),
  (-999015003, -1, '999015', 'Corte Fixture', 'Qmaria Fixture Tres',   '7403'),
  (-999015004, -1, '999015', 'Corte Fixture', 'Qmaria Fixture Quatro', '7404'),
  (-999015005, -1, '999015', 'Corte Fixture', 'Qlimite Fixture Um',    '7405'),
  (-999015006, -1, '999015', 'Corte Fixture', 'Qlimite Fixture Dois',  '7406'),
  (-999015007, -1, '999015', 'Corte Fixture', 'QLIMITE  Fixture Tres', '7407')
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
    ('loja_trinks',  999013, 'Qzx Fixture Unica Wyk',     'pendente', interval '0', 'Qlojab Qbellab Qmodab', null::bigint, -1, 'digitado'),
    ('loja_gb',      999012, 'Qlojab Qbellab Qmodab',     'pendente', interval '-4 days', null, null::bigint, null, null),
    ('sim_a',        999011, 'Qwfixture Antonieta Zzz',   'pendente', interval '0', null, null::bigint, null, null),
    ('sim_b',        999012, 'Qwfixture Antonietta Zzz',  'rejeitada', interval '-1 day', null, null::bigint, null, null),
    ('fraco_a',      999011, 'Qwfixture Ariane Kkk',      'pendente', interval '0', null, null::bigint, null, null),
    ('fraco_b',      999012, 'Qwfixture Mariane Ppp',     'pendente', interval '0', null, null::bigint, null, null),
    -- fix round 1
    ('id_futura',    999011, 'Fxa Futura Idq',            'pendente', interval '0', 'Cliente Nove Fixture', 7003::bigint,  5,  'lista'),
    ('dig_futura',   999012, 'Fxb Futura Dgt',            'pendente', interval '0', 'Zeca Fixture Digitado', null::bigint, 5,  'digitado'),
    ('id_antiga',    999011, 'Fxc Antiga Idz',            'pendente', interval '0', 'Cliente Dez Fixture', 7004::bigint, -40, 'lista'),
    ('id_sem_data',  999011, 'Fxd Semdata Idw',           'pendente', interval '0', 'Cliente Sete Fixture', 7001::bigint, null, 'lista'),
    ('trava30',      999013, 'Fxe Trava Tdy',             'pendente', interval '0', 'Qtrava Fixture Nome', null::bigint, -40, 'digitado'),
    ('uma_palavra',  999014, 'Ana',                       'pendente', interval '0', null, null::bigint, null, null),
    ('google_vazio', 999014, '   ',                       'pendente', interval '0', null, null::bigint, null, null),
    -- 20261019180000: criterio A (grafia). Raw similarity < 0.7; a chave dos dois e igual
    ('ga_a',         999011, 'Nivea Xyzqw',               'pendente', interval '0', null, null::bigint, null, null),
    ('ga_b',         999012, 'Nivia Xyzqw',               'rejeitada', interval '-1 day', null, null::bigint, null, null),
    -- criterio B (Trinks da alvo x Google das outras). b_alvo tem Trinks real
    ('b_alvo',       999013, 'Qzrt Alvo Bxv',             'pendente', interval '0', 'Xaviera Qwrtz De Sousa', null::bigint, -1, 'digitado'),
    ('b_outra',      999014, 'Xaviera Xaviera',           'pendente', interval '-1 day', null, null::bigint, null, null),
    ('b_outra2',     999011, 'Xaviera Qwrtz',             'pendente', interval '-2 days', null, null::bigint, null, null),
    ('b_naocont',    999012, 'Xaviera Outrasobrenome',    'pendente', interval '-3 days', null, null::bigint, null, null),
    -- palavra comum (4 nomes no espelho) nao basta; no limite (3) basta
    ('c_alvo',       999013, 'Qzrt Comum Bxw',            'pendente', interval '0', 'Qmaria Silvaqx', null::bigint, -1, 'digitado'),
    ('c_outra',      999014, 'Qmaria',                    'pendente', interval '-1 day', null, null::bigint, null, null),
    ('l_alvo',       999013, 'Qzrt Limite Bxu',           'pendente', interval '0', 'Qlimite Silvaqx', null::bigint, -1, 'digitado'),
    ('l_outra',      999014, 'Qlimite',                   'pendente', interval '-1 day', null, null::bigint, null, null),
    -- sem nome do Trinks real (null / so espacos) o B nao roda, mesmo com o Google contido
    ('n_alvo',       999013, 'Qnull Alvo Zzpq',           'pendente', interval '0', null, null::bigint, null, null),
    ('n_outra',      999014, 'Qnull',                     'pendente', interval '-1 day', null, null::bigint, null, null),
    ('n_alvo_esp',   999013, 'Qesp Alvo Zzpr',            'pendente', interval '0', '   ', null::bigint, null, null),
    ('e_outra',      999014, 'Qesp',                      'pendente', interval '-1 day', null, null::bigint, null, null),
    -- Google vazio da alvo desliga so os criterios Google; o B segue
    ('gv_alvo',      999013, '   ',                       'pendente', interval '0', 'Xaviera Qwrtz De Sousa', null::bigint, -1, 'digitado'),
    -- os dois criterios: motivo nome_google
    ('m_alvo',       999011, 'Qmotivo Dupla Zzt',         'pendente', interval '0', 'Qmotivo Dupla Zzt', null::bigint, -1, 'digitado'),
    ('m_outra',      999012, 'Qmotivo Dupla Zzt',         'pendente', interval '-1 day', null, null::bigint, null, null),
    -- P contido em Q: Trinks da alvo MENOR que o Google da outra
    ('pq_alvo',      999013, 'Qpq Alvo Zzw',              'pendente', interval '0', 'Vorzina Qwrtz', null::bigint, -1, 'digitado'),
    ('pq_outra',     999014, 'Vorzina Qwrtz de Sousa Fixture', 'pendente', interval '-1 day', null, null::bigint, null, null),
    -- stopword dentro do match do B: "No sistema Zandora" casa com Trinks "Zandora Qwrtz"?
    -- (Q = {sandura} ja sem 'sistema'; P = {sandura, qvrts}; Q contido em P)
    ('sw_alvo',      999013, 'Qsw Alvo Zzy',              'pendente', interval '0', 'Zandora Qwrtz', null::bigint, -1, 'digitado'),
    ('sw_outra',     999014, 'No sistema Zandora',        'pendente', interval '-1 day', null, null::bigint, null, null),
    -- teto de 5 por forca: 1 candidata de nome do Google (a mais ANTIGA) e 6 so-Trinks
    -- (mais recentes). A do Google nao pode ser cortada; a ordem de exibicao e por recencia.
    ('tp_alvo',      999013, 'Qtopo Cinco Zzv',           'pendente', interval '0', 'Wumbria Plkx', null::bigint, -1, 'digitado'),
    ('tp_goo',       999011, 'Qtopo Cinco Zzv',           'aprovada', interval '-30 days', null, null::bigint, null, null),
    ('tp_1',         999014, 'Wumbria',                   'pendente', interval '-1 day', null, null::bigint, null, null),
    ('tp_2',         999014, 'Wumbria',                   'pendente', interval '-2 days', null, null::bigint, null, null),
    ('tp_3',         999014, 'Wumbria',                   'pendente', interval '-3 days', null, null::bigint, null, null),
    ('tp_4',         999014, 'Wumbria',                   'pendente', interval '-4 days', null, null::bigint, null, null),
    ('tp_5',         999014, 'Wumbria',                   'pendente', interval '-5 days', null, null::bigint, null, null),
    ('tp_6',         999014, 'Wumbria',                   'pendente', interval '-6 days', null, null::bigint, null, null)
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
  dup_motivo text;
begin
  -- precondicoes das fixtures de similaridade
  assert public.similarity('qwfixture antonieta zzz', 'qwfixture antonietta zzz') >= 0.7, 'pre: sim_a/sim_b >= 0.7';
  assert public.similarity('qwfixture ariane kkk', 'qwfixture mariane ppp') < 0.7, 'pre: fraco_a/fraco_b < 0.7';

  insert into _r
    select k.k, s.* from public.avaliacoes_sinais(ids) s join _ids k on k.id = s.avaliacao_id;
  assert (select count(*) from _ids) = 61, format('fixtures: %s estrelas', (select count(*) from _ids));

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
  -- (so as duplicatas que sao fixtures: robusto a estrelas reais parecidas)
  select coalesce(jsonb_agg(e), '[]'::jsonb) into dup
    from _r, jsonb_array_elements(_r.duplicatas) e
   where _r.k = 'loja_pend' and (e->>'id')::uuid in (select id from _ids);
  assert jsonb_array_length(dup) = 1, format('loja_pend duplicatas: %s', dup);
  assert (dup->0->>'id')::uuid = (select id from _ids where k = 'loja_aprov'), 'loja_pend lista loja_aprov';
  assert dup->0->>'status' = 'aprovada', 'loja_pend: status aprovada';
  assert dup->0->>'nome_profissional' = 'Fixture Sinais', 'loja_pend: nome_profissional';
  assert dup->0->>'nome_cliente' = 'Loja Bella Moda', 'loja_pend: nome_cliente';
  assert dup->0 ? 'data_hora_cadastro', 'loja_pend: data_hora_cadastro';

  select coalesce(jsonb_agg(e), '[]'::jsonb) into dup
    from _r, jsonb_array_elements(_r.duplicatas) e
   where _r.k = 'loja_aprov' and (e->>'id')::uuid in (select id from _ids);
  assert jsonb_array_length(dup) = 1, format('loja_aprov duplicatas: %s', dup);
  assert (dup->0->>'id')::uuid = (select id from _ids where k = 'loja_pend'), 'loja_aprov lista loja_pend';
  assert dup->0->>'status' = 'pendente', 'loja_aprov: status pendente';

  -- nome do Trinks da alvo = Google de outra (criterio B, 20261019180000; palavras inventadas,
  -- raras no espelho): lista so loja_gb, com motivo nome_trinks (antes da migracao nova era []).
  -- As duas "Loja Bella Moda" (Google) NAO entram: o Trinks desta alvo e outro nome.
  select coalesce(jsonb_agg(e), '[]'::jsonb) into dup
    from _r, jsonb_array_elements(_r.duplicatas) e
   where _r.k = 'loja_trinks' and (e->>'id')::uuid in (select id from _ids);
  assert jsonb_array_length(dup) = 1 and (dup->0->>'id')::uuid = (select id from _ids where k = 'loja_gb')
     and dup->0->>'motivo' = 'nome_trinks',
    format('loja_trinks duplicatas: %s', dup);
  -- ... e a direcao inversa nao existe: loja_pend (Trinks = Cliente Sete Fixture) nao lista
  -- loja_trinks, cujo Google e 'Qzx Fixture Unica Wyk'
  select coalesce(jsonb_agg(e), '[]'::jsonb) into dup
    from _r, jsonb_array_elements(_r.duplicatas) e
   where _r.k = 'loja_pend' and (e->>'id')::uuid = (select id from _ids where k = 'loja_trinks');
  assert dup = '[]'::jsonb, format('loja_pend nao lista loja_trinks: %s', dup);
  -- motivo das duplicatas pelo Google (criterio antigo): nome_google
  select e->>'motivo' into dup_motivo
    from _r, jsonb_array_elements(_r.duplicatas) e
   where _r.k = 'loja_pend' and (e->>'id')::uuid = (select id from _ids where k = 'loja_aprov');
  assert dup_motivo = 'nome_google', format('loja_pend/loja_aprov motivo: %s', dup_motivo);

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
  -- fix round 1 -----------------------------------------------------------
  -- data futura nunca vira atendida/aguardando: id (com linha no espelho na data futura) e digitado
  select * into r from _r where k = 'id_futura';
  assert r.atendida = 'nao_encontrada', format('id_futura: %s', r.atendida);
  assert r.atendida_nome is null, 'id_futura: sem nome';
  select * into r from _r where k = 'dig_futura';
  assert r.atendida = 'nao_encontrada', format('dig_futura: %s', r.atendida);

  -- id com data fora de [dia_cadastro-10, dia_cadastro], mesmo atendida nessa data -> nao_encontrada
  select * into r from _r where k = 'id_antiga';
  assert r.atendida = 'nao_encontrada', format('id_antiga: %s', r.atendida);

  -- id preenchido e data_atendimento NULL -> caminho por nome (nome do Trinks, janela do cadastro)
  select * into r from _r where k = 'id_sem_data';
  assert r.atendida = 'atendida', format('id_sem_data: %s', r.atendida);
  assert r.atendida_nome = 'Cliente Sete Fixture' and r.atendida_data = v_hoje - 2,
    format('id_sem_data: %s %s', r.atendida_nome, r.atendida_data);

  -- trava de 30 dias: nome exato em hoje-45 (dentro de data_atendimento-10) nao conta
  select * into r from _r where k = 'trava30';
  assert r.atendida = 'nao_encontrada', format('trava30: %s', r.atendida);

  -- alvo de uma palavra: so similarity ("Ana" x "Ana Paula Ribeiro" = 0.22; word_similarity seria 1)
  assert public.word_similarity('ana', 'ana paula ribeiro') = 1 and public.similarity('ana', 'ana paula ribeiro') < 0.6,
    'pre: uma_palavra';
  select * into r from _r where k = 'uma_palavra';
  assert r.atendida = 'aguardando_espelho', format('uma_palavra: %s', r.atendida);
  assert r.atendida_nome is null, 'uma_palavra: sem nome';

  -- nome do Google vazio apos normalizar: sem duplicatas, caminho por nome -> nao_encontrada
  select * into r from _r where k = 'google_vazio';
  assert r.atendida = 'nao_encontrada', format('google_vazio: %s', r.atendida);
  assert r.duplicatas = '[]'::jsonb, format('google_vazio duplicatas: %s', r.duplicatas);

  -- 20261019180000 ----------------------------------------------------------
  -- helpers
  assert public.avaliacao_chave_grafia('nivea') = 'nivia' and public.avaliacao_chave_grafia('nivia') = 'nivia',
    'chave: nivea/nivia';
  assert public.avaliacao_chave_grafia('joice') = public.avaliacao_chave_grafia('joyce'), 'chave: joice/joyce';
  assert public.avaliacao_chave_grafia('suzana') = public.avaliacao_chave_grafia('susana'), 'chave: suzana/susana';
  assert public.avaliacao_chave_grafia('andressa') = public.avaliacao_chave_grafia('andreza'), 'chave: andressa/andreza';
  assert public.avaliacao_chave_grafia('') = '' and public.avaliacao_chave_grafia(null) is null, 'chave: vazio/null';
  assert public.avaliacao_palavras_nome('Nívea Terlucia (Nivia Nivia) de Sousa') = array['nivia','susa','tirlucia'],
    format('palavras: %s', public.avaliacao_palavras_nome('Nívea Terlucia (Nivia Nivia) de Sousa'));
  assert public.avaliacao_palavras_nome('Nivia Terlucia De Sousa') = array['nivia','susa','tirlucia'], 'palavras: trinks real';
  assert public.avaliacao_palavras_nome('No sistema: Ana, no Google: Ana Paula; a filha que fez') = array['ana','paula'],
    format('palavras sem stopwords: %s', public.avaliacao_palavras_nome('No sistema: Ana, no Google: Ana Paula; a filha que fez'));
  assert public.avaliacao_palavras_nome('   ') = array[]::text[] and public.avaliacao_palavras_nome(null) = array[]::text[],
    'palavras: vazio/null -> {}';
  assert public.avaliacao_palavras_nome('Mae de Ana 12 Sao Joao') = array['ana','juau','sau'],
    format('palavras: %s', public.avaliacao_palavras_nome('Mae de Ana 12 Sao Joao'));
  -- stopword e comparada com o token normalizado ANTES da chave: nomes que so DOBRAM para uma
  -- stopword sobrevivem (Dieylle->dili, May->mai, Nyla->nila, Della->dila), e acento nao salva
  -- a stopword literal (Irmã, Mãe, Não)
  assert public.avaliacao_palavras_nome('Dieylle May Nyla Della Nilla Dila Fila') = array['dila','dili','fila','mai','nila'],
    format('palavras que dobram para stopword sobrevivem: %s', public.avaliacao_palavras_nome('Dieylle May Nyla Della Nilla Dila Fila'));
  assert public.avaliacao_palavras_nome('Irmã Mãe Não Sistema Google Cliente Nela Dela Del') = array[]::text[],
    'stopwords literais (com acento) saem';
  assert public.avaliacao_palavras_nome('Maria da Silva') = array['maria','silva'], 'palavras: Maria da Silva (da < 3 letras)';

  -- criterio A (grafia): raw similarity < 0.7 e chaves iguais; os dois lados se listam
  assert public.similarity('nivea xyzqw', 'nivia xyzqw') < 0.7, 'pre: ga_a/ga_b raw < 0.7';
  assert public.similarity(public.avaliacao_chave_grafia('nivea xyzqw'), public.avaliacao_chave_grafia('nivia xyzqw')) >= 0.7,
    'pre: ga_a/ga_b chave >= 0.7';
  select coalesce(jsonb_agg(e), '[]'::jsonb) into dup
    from _r, jsonb_array_elements(_r.duplicatas) e
   where _r.k = 'ga_a' and (e->>'id')::uuid in (select id from _ids);
  assert jsonb_array_length(dup) = 1 and (dup->0->>'id')::uuid = (select id from _ids where k = 'ga_b')
     and dup->0->>'motivo' = 'nome_google', format('ga_a: %s', dup);
  select coalesce(jsonb_agg(e), '[]'::jsonb) into dup
    from _r, jsonb_array_elements(_r.duplicatas) e
   where _r.k = 'ga_b' and (e->>'id')::uuid in (select id from _ids);
  assert jsonb_array_length(dup) = 1 and (dup->0->>'id')::uuid = (select id from _ids where k = 'ga_a')
     and dup->0->>'motivo' = 'nome_google', format('ga_b: %s', dup);

  -- criterio B: Trinks "Xaviera Qwrtz De Sousa" -> {xaviera, qvrts, susa}
  assert public.avaliacao_palavras_nome('Xaviera Qwrtz De Sousa') = array['qvrts','susa','xavira'],
    format('palavras b_alvo: %s', public.avaliacao_palavras_nome('Xaviera Qwrtz De Sousa'));
  -- pre: nenhum dos nomes do Google passa pelo criterio Google
  assert public.similarity('qzrt alvo bxv', 'xaviera xaviera') < 0.7
     and public.similarity('xaviera qwrtz de sousa', 'xaviera xaviera') < 0.7
     and public.similarity('xaviera qwrtz de sousa', 'xaviera qwrtz') < 0.7
     and public.similarity('xaviera qwrtz de sousa', 'xaviera outrasobrenome') < 0.7,
    'pre: B nao e pego pelo Google';
  select coalesce(jsonb_agg(e), '[]'::jsonb) into dup
    from _r, jsonb_array_elements(_r.duplicatas) e
   where _r.k = 'b_alvo' and (e->>'id')::uuid in (select id from _ids);
  assert jsonb_array_length(dup) = 2
     and (select array_agg((e->>'id')::uuid order by e->>'nome_cliente') from jsonb_array_elements(dup) e)
         = (select array_agg(id order by nome) from (select id, nome_cliente nome from public.avaliacoes_cadastradas
                                                      where id in (select id from _ids where k in ('b_outra','b_outra2'))) q)
     and not exists (select 1 from jsonb_array_elements(dup) e where e->>'motivo' <> 'nome_trinks'),
    format('b_alvo (b_outra e b_outra2 por nome_trinks; b_naocont nao): %s', dup);
  -- b_naocont ("Xaviera Outrasobrenome") tem 'xaviera' em comum mas o nome mais curto
  -- (2 palavras) nao esta inteiro no Trinks da alvo (3 palavras)
  assert not exists (select 1 from jsonb_array_elements(dup) e where (e->>'id')::uuid = (select id from _ids where k = 'b_naocont')),
    'b_alvo: b_naocont nao e duplicata';
  -- a direcao inversa nao existe: b_outra (sem Trinks) nao lista b_alvo
  select coalesce(jsonb_agg(e), '[]'::jsonb) into dup
    from _r, jsonb_array_elements(_r.duplicatas) e
   where _r.k = 'b_outra' and (e->>'id')::uuid in (select id from _ids);
  assert dup = '[]'::jsonb, format('b_outra: %s', dup);

  -- palavra comum (4 nomes distintos no espelho) nao basta; 3 basta (LIMIAR_RARA)
  select coalesce(jsonb_agg(e), '[]'::jsonb) into dup
    from _r, jsonb_array_elements(_r.duplicatas) e
   where _r.k = 'c_alvo' and (e->>'id')::uuid in (select id from _ids);
  assert dup = '[]'::jsonb, format('c_alvo (Qmaria e comum): %s', dup);
  select coalesce(jsonb_agg(e), '[]'::jsonb) into dup
    from _r, jsonb_array_elements(_r.duplicatas) e
   where _r.k = 'l_alvo' and (e->>'id')::uuid in (select id from _ids);
  assert jsonb_array_length(dup) = 1 and (dup->0->>'id')::uuid = (select id from _ids where k = 'l_outra')
     and dup->0->>'motivo' = 'nome_trinks', format('l_alvo (Qlimite e rara, freq 3): %s', dup);

  -- sem nome do Trinks real (null ou so espacos) o B nao roda; Google contido nao basta
  select coalesce(jsonb_agg(e), '[]'::jsonb) into dup
    from _r, jsonb_array_elements(_r.duplicatas) e
   where _r.k in ('n_alvo', 'n_alvo_esp') and (e->>'id')::uuid in (select id from _ids);
  assert dup = '[]'::jsonb, format('n_alvo/n_alvo_esp: %s', dup);
  assert public.similarity('qnull alvo zzpq', 'qnull') < 0.7 and public.similarity('qesp alvo zzpr', 'qesp') < 0.7,
    'pre: n_alvo/n_alvo_esp nao pegos pelo Google';
  assert public.avaliacao_palavras_nome('Qnull') <@ public.avaliacao_palavras_nome('Qnull Alvo Zzpq')
     and public.avaliacao_palavras_nome('Qesp') <@ public.avaliacao_palavras_nome('Qesp Alvo Zzpr'),
    'pre: com o Google como Trinks, o B pegaria n_alvo/n_alvo_esp';

  -- Google vazio da alvo nao desliga o B
  select coalesce(jsonb_agg(e), '[]'::jsonb) into dup
    from _r, jsonb_array_elements(_r.duplicatas) e
   where _r.k = 'gv_alvo' and (e->>'id')::uuid in (select id from _ids);
  assert jsonb_array_length(dup) = 2
     and exists (select 1 from jsonb_array_elements(dup) e where (e->>'id')::uuid = (select id from _ids where k = 'b_outra'))
     and not exists (select 1 from jsonb_array_elements(dup) e where e->>'motivo' <> 'nome_trinks'),
    format('gv_alvo: %s', dup);

  -- os dois criterios ao mesmo tempo -> nome_google
  select coalesce(jsonb_agg(e), '[]'::jsonb) into dup
    from _r, jsonb_array_elements(_r.duplicatas) e
   where _r.k = 'm_alvo' and (e->>'id')::uuid in (select id from _ids);
  assert jsonb_array_length(dup) = 1 and (dup->0->>'id')::uuid = (select id from _ids where k = 'm_outra')
     and dup->0->>'motivo' = 'nome_google', format('m_alvo: %s', dup);
  -- P contido em Q (Trinks da alvo menor que o Google da outra) -> nome_trinks
  assert public.similarity('qpq alvo zzw', 'vorzina qwrtz de sousa fixture') < 0.7, 'pre: pq nao e Google';
  select coalesce(jsonb_agg(e), '[]'::jsonb) into dup
    from _r, jsonb_array_elements(_r.duplicatas) e
   where _r.k = 'pq_alvo' and (e->>'id')::uuid in (select id from _ids);
  assert jsonb_array_length(dup) = 1 and (dup->0->>'id')::uuid = (select id from _ids where k = 'pq_outra')
     and dup->0->>'motivo' = 'nome_trinks', format('pq_alvo (P contido em Q): %s', dup);

  -- stopword dentro do match: sem remover 'sistema', |Q|=2 e |C|=1 nao fecharia
  assert public.avaliacao_palavras_nome('No sistema Zandora') = array['sandura']
     and public.avaliacao_palavras_nome('Zandora Qwrtz') = array['qvrts','sandura'], 'pre: palavras sw';
  select coalesce(jsonb_agg(e), '[]'::jsonb) into dup
    from _r, jsonb_array_elements(_r.duplicatas) e
   where _r.k = 'sw_alvo' and (e->>'id')::uuid in (select id from _ids);
  assert jsonb_array_length(dup) = 1 and (dup->0->>'id')::uuid = (select id from _ids where k = 'sw_outra')
     and dup->0->>'motivo' = 'nome_trinks', format('sw_alvo (stopword no match): %s', dup);

  -- teto de 5 por forca: a de nome do Google (a mais antiga, 30 dias) entra mesmo com 6
  -- candidatas so-Trinks mais recentes; ficam as 4 so-Trinks mais recentes; exibicao por recencia
  select coalesce(jsonb_agg(e), '[]'::jsonb) into dup
    from _r, jsonb_array_elements(_r.duplicatas) e
   where _r.k = 'tp_alvo' and (e->>'id')::uuid in (select id from _ids);
  assert jsonb_array_length(dup) = 5, format('tp_alvo: teto 5, veio %s', jsonb_array_length(dup));
  assert (dup->4->>'id')::uuid = (select id from _ids where k = 'tp_goo') and dup->4->>'motivo' = 'nome_google',
    format('tp_alvo: a de nome do Google (mais antiga) fica por ultimo e nao e cortada: %s', dup);
  assert (select array_agg((e->>'id')::uuid order by o) from jsonb_array_elements(dup) with ordinality as t(e, o) where o <= 4)
         = (select array_agg(id order by k) from _ids where k in ('tp_1','tp_2','tp_3','tp_4')),
    'tp_alvo: as 4 so-Trinks mais recentes, em ordem de recencia';
  assert (select count(*) from jsonb_array_elements(dup) e where e->>'motivo' = 'nome_trinks') = 4, 'tp_alvo: 4 nome_trinks';

  -- todo item traz motivo valido
  assert not exists (select 1 from _r, jsonb_array_elements(_r.duplicatas) e
                      where coalesce(e->>'motivo', '') not in ('nome_google', 'nome_trinks')),
    'todo item de duplicatas traz motivo nome_google|nome_trinks';

  -- limite de 300 ids
  perform * from public.avaliacoes_sinais(array(select gen_random_uuid() from generate_series(1, 300)));
  begin
    perform * from public.avaliacoes_sinais(array(select gen_random_uuid() from generate_series(1, 301)));
    raise exception '301 ids deveria falhar';
  exception when invalid_parameter_value then null;
  end;

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
