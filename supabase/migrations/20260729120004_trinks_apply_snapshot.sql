CREATE OR REPLACE FUNCTION public.trinks_apply_snapshot(
  p_desde            date,
  p_ate              date,
  p_transacoes       jsonb,                  -- array cru de /v1/transacoes (todas as páginas)
  p_completo         boolean DEFAULT false,  -- true SOMENTE se a paginação foi íntegra ⇒ habilita DELETE
  p_incluir_produtos boolean DEFAULT true
) RETURNS TABLE (inseridos int, atualizados int, excluidos int, inalterados int, sem_depara int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dias text[];
  v_ins int; v_upd int; v_del int; v_tot int; v_nil int;
BEGIN
  -- Janela como lista literal de datas 'DD/MM/YYYY' → usa o índice btree existente em service_date.
  -- (to_date() é STABLE no Postgres, então NÃO dá para indexar por expressão — ver §10.)
  SELECT array_agg(to_char(d, 'DD/MM/YYYY'))
    INTO v_dias
    FROM generate_series(p_desde, p_ate, interval '1 day') d;

  WITH alvo AS (
    -- SERVIÇOS
    SELECT (t.el->>'id')::bigint * 1000 + it.ord                        AS id,
           to_char(((t.el->>'dataHora')::timestamp)::date,'DD/MM/YYYY') AS service_date,
           it.el->>'nome'                                               AS service_name,
           trinks_categoria_csv(it.el->>'categoria')                    AS category,
           (it.el->>'preco')::numeric                                   AS value,
           (it.el->>'id')::text                                         AS servicoid,
           NULL::text                                                   AS produtoid,
           NULL::text                                                   AS produto_name,
           (it.el->>'idProfissionalQueRealizouServico')::bigint         AS pid_p,
           (t.el->'cliente'->>'id')::text                               AS clienteid,
           t.el->'cliente'->>'nome'                                     AS client_name
    FROM jsonb_array_elements(p_transacoes) t(el),
         LATERAL jsonb_array_elements(t.el->'servicos') WITH ORDINALITY AS it(el, ord)

    UNION ALL

    -- PRODUTOS (offset +500 na ordinalidade evita colisão com serviços)
    SELECT (t.el->>'id')::bigint * 1000 + 500 + it.ord,
           to_char(((t.el->>'dataHora')::timestamp)::date,'DD/MM/YYYY'),
           it.el->>'nome',
           NULL,                                    -- a API não categoriza produto
           (it.el->>'valorUnitario')::numeric * COALESCE((it.el->>'quantidade')::int, 1),
           NULL, (it.el->>'id')::text, it.el->>'nome',
           (it.el->>'IdProfissionalQueRealizouAVenda')::bigint,
           (t.el->'cliente'->>'id')::text,
           t.el->'cliente'->>'nome'
    FROM jsonb_array_elements(p_transacoes) t(el),
         LATERAL jsonb_array_elements(t.el->'produtos') WITH ORDINALITY AS it(el, ord)
    WHERE p_incluir_produtos
  ),
  resolvido AS (
    SELECT a.id, a.service_date,
           COALESCE(m.apelido, pa.nome_profissional, m.nome_completo) AS professional,
           a.service_name, a.category, a.client_name, a.value, a.servicoid,
           m.id_estabelecimento::text AS profissionalid,     -- ✅ espaço E, o que o consumidor espera
           a.produtoid, a.produto_name, a.clienteid
    FROM alvo a
    LEFT JOIN trinks_profissional_id_map m ON m.id_pessoa = a.pid_p
    LEFT JOIN profissionais_ativos pa      ON pa."profissionalId" = m.id_estabelecimento
  ),
  ins AS (
    INSERT INTO trinks_services AS ts
      (id, service_date, professional, service_name, category, client_name,
       value, servicoid, profissionalid, produtoid, produto_name, clienteid, created_at)
    SELECT r.id, r.service_date, r.professional, r.service_name, r.category, r.client_name,
           r.value, r.servicoid, r.profissionalid, r.produtoid, r.produto_name, r.clienteid,
           to_char(now() AT TIME ZONE 'America/Manaus', 'YYYY-MM-DD"T"HH24:MI:SS.MS-04:00')
    FROM resolvido r
    ON CONFLICT (id) DO UPDATE SET
      service_date = EXCLUDED.service_date, professional   = EXCLUDED.professional,
      service_name = EXCLUDED.service_name, category       = EXCLUDED.category,
      client_name  = EXCLUDED.client_name,  value          = EXCLUDED.value,
      servicoid    = EXCLUDED.servicoid,    profissionalid = EXCLUDED.profissionalid,
      produtoid    = EXCLUDED.produtoid,    produto_name   = EXCLUDED.produto_name,
      clienteid    = EXCLUDED.clienteid,    created_at     = EXCLUDED.created_at
    WHERE (ts.service_date, ts.professional, ts.service_name, ts.category, ts.client_name,
           ts.value, ts.servicoid, ts.profissionalid, ts.produtoid, ts.produto_name, ts.clienteid)
      IS DISTINCT FROM
          (EXCLUDED.service_date, EXCLUDED.professional, EXCLUDED.service_name, EXCLUDED.category,
           EXCLUDED.client_name, EXCLUDED.value, EXCLUDED.servicoid, EXCLUDED.profissionalid,
           EXCLUDED.produtoid, EXCLUDED.produto_name, EXCLUDED.clienteid)
    RETURNING (xmax = 0) AS inserido
  ),
  del AS (
    -- Só deleta quando o snapshot é íntegro (§5.5) E apenas dentro da janela consultada (§5.4).
    -- Compara contra `resolvido` (não contra a tabela): linhas recém-inseridas estão protegidas.
    DELETE FROM trinks_services ts
    WHERE p_completo
      AND ts.service_date = ANY (v_dias)
      AND NOT EXISTS (SELECT 1 FROM resolvido r WHERE r.id = ts.id)
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM ins WHERE inserido)::int,
         (SELECT count(*) FROM ins WHERE NOT inserido)::int,
         (SELECT count(*) FROM del)::int,
         (SELECT count(*) FROM resolvido)::int,
         (SELECT count(*) FROM resolvido WHERE profissionalid IS NULL)::int
    INTO v_ins, v_upd, v_del, v_tot, v_nil;

  RETURN QUERY SELECT v_ins, v_upd, v_del, (v_tot - v_ins - v_upd), v_nil;
END $$;

REVOKE ALL ON FUNCTION public.trinks_apply_snapshot(date, date, jsonb, boolean, boolean) FROM PUBLIC, anon, authenticated;
