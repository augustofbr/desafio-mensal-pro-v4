CREATE OR REPLACE FUNCTION public.trinks_refresh_profissional_id_map(
  p_dias      integer DEFAULT 60,
  p_min_votos integer DEFAULT 2
) RETURNS TABLE (acao text, id_pessoa bigint, id_estabelecimento bigint, votos integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
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
  cand AS (   -- só matches ÚNICOS: exatamente 1 agendamento para (cliente, serviço, dia)
    SELECT x.pid_p, a.profissional_id AS pid_e, a.profissional_nome,
           count(*) OVER (PARTITION BY x.cliente_id, x.servico_id, x.dia) AS n_ag
    FROM tx x
    JOIN financeiro_studiox_trinks_agendamentos_mirror a
      ON a.cliente_id = x.cliente_id
     AND a.servico_id = x.servico_id
     AND (a.data_hora_inicio AT TIME ZONE 'America/Manaus')::date = x.dia
    WHERE a.profissional_id > 0
  ),
  votos AS (
    SELECT pid_p, pid_e, max(profissional_nome) AS nome, count(*)::int AS v
    FROM cand WHERE n_ag = 1 GROUP BY 1, 2
  ),
  agg AS (
    SELECT pid_p,
           count(*)                              AS n_destinos,
           (array_agg(pid_e ORDER BY v DESC))[1] AS pid_e,
           (array_agg(nome  ORDER BY v DESC))[1] AS nome,
           max(v)                                AS v_top,
           sum(v)::int                           AS v_tot
    FROM votos GROUP BY 1
  ),
  quarentena AS (
    INSERT INTO trinks_profissional_id_map_quarentena (id_pessoa, candidatos, motivo)
    SELECT a.pid_p,
           (SELECT jsonb_agg(jsonb_build_object('id_estabelecimento', v.pid_e, 'votos', v.v))
              FROM votos v WHERE v.pid_p = a.pid_p),
           CASE WHEN a.n_destinos > 1 THEN 'ambiguo_multiplos_destinos'
                ELSE 'votos_insuficientes' END
    FROM agg a
    WHERE (a.n_destinos > 1 OR a.v_top < p_min_votos)
      AND NOT EXISTS (SELECT 1 FROM trinks_profissional_id_map m WHERE m.id_pessoa = a.pid_p)
    RETURNING 1
  ),
  aceitos AS (
    SELECT a.pid_p, a.pid_e, a.nome, a.v_top, a.v_tot
    FROM agg a
    WHERE a.n_destinos = 1 AND a.v_top >= p_min_votos
      AND NOT EXISTS (   -- trava de bijeção: destino já usado por outra origem
        SELECT 1 FROM trinks_profissional_id_map m
        WHERE m.id_estabelecimento = a.pid_e AND m.id_pessoa <> a.pid_p)
  ),
  gravado AS (
    INSERT INTO trinks_profissional_id_map AS m
      (id_pessoa, id_estabelecimento, nome_completo, apelido, fonte, votos, confianca)
    SELECT ac.pid_p, ac.pid_e, ac.nome,
           (SELECT pa.nome_profissional FROM profissionais_ativos pa
             WHERE pa."profissionalId" = ac.pid_e),
           'derivado_agenda', ac.v_top, ac.v_top::numeric / NULLIF(ac.v_tot, 0)
    FROM aceitos ac
    -- fix 2026-07-29: ON CONFLICT ON CONSTRAINT evita colisão com a variável OUT id_pessoa (RETURNS TABLE)
    ON CONFLICT ON CONSTRAINT trinks_profissional_id_map_pkey DO UPDATE SET
      votos         = GREATEST(m.votos, EXCLUDED.votos),
      confianca     = EXCLUDED.confianca,
      nome_completo = COALESCE(EXCLUDED.nome_completo, m.nome_completo),
      apelido       = COALESCE(EXCLUDED.apelido,       m.apelido),  -- nunca apaga apelido histórico
      updated_at    = now()
    WHERE m.id_estabelecimento = EXCLUDED.id_estabelecimento        -- só atualiza se o destino não mudou
    RETURNING (xmax = 0) AS inserido, m.id_pessoa, m.id_estabelecimento, m.votos
  )
  SELECT CASE WHEN g.inserido THEN 'inserido' ELSE 'atualizado' END,
         g.id_pessoa, g.id_estabelecimento, g.votos
  FROM gravado g;
END $$;

REVOKE ALL ON FUNCTION public.trinks_refresh_profissional_id_map(integer, integer) FROM PUBLIC, anon, authenticated;
