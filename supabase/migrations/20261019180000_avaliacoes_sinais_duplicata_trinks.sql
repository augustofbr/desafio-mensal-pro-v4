-- Estrelas do Google: duplicata tambem por grafia e pelo nome do Trinks (out/2026).
--
-- Caso real que motivou: estrela nova com Google "Nivea nivea" e Trinks "Nivia Terlucia De
-- Sousa" passou batida. No historico havia "Nivia nivia" (similarity 0,33) e "Nivia terlucia
-- (Nivia Nivia )" (0,18). A regra antiga (20261019120100) era so: nome do Google normalizado
-- igual ou similarity >= 0,7. Esta migracao acrescenta dois criterios a public.avaliacoes_sinais
-- (mesma assinatura, retorno, SECURITY INVOKER, search_path vazio, teto de 300 ids; o caminho
-- "Atendida?" fica intocado).
--
--   Criterio A - grafia (Google x Google)
--     public.avaliacao_chave_grafia(texto_ja_normalizado):
--       remove 'h'; translate(..., 'eoyzwk', 'iuisvc'); colapsa letras repetidas.
--       regexp_replace(translate(replace(g,'h',''), 'eoyzwk', 'iuisvc'), '(.)\1+', '\1', 'g')
--     Duplicata se similarity(chave(o.google_n), chave(s.google_n)) >= 0.7 (chaves nao vazias),
--     alem do criterio antigo.
--     Calibracao (so leitura, 2026-10-19): +15 pares de nomes no historico alem dos 35 que o
--     criterio antigo ja pegava; 13 eram a mesma pessoa (Joice/Joyce Queiroz, Susana/Suzana,
--     Nivea/Nivia, Andrea/Andreia, Andressa/Andreza, Ericka/Erika Alves...) e 2 falsos
--     ("lene" x "liline", "isabele" x "kelly isabelly").
--
--   Criterio B - cruzado: nome do TRINKS da estrela-alvo x nome do GOOGLE das outras estrelas
--     So nessa direcao (decisao do dono) e so quando a alvo tem nome_cliente_trinks real
--     (nao vazio apos btrim). NAO usa o trinks_n do caminho "Atendida?", que cai para o nome do
--     Google em estrela legada.
--     public.avaliacao_palavras_nome(texto): do nome normalizado, tudo que nao e [a-z ] vira
--     espaco; divide por espaco; aplica a chave de grafia em cada palavra; mantem as de
--     comprimento >= 3; remove stopwords (comparadas ja dobradas pela chave); distintas.
--     Stopwords (campo do Google no legado traz anotacoes tipo "no sistema X, no google Y, a
--     filha que fez..."): sistema, siste, google, cliente, nome, mesma, mesmo, atendimento,
--     atendida, filha, filho, irma, irmao, amiga, amigo, comanda, agenda, esta, estara, estava,
--     consta, constara, somente, apenas, primeiro, tambem, procedimento, studio, contato, nela,
--     dela, dele, tive, marido, esposa, namorada, perfil, conta, celular, comentario, que, fez,
--     fiz, sem, mae, nao, com, por, dra, obs, dos, das, del.
--     Raridade: frequencia de uma palavra = numero de nomes de cliente DISTINTOS (normalizados)
--     de trinks_services.client_name que a contem. Rara = frequencia <= 3 (LIMIAR_RARA);
--     palavra ausente da base = 0 = rara. A frequencia so e calculada para as palavras dos
--     Trinks das estrelas pedidas (e so se houver alguma).
--     Match: P = palavras(Trinks da alvo), Q = palavras(Google da outra), C = P intersecao Q.
--     Duplicata se C nao e vazio E |C| = least(|P|,|Q|) (o nome mais curto inteiro contido no
--     outro) E ha palavra rara em C.
--     Caso real: Trinks "nivia terlucia de sousa" -> {nivia, tirlucia, susa}; "nivia nivia" ->
--     {nivia} contido (nivia: 2 clientes); "nivia terlucia (nivia nivia )" -> {nivia, tirlucia}
--     contido. Calibracao (simulacao Google x Google no historico): 58 pares, quase todos a
--     mesma pessoa. Em 2026-10-19, com Trinks x Google, alem de A e do criterio antigo, so 1
--     par ordenado novo (os demais ja eram pegos).
--
--   Saida: cada item de duplicatas ganha "motivo": 'nome_google' (criterio antigo ou A) ou
--     'nome_trinks' (so B). Se os dois, 'nome_google'. Mantem: nunca a propria estrela, max. 5,
--     mais recentes primeiro, demais campos iguais. Nome do Google vazio da alvo desliga so os
--     criterios Google; o B segue valendo.
--
-- Custo: as palavras das outras estrelas sao calculadas uma vez (CTE materializada); a
-- frequencia usa os ~2.200 nomes distintos do espelho, uma vez por chamada.
--
-- As funcoes auxiliares sao immutable, search_path vazio, EXECUTE so para authenticated e
-- service_role (a RPC e SECURITY INVOKER e roda como authenticated; anon e public revogados).
--
-- Depende de 20261019120000 (avaliacao_normalizar_nome) e 20261019120100 (a RPC). Aditiva e
-- idempotente (create or replace).
--
-- Rollback: reaplicar o corpo de public.avaliacoes_sinais de 20261019120100_avaliacoes_sinais.sql
-- (create or replace) e depois:
--   drop function if exists public.avaliacao_palavras_nome(text);
--   drop function if exists public.avaliacao_chave_grafia(text);

create or replace function public.avaliacao_chave_grafia(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.regexp_replace(
           pg_catalog.translate(pg_catalog.replace(p, 'h', ''), 'eoyzwk', 'iuisvc'),
           '(.)\1+', '\1', 'g')
$$;

comment on function public.avaliacao_chave_grafia(text) is
  'Chave de grafia de um nome JA normalizado (avaliacao_normalizar_nome): sem h, e/o/y/z/w/k dobrados em i/u/i/s/v/c e letras repetidas colapsadas. Usada na duplicata das estrelas.';

-- Stopwords ja dobradas pela chave de grafia (ex.: sistema -> sistima, que -> qui).
create or replace function public.avaliacao_palavras_nome(p text)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(s.k order by s.k), array[]::text[])
  from (
    select distinct public.avaliacao_chave_grafia(x) as k
    from pg_catalog.unnest(
           pg_catalog.string_to_array(
             pg_catalog.regexp_replace(public.avaliacao_normalizar_nome(p), '[^a-z ]', ' ', 'g'),
             ' ')) as x
  ) s
  where pg_catalog.length(s.k) >= 3
    and s.k <> all (array[
      'aginda', 'amiga', 'amigu', 'apinas', 'atindida', 'atindimintu', 'cilular', 'clinti',
      'cum', 'cumanda', 'cumintariu', 'cunsta', 'cunstara', 'cunta', 'cuntatu', 'das', 'dil',
      'dila', 'dili', 'dra', 'dus', 'fila', 'filu', 'fis', 'gugli', 'irma', 'irmau', 'ispusa',
      'ista', 'istara', 'istava', 'mai', 'maridu', 'misma', 'mismu', 'namurada', 'nau', 'nila',
      'numi', 'pirfil', 'primiru', 'prucidimintu', 'pur', 'qui', 'sim', 'sisti', 'sistima',
      'studiu', 'suminti', 'tambim', 'tivi', 'ubs'
    ]::text[])
$$;

comment on function public.avaliacao_palavras_nome(text) is
  'Palavras distintas de um nome (normalizado, so [a-z], chave de grafia, comprimento >= 3, sem stopwords) como text[] ordenado. Usada na duplicata das estrelas pelo nome do Trinks.';

revoke all on function public.avaliacao_chave_grafia(text) from public, anon;
revoke all on function public.avaliacao_palavras_nome(text) from public, anon;
grant execute on function public.avaliacao_chave_grafia(text) to authenticated, service_role;
grant execute on function public.avaliacao_palavras_nome(text) to authenticated, service_role;

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
           public.avaliacao_normalizar_nome(o.nome_cliente) as google_n
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
  nomes_espelho as materialized (
    select distinct public.avaliacao_normalizar_nome(t.client_name) as nome_n
    from public.trinks_services t
    where t.client_name is not null
      and exists (select 1 from palavras_alvo)
  ),
  freq as (
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
             case when m.via_google then 'nome_google' else 'nome_trinks' end as motivo
      from todas o
      cross join lateral (
        select
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
        and (m.via_google or m.via_trinks)
      order by o.data_hora_cadastro desc nulls last, o.id
      limit 5
    ) x
  ) dup;
end
$$;

comment on function public.avaliacoes_sinais(uuid[]) is
  'Sinais da fila de aprovacao por estrela (max. 300 ids): atendida (atendida|provavel|aguardando_espelho|nao_encontrada, cruzando com trinks_services da mesma profissional) e duplicatas (ate 5 outras estrelas: nome do Google igual, similarity >= 0.7 ou chave de grafia similar >= 0.7 [motivo nome_google]; ou nome do Trinks da estrela contido no nome do Google da outra com palavra rara [motivo nome_trinks]). SECURITY INVOKER, search_path vazio. EXECUTE: authenticated e service_role (anon e public revogados).';

revoke all on function public.avaliacoes_sinais(uuid[]) from public;
revoke all on function public.avaliacoes_sinais(uuid[]) from anon;
grant execute on function public.avaliacoes_sinais(uuid[]) to authenticated, service_role;
