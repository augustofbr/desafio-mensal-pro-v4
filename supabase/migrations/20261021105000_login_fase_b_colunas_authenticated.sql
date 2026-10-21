-- Login em todas as rotas — migração B: `authenticated` passa a ler SÓ as 9 colunas do app em
-- public.profissionais_ativos (cpf, telefone, e-mail e dados fiscais saem).
--
-- ============================================================================================
-- AVISO 1 — APLICAR BYTE A BYTE (como postgres: o REVOKE/GRANT exige o dono da tabela). A
--   guarda final confere o estado pelo catálogo; o ROLLBACK, abaixo, é autossuficiente.
-- AVISO 2 — PRÉ-REQUISITO CUMPRIDO EM 2026-10-20: o app NFS-e (emissao-nota-prof-parceiro, main
--   1e1b147) lê profissionais_ativos SÓ com service_role, depois de checar o papel. A prova
--   pós-B (nfse_pos_B.sql, com este mesmo texto de REVOKE/GRANT, em transação desfeita) deu
--   NFSE_POS_B_OK: as 13 leituras do NFS-e com o client do usuário funcionam; coluna fiscal,
--   select * e embed com `documento` dão 42501. Se o NFS-e voltar a ler a tabela com o client
--   do usuário, quebra (42501) — de propósito.
-- AVISO 3 — ORDEM FINAL: esta B, depois o deploy do front, depois a C
--   (20261021110000_login_fase_c_fecha_anon.sql). O nome 20261021105000 faz a B rodar antes da C
--   também num replay das migrações. A C foi ajustada (commit 0e04fdd) para valer com a B já
--   aplicada: a guarda final dela confere as 9 colunas de profissionais_ativos para
--   authenticated, uma a uma (não o SELECT de tabela que a B tira), e a verificação dela
--   (login_fase_c.sql, item 22) lê do catálogo se authenticated ainda lê `email` (sem a B) ou
--   não (com a B). A B em si não depende da C: vale antes ou depois dela.
-- AVISO 4 — lock_timeout de 5s: se a tabela estiver ocupada por DDL, a migração falha inteira,
--   sem efeito parcial; basta rodar de novo. Reaplicável (REVOKE/GRANT são idempotentes).
-- AVISO 5 — RELAÇÃO COM A MIGRAÇÃO A (20261021100000_login_fase_a.sql):
--   * para reverter as duas, reverta a B ANTES da A (o ROLLBACK da A regrava os privilégios de
--     authenticated em profissionais_ativos a partir do SELECT de tabela que a B tira);
--   * reaplicar a A depois da B aborta na guarda da A, que exige SELECT de TABELA de
--     authenticated em profissionais_ativos ("authenticated perdeu SELECT em profissionais_ativos
--     (e da migracao B)"). Para reaplicar a A, reverta a B antes.
-- ============================================================================================
--
-- Spec: docs/superpowers/specs/2026-10-20-login-todas-as-rotas-design.md (§3, tabela, linha
-- profissionais_ativos; §5, item 4).
-- Plano: docs/superpowers/plans/2026-10-20-login-todas-as-rotas.md (Task 7).
-- Verificação: supabase/verificacoes/login_fase_b.sql (termina em erro (RAISE), e a transação é
-- desfeita; nada persiste).
-- Depende da migração A (20261021100000_login_fase_a.sql), já aplicada: o e-mail e o vínculo
-- da profissional chegam ao app pelas RPCs SECURITY DEFINER destaque_minha_profissional() e
-- destaque_profissionais_sem_conta(), que leem a tabela como o dono (postgres) e não perdem nada.
--
-- Estado de partida (catálogo lido em 2026-10-20):
--   relacl = {postgres=arwdDxt/postgres, authenticated=r/postgres, service_role=arwdDxt/postgres}
--   anon: SELECT por coluna nas 9 colunas abaixo (migração 20261019160000; a C reduz a 4).
--   authenticated: SELECT de TABELA (lê as 24 colunas, inclusive cpf, telefone, email,
--   documento, cnpj, endereco, dados fiscais e trinks_id_profissional). Escrita já revogada
--   pela A.
--
-- Quem lê profissionais_ativos como authenticated (mapeado em 2026-10-20) — nenhum perde coluna:
--   * Destaque (src/): useActiveProfessionals.ts:21 (profissionalId, nome_profissional,
--     categoria, apelido, ativo, dia_aniversario, mes_aniversario, created_at);
--     useAniversariosData.ts:33 (profissionalId, apelido, nome_profissional, dia_aniversario,
--     mes_aniversario; filtro em ativo); StarBonusExtraFields.tsx:53 (profissionalId,
--     nome_profissional, apelido, categoria, ativo). E-mail e vínculo: só pelas RPCs acima.
--   * Fila V2 logada (lib/supabase/queries/{client-queue,professionals,attendances}.ts):
--     profissionalId, nome_profissional, categoria; filtro em ativo. fila_trinks_process_webhook
--     (INVOKER, executável por authenticated): profissionalId, nome_profissional, categoria.
--   * NFS-e: só service_role (ver AVISO 2). Financeiro: só service_role (createAdminClient).
--   * Views financeiro_studiox_v_dasmei_duplo_titulo e financeiro_studiox_v_pessoas_master
--     (security_invoker, leem cpf/cnpj/nome_completo): authenticated NÃO tem SELECT nelas.
--   * Funções que leem a tabela: todas SECURITY DEFINER, exceto fila_trinks_process_webhook
--     (acima). Nenhuma policy de outra tabela lê profissionais_ativos. FKs de outras tabelas
--     para ela (destaque_users_app, emissoes, certificados, fila) checam como o dono.
--
-- O que muda:
--   1) REVOKE SELECT de TABELA de authenticated (o REVOKE de tabela leva junto os privilégios
--      de coluna correspondentes, se houver).
--   2) GRANT SELECT por coluna a authenticated: "profissionalId", nome_profissional, categoria,
--      apelido, ativo, dia_aniversario, mes_aniversario, created_at, updated_at.
--   Consequências: `select *` (ou `select=*` no PostgREST) como authenticated dá 42501 — liste
--   colunas. Coluna nova na tabela nasce ilegível para authenticated (precisa entrar no grant).
--   NÃO muda: anon (o que a C deixa: 4 colunas; antes da C, 9), service_role (tudo), as
--   policies de linha (a pública de SELECT continua; RLS habilitada, não forçada), as RPCs.
--
-- Rollback autossuficiente (não depende de outro arquivo): devolve o SELECT de TABELA a
-- authenticated, exatamente o relacl de partida. Rodar inteiro, BYTE A BYTE, no SQL Editor (como
-- postgres) — NÃO pelo apply_migration: o bloco tem begin/commit próprios. O DO final confere;
-- se não bater, aborta e nada é desfeito. Reabre cpf/telefone/e-mail/dados fiscais para toda
-- conta logada: só faz sentido se algo que lê como authenticated quebrar e não der para corrigir
-- o leitor a tempo.
/* ---- ROLLBACK ----
begin;
set local lock_timeout = '5s';

-- REVOKE de tabela primeiro: tira também os privilégios de COLUNA desta B; depois o SELECT de
-- tabela de partida (authenticated=r/postgres)
REVOKE SELECT ON TABLE public.profissionais_ativos FROM authenticated;
GRANT SELECT ON TABLE public.profissionais_ativos TO authenticated;

DO $$
DECLARE
  v_falhas text[] := '{}';
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.profissionais_ativos', 'select') THEN
    v_falhas := v_falhas || 'authenticated sem SELECT de tabela'::text;
  END IF;
  IF has_table_privilege('authenticated', 'public.profissionais_ativos',
                         'insert, update, delete, truncate, references, trigger') THEN
    v_falhas := v_falhas || 'authenticated com privilegio de escrita (nao devia: a A revogou)'::text;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a, pg_catalog.aclexplode(a.attacl) x
              WHERE a.attrelid = 'public.profissionais_ativos'::regclass
                AND x.grantee = 'authenticated'::regrole) THEN
    v_falhas := v_falhas || 'sobrou privilegio de coluna para authenticated'::text;
  END IF;
  -- cada privilégio num has_table_privilege próprio (com a lista, basta UM para dar true)
  IF NOT has_table_privilege('service_role', 'public.profissionais_ativos', 'select')
     OR NOT has_table_privilege('service_role', 'public.profissionais_ativos', 'insert')
     OR NOT has_table_privilege('service_role', 'public.profissionais_ativos', 'update')
     OR NOT has_table_privilege('service_role', 'public.profissionais_ativos', 'delete') THEN
    v_falhas := v_falhas || 'service_role perdeu privilegio'::text;
  END IF;
  IF array_length(v_falhas, 1) > 0 THEN
    RAISE EXCEPTION 'rollback da B incompleto: %', array_to_string(v_falhas, ' | ');
  END IF;
END $$;
commit;
---- FIM DO ROLLBACK ---- */

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_setting('lock_timeout') <> '5s' THEN
    RAISE EXCEPTION 'lock_timeout nao ficou em 5s (%): o arquivo nao esta rodando numa transacao - abortando',
      current_setting('lock_timeout');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 0) Estado de partida
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  c text;
BEGIN
  -- o e-mail e o vínculo saem pelas RPCs da A; sem elas o app perderia o vínculo
  IF to_regprocedure('public.destaque_minha_profissional()') IS NULL
     OR to_regprocedure('public.destaque_profissionais_sem_conta()') IS NULL
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.destaque_minha_profissional()'::regprocedure)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.destaque_profissionais_sem_conta()'::regprocedure) THEN
    RAISE EXCEPTION 'migracao A ausente (RPCs destaque_minha_profissional/destaque_profissionais_sem_conta SECURITY DEFINER): abortando';
  END IF;
  -- as 9 colunas existem (senão o GRANT falharia no meio com mensagem pior)
  FOREACH c IN ARRAY ARRAY['profissionalId', 'nome_profissional', 'categoria', 'apelido', 'ativo',
                           'dia_aniversario', 'mes_aniversario', 'created_at', 'updated_at'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
                    WHERE attrelid = 'public.profissionais_ativos'::regclass AND attname = c
                      AND attnum > 0 AND NOT attisdropped) THEN
      RAISE EXCEPTION 'profissionais_ativos.% nao existe: abortando', c;
    END IF;
  END LOOP;
  -- authenticated só pode ter SELECT (a A revogou a escrita); se tiver mais, alguém mexeu depois
  IF has_table_privilege('authenticated', 'public.profissionais_ativos',
                         'insert, update, delete, truncate, references, trigger')
     OR has_any_column_privilege('authenticated', 'public.profissionais_ativos', 'insert, update, references') THEN
    RAISE EXCEPTION 'authenticated tem privilegio de escrita em profissionais_ativos (a A revogou): reavalie antes da B';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1) e 2) authenticated: SELECT só nas 9 colunas do app
-- ---------------------------------------------------------------------------
REVOKE SELECT ON public.profissionais_ativos FROM authenticated;
GRANT SELECT ("profissionalId", nome_profissional, categoria, apelido, ativo,
              dia_aniversario, mes_aniversario, created_at, updated_at)
  ON public.profissionais_ativos TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Guarda: estado final esperado (aborta a migração inteira se algo não bater)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_falhas text[] := '{}';
  v_app text[] := ARRAY['profissionalId', 'nome_profissional', 'categoria', 'apelido', 'ativo',
                        'dia_aniversario', 'mes_aniversario', 'created_at', 'updated_at'];
  v_fila text[] := ARRAY['profissionalId', 'nome_profissional', 'categoria', 'ativo'];
  v_anon text[];
  c text;
BEGIN
  -- authenticated: nada de tabela; exatamente as 9 colunas, só SELECT
  IF has_table_privilege('authenticated', 'public.profissionais_ativos',
                         'select, insert, update, delete, truncate, references, trigger') THEN
    v_falhas := v_falhas || 'authenticated ainda tem privilegio de TABELA'::text;
  END IF;
  FOREACH c IN ARRAY v_app LOOP
    IF NOT has_column_privilege('authenticated', 'public.profissionais_ativos', c, 'select') THEN
      v_falhas := v_falhas || format('authenticated nao le %s (o app quebra)', c);
    END IF;
  END LOOP;
  FOR c IN SELECT a.attname FROM pg_catalog.pg_attribute a
            WHERE a.attrelid = 'public.profissionais_ativos'::regclass AND a.attnum > 0
              AND NOT a.attisdropped AND a.attname <> ALL (v_app) LOOP
    IF has_column_privilege('authenticated', 'public.profissionais_ativos', c, 'select, insert, update, references') THEN
      v_falhas := v_falhas || format('authenticated ainda acessa %s', c);
    END IF;
  END LOOP;
  IF has_any_column_privilege('authenticated', 'public.profissionais_ativos', 'insert, update, references') THEN
    v_falhas := v_falhas || 'authenticated com escrita por coluna'::text;
  END IF;

  -- anon: intocado — sem privilégio de tabela e com as 4 colunas da fila (pós-C) ou as 9 (pré-C)
  SELECT array_agg(a.attname::text ORDER BY a.attname::text COLLATE "C") INTO v_anon
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = 'public.profissionais_ativos'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND has_column_privilege('anon', 'public.profissionais_ativos', a.attname::text, 'select');
  IF has_table_privilege('anon', 'public.profissionais_ativos',
                         'select, insert, update, delete, truncate, references, trigger')
     OR has_any_column_privilege('anon', 'public.profissionais_ativos', 'insert, update, references')
     OR (v_anon IS DISTINCT FROM (SELECT array_agg(x ORDER BY x COLLATE "C") FROM unnest(v_fila) x)
         AND v_anon IS DISTINCT FROM (SELECT array_agg(x ORDER BY x COLLATE "C") FROM unnest(v_app) x)) THEN
    v_falhas := v_falhas || format('anon fora do esperado (4 ou 9 colunas, so SELECT): %s', v_anon);
  END IF;

  -- service_role: tudo
  -- cada privilégio num has_table_privilege próprio (com a lista, basta UM para dar true)
  IF NOT has_table_privilege('service_role', 'public.profissionais_ativos', 'select')
     OR NOT has_table_privilege('service_role', 'public.profissionais_ativos', 'insert')
     OR NOT has_table_privilege('service_role', 'public.profissionais_ativos', 'update')
     OR NOT has_table_privilege('service_role', 'public.profissionais_ativos', 'delete') THEN
    v_falhas := v_falhas || 'service_role perdeu privilegio'::text;
  END IF;

  -- policy de leitura de linhas (fila sem login e app logado dependem dela)
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies
                  WHERE schemaname = 'public' AND tablename = 'profissionais_ativos'
                    AND policyname = 'Permitir leitura pública de profissionais' AND cmd = 'SELECT') THEN
    v_falhas := v_falhas || 'policy de leitura publica de profissionais_ativos sumiu'::text;
  END IF;

  -- RPCs continuam executáveis por authenticated (o e-mail e o vínculo saem por elas)
  IF NOT has_function_privilege('authenticated', 'public.destaque_minha_profissional()', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.destaque_profissionais_sem_conta()', 'execute') THEN
    v_falhas := v_falhas || 'authenticated sem EXECUTE nas RPCs da A'::text;
  END IF;

  IF array_length(v_falhas, 1) > 0 THEN
    RAISE EXCEPTION 'migracao B abortada: %', array_to_string(v_falhas, ' | ');
  END IF;
END $$;
