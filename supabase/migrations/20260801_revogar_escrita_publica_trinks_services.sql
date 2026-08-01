-- 20260801_revogar_escrita_publica_trinks_services.sql
--
-- Hardening de public.trinks_services: revogar a ESCRITA publica, manter a LEITURA.
--
-- Contexto:
--   As policies "Public can insert/update/delete trinks_services" e os grants de
--   INSERT/UPDATE/DELETE para anon/authenticated sao heranca da era CSV, quando a
--   carga era feita pelo browser. Hoje 100% da escrita e server-side:
--     - workflows n8n conectam com credencial postgres;
--     - as funcoes trinks_apply_snapshot() e trinks_sync_executar() sao
--       SECURITY DEFINER de dono postgres, portanto nao sao afetadas por RLS
--       nem pelos grants de anon/authenticated.
--   O front-end (src/) apenas LE a tabela (verificado: nenhum .insert/.update/
--   .delete/.upsert sobre trinks_services).
--   O trigger trigger_sync_new_professional (AFTER INSERT -> professionals) roda
--   no contexto de quem insere (postgres), logo segue funcionando.
--
-- O que MUDA: anon e authenticated perdem INSERT, UPDATE e DELETE.
-- O que NAO muda: a policy "Public can view trinks_services" e o grant de SELECT
--                 permanecem INTOCADOS (o dashboard continua lendo normalmente).

BEGIN;

-- 1. Remover as policies permissivas de escrita (nomes exatos do catalogo).
DROP POLICY IF EXISTS "Public can insert trinks_services" ON public.trinks_services;
DROP POLICY IF EXISTS "Public can update trinks_services" ON public.trinks_services;
DROP POLICY IF EXISTS "Public can delete trinks_services" ON public.trinks_services;

-- A policy de leitura permanece:
--   "Public can view trinks_services" (SELECT, roles={public}, qual=true)

-- 2. Revogar os grants de escrita. Sem grant, o erro e "permission denied"
--    antes mesmo de a RLS ser avaliada (defesa em profundidade).
REVOKE INSERT, UPDATE, DELETE ON public.trinks_services FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.trinks_services FROM authenticated;

-- SELECT continua concedido para anon e authenticated. postgres e service_role
-- mantem todos os privilegios (usados pelo sync server-side).

COMMIT;
