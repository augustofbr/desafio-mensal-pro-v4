-- 20260801_revogar_truncate_publico_trinks_services.sql
--
-- Complemento de 20260801_revogar_escrita_publica_trinks_services.sql.
--
-- Aquela migration revogou INSERT/UPDATE/DELETE de anon/authenticated, mas o grant
-- de TRUNCATE — tambem herdado da era CSV — tinha ficado para tras. TRUNCATE e
-- escrita, e das mais destrutivas:
--   - ignora RLS por completo (nenhuma policy o intercepta);
--   - apagaria a tabela inteira numa unica instrucao.
--
-- Na pratica o risco era baixo, porque o PostgREST nao expoe verbo HTTP que dispare
-- TRUNCATE — nao da para alcanca-lo com a anon key a partir do browser. Mas o grant
-- ficaria armado para qualquer caminho futuro: uma conexao direta ao Postgres com
-- credencial anon, uma funcao SECURITY INVOKER, um EXECUTE dinamico. Revogar fecha
-- a porta antes de existir a chave.
--
-- Escopo deliberadamente restrito a trinks_services. As demais tabelas da era CSV
-- (profissionais_ativos, avaliacoes_cadastradas, automation_logs) provavelmente
-- carregam o mesmo padrao de grants herdados, mas ficam como recomendacao de
-- auditoria para o owner — NAO sao tocadas aqui.
--
-- O que NAO muda: a policy "Public can view trinks_services" e o grant de SELECT
--                 permanecem INTOCADOS. postgres e service_role seguem com tudo.

BEGIN;

REVOKE TRUNCATE ON public.trinks_services FROM anon;
REVOKE TRUNCATE ON public.trinks_services FROM authenticated;

COMMIT;
