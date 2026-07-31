-- De-para dos dois espaços de ID
CREATE TABLE IF NOT EXISTS public.trinks_profissional_id_map (
  id_pessoa          bigint PRIMARY KEY,             -- espaço P (transações)
  id_estabelecimento bigint NOT NULL UNIQUE,         -- espaço E — UNIQUE garante bijeção
  nome_completo      text,
  apelido            text,                           -- congelado: profissionais_ativos é só o presente
  fonte              text NOT NULL DEFAULT 'derivado_agenda',
  votos              integer NOT NULL DEFAULT 0,
  confianca          numeric(6,4),
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trinks_map_fonte_ck CHECK (fonte IN
    ('derivado_agenda','webhook_profissional','webhook_fechamento','manual'))
);
ALTER TABLE public.trinks_profissional_id_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trinks_profissional_id_map FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.trinks_profissional_id_map FROM anon, authenticated;

-- Quarentena: candidatos rejeitados (voto insuficiente, ambiguidade, conflito de bijeção)
CREATE TABLE IF NOT EXISTS public.trinks_profissional_id_map_quarentena (
  id           bigserial PRIMARY KEY,
  id_pessoa    bigint NOT NULL,
  candidatos   jsonb  NOT NULL,
  motivo       text   NOT NULL,
  detectado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trinks_profissional_id_map_quarentena ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trinks_profissional_id_map_quarentena FROM anon, authenticated;

-- Log de execução (também serve de "última verificação" para a UI)
CREATE TABLE IF NOT EXISTS public.trinks_sync_log (
  id                    bigserial PRIMARY KEY,
  executado_em          timestamptz NOT NULL DEFAULT now(),
  origem                text,                     -- 'daily' | 'hourly' | 'manual'
  janela_desde          date    NOT NULL,
  janela_ate            date    NOT NULL,
  snapshot_completo     boolean NOT NULL,
  transacoes_recebidas  integer,
  inseridos             integer,
  atualizados           integer,
  excluidos             integer,
  inalterados           integer,
  sem_depara            integer,
  duracao_ms            integer,
  erro                  text
);
CREATE INDEX IF NOT EXISTS idx_trinks_sync_log_exec ON public.trinks_sync_log (executado_em DESC);
ALTER TABLE public.trinks_sync_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trinks_sync_log FROM anon, authenticated;
-- Se a UI precisar exibir "última atualização", libere só leitura:
-- GRANT SELECT ON public.trinks_sync_log TO authenticated;
-- CREATE POLICY trinks_sync_log_read ON public.trinks_sync_log FOR SELECT TO authenticated USING (true);
