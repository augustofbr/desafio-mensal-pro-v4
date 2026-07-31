-- Task 9 · Fix round 2 — corrige breakage introduzido pela fix wave anterior
--
-- B-1 (Critical): `trinks_refresh_profissional_id_map` falhava em TODA invocação com
--   ERROR 42702: column reference "votos" is ambiguous
-- A fix wave havia renomeado o CTE de votação (`votos AS (... AS v)` -> `v AS (... AS votos)`),
-- e `votos` passou a colidir com o parâmetro OUT homônimo do RETURNS TABLE. É a MESMA armadilha
-- que a migration 120006 já havia corrigido com `id_pessoa` no dia 1.
--
-- Agravante: o nó do refresh no daily usa `onError: continueRegularOutput`, então o erro seria
-- engolido em silêncio — o sync ficaria verde e toda a correção C-1 (auto-cura do de-para) viraria
-- código morto sem ninguém perceber. Daí também a checagem (e) nova no watchdog.
--
-- Além do B-1, esta migration fecha dois concerns do próprio relatório, ambos com o mesmo modo de
-- falha (erro em runtime engolido pelo continueRegularOutput):
--   · concern 3: dois candidatos derivados disputando o mesmo E no mesmo ciclo estouravam o UNIQUE
--     de `id_estabelecimento` e derrubavam a função inteira. Agora o vencedor por votos entra e o
--     perdedor vai para quarentena ('disputa_mesmo_destino'). A função NUNCA aborta por UNIQUE.
--   · concern 2: o despejo do squatter era um DELETE silencioso. Agora deixa rastro em quarentena
--     ('squatter_despejado', já com `resolvido_em` preenchida — é registro, não pendência).

CREATE OR REPLACE FUNCTION public.trinks_refresh_profissional_id_map(
  p_dias integer DEFAULT 60,
  p_min_votos integer DEFAULT 2
)
RETURNS TABLE(acao text, id_pessoa bigint, id_estabelecimento bigint, votos integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- ############################################################################
  -- ARMADILHA JA PISADA DUAS VEZES (migration 120006 com `id_pessoa`; fix wave da
  -- Task 9 com `votos`): os QUATRO parametros OUT do RETURNS TABLE
  --     acao | id_pessoa | id_estabelecimento | votos
  -- sao variaveis plpgsql visiveis em TODO o corpo da funcao. Qualquer coluna com
  -- um desses nomes referenciada SEM qualificacao levanta 42702 em tempo de execucao
  -- -- e, com onError=continueRegularOutput no no do n8n, o daily engoliria isso
  -- em silencio. Regras deste corpo, portanto:
  --   1. colunas internas NUNCA usam esses 4 nomes (prefixos pid_*, n_votos, v_top);
  --   2. toda referencia a coluna real e qualificada por alias de tabela (m., a., e.).
  -- ############################################################################

  DROP TABLE IF EXISTS pg_temp._trinks_agg;
  CREATE TEMP TABLE _trinks_agg ON COMMIT DROP AS
  WITH tx AS (
    SELECT (t.raw_json->'cliente'->>'id')::bigint            AS cliente_id,
           (s->>'id')::bigint                                AS servico_id,
           (s->>'idProfissionalQueRealizouServico')::bigint  AS pid_p,
           (t.data_hora AT TIME ZONE 'America/Manaus')::date AS dia
    FROM financeiro_studiox_trinks_transacoes_mirror t,
         LATERAL jsonb_array_elements(t.servicos) s
    WHERE t.data_hora >= now() - make_interval(days => p_dias)
      AND s->>'idProfissionalQueRealizouServico' IS NOT NULL
  ),
  cand AS (
    SELECT x.pid_p, a.profissional_id AS pid_e, a.profissional_nome,
           count(*) OVER (PARTITION BY x.cliente_id, x.servico_id, x.dia) AS n_ag
    FROM tx x
    JOIN financeiro_studiox_trinks_agendamentos_mirror a
      ON a.cliente_id = x.cliente_id
     AND a.servico_id = x.servico_id
     AND (a.data_hora_inicio AT TIME ZONE 'America/Manaus')::date = x.dia
    WHERE a.profissional_id > 0
  ),
  vot AS (
    SELECT c.pid_p, c.pid_e, max(c.profissional_nome) AS nome, count(*)::int AS n_votos
    FROM cand c WHERE c.n_ag = 1 GROUP BY 1, 2
  ),
  agg AS (
    SELECT w.pid_p,
           count(*)                                         AS n_destinos,
           (array_agg(w.pid_e ORDER BY w.n_votos DESC))[1]  AS pid_e,
           (array_agg(w.nome  ORDER BY w.n_votos DESC))[1]  AS nome,
           max(w.n_votos)                                   AS v_top,
           sum(w.n_votos)::int                              AS v_tot
    FROM vot w GROUP BY 1
  )
  SELECT a.pid_p, a.n_destinos, a.pid_e, a.nome, a.v_top, a.v_tot,
         (SELECT jsonb_agg(jsonb_build_object('id_estabelecimento', x.pid_e, 'votos', x.n_votos))
            FROM vot x WHERE x.pid_p = a.pid_p) AS candidatos
  FROM agg a;

  -- Elegiveis + desempate por destino (concern 3).
  DROP TABLE IF EXISTS pg_temp._trinks_eleg;
  CREATE TEMP TABLE _trinks_eleg ON COMMIT DROP AS
  SELECT a.pid_p, a.pid_e, a.nome, a.v_top, a.v_tot,
         row_number() OVER (PARTITION BY a.pid_e ORDER BY a.v_top DESC, a.pid_p) AS rn
  FROM pg_temp._trinks_agg a
  WHERE a.n_destinos = 1 AND a.v_top >= p_min_votos;

  -- (1) quarentena original: ambiguidade ou votos insuficientes
  INSERT INTO trinks_profissional_id_map_quarentena (id_pessoa, candidatos, motivo)
  SELECT a.pid_p, a.candidatos,
         CASE WHEN a.n_destinos > 1 THEN 'ambiguo_multiplos_destinos'
              ELSE 'votos_insuficientes' END
  FROM pg_temp._trinks_agg a
  WHERE (a.n_destinos > 1 OR a.v_top < p_min_votos)
    AND NOT EXISTS (SELECT 1 FROM trinks_profissional_id_map m WHERE m.id_pessoa = a.pid_p);

  -- (2) perdedor da disputa pelo mesmo destino -> quarentena (a funcao NUNCA aborta)
  INSERT INTO trinks_profissional_id_map_quarentena (id_pessoa, candidatos, motivo)
  SELECT e.pid_p,
         jsonb_build_object(
           'proposto', jsonb_build_object('id_pessoa', e.pid_p, 'id_estabelecimento', e.pid_e,
                                          'votos', e.v_top, 'fonte', 'derivado_agenda'),
           'vencedor', (SELECT jsonb_build_object('id_pessoa', w.pid_p, 'votos', w.v_top)
                          FROM pg_temp._trinks_eleg w
                         WHERE w.pid_e = e.pid_e AND w.rn = 1)),
         'disputa_mesmo_destino'
  FROM pg_temp._trinks_eleg e
  WHERE e.rn > 1
    AND NOT EXISTS (
      SELECT 1 FROM trinks_profissional_id_map_quarentena q
       WHERE q.id_pessoa = e.pid_p AND q.motivo = 'disputa_mesmo_destino'
         AND q.resolvido_em IS NULL
         AND (q.candidatos->'proposto'->>'id_estabelecimento') = e.pid_e::text);

  -- (3) candidato barrado por destino de entrada CORROBORADA -> quarentena
  INSERT INTO trinks_profissional_id_map_quarentena (id_pessoa, candidatos, motivo)
  SELECT e.pid_p,
         jsonb_build_object(
           'proposto', jsonb_build_object('id_pessoa', e.pid_p, 'id_estabelecimento', e.pid_e,
                                          'votos', e.v_top, 'fonte', 'derivado_agenda'),
           'vigente',  jsonb_build_object('id_pessoa', m.id_pessoa, 'id_estabelecimento', e.pid_e,
                                          'votos', m.votos, 'fonte', m.fonte,
                                          'colisao', 'id_estabelecimento_ocupado')),
         'bijecao_bloqueada'
  FROM pg_temp._trinks_eleg e
  JOIN trinks_profissional_id_map m
    ON m.id_estabelecimento = e.pid_e AND m.id_pessoa <> e.pid_p AND m.votos > 0
  WHERE e.rn = 1
    AND NOT EXISTS (
      SELECT 1 FROM trinks_profissional_id_map_quarentena q
       WHERE q.id_pessoa = e.pid_p AND q.motivo = 'bijecao_bloqueada'
         AND q.resolvido_em IS NULL
         AND (q.candidatos->'proposto'->>'id_estabelecimento') = e.pid_e::text);

  -- (4) despejo do squatter de webhook nao corroborado, agora COM RASTRO (concern 2).
  -- Statement proprio: CTEs compartilham snapshot, o INSERT seguinte precisa ver a liberacao.
  WITH despejados AS (
    DELETE FROM trinks_profissional_id_map m
    USING pg_temp._trinks_eleg e
    WHERE m.id_estabelecimento = e.pid_e
      AND m.id_pessoa <> e.pid_p
      AND m.votos = 0
      AND m.fonte LIKE 'webhook%'
      AND e.rn = 1
      AND NOT EXISTS (SELECT 1 FROM trinks_profissional_id_map m2
                       WHERE m2.id_estabelecimento = e.pid_e
                         AND m2.id_pessoa <> e.pid_p
                         AND m2.votos > 0)
    RETURNING m.id_pessoa AS pid_despejado, m.id_estabelecimento AS pide_alvo,
              m.fonte AS fonte_despejada, m.nome_completo AS nome_despejado,
              e.pid_p AS pid_vencedor, e.v_top AS votos_vencedor
  )
  INSERT INTO trinks_profissional_id_map_quarentena (id_pessoa, candidatos, motivo, resolvido_em)
  SELECT d.pid_despejado,
         jsonb_build_object(
           'despejado', jsonb_build_object('id_pessoa', d.pid_despejado,
                                           'id_estabelecimento', d.pide_alvo,
                                           'fonte', d.fonte_despejada, 'nome', d.nome_despejado),
           'vencedor',  jsonb_build_object('id_pessoa', d.pid_vencedor,
                                           'id_estabelecimento', d.pide_alvo,
                                           'votos', d.votos_vencedor, 'fonte', 'derivado_agenda')),
         'squatter_despejado', now()
  FROM despejados d;

  -- (5) gravacao
  RETURN QUERY
  WITH aceitos AS (
    SELECT e.pid_p, e.pid_e, e.nome, e.v_top, e.v_tot
    FROM pg_temp._trinks_eleg e
    WHERE e.rn = 1
      AND NOT EXISTS (SELECT 1 FROM trinks_profissional_id_map m
                       WHERE m.id_estabelecimento = e.pid_e AND m.id_pessoa <> e.pid_p)
  ),
  gravado AS (
    INSERT INTO trinks_profissional_id_map AS m
      (id_pessoa, id_estabelecimento, nome_completo, apelido, fonte, votos, confianca)
    SELECT ac.pid_p, ac.pid_e, ac.nome,
           (SELECT pa.nome_profissional FROM profissionais_ativos pa
             WHERE pa."profissionalId" = ac.pid_e),
           'derivado_agenda', ac.v_top, ac.v_top::numeric / NULLIF(ac.v_tot, 0)
    FROM aceitos ac
    ON CONFLICT ON CONSTRAINT trinks_profissional_id_map_pkey DO UPDATE SET
      id_estabelecimento = EXCLUDED.id_estabelecimento,
      votos         = GREATEST(m.votos, EXCLUDED.votos),
      confianca     = EXCLUDED.confianca,
      nome_completo = COALESCE(EXCLUDED.nome_completo, m.nome_completo),
      apelido       = COALESCE(EXCLUDED.apelido,       m.apelido),
      fonte         = CASE WHEN m.votos = 0 AND m.fonte LIKE 'webhook%'
                           THEN 'derivado_agenda' ELSE m.fonte END,
      updated_at    = now()
    WHERE m.id_estabelecimento = EXCLUDED.id_estabelecimento
       OR (m.votos = 0 AND m.fonte LIKE 'webhook%')
    RETURNING (xmax = 0) AS inserido, m.id_pessoa AS pid_gravado,
              m.id_estabelecimento AS pide_gravado, m.votos AS n_votos_gravado
  ),
  resolvidos AS (
    UPDATE trinks_profissional_id_map_quarentena q
       SET resolvido_em = now()
      FROM gravado g
     WHERE q.id_pessoa = g.pid_gravado
       AND q.resolvido_em IS NULL
    RETURNING 1
  )
  SELECT CASE WHEN g.inserido THEN 'inserido' ELSE 'atualizado' END,
         g.pid_gravado, g.pide_gravado, g.n_votos_gravado
  FROM gravado g;
END $function$;

REVOKE ALL ON FUNCTION public.trinks_refresh_profissional_id_map(integer, integer)
  FROM PUBLIC, anon, authenticated;
