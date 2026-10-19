-- Estrelas do Google: duplicata tambem por MESMA CLIENTE NO TRINKS (out/2026).
--
-- Caso: duas profissionais atendem a mesma cliente; cada uma cadastra uma estrela escolhendo a
-- MESMA cliente no Trinks, mas escreve nomes do Google diferentes (ou totalmente diferentes).
-- Nenhum criterio anterior pega (Google x Google nao bate; Trinks x Google nao bate). O dono
-- confere no Google e decide qual aprovar. Esta migracao acrescenta o criterio C a
-- public.avaliacoes_sinais (mesma assinatura, retorno, SECURITY INVOKER, search_path vazio,
-- teto de 300 ids; "Atendida?" e os criterios anteriores ficam intocados; o corpo parte
-- exatamente do de 20261019180000).
--
--   Criterio C - mesma cliente no Trinks (Trinks x Trinks)
--     Para a estrela-alvo s e cada outra estrela o (qualquer status, mes ou profissional; nunca
--     a propria), duplicata se:
--       - s e o tem cliente_trinks_id nao nulo -> ids iguais (e entao o nome NAO e olhado: ids
--         diferentes = clientes diferentes, mesmo com nome igual);
--       - senao, se as duas tem nome do Trinks real (nao vazio apos btrim) ->
--         avaliacao_normalizar_nome dos dois nomes do Trinks iguais (igualdade exata apos
--         normalizar: sem chave de grafia e sem similarity).
--     "Senao" inclui o caso de so UMA ter id: ai vale o nome. O nome do Google nao entra.
--
--   Regra completa da duplicata (todos os criterios; basta um):
--     (1) nome: Google da alvo x Google da outra, normalizados, iguais ou similarity >= 0.7;
--     (2) grafia: similarity >= 0.7 entre as chaves de avaliacao_chave_grafia dos dois;
--     (3) nome_trinks: Trinks da alvo (so se real) x Google da outra, palavras do nome mais
--         curto todas no outro e ao menos uma rara (<= 3 nomes de cliente no espelho);
--     (4) mesma cliente no Trinks (C, acima).
--     (1)/(2) = motivo nome_google, (3) = nome_trinks, (4) = mesma_cliente_trinks. Nome do
--     Google vazio da alvo desliga so (1) e (2). As constantes (0.7, 3, stopwords) seguem em
--     20261019180000 e neste corpo (LIMIAR_DUP, LIMIAR_RARA).
--
--   Saida: cada item de duplicatas traz "motivo". Precedencia quando mais de um criterio casa
--     (e FORCA para o teto de 5): mesma_cliente_trinks > nome_google > nome_trinks. Maximo 5
--     itens, nunca a propria estrela: as 5 sao escolhidas por forca e depois por recencia (para
--     que candidatas mais novas de motivo mais fraco nao cortem uma mais forte); a ordem de
--     EXIBICAO no jsonb e por recencia (mais recente primeiro). Demais campos iguais.
--
-- Custo: so acrescenta duas colunas (cliente_trinks_id e o nome do Trinks normalizado) na CTE
-- materializada das outras estrelas e uma comparacao por par.
--
-- Depende de 20261019120000, 20261019120100 e 20261019180000. Aditiva e idempotente (create or
-- replace).
--
-- Rollback: reaplicar o corpo de public.avaliacoes_sinais de
-- 20261019180000_avaliacoes_sinais_duplicata_trinks.sql (create or replace). Nada a dropar.

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
             coalesce(nullif(pg_catalog.btrim(a.nome_cliente_trinks), ''), a.nome_cliente)) as trinks_n,
           -- nome do Trinks REAL (NULL se vazio): base do criterio B da duplicata
           public.avaliacao_normalizar_nome(nullif(pg_catalog.btrim(a.nome_cliente_trinks), '')) as trinks_real_n
    from public.avaliacoes_cadastradas a
    cross join params pr
    where a.id = any (p_ids)
  ),
  alvo as (
    select b.*,
           least(b.dia_cadastro, b.hoje) as fim,
           (pg_catalog.strpos(b.trinks_n, ' ') = 0) as uma_palavra,
           public.avaliacao_chave_grafia(b.google_n) as google_k,
           public.avaliacao_palavras_nome(b.trinks_real_n) as trinks_pal
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
  -- Duplicatas: nomes do Google de todas as estrelas, normalizados uma vez so (com a chave
  -- de grafia e as palavras, para os criterios A e B).
  todas0 as materialized (
    select o.id, o.nome_profissional, o.nome_cliente, o.status, o.data_hora_cadastro,
           o.cliente_trinks_id,
           public.avaliacao_normalizar_nome(o.nome_cliente) as google_n,
           -- nome do Trinks REAL normalizado (NULL se vazio): base do criterio C
           public.avaliacao_normalizar_nome(nullif(pg_catalog.btrim(o.nome_cliente_trinks), '')) as trinks_real_n
    from public.avaliacoes_cadastradas o
  ),
  todas as materialized (
    select t0.*,
           public.avaliacao_chave_grafia(t0.google_n) as google_k,
           public.avaliacao_palavras_nome(t0.google_n) as pal
    from todas0 t0
  ),
  -- Criterio B: frequencia (nomes de cliente distintos no espelho) so das palavras dos Trinks
  -- das estrelas pedidas; nada e calculado se nenhuma tem nome do Trinks real.
  palavras_alvo as materialized (
    select distinct w.w
    from alvo al
    cross join lateral pg_catalog.unnest(al.trinks_pal) as w(w)
  ),
  -- so nomes do espelho cuja chave de grafia contem (substring) alguma palavra-alvo: o
  -- pre-filtro e um superconjunto (a chave de uma palavra e substring da chave do nome
  -- inteiro); a conferencia exata por palavra vem depois, so nesses nomes.
  -- a chave de cada nome e calculada UMA vez (CTE materializada = barreira: sem ela o
  -- planner recalcula a chave por par nome x palavra)
  nomes_k as materialized (
    select d.nome_n, public.avaliacao_chave_grafia(d.nome_n) as nome_k
    from (
      select distinct public.avaliacao_normalizar_nome(t.client_name) as nome_n
      from public.trinks_services t
      where t.client_name is not null
        and exists (select 1 from palavras_alvo)
    ) d
  ),
  nomes_espelho as materialized (
    select n.nome_n
    from nomes_k n
    where exists (
      select 1 from palavras_alvo pa
      where pg_catalog.strpos(n.nome_k, pa.w) > 0)
  ),
  freq as materialized (
    select pa.w, pg_catalog.count(*) as n
    from palavras_alvo pa
    join (
      select ne.nome_n, u.w
      from nomes_espelho ne
      cross join lateral pg_catalog.unnest(public.avaliacao_palavras_nome(ne.nome_n)) as u(w)
    ) nw on nw.w = pa.w
    group by pa.w
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
                 'data_hora_cadastro', x.data_hora_cadastro,
                 'motivo', x.motivo)
               order by x.data_hora_cadastro desc nulls last, x.id),
             '[]'::jsonb) as lista
    from (
      select o.id, o.nome_profissional, o.nome_cliente, o.status, o.data_hora_cadastro,
             case when m.via_cliente then 'mesma_cliente_trinks'
                  when m.via_google  then 'nome_google'
                  else 'nome_trinks' end as motivo
      from todas o
      cross join lateral (
        select
          -- criterio C: mesma cliente no Trinks (Trinks x Trinks). Com id nos dois lados, so o
          -- id vale (ids diferentes = clientes diferentes, mesmo com nome igual); senao, nome
          -- do Trinks real dos dois, igual apos normalizar (sem chave de grafia nem similarity)
          coalesce(
            case when s.cliente_trinks_id is not null and o.cliente_trinks_id is not null
                 then s.cliente_trinks_id = o.cliente_trinks_id
                 else coalesce(s.trinks_real_n, '') <> '' and s.trinks_real_n = o.trinks_real_n
            end, false) as via_cliente,
          -- criterio antigo + A (grafia); nome do Google vazio da alvo desliga so estes
          (s.google_n <> ''
           and (o.google_n = s.google_n
                or public.similarity(o.google_n, s.google_n) >= 0.7            -- LIMIAR_DUP
                or (s.google_k <> '' and o.google_k <> ''
                    and public.similarity(o.google_k, s.google_k) >= 0.7))) as via_google,
          -- criterio B: Trinks da alvo x Google da outra (so com nome do Trinks real)
          (pg_catalog.cardinality(s.trinks_pal) > 0
           and s.trinks_pal operator(pg_catalog.&&) o.pal   -- barato: so entao calcula a raridade
           and coalesce((
                 select pg_catalog.count(*) > 0
                        and pg_catalog.count(*) = least(pg_catalog.cardinality(s.trinks_pal),
                                                        pg_catalog.cardinality(o.pal))
                        and coalesce(pg_catalog.bool_or(coalesce(f.n, 0) <= 3), false)  -- LIMIAR_RARA
                 from pg_catalog.unnest(s.trinks_pal) as u(w)
                 left join freq f on f.w = u.w
                 where u.w = any (o.pal)), false)) as via_trinks
      ) m
      where o.id <> s.id
        and (m.via_cliente or m.via_google or m.via_trinks)
      -- as 5 mais fortes (mesma cliente no Trinks > nome do Google > so-Trinks), depois as
      -- mais recentes; a exibicao no jsonb (acima) volta a ser por recencia
      order by case when m.via_cliente then 3 when m.via_google then 2 else 1 end desc,
               o.data_hora_cadastro desc nulls last, o.id
      limit 5
    ) x
  ) dup;
end
$$;

comment on function public.avaliacoes_sinais(uuid[]) is
  'Sinais da fila de aprovacao por estrela (max. 300 ids): atendida (atendida|provavel|aguardando_espelho|nao_encontrada, cruzando com trinks_services da mesma profissional) e duplicatas (ate 5 outras estrelas, qualquer status/mes/profissional). Motivos, do mais forte ao mais fraco: mesma_cliente_trinks (mesmo cliente_trinks_id nas duas; sem id em uma delas, nome do Trinks real igual apos normalizar); nome_google (nome do Google igual, similarity >= 0.7 ou chave de grafia similar >= 0.7); nome_trinks (nome do Trinks da estrela contido no nome do Google da outra, com palavra rara). As 5 saem por forca e depois recencia; a lista sai por recencia. SECURITY INVOKER, search_path vazio. EXECUTE: authenticated e service_role (anon e public revogados).';

revoke all on function public.avaliacoes_sinais(uuid[]) from public;
revoke all on function public.avaliacoes_sinais(uuid[]) from anon;
grant execute on function public.avaliacoes_sinais(uuid[]) to authenticated, service_role;
