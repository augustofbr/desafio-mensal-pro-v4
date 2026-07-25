-- Remove a tabela `aniversarios`, deprecada em 2026-07-25 pela migration
-- move_aniversarios_to_profissionais_ativos (versão 20260725110737).
--
-- As datas vivem agora em profissionais_ativos.dia_aniversario / .mes_aniversario.
-- Nada no app lê desta tabela: `useAniversariosData` consulta profissionais_ativos.
--
-- Sem dependências: nenhuma view, FK, trigger ou função referencia `aniversarios`.
-- O índice idx_aniversarios_mes e a policy "Allow public read access to aniversarios"
-- são removidos junto com a tabela.
--
-- Preservação dos dados:
--   - 18 registros migrados para profissionais_ativos
--   - 3 registros descartados no backfill (Stefanny 31/03, Letícia 05/04, Sarah 29/09)
--     seguem versionados no seed de 20260222_create_aniversarios.sql

DROP TABLE IF EXISTS aniversarios;
