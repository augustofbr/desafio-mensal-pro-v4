-- Move as datas de aniversário da tabela avulsa `aniversarios` para
-- `profissionais_ativos`, a base oficial de profissionais do Studio X.
--
-- Continua armazenando apenas dia + mês (sem ano), preservando a restrição
-- de privacidade da tabela original.

ALTER TABLE profissionais_ativos
  ADD COLUMN IF NOT EXISTS dia_aniversario SMALLINT,
  ADD COLUMN IF NOT EXISTS mes_aniversario SMALLINT;

-- CHECKs adicionados em bloco condicional para a migration permanecer idempotente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profissionais_ativos_dia_aniversario_check'
  ) THEN
    ALTER TABLE profissionais_ativos
      ADD CONSTRAINT profissionais_ativos_dia_aniversario_check
      CHECK (dia_aniversario IS NULL OR dia_aniversario BETWEEN 1 AND 31);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profissionais_ativos_mes_aniversario_check'
  ) THEN
    ALTER TABLE profissionais_ativos
      ADD CONSTRAINT profissionais_ativos_mes_aniversario_check
      CHECK (mes_aniversario IS NULL OR mes_aniversario BETWEEN 1 AND 12);
  END IF;
END $$;

-- Backfill: casamento por apelido.
-- Profissionais presentes em `aniversarios` mas ausentes de `profissionais_ativos`
-- são descartados de propósito — `profissionais_ativos` é a fonte da verdade do
-- quadro do Studio X.
-- O guard `IS NULL` torna o backfill re-executável sem sobrescrever ajustes manuais.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'aniversarios'
  ) THEN
    UPDATE profissionais_ativos pa
       SET dia_aniversario = a.dia,
           mes_aniversario = a.mes
      FROM aniversarios a
     WHERE lower(btrim(pa.apelido)) = lower(btrim(a.apelido))
       AND pa.dia_aniversario IS NULL
       AND pa.mes_aniversario IS NULL;

    EXECUTE 'COMMENT ON TABLE aniversarios IS ' || quote_literal(
      'DEPRECATED (2026-07-25): dados migrados para profissionais_ativos.dia_aniversario / mes_aniversario. Mantida como backup; pode ser removida após validação.'
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profissionais_ativos_aniversario
  ON profissionais_ativos (mes_aniversario, dia_aniversario)
  WHERE mes_aniversario IS NOT NULL;

COMMENT ON COLUMN profissionais_ativos.dia_aniversario IS
  'Dia do aniversário (1-31). NULL = data não informada.';
COMMENT ON COLUMN profissionais_ativos.mes_aniversario IS
  'Mês do aniversário (1-12). NULL = data não informada. O ano não é armazenado, por privacidade.';
