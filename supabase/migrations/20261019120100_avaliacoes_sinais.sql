-- Estrelas do Google: sinais da fila de aprovacao (out/2026).
--
-- public.avaliacoes_sinais(p_ids uuid[]) devolve, para cada estrela pedida (a aba
-- "Aprovacoes" passa os ids das pendentes carregadas), dois sinais:
--
--   "Atendida?"  (atendida, atendida_nome, atendida_data, atendida_servico)
--     Cruza com o espelho do Trinks (trinks_services) da MESMA profissional
--     (trinks_services.profissionalid = profissional_id::text).
--     - Com cliente_trinks_id E data_atendimento: existe linha com o mesmo clienteid
--       (numerico) e service_date = data_atendimento -> 'atendida' (nome da linha,
--       data, servicos distintos do dia separados por ", "). Senao, data_atendimento
--       >= hoje-1 -> 'aguardando_espelho' (comanda pode nao ter fechado); senao
--       'nao_encontrada'.
--     - Sem id (digitado ou cadastro antigo): nome alvo = nome_cliente_trinks, ou o
--       nome do Google se aquele for vazio. Candidatas = clientes da profissional entre
--       coalesce(data_atendimento, dia_cadastro) - 10 e dia_cadastro (Manaus). Melhor
--       candidata: nome normalizado igual primeiro, depois maior
--       greatest(similarity, word_similarity), depois o dia mais recente. Igual ->
--       'atendida'; score >= 0.6 -> 'provavel'; senao coalesce(data_atendimento,
--       dia_cadastro) >= hoje-1 -> 'aguardando_espelho'; senao 'nao_encontrada'.
--       nome/data/servico so vem preenchido em 'atendida' e 'provavel'.
--       Trava: o inicio da janela nunca passa de dia_cadastro - 30. A UI so grava
--       data_atendimento entre hoje-10 e hoje (janela maxima normal: 21 dias), mas o
--       INSERT publico aceita qualquer data; sem a trava uma data absurda faria a
--       janela ter milhares de dias.
--     service_date e TEXT 'DD/MM/YYYY' no banco: comparamos com to_char(dia) em vez de
--     converter a coluna (to_date erraria em linha malformada e derrubaria a fila).
--
--   "Possivel duplicata"  (duplicatas jsonb)
--     Outras estrelas (qualquer status, mes ou profissional; nunca a propria) cujo nome
--     do GOOGLE normalizado e igual ou tem similarity >= LIMIAR_DUP = 0.7. Nunca compara
--     pelo nome do Trinks. Array (max. 5, mais recentes primeiro) de
--     {id, nome_profissional, nome_cliente, status, data_hora_cadastro}; [] quando nao ha.
--     Nome do Google vazio apos normalizar -> [].
--
--   Calibracao de LIMIAR_DUP (2026-10-19, so leitura, 1.069 estrelas / 984 nomes do
--   Google distintos apos normalizar; pares distintos por faixa de similarity):
--     [0.6,0.7): 64   maioria de pessoas DIFERENTES (prenome ou sobrenome em comum)
--     [0.7,0.8): 22   maioria a mesma pessoa (grafia: s/z, i/y, letra dobrada,
--                     sobrenome a mais); ~3 claramente diferentes, ~5 ambiguos
--     [0.8,0.9):  9   quase todos a mesma pessoa
--     [0.9,1.0):  1   mesma pessoa
--     = 1.0    :  3   textos distintos com os mesmos trigramas (ordem/repeticao)
--   Escolhido o menor limiar cuja faixa e majoritariamente a mesma pessoa: 0.7. O sinal
--   e so um aviso ao admin; falso positivo custa uma olhada, falso negativo deixa passar
--   estrela repetida.
--
-- SECURITY INVOKER: so le tabelas que authenticated ja le (RLS publica de leitura em
-- avaliacoes_cadastradas e trinks_services). search_path vazio, tudo qualificado.
-- EXECUTE so para authenticated/service_role (o default do Supabase concede a anon em
-- funcoes novas do schema public; revogado explicitamente).
--
-- Depende de 20261019120000_avaliacoes_cliente_trinks.sql (colunas novas e
-- public.avaliacao_normalizar_nome).
--
-- Aditiva e idempotente (create or replace). Nao cria indice: explain analyze em ensaio
-- (2026-10-19, como authenticated) com as 10 pendentes reais = 119 ms. Custo cresce com o
-- numero de ids pedidos (as 1.069 de uma vez = 6,4 s): chame so com as pendentes da tela.
--
-- Rollback:
--   drop function if exists public.avaliacoes_sinais(uuid[]);

create or replace function public.avaliacoes_sinais(p_ids uuid[])
returns table (
  avaliacao_id     uuid,
  atendida         text,
  atendida_nome    text,
  atendida_data    date,
  atendida_servico text,
  duplicatas       jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select (pg_catalog.now() at time zone 'America/Manaus')::date as hoje
  ),
  alvo as (
    select a.id,
           a.profissional_id,
           a.cliente_trinks_id,
           a.data_atendimento,
           (a.data_hora_cadastro at time zone 'America/Manaus')::date as dia_cadastro,
           (a.cliente_trinks_id is not null and a.data_atendimento is not null) as usa_id,
           public.avaliacao_normalizar_nome(a.nome_cliente) as google_n,
           public.avaliacao_normalizar_nome(
             coalesce(nullif(pg_catalog.btrim(a.nome_cliente_trinks), ''), a.nome_cliente)) as trinks_n
    from public.avaliacoes_cadastradas a
    where a.id = any (p_ids)
  ),
  -- Caminho por id: mesma profissional, mesmo clienteid (numerico), mesmo dia.
  por_id as (
    select al.id,
           min(pg_catalog.btrim(t.client_name)) as nome,
           pg_catalog.string_agg(distinct t.service_name, ', ' order by t.service_name) as servico
    from alvo al
    join public.trinks_services t
      on t.profissionalid = al.profissional_id::text
     and t.service_date   = pg_catalog.to_char(al.data_atendimento, 'DD/MM/YYYY')
     and (case when pg_catalog.btrim(t.clienteid) ~ '^[0-9]{1,18}$'
               then pg_catalog.btrim(t.clienteid)::bigint end) = al.cliente_trinks_id
    where al.usa_id
    group by al.id
  ),
  -- Caminho por nome: dias da janela (como texto 'DD/MM/YYYY', o formato da coluna).
  janela as (
    select al.id,
           d::date as dia,
           pg_catalog.to_char(d::date, 'DD/MM/YYYY') as dia_txt
    from alvo al
    cross join lateral pg_catalog.generate_series(
      greatest(coalesce(al.data_atendimento, al.dia_cadastro) - 10,
                          al.dia_cadastro - 30)::timestamp,
      al.dia_cadastro::timestamp,
      interval '1 day') as d
    where not al.usa_id
  ),
  cand as (
    select j.id,
           j.dia,
           public.avaliacao_normalizar_nome(t.client_name) as nome_n,
           min(pg_catalog.btrim(t.client_name)) as nome,
           pg_catalog.string_agg(distinct t.service_name, ', ' order by t.service_name) as servico
    from janela j
    join alvo al on al.id = j.id
    join public.trinks_services t
      on t.profissionalid = al.profissional_id::text
     and t.service_date   = j.dia_txt
    where t.client_name is not null
      and pg_catalog.btrim(t.client_name) <> ''
    group by j.id, j.dia, public.avaliacao_normalizar_nome(t.client_name)
  ),
  melhor as (
    select distinct on (c.id)
           c.id, c.nome, c.dia, c.servico,
           (c.nome_n = al.trinks_n) as igual,
           greatest(public.similarity(al.trinks_n, c.nome_n),
                               public.word_similarity(al.trinks_n, c.nome_n)) as score
    from cand c
    join alvo al on al.id = c.id
    order by c.id,
             (c.nome_n = al.trinks_n) desc,
             greatest(public.similarity(al.trinks_n, c.nome_n),
                                 public.word_similarity(al.trinks_n, c.nome_n)) desc,
             c.dia desc,
             c.nome
  ),
  -- Duplicatas: nomes do Google de todas as estrelas, normalizados uma vez so.
  todas as materialized (
    select o.id, o.nome_profissional, o.nome_cliente, o.status, o.data_hora_cadastro,
           public.avaliacao_normalizar_nome(o.nome_cliente) as google_n
    from public.avaliacoes_cadastradas o
  ),
  sinal as (
    select al.*,
           p.id is not null as achou_id, p.nome as id_nome, p.servico as id_servico,
           m.igual, m.score, m.nome as m_nome, m.dia as m_dia, m.servico as m_servico,
           case
             when al.usa_id then
               case when p.id is not null                                  then 'atendida'
                    when al.data_atendimento >= pr.hoje - 1                then 'aguardando_espelho'
                    else 'nao_encontrada' end
             else
               case when m.igual                                           then 'atendida'
                    when m.score >= 0.6                                    then 'provavel'
                    when coalesce(al.data_atendimento, al.dia_cadastro) >= pr.hoje - 1
                                                                           then 'aguardando_espelho'
                    else 'nao_encontrada' end
           end as atendida
    from alvo al
    cross join params pr
    left join por_id p on p.id = al.id
    left join melhor m on m.id = al.id
  )
  select s.id,
         s.atendida,
         case when s.atendida = 'atendida' and s.usa_id                  then s.id_nome
              when s.atendida in ('atendida', 'provavel') and not s.usa_id then s.m_nome end,
         case when s.atendida = 'atendida' and s.usa_id                  then s.data_atendimento
              when s.atendida in ('atendida', 'provavel') and not s.usa_id then s.m_dia end,
         case when s.atendida = 'atendida' and s.usa_id                  then s.id_servico
              when s.atendida in ('atendida', 'provavel') and not s.usa_id then s.m_servico end,
         dup.duplicatas
  from sinal s
  cross join lateral (
    select coalesce(
             pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'id', x.id,
                 'nome_profissional', x.nome_profissional,
                 'nome_cliente', x.nome_cliente,
                 'status', x.status,
                 'data_hora_cadastro', x.data_hora_cadastro)
               order by x.data_hora_cadastro desc nulls last, x.id),
             '[]'::jsonb) as duplicatas
    from (
      select o.*
      from todas o
      where o.id <> s.id
        and s.google_n <> ''
        and (o.google_n = s.google_n
             or public.similarity(o.google_n, s.google_n) >= 0.7)  -- LIMIAR_DUP
      order by o.data_hora_cadastro desc nulls last, o.id
      limit 5
    ) x
  ) dup
$$;

comment on function public.avaliacoes_sinais(uuid[]) is
  'Sinais da fila de aprovacao por estrela: atendida (atendida|provavel|aguardando_espelho|nao_encontrada, cruzando com trinks_services da mesma profissional) e duplicatas (ate 5 outras estrelas com nome do Google igual ou similarity >= 0.7). SECURITY INVOKER, search_path vazio. So authenticated.';

revoke all on function public.avaliacoes_sinais(uuid[]) from public;
revoke all on function public.avaliacoes_sinais(uuid[]) from anon;
grant execute on function public.avaliacoes_sinais(uuid[]) to authenticated, service_role;
