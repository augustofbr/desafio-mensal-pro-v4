-- Estrelas do Google: sinais da fila de aprovacao (out/2026).
--
-- public.avaliacoes_sinais(p_ids uuid[]) devolve, para cada estrela pedida (a aba
-- "Aprovacoes" passa os ids das pendentes carregadas, no maximo 300), dois sinais:
--
--   "Atendida?"  (atendida, atendida_nome, atendida_data, atendida_servico)
--     Cruza com o espelho do Trinks (trinks_services) da MESMA profissional
--     (trinks_services.profissionalid = profissional_id::text).
--     hoje = dia atual em America/Manaus; dia_cadastro = data_hora_cadastro em Manaus;
--     fim = least(dia_cadastro, hoje) (nenhuma data depois disso e plausivel).
--     - Com cliente_trinks_id E data_atendimento:
--         data_atendimento fora de [dia_cadastro - 10, fim]   -> 'nao_encontrada'
--           (a UI so permite hoje-10..hoje no cadastro; data futura ou antiga demais e
--            dado invalido e nunca vira 'atendida' nem 'aguardando_espelho')
--         linha com o mesmo clienteid (numerico) em service_date = data_atendimento
--                                                              -> 'atendida' (nome da
--           linha, data, servicos distintos do dia separados por ", ")
--         data_atendimento entre hoje-1 e hoje               -> 'aguardando_espelho'
--           (comanda pode nao ter fechado)
--         senao                                               -> 'nao_encontrada'
--     - Sem id, OU com id mas data_atendimento NULL (so por INSERT direto; a UI nao
--       produz): caminho por nome. Alvo = nome_cliente_trinks, ou o nome do Google se
--       aquele for vazio, normalizado. Candidatas = clientes da profissional entre
--       greatest(coalesce(data_atendimento, dia_cadastro) - 10, dia_cadastro - 30) e fim.
--       Score: alvo de UMA palavra -> similarity; de 2+ palavras ->
--       greatest(similarity, word_similarity) (word_similarity de uma palavra so daria 1
--       contra qualquer nome que a contenha: "Ana" x "Ana Paula ...").
--       Melhor candidata: igual apos normalizar primeiro, depois maior score, depois o dia
--       mais recente.
--         alvo vazio, ou data_atendimento > fim                -> 'nao_encontrada'
--         igual                                               -> 'atendida'
--         score >= 0.6                                        -> 'provavel'
--         coalesce(data_atendimento, dia_cadastro) entre hoje-1 e hoje
--                                                             -> 'aguardando_espelho'
--         senao                                               -> 'nao_encontrada'
--       Trava dos 30 dias: a UI so grava data_atendimento entre hoje-10 e hoje (janela
--       normal de ate 21 dias), mas o INSERT publico aceita qualquer data; sem a trava
--       uma data absurda faria a janela ter milhares de dias.
--     nome/data/servico so vem preenchido em 'atendida' e 'provavel'.
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
-- Mais de 300 ids -> erro 22023 (o custo e linear no numero de ids: 10 pendentes reais =
-- 119 ms, as 1.069 estrelas de uma vez = 6,4 s, medido em ensaio em 2026-10-19).
--
-- SECURITY INVOKER: so le tabelas que authenticated ja le (RLS publica de leitura em
-- avaliacoes_cadastradas e trinks_services). search_path vazio, tudo qualificado.
-- EXECUTE so para authenticated/service_role (o default do Supabase concede a anon em
-- funcoes novas do schema public; revogado explicitamente).
--
-- Depende de 20261019120000_avaliacoes_cliente_trinks.sql (colunas novas e
-- public.avaliacao_normalizar_nome).
--
-- Aditiva e idempotente (create or replace). Sem indice: a medicao com as pendentes reais
-- ficou bem abaixo de 1 s.
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
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if pg_catalog.cardinality(p_ids) > 300 then
    raise exception 'avaliacoes_sinais: no maximo 300 ids por chamada (recebidos %)',
      pg_catalog.cardinality(p_ids)
      using errcode = '22023';  -- invalid_parameter_value
  end if;

  return query
  with params as (
    select (pg_catalog.now() at time zone 'America/Manaus')::date as hoje
  ),
  base as (
    select a.id,
           a.profissional_id,
           a.cliente_trinks_id,
           a.data_atendimento,
           (a.data_hora_cadastro at time zone 'America/Manaus')::date as dia_cadastro,
           pr.hoje,
           (a.cliente_trinks_id is not null and a.data_atendimento is not null) as usa_id,
           public.avaliacao_normalizar_nome(a.nome_cliente) as google_n,
           public.avaliacao_normalizar_nome(
             coalesce(nullif(pg_catalog.btrim(a.nome_cliente_trinks), ''), a.nome_cliente)) as trinks_n
    from public.avaliacoes_cadastradas a
    cross join params pr
    where a.id = any (p_ids)
  ),
  alvo as (
    select b.*,
           least(b.dia_cadastro, b.hoje) as fim,
           (pg_catalog.strpos(b.trinks_n, ' ') = 0) as uma_palavra
    from base b
  ),
  -- Caminho por id: mesma profissional, mesmo clienteid (numerico), mesmo dia, data plausivel.
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
      and al.data_atendimento between al.dia_cadastro - 10 and al.fim
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
      al.fim::timestamp,
      interval '1 day') as d
    where not al.usa_id
      and al.trinks_n <> ''
      and (al.data_atendimento is null or al.data_atendimento <= al.fim)
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
  pontuado as (
    select c.id, c.nome, c.dia, c.servico,
           (al.trinks_n <> '' and c.nome_n = al.trinks_n) as igual,
           case when al.uma_palavra
                then public.similarity(al.trinks_n, c.nome_n)
                else greatest(public.similarity(al.trinks_n, c.nome_n),
                              public.word_similarity(al.trinks_n, c.nome_n))
           end as score
    from cand c
    join alvo al on al.id = c.id
  ),
  melhor as (
    select distinct on (p.id) p.*
    from pontuado p
    order by p.id, p.igual desc, p.score desc, p.dia desc, p.nome
  ),
  -- Duplicatas: nomes do Google de todas as estrelas, normalizados uma vez so.
  todas as materialized (
    select o.id, o.nome_profissional, o.nome_cliente, o.status, o.data_hora_cadastro,
           public.avaliacao_normalizar_nome(o.nome_cliente) as google_n
    from public.avaliacoes_cadastradas o
  ),
  sinal as (
    select al.*,
           p.nome as id_nome, p.servico as id_servico,
           m.nome as m_nome, m.dia as m_dia, m.servico as m_servico,
           case
             when al.usa_id then
               case when not coalesce(al.data_atendimento between al.dia_cadastro - 10 and al.fim, false)
                                                                   then 'nao_encontrada'
                    when p.id is not null                          then 'atendida'
                    when al.data_atendimento between al.hoje - 1 and al.hoje
                                                                   then 'aguardando_espelho'
                    else 'nao_encontrada' end
             else
               case when al.trinks_n = ''
                      or al.dia_cadastro is null
                      or al.data_atendimento > al.fim              then 'nao_encontrada'
                    when m.igual                                   then 'atendida'
                    when m.score >= 0.6                            then 'provavel'
                    when coalesce(al.data_atendimento, al.dia_cadastro) between al.hoje - 1 and al.hoje
                                                                   then 'aguardando_espelho'
                    else 'nao_encontrada' end
           end as sinal_atendida
    from alvo al
    left join por_id p on p.id = al.id
    left join melhor m on m.id = al.id
  )
  select s.id,
         s.sinal_atendida,
         case when s.sinal_atendida = 'atendida' and s.usa_id                  then s.id_nome
              when s.sinal_atendida in ('atendida', 'provavel') and not s.usa_id then s.m_nome end,
         case when s.sinal_atendida = 'atendida' and s.usa_id                  then s.data_atendimento
              when s.sinal_atendida in ('atendida', 'provavel') and not s.usa_id then s.m_dia end,
         case when s.sinal_atendida = 'atendida' and s.usa_id                  then s.id_servico
              when s.sinal_atendida in ('atendida', 'provavel') and not s.usa_id then s.m_servico end,
         dup.lista
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
             '[]'::jsonb) as lista
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
  ) dup;
end
$$;

comment on function public.avaliacoes_sinais(uuid[]) is
  'Sinais da fila de aprovacao por estrela (max. 300 ids): atendida (atendida|provavel|aguardando_espelho|nao_encontrada, cruzando com trinks_services da mesma profissional) e duplicatas (ate 5 outras estrelas com nome do Google igual ou similarity >= 0.7). SECURITY INVOKER, search_path vazio. EXECUTE: authenticated e service_role (anon e public revogados).';

revoke all on function public.avaliacoes_sinais(uuid[]) from public;
revoke all on function public.avaliacoes_sinais(uuid[]) from anon;
grant execute on function public.avaliacoes_sinais(uuid[]) to authenticated, service_role;
