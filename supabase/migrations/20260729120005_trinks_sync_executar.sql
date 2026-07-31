CREATE OR REPLACE FUNCTION public.trinks_sync_executar(
  p_transacoes jsonb,
  p_completo   boolean,
  p_dias       integer DEFAULT 1,      -- 15 no job da madrugada, 1 no intradiário
  p_origem     text    DEFAULT 'hourly'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_desde date; v_ate date; v_t0 timestamptz := clock_timestamp(); r record;
BEGIN
  v_ate   := (now() AT TIME ZONE 'America/Manaus')::date;
  v_desde := v_ate - (p_dias - 1);          -- p_dias = 1 → janela do dia corrente

  SELECT * INTO r FROM trinks_apply_snapshot(v_desde, v_ate, p_transacoes, p_completo, true);

  INSERT INTO trinks_sync_log (origem, janela_desde, janela_ate, snapshot_completo,
                               transacoes_recebidas, inseridos, atualizados, excluidos,
                               inalterados, sem_depara, duracao_ms)
  VALUES (p_origem, v_desde, v_ate, p_completo, jsonb_array_length(p_transacoes),
          r.inseridos, r.atualizados, r.excluidos, r.inalterados, r.sem_depara,
          (extract(epoch FROM clock_timestamp() - v_t0) * 1000)::int);

  RETURN jsonb_build_object('origem', p_origem, 'janela_desde', v_desde, 'janela_ate', v_ate,
    'snapshot_completo', p_completo, 'inseridos', r.inseridos, 'atualizados', r.atualizados,
    'excluidos', r.excluidos, 'inalterados', r.inalterados, 'sem_depara', r.sem_depara);
END $$;

REVOKE ALL ON FUNCTION public.trinks_sync_executar(jsonb, boolean, integer, text) FROM PUBLIC, anon, authenticated;
