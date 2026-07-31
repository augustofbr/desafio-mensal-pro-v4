-- Task 9 · Fix wave pós-review — reversibilidade do par vindo do webhook
--
-- C-1 (Critical, provado pelo revisor): um par gravado pelo webhook era IRREVERSÍVEL.
--   (a) `trinks_refresh_profissional_id_map` não trocava o destino divergente — o
--       `ON CONFLICT ... WHERE m.id_estabelecimento = EXCLUDED.id_estabelecimento` barrava o
--       UPDATE, e o SET nem sequer atualizava a coluna;
--   (b) o candidato cujo destino estava ocupado era descartado pela trava de bijeção em
--       SILÊNCIO, sem quarentena.
-- Resultado: uma escrita ruim (ataque OU erro legítimo de payload) fixava um profissional com
-- `profissionalid` inexistente em `profissionais_ativos` — sumia do ranking e da premiação, para
-- sempre, e o alerta se calava em 24h. Há prêmio em dinheiro atrelado.
--
-- Princípio adotado: **evidência corroborada vence evidência única**. O par derivado (≥2 votos
-- de agendamentos independentes) é soberano sobre um par de webhook nunca corroborado
-- (`votos = 0 AND fonte LIKE 'webhook%'`). O webhook mantém toda a instantaneidade; o que ele
-- perde é o direito de ser permanente sem corroboração.

-- ---------------------------------------------------------------------------
-- I-2 — quarentena ganha estado de resolução
-- ---------------------------------------------------------------------------
-- Antes o watchdog olhava uma janela de 24h: um conflito ignorado por um dia parava de alertar
-- embora o mapa seguisse errado. Agora alerta enquanto houver conflito ABERTO.
ALTER TABLE public.trinks_profissional_id_map_quarentena
  ADD COLUMN IF NOT EXISTS resolvido_em timestamptz NULL;

COMMENT ON COLUMN public.trinks_profissional_id_map_quarentena.resolvido_em IS
  'NULL = conflito aberto (o watchdog alerta enquanto for NULL). Preenchido automaticamente '
  'quando a derivação grava um par para o mesmo id_pessoa, ou manualmente por quem resolver.';

CREATE INDEX IF NOT EXISTS idx_trinks_map_quarentena_aberta
  ON public.trinks_profissional_id_map_quarentena (id_pessoa)
  WHERE resolvido_em IS NULL;

-- ---------------------------------------------------------------------------
-- C-1 — derivação passa a corrigir e a denunciar
-- ---------------------------------------------------------------------------
-- Mudança estrutural: o despejo do "squatter" precisa ser um STATEMENT ANTERIOR ao INSERT.
-- CTEs de um mesmo comando compartilham snapshot, então um DELETE em CTE não seria visto pelo
-- INSERT e a troca de destino estouraria o UNIQUE de id_estabelecimento. Por isso o corpo agora
-- materializa os candidatos numa temp table e executa os passos em sequência.
CREATE OR REPLACE FUNCTION public.trinks_refresh_profissional_id_map(
  p_dias integer DEFAULT 60,
  p_min_votos integer DEFAULT 2
)
RETURNS TABLE(acao text, id_pessoa bigint, id_estabelecimento bigint, votos integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- Candidatos materializados (mesma lógica de sempre: só matches ÚNICOS por cliente/serviço/dia).
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
  v AS (
    SELECT pid_p, pid_e, max(profissional_nome) AS nome, count(*)::int AS votos
    FROM cand WHERE n_ag = 1 GROUP BY 1, 2
  ),
  agg AS (
    SELECT pid_p,
           count(*)                                  AS n_destinos,
           (array_agg(pid_e ORDER BY votos DESC))[1] AS pid_e,
           (array_agg(nome  ORDER BY votos DESC))[1] AS nome,
           max(votos)                                AS v_top,
           sum(votos)::int                           AS v_tot
    FROM v GROUP BY 1
  )
  SELECT a.pid_p, a.n_destinos, a.pid_e, a.nome, a.v_top, a.v_tot,
         (SELECT jsonb_agg(jsonb_build_object('id_estabelecimento', x.pid_e, 'votos', x.votos))
            FROM v x WHERE x.pid_p = a.pid_p) AS candidatos
  FROM agg a;

  -- (1) Quarentena original: ambiguidade ou votos insuficientes, só para P ainda não mapeado.
  INSERT INTO trinks_profissional_id_map_quarentena (id_pessoa, candidatos, motivo)
  SELECT a.pid_p, a.candidatos,
         CASE WHEN a.n_destinos > 1 THEN 'ambiguo_multiplos_destinos'
              ELSE 'votos_insuficientes' END
  FROM pg_temp._trinks_agg a
  WHERE (a.n_destinos > 1 OR a.v_top < p_min_votos)
    AND NOT EXISTS (SELECT 1 FROM trinks_profissional_id_map m WHERE m.id_pessoa = a.pid_p);

  -- (2) C-1(b): candidato barrado pela trava de bijeção agora VIRA QUARENTENA.
  -- Antes esse descarte era mudo — lacuna que já existia e que a Task 9 tornou explorável.
  -- Só destino ocupado por entrada CORROBORADA (votos > 0) barra de verdade.
  -- Dedup por conflito ABERTO (não por dia): a derivação roda diariamente e geraria spam.
  INSERT INTO trinks_profissional_id_map_quarentena (id_pessoa, candidatos, motivo)
  SELECT a.pid_p,
         jsonb_build_object(
           'proposto', jsonb_build_object('id_pessoa', a.pid_p, 'id_estabelecimento', a.pid_e,
                                          'votos', a.v_top, 'fonte', 'derivado_agenda'),
           'vigente',  jsonb_build_object('id_pessoa', m.id_pessoa, 'id_estabelecimento', a.pid_e,
                                          'votos', m.votos, 'fonte', m.fonte,
                                          'colisao', 'id_estabelecimento_ocupado')),
         'bijecao_bloqueada'
  FROM pg_temp._trinks_agg a
  JOIN trinks_profissional_id_map m
    ON m.id_estabelecimento = a.pid_e AND m.id_pessoa <> a.pid_p AND m.votos > 0
  WHERE a.n_destinos = 1 AND a.v_top >= p_min_votos
    AND NOT EXISTS (
      SELECT 1 FROM trinks_profissional_id_map_quarentena q
       WHERE q.id_pessoa = a.pid_p
         AND q.motivo = 'bijecao_bloqueada'
         AND q.resolvido_em IS NULL
         AND (q.candidatos->'proposto'->>'id_estabelecimento') = a.pid_e::text);

  -- (3) C-1(a) parte 1: o squatter de webhook NÃO corroborado cede o destino.
  -- Statement próprio (não CTE) para que o INSERT seguinte enxergue a liberação e não colida
  -- com o UNIQUE de id_estabelecimento.
  DELETE FROM trinks_profissional_id_map m
  USING pg_temp._trinks_agg a
  WHERE m.id_estabelecimento = a.pid_e
    AND m.id_pessoa <> a.pid_p
    AND m.votos = 0
    AND m.fonte LIKE 'webhook%'
    AND a.n_destinos = 1
    AND a.v_top >= p_min_votos
    AND NOT EXISTS (SELECT 1 FROM trinks_profissional_id_map m2
                     WHERE m2.id_estabelecimento = a.pid_e
                       AND m2.id_pessoa <> a.pid_p
                       AND m2.votos > 0);

  -- (4) Gravação + C-1(a) parte 2: o UPDATE agora pode TROCAR o destino quando a linha guardada
  -- for de webhook sem corroboração. Para os demais casos o WHERE original continua valendo.
  RETURN QUERY
  WITH aceitos AS (
    SELECT a.pid_p, a.pid_e, a.nome, a.v_top, a.v_tot
    FROM pg_temp._trinks_agg a
    WHERE a.n_destinos = 1 AND a.v_top >= p_min_votos
      AND NOT EXISTS (   -- após o passo (3), o que sobra ocupando é corroborado
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
    ON CONFLICT ON CONSTRAINT trinks_profissional_id_map_pkey DO UPDATE SET
      id_estabelecimento = EXCLUDED.id_estabelecimento,   -- C-1(a): sem isto o destino nunca troca
      votos         = GREATEST(m.votos, EXCLUDED.votos),
      confianca     = EXCLUDED.confianca,
      nome_completo = COALESCE(EXCLUDED.nome_completo, m.nome_completo),
      apelido       = COALESCE(EXCLUDED.apelido,       m.apelido),
      fonte         = CASE WHEN m.votos = 0 AND m.fonte LIKE 'webhook%'
                           THEN 'derivado_agenda' ELSE m.fonte END,
      updated_at    = now()
    WHERE m.id_estabelecimento = EXCLUDED.id_estabelecimento
       OR (m.votos = 0 AND m.fonte LIKE 'webhook%')       -- par webhook não corroborado cede
    RETURNING (xmax = 0) AS inserido, m.id_pessoa, m.id_estabelecimento, m.votos
  ),
  resolvidos AS (   -- I-2: derivação gravou a verdade para este P -> conflito pendente encerrado
    UPDATE trinks_profissional_id_map_quarentena q
       SET resolvido_em = now()
      FROM gravado g
     WHERE q.id_pessoa = g.id_pessoa
       AND q.resolvido_em IS NULL
    RETURNING 1
  )
  SELECT CASE WHEN g.inserido THEN 'inserido' ELSE 'atualizado' END,
         g.id_pessoa, g.id_estabelecimento, g.votos
  FROM gravado g;
END $function$;

REVOKE ALL ON FUNCTION public.trinks_refresh_profissional_id_map(integer, integer)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- I-1 — webhook não reescreve nome de entrada derivada · M-2 — dia em America/Manaus
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trinks_map_upsert_par(
  p_id_pessoa          bigint,
  p_id_estabelecimento bigint,
  p_nome               text DEFAULT NULL,
  p_fonte              text DEFAULT 'webhook_profissional'
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_destino_atual bigint;
  v_dono_destino  bigint;
  v_candidato     jsonb;
BEGIN
  IF p_fonte NOT IN ('webhook_profissional', 'webhook_fechamento') THEN
    RAISE EXCEPTION 'trinks_map_upsert_par: fonte invalida %, esperado webhook_profissional ou webhook_fechamento', p_fonte;
  END IF;

  IF p_id_pessoa IS NULL OR p_id_estabelecimento IS NULL
     OR p_id_pessoa <= 0 OR p_id_estabelecimento <= 0 THEN
    RETURN 'ignorado';
  END IF;

  SELECT id_estabelecimento INTO v_destino_atual
    FROM trinks_profissional_id_map WHERE id_pessoa = p_id_pessoa;

  SELECT id_pessoa INTO v_dono_destino
    FROM trinks_profissional_id_map WHERE id_estabelecimento = p_id_estabelecimento;

  IF v_destino_atual IS NOT NULL AND v_destino_atual = p_id_estabelecimento THEN
    -- I-1: em entrada DERIVADA o webhook só PREENCHE nome vazio, nunca reescreve.
    -- O caminho 'confirmado' era um primitivo de injeção: para as entradas sem `apelido`,
    -- `trinks_apply_snapshot` resolve o nome exibido via COALESCE(apelido, pa.nome, nome_completo)
    -- — ou seja, o texto injetado chegava ao dashboard.
    UPDATE trinks_profissional_id_map
       SET nome_completo = CASE
             WHEN fonte = 'derivado_agenda'
               THEN COALESCE(nome_completo, NULLIF(btrim(p_nome), ''))
               ELSE COALESCE(NULLIF(btrim(p_nome), ''), nome_completo)
           END,
           updated_at = now()
     WHERE id_pessoa = p_id_pessoa;
    RETURN 'confirmado';
  END IF;

  IF v_destino_atual IS NOT NULL OR v_dono_destino IS NOT NULL THEN
    v_candidato := jsonb_build_object(
      'proposto', jsonb_build_object(
        'id_pessoa',          p_id_pessoa,
        'id_estabelecimento', p_id_estabelecimento,
        'nome',               NULLIF(btrim(p_nome), ''),
        'fonte',              p_fonte),
      'vigente', CASE
        WHEN v_destino_atual IS NOT NULL THEN
          jsonb_build_object('id_pessoa', p_id_pessoa,
                             'id_estabelecimento', v_destino_atual,
                             'colisao', 'id_pessoa_ja_mapeado')
        ELSE
          jsonb_build_object('id_pessoa', v_dono_destino,
                             'id_estabelecimento', p_id_estabelecimento,
                             'colisao', 'id_estabelecimento_ocupado')
      END
    );

    -- M-2: o dia é o de America/Manaus, como o resto do projeto (era UTC).
    IF NOT EXISTS (
      SELECT 1
        FROM trinks_profissional_id_map_quarentena q
       WHERE q.id_pessoa = p_id_pessoa
         AND q.motivo    = 'conflito_webhook'
         AND (q.candidatos -> 'proposto' ->> 'id_estabelecimento') = p_id_estabelecimento::text
         AND q.detectado_em >= (date_trunc('day', now() AT TIME ZONE 'America/Manaus')
                                AT TIME ZONE 'America/Manaus')
    ) THEN
      INSERT INTO trinks_profissional_id_map_quarentena (id_pessoa, candidatos, motivo)
      VALUES (p_id_pessoa, v_candidato, 'conflito_webhook');
    END IF;

    RETURN 'conflito_quarentena';
  END IF;

  INSERT INTO trinks_profissional_id_map
    (id_pessoa, id_estabelecimento, nome_completo, apelido, fonte, votos, confianca)
  VALUES (
    p_id_pessoa,
    p_id_estabelecimento,
    NULLIF(btrim(p_nome), ''),
    (SELECT COALESCE(pa.apelido, pa.nome_profissional)
       FROM profissionais_ativos pa
      WHERE pa."profissionalId" = p_id_estabelecimento
      LIMIT 1),
    p_fonte, 0, NULL
  );

  RETURN 'inserido';
END $$;

-- ---------------------------------------------------------------------------
-- M-5 — colher também o par de quem FECHOU a conta (é o único que traz nome)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trinks_map_upsert_from_fechamento(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e jsonb;
  r text;
  v_ins int := 0; v_conf int := 0; v_confl int := 0; v_ign int := 0;
BEGIN
  FOR e IN
    SELECT jsonb_array_elements(
             CASE jsonb_typeof(p_payload -> 'IdsDosProfissionaisEnvolvidos')
               WHEN 'array' THEN p_payload -> 'IdsDosProfissionaisEnvolvidos'
               ELSE '[]'::jsonb
             END)
  LOOP
    -- Os elementos de IdsDosProfissionaisEnvolvidos[] NÃO trazem nome (confirmado no payload
    -- real da execução 311207), por isso p_nome => NULL aqui.
    r := trinks_map_upsert_par(
           NULLIF(e ->> 'IdDoProfissional', '')::bigint,
           NULLIF(e ->> 'IdDoProfissionalNoEstabelecimento', '')::bigint,
           NULL,
           'webhook_fechamento');

    IF    r = 'inserido'            THEN v_ins   := v_ins   + 1;
    ELSIF r = 'confirmado'          THEN v_conf  := v_conf  + 1;
    ELSIF r = 'conflito_quarentena' THEN v_confl := v_confl + 1;
    ELSE                                 v_ign   := v_ign   + 1;
    END IF;
  END LOOP;

  -- M-5: quem fechou a conta costuma ser justamente o pessoal do balcão — o alvo da lacuna do
  -- §4.6 — e é a ÚNICA fonte do webhook que entrega o nome do profissional.
  r := trinks_map_upsert_par(
         NULLIF(p_payload ->> 'IdDoProfissionalQueFechouConta', '')::bigint,
         NULLIF(p_payload ->> 'IdDoProfissionalNoEstabelecimentoQueFechouConta', '')::bigint,
         NULLIF(p_payload ->> 'NomeDoProfissionalQueFechouConta', ''),
         'webhook_fechamento');

  IF    r = 'inserido'            THEN v_ins   := v_ins   + 1;
  ELSIF r = 'confirmado'          THEN v_conf  := v_conf  + 1;
  ELSIF r = 'conflito_quarentena' THEN v_confl := v_confl + 1;
  ELSE                                 v_ign   := v_ign   + 1;
  END IF;

  RETURN jsonb_build_object(
    'inseridos',   v_ins,
    'confirmados', v_conf,
    'conflitos',   v_confl,
    'ignorados',   v_ign);
END $$;

REVOKE ALL ON FUNCTION public.trinks_map_upsert_par(bigint, bigint, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trinks_map_upsert_from_fechamento(jsonb)
  FROM PUBLIC, anon, authenticated;
