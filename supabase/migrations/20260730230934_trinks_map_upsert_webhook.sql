-- Task 9 — De-para instantâneo via webhook Trinks (HANDOFF §4.6 opção B)
--
-- Hoje o mapa P→E é derivado do mirror (D-1) pelo daily 03:40: auto-cura com latência de até
-- um dia útil, e cega para quem nunca tem agendamento (balconistas que só vendem produto —
-- os IDs P 484900/623942 do §4.6, hoje NULL permanente).
--
-- O webhook `Webhook Trinks - Geral` (yTCvrwWynVGB3dqo) já recebe o par pronto:
--   IdDoProfissional                  = espaço P  (mesmo de idProfissionalQueRealizouServico)
--   IdDoProfissionalNoEstabelecimento = espaço E  (o que profissionais_ativos usa)
--   IdPessoaDoProfissional            = TERCEIRO id, NÃO usar em nada
-- Confirmado contra payloads reais armazenados (execuções 311207 e 311184, TipoDeEvento 1).
--
-- Princípio de segurança: o webhook só PODE criar par novo ou confirmar par existente.
-- Nunca sobrescreve. Qualquer divergência vai para quarentena e um humano decide.

-- ---------------------------------------------------------------------------
-- 1) Upsert de um par, com quarentena em caso de conflito
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trinks_map_upsert_par(
  p_id_pessoa          bigint,
  p_id_estabelecimento bigint,
  p_nome               text DEFAULT NULL,
  p_fonte              text DEFAULT 'webhook_profissional'
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_destino_atual bigint;   -- para onde este id_pessoa já aponta (se aponta)
  v_dono_destino  bigint;   -- quem já ocupa este id_estabelecimento (se ocupado)
  v_candidato     jsonb;
BEGIN
  -- Fonte fora do contrato é erro de programação, não dado ruim: falha alto.
  IF p_fonte NOT IN ('webhook_profissional', 'webhook_fechamento') THEN
    RAISE EXCEPTION 'trinks_map_upsert_par: fonte invalida %, esperado webhook_profissional ou webhook_fechamento', p_fonte;
  END IF;

  -- Dado ausente/inválido é rotina no webhook (evento sem profissional): ignora em silêncio.
  IF p_id_pessoa IS NULL OR p_id_estabelecimento IS NULL
     OR p_id_pessoa <= 0 OR p_id_estabelecimento <= 0 THEN
    RETURN 'ignorado';
  END IF;

  SELECT id_estabelecimento INTO v_destino_atual
    FROM trinks_profissional_id_map WHERE id_pessoa = p_id_pessoa;

  SELECT id_pessoa INTO v_dono_destino
    FROM trinks_profissional_id_map WHERE id_estabelecimento = p_id_estabelecimento;

  -- (a) Par já existe idêntico -> confirmado.
  -- Só toca em nome_completo e updated_at. NÃO mexe em fonte/votos/confianca: se a entrada
  -- veio da derivação estatística, a procedência dela continua sendo a verdade histórica.
  IF v_destino_atual IS NOT NULL AND v_destino_atual = p_id_estabelecimento THEN
    UPDATE trinks_profissional_id_map
       SET nome_completo = COALESCE(NULLIF(btrim(p_nome), ''), nome_completo),
           updated_at    = now()
     WHERE id_pessoa = p_id_pessoa;
    RETURN 'confirmado';
  END IF;

  -- (b) Conflito: este P já aponta para OUTRO E, ou este E já pertence a OUTRO P.
  -- Nunca sobrescreve — o mapa foi validado 22/22 e uma troca silenciosa atribuiria
  -- serviços ao profissional errado. Vai para quarentena.
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

    -- Idempotência: o mesmo evento reenviado (ou o mesmo conflito repetido no dia) não deve
    -- inflar a quarentena. Compara pelo PAR proposto, não pelo jsonb inteiro, para que uma
    -- variação de nome entre eventos não crie linha nova.
    IF NOT EXISTS (
      SELECT 1
        FROM trinks_profissional_id_map_quarentena q
       WHERE q.id_pessoa = p_id_pessoa
         AND q.motivo    = 'conflito_webhook'
         AND (q.candidatos -> 'proposto' ->> 'id_estabelecimento') = p_id_estabelecimento::text
         AND q.detectado_em >= date_trunc('day', now())
    ) THEN
      INSERT INTO trinks_profissional_id_map_quarentena (id_pessoa, candidatos, motivo)
      VALUES (p_id_pessoa, v_candidato, 'conflito_webhook');
    END IF;

    RETURN 'conflito_quarentena';
  END IF;

  -- (c) P inédito e E livre -> insere.
  -- votos=0/confianca=NULL marcam "não veio de votação estatística, veio da fonte".
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
-- 2) Fechamento de Conta (TipoDeEvento 1): colhe o par de TODOS os envolvidos
-- ---------------------------------------------------------------------------
-- É o evento que fecha a lacuna do §4.6: quem só vende produto no balcão aparece em
-- IdsDosProfissionaisEnvolvidos mesmo sem nunca ter agendamento.
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

  RETURN jsonb_build_object(
    'inseridos',   v_ins,
    'confirmados', v_conf,
    'conflitos',   v_confl,
    'ignorados',   v_ign);
END $$;

-- ---------------------------------------------------------------------------
-- 3) Superfície mínima: nenhuma das duas é chamável pelo cliente web
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.trinks_map_upsert_par(bigint, bigint, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trinks_map_upsert_from_fechamento(jsonb)
  FROM PUBLIC, anon, authenticated;
