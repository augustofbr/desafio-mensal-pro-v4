-- profissionais_ativos ganha `email` e `trinks_id_profissional` (id da REDE Trinks, espaco P),
-- e o webhook de profissional (eventos 5/6) passa a preenche-los.
--
-- Por que:
--   * `email` vai ser a chave de vinculo login -> profissional (login das profissionais, em
--     breve). Por isso e UNICO (sem dois cadastros com o mesmo e-mail) e normalizado.
--   * `trinks_id_profissional` guarda o id no espaco P ao lado da PK (espaco E), para que
--     consumidores nao precisem de join com trinks_profissional_id_map para cruzar com a API.
--     Espaco P = `IdDoProfissional` do webhook = `idProfissional` de GET /v1/profissionais =
--     `id_pessoa` de trinks_profissional_id_map. NAO e `IdPessoaDoProfissional` (terceiro id,
--     nao usar). A PK "profissionalId" e o espaco E (`IdDoProfissionalNoEstabelecimento`).
--     Evidencia em prod (2026-10-20): map 885975 -> 391281 (Aline), igual ao idProfissional da
--     API; 945197 -> 736008 (Lincoln), igual ao IdDoProfissional do webhook.
--     Refs: docs/trinks-automacao/HANDOFF.md (secao "IDs de profissional"),
--     20260730230934_trinks_map_upsert_webhook.sql:8-10.
--
-- Transacao e lock: o corpo inteiro roda numa transacao (apply_migration manda o arquivo como
-- um lote; conferido em 2026-10-20 que SET LOCAL vale no lote via execute_sql, PG 15.8). O
-- ALTER TABLE pega ACCESS EXCLUSIVE numa tabela compartilhada (fila, NFS-e, financeiro, n8n),
-- entao `SET LOCAL lock_timeout = '5s'`: se houver transacao longa segurando a tabela, a
-- migracao falha inteira (sem efeito parcial) em vez de enfileirar todo mundo atras dela.
-- Um DO logo abaixo ASSERTA que o lock_timeout pegou — se o arquivo rodar fora de transacao, o
-- SET LOCAL nao tem efeito e a migracao aborta antes do ALTER.
--
-- Escopo:
--   1) duas colunas nullable + CHECKs + indices UNIQUE parciais + comentarios;
--   2) backfill de trinks_id_profissional a partir de trinks_profissional_id_map (so pares
--      inequivocos: o map tem PK id_pessoa e UNIQUE id_estabelecimento, logo e 1:1 por
--      construcao; ainda assim pula id_pessoa com quarentena aberta). Medido em 2026-10-20:
--      28 profissionais, 27 casam, quarentena vazia, 0 conflitos. Fica NULL: Felipe (924461),
--      que nao tem par no map;
--   3) trinks_profissional_upsert_do_webhook: create or replace a partir da definicao VIGENTE
--      em prod (md5 do pg_get_functiondef 777162321627fe01058c576fd9a27fc3, a versao com
--      telefone), com todo o comportamento, owner/grants e chaves de retorno preservados. Muda:
--        - search_path = public, pg_temp (era so public);
--        - `Email` -> email (chave confirmada: execucao n8n 424521, evento 6, preenchida).
--          Remove U+00A0, U+200B-U+200D e U+FEFF, depois btrim+lower, e valida com a MESMA
--          regra ASCII do CHECK. Vazio = ignorado; presente mas implausivel = ignorado e
--          registrado em automation_logs com is_error=false. Grava SO quando a coluna esta
--          NULL. Diferente do gravado: NAO sobrescreve, alerta. Ja e de OUTRA profissional:
--          nao grava, alerta, e a funcao NAO falha (checagem previa + unique_violation local);
--        - `IdDoProfissional` -> trinks_id_profissional: mesma politica, e tambem NAO grava se
--          o id estiver em quarentena aberta em trinks_profissional_id_map_quarentena (alerta);
--        - alertas novos (incl. o de implausivel) nao se repetem: se a mesma mensagem ja esta
--          em automation_logs nas ultimas 24h, nao grava de novo;
--        - retorno ganha chaves novas (email_*, id_rede_*), sem remover as antigas.
--      Evento 7 (inativacao) e os retornos de 'ignorado' ficam identicos.
--      O no n8n "Upsert profissionais_ativos (5/6/7)" ja manda o payload inteiro
--      (JSON.stringify($('Parser para JSON').item.json)), entao nao muda.
--
-- Formato do e-mail (CHECK e funcao usam a mesma regra): so ASCII imprimivel sem espaco
-- ([!-?A-~], i.e. 0x21-0x7E menos '@'), exatamente um '@', ponto no dominio. Motivo: NBSP,
-- zero-width e BOM passam por btrim, por [[:space:]] (locale libc) e pelo UNIQUE — dois
-- e-mails "iguais" na tela virariam duas chaves diferentes. E-mail com acento/IDN fica de fora
-- (implausivel); se um dia for preciso, muda a regra nos dois lugares numa migracao nova.
--
-- Normalizacao do e-mail: garantida por CHECK (email = lower(btrim(email))), nao so pela
-- funcao. Motivo: a tabela tem varios escritores com service_role (NFS-e, financeiro-studiox,
-- n8n) que ignoram a funcao; com o CHECK, um e-mail com maiuscula/espaco nunca entra, e o
-- UNIQUE em lower(email) nao e contornado por grafia. Quem gravar sem normalizar recebe erro
-- 23514 explicito (hoje nenhum escritor grava email: a coluna e nova).
--
-- Permissoes:
--   * anon tem so GRANT por coluna (20261019160000_profissionais_ativos_colunas_anon.sql), entao
--     coluna nova NAO entra para anon. O bloco final ASSERTA isso e aborta a migracao se nao.
--   * authenticated tem GRANT de TABELA (arwdDxt) e a policy publica de SELECT (using true):
--     le as colunas novas, como ja le cpf/telefone. Ver PENDENCIAS abaixo.
--
-- PENDENCIAS ANTES DE LIGAR O LOGIN (nao resolvidas aqui, de proposito):
--   a) O webhook n8n "Webhook Trinks - Geral" nao tem autenticacao: quem souber a URL manda um
--      evento 6 com qualquer `Email`. A origem do e-mail NAO e autenticada, e a regra e "o
--      primeiro grava" — um e-mail injetado antes do real ocupa a linha (o real vira alerta).
--   b) authenticated LE email de todas (policy SELECT using true + grant arwdDxt) e pode dar
--      UPDATE em email se tiver papel admin/contador da NFS-e (policy nfse_update_*). Fechar
--      com grant por coluna / revoke de escrita antes do login.
--   c) Recontratacao: profissional inativada e recadastrada no Trinks ganha outro id E; o
--      e-mail fica preso na linha inativa (UNIQUE) e o novo cadastro vira alerta. O login tem
--      de checar `ativo` e alguem tem de mover o e-mail manualmente.
--   Mitigacao vigente para (a): a criacao de usuarios de auth e SEMPRE revisada pelo dono (a
--   lista e conferida antes de criar), entao um e-mail injetado aqui nao vira conta sozinho.
--
-- Consumidores conferidos (2026-10-20). A tabela e legada e compartilhada; o
-- gerenciador-fila-interna-V2/CLAUDE.md diz "nao alterar estrutura" — o dono decidiu
-- acrescentar colunas. Colunas novas nullable, sem default, nao quebram ninguem:
--   * gerenciador-fila-interna-V2: so selects com colunas explicitas;
--   * destaque-mensal-pro-v4 (anon): colunas explicitas;
--   * emissao-nota-prof-parceiro: select('*') como authenticated (recebe 2 chaves a mais);
--     INSERT/UPDATE/DELETE via service_role com colunas explicitas;
--   * financeiro-studiox: service_role, colunas explicitas;
--   * n8n "Multiagente Principal V2" (select *, informado no brief) e espelho diario
--     (upsert com colunas explicitas): chaves a mais no item, inserts sem as colunas validos;
--   * views dependentes (pg_depend): financeiro_studiox_v_pessoas_master e
--     financeiro_studiox_v_dasmei_duplo_titulo — ambas listam colunas explicitas (nenhuma usa
--     pa.*), entao um `create or replace view` futuro nao e afetado;
--   * funcoes que citam a tabela (fila_trinks_process_webhook, trinks_apply_snapshot,
--     trinks_map_upsert_par, trinks_refresh_profissional_id_map, financeiro_studiox_dasmei_*):
--     nenhuma usa %rowtype, select * ou insert sem lista de colunas;
--   * FKs que apontam para a tabela (gerencia-fila-trinks-appointments, certificados,
--     emissoes) referenciam so a PK. Sem triggers na tabela. Fora da publication realtime.
--
-- Rollback autossuficiente (nao depende de nenhum outro arquivo). Rodar numa transacao, nesta
-- ordem: funcao antiga -> drop indices -> drop colunas (a funcao nova referencia as colunas,
-- entao ela sai antes). O drop apaga os e-mails gravados pelo webhook: exporte antes se ja
-- houver login usando. Conferencia: depois do passo 1,
--   select md5(pg_get_functiondef('public.trinks_profissional_upsert_do_webhook(jsonb)'::regprocedure))
-- tem de dar 777162321627fe01058c576fd9a27fc3.
/* ---- ROLLBACK ----
begin;
set local lock_timeout = '5s';

-- 1) funcao vigente antes desta migracao (pg_get_functiondef de 2026-10-20, md5 777162321627fe01058c576fd9a27fc3)
CREATE OR REPLACE FUNCTION public.trinks_profissional_upsert_do_webhook(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_evento      int;
  v_id_e        bigint;
  v_nome        text;
  v_apelido     text;
  v_cpf         text;
  v_funcao      text;
  v_funcao_norm text;
  v_categoria   text;
  v_conhecida   boolean;
  v_nasc        date;
  v_existe      boolean;
  v_acao        text;
  v_cat_final   text;
  v_tel_bruto   text;
  v_tel_dig     text;
  v_telefone    text;
  v_tel_ok      boolean := false;
BEGIN
  v_evento := NULLIF(p_payload ->> 'TipoDeEvento', '')::int;
  v_id_e   := NULLIF(p_payload ->> 'IdDoProfissionalNoEstabelecimento', '')::bigint;

  IF v_evento IS NULL OR v_evento NOT IN (5, 6, 7) THEN
    RETURN jsonb_build_object('acao', 'ignorado', 'motivo', 'evento_fora_de_escopo');
  END IF;

  IF v_id_e IS NULL OR v_id_e <= 0 THEN
    RETURN jsonb_build_object('acao', 'ignorado', 'motivo', 'sem_id_estabelecimento');
  END IF;

  SELECT true INTO v_existe FROM profissionais_ativos WHERE "profissionalId" = v_id_e;
  v_existe := COALESCE(v_existe, false);

  IF v_evento = 7 THEN
    IF NOT v_existe THEN
      RETURN jsonb_build_object('acao', 'ignorado', 'motivo', 'inativacao_de_desconhecido',
                                'profissionalId', v_id_e);
    END IF;
    UPDATE profissionais_ativos
       SET ativo = false, updated_at = now()
     WHERE "profissionalId" = v_id_e;
    RETURN jsonb_build_object('acao', 'inativado', 'profissionalId', v_id_e);
  END IF;

  v_nome    := NULLIF(btrim(p_payload ->> 'Nome'), '');
  v_apelido := NULLIF(btrim(p_payload ->> 'Apelido'), '');
  v_cpf     := NULLIF(btrim(p_payload ->> 'CPF'), '');
  v_funcao  := NULLIF(btrim(p_payload ->> 'Funcao'), '');

  IF jsonb_typeof(p_payload -> 'Telefones') = 'array' THEN
    SELECT btrim(t) INTO v_tel_bruto
      FROM jsonb_array_elements_text(p_payload -> 'Telefones') AS t
     WHERE regexp_replace(COALESCE(t, ''), '[^0-9]', '', 'g') <> ''
     LIMIT 1;
  ELSIF jsonb_typeof(p_payload -> 'Telefones') = 'string' THEN
    v_tel_bruto := NULLIF(btrim(p_payload ->> 'Telefones'), '');
  END IF;

  v_tel_dig := regexp_replace(COALESCE(v_tel_bruto, ''), '[^0-9]', '', 'g');

  IF v_tel_dig = '' THEN
    v_telefone := NULL;
  ELSIF length(v_tel_dig) IN (10, 11) THEN
    v_telefone := '55' || v_tel_dig;
    v_tel_ok   := true;
  ELSIF length(v_tel_dig) IN (12, 13) AND left(v_tel_dig, 2) = '55' THEN
    v_telefone := v_tel_dig;
    v_tel_ok   := true;
  ELSE
    v_telefone := v_tel_dig;
  END IF;

  v_funcao_norm := unaccent(lower(COALESCE(v_funcao, '')));

  SELECT m.categoria, true INTO v_categoria, v_conhecida
    FROM trinks_funcao_categoria_map m
   WHERE m.funcao_norm = v_funcao_norm;
  v_conhecida := COALESCE(v_conhecida, false);

  IF NOT v_conhecida THEN
    v_categoria := NULL;
    INSERT INTO automation_logs (message, is_error)
    VALUES (format('webhook profissional: funcao %L (id %s, %s) fora de trinks_funcao_categoria_map - entrou sem categoria e fica fora dos rankings ate ser mapeada',
                   v_funcao, v_id_e, COALESCE(v_apelido, v_nome, '?')), true);
  END IF;

  BEGIN
    v_nasc := to_date(NULLIF(btrim(p_payload ->> 'DataDeNascimento'), ''), 'DD/MM/YYYY');
  EXCEPTION WHEN OTHERS THEN
    v_nasc := NULL;
  END;

  IF v_existe THEN
    UPDATE profissionais_ativos SET
      nome_profissional = COALESCE(v_apelido, v_nome, nome_profissional),
      nome_completo     = COALESCE(v_nome, nome_completo),
      cpf               = COALESCE(v_cpf, cpf),
      apelido           = COALESCE(v_apelido, apelido),
      telefone          = CASE WHEN v_tel_ok THEN v_telefone
                               ELSE COALESCE(telefone, v_telefone) END,
      categoria         = COALESCE(categoria, v_categoria),
      dia_aniversario   = COALESCE(dia_aniversario, EXTRACT(DAY   FROM v_nasc)::smallint),
      mes_aniversario   = COALESCE(mes_aniversario, EXTRACT(MONTH FROM v_nasc)::smallint),
      updated_at        = now()
    WHERE "profissionalId" = v_id_e
    RETURNING categoria INTO v_cat_final;
    v_acao := 'atualizado';
  ELSE
    INSERT INTO profissionais_ativos
      ("profissionalId", nome_profissional, nome_completo, cpf, apelido, telefone, categoria,
       ativo, dia_aniversario, mes_aniversario, updated_at)
    VALUES (
      v_id_e,
      COALESCE(v_apelido, v_nome),
      v_nome, v_cpf, v_apelido, v_telefone, v_categoria,
      true,
      EXTRACT(DAY   FROM v_nasc)::smallint,
      EXTRACT(MONTH FROM v_nasc)::smallint,
      now())
    RETURNING categoria INTO v_cat_final;
    v_acao := 'inserido';
  END IF;

  RETURN jsonb_build_object(
    'acao',            v_acao,
    'profissionalId',  v_id_e,
    'funcao',          v_funcao,
    'funcao_conhecida', v_conhecida,
    'categoria_mapeada', v_categoria,
    'categoria',       v_cat_final,
    'telefone',        v_telefone,
    'telefone_plausivel', v_tel_ok);
END $function$
;

-- owner/grants originais: owner postgres; EXECUTE so postgres e service_role
ALTER FUNCTION public.trinks_profissional_upsert_do_webhook(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trinks_profissional_upsert_do_webhook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trinks_profissional_upsert_do_webhook(jsonb) TO service_role;

-- 2) indices
drop index if exists public.profissionais_ativos_email_uniq;
drop index if exists public.profissionais_ativos_trinks_id_profissional_uniq;

-- 3) colunas (os CHECKs caem junto)
alter table public.profissionais_ativos
  drop column if exists email,
  drop column if exists trinks_id_profissional;
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
-- 1) Colunas
-- ---------------------------------------------------------------------------
-- Formato: ASCII imprimivel sem espaco ([!-?A-~] = 0x21-0x7E menos '@'), um unico '@', ponto
-- no dominio. A funcao do webhook usa exatamente esta mesma expressao.
ALTER TABLE public.profissionais_ativos
  ADD COLUMN IF NOT EXISTS email text
    CONSTRAINT profissionais_ativos_email_normalizado_chk
      CHECK (email IS NULL OR email = lower(btrim(email)))
    CONSTRAINT profissionais_ativos_email_formato_chk
      CHECK (email IS NULL OR email ~ '^[!-?A-~]+@[!-?A-~]+\.[!-?A-~]+$'),
  ADD COLUMN IF NOT EXISTS trinks_id_profissional bigint
    CONSTRAINT profissionais_ativos_trinks_id_profissional_positivo_chk
      CHECK (trinks_id_profissional IS NULL OR trinks_id_profissional > 0);

-- Tabela pequena (28 linhas): indice comum, sem CONCURRENTLY (que nao roda em transacao).
CREATE UNIQUE INDEX IF NOT EXISTS profissionais_ativos_email_uniq
  ON public.profissionais_ativos (lower(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profissionais_ativos_trinks_id_profissional_uniq
  ON public.profissionais_ativos (trinks_id_profissional)
  WHERE trinks_id_profissional IS NOT NULL;

COMMENT ON COLUMN public.profissionais_ativos.email IS
  'E-mail da profissional, normalizado (lower+btrim, CHECK) e so ASCII imprimivel sem espaco, um @, '
  'ponto no dominio (CHECK). UNICO (indice parcial em lower(email)). Chave de vinculo login -> profissional. '
  'Preenchido pelo webhook Trinks (eventos 5/6, campo Email) so quando NULL; divergencia/conflito vira '
  'alerta em automation_logs, nunca sobrescrita. Origem NAO autenticada (webhook aberto): o login deve '
  'checar ativo e a criacao de usuario e revisada pelo dono. Nao legivel por anon.';

COMMENT ON COLUMN public.profissionais_ativos.trinks_id_profissional IS
  'Id da profissional na REDE Trinks (espaco P): IdDoProfissional do webhook = idProfissional de '
  'GET /v1/profissionais = id_pessoa de trinks_profissional_id_map. NAO e IdPessoaDoProfissional '
  '(terceiro id, nao usar). A PK "profissionalId" e o espaco E (IdDoProfissionalNoEstabelecimento). '
  'UNICO. Backfill do map em 2026-10-20; depois, webhook 5/6 preenche so quando NULL e fora de '
  'quarentena. Nao legivel por anon.';

-- ---------------------------------------------------------------------------
-- 2) Backfill de trinks_id_profissional (so pares inequivocos)
-- ---------------------------------------------------------------------------
UPDATE public.profissionais_ativos pa
   SET trinks_id_profissional = m.id_pessoa
  FROM public.trinks_profissional_id_map m
 WHERE m.id_estabelecimento = pa."profissionalId"
   AND pa.trinks_id_profissional IS NULL
   AND m.id_pessoa > 0
   -- 1:1 garantido pelas constraints do map; conferido de novo aqui por defesa
   AND (SELECT count(*) FROM public.trinks_profissional_id_map m2
         WHERE m2.id_estabelecimento = m.id_estabelecimento) = 1
   AND NOT EXISTS (SELECT 1 FROM public.trinks_profissional_id_map_quarentena q
                    WHERE q.id_pessoa = m.id_pessoa AND q.resolvido_em IS NULL)
   AND NOT EXISTS (SELECT 1 FROM public.profissionais_ativos o
                    WHERE o.trinks_id_profissional = m.id_pessoa);

-- ---------------------------------------------------------------------------
-- 3) Webhook de profissional: + email e + id da rede
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trinks_profissional_upsert_do_webhook(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_evento      int;
  v_id_e        bigint;
  v_nome        text;
  v_apelido     text;
  v_cpf         text;
  v_funcao      text;
  v_funcao_norm text;
  v_categoria   text;
  v_conhecida   boolean;
  v_nasc        date;
  v_existe      boolean;
  v_acao        text;
  v_cat_final   text;
  v_tel_bruto   text;
  v_tel_dig     text;
  v_telefone    text;
  v_tel_ok      boolean := false;
  -- e-mail
  v_email_presente boolean := false;
  v_email          text;
  v_email_ok       boolean := false;
  v_email_atual    text;
  v_email_dono     bigint;
  v_email_gravado  boolean := false;
  v_email_alerta   text;
  -- id da rede (espaco P)
  v_idp_presente   boolean := false;
  v_idp            bigint;
  v_idp_atual      bigint;
  v_idp_dono       bigint;
  v_idp_gravado    boolean := false;
  v_idp_alerta     text;
  -- alertas (gravados no fim, com dedupe de 24h)
  v_quem           text;
  v_msgs           text[]    := '{}';
  v_errs           boolean[] := '{}';
  i                int;
BEGIN
  v_evento := NULLIF(p_payload ->> 'TipoDeEvento', '')::int;
  v_id_e   := NULLIF(p_payload ->> 'IdDoProfissionalNoEstabelecimento', '')::bigint;

  IF v_evento IS NULL OR v_evento NOT IN (5, 6, 7) THEN
    RETURN jsonb_build_object('acao', 'ignorado', 'motivo', 'evento_fora_de_escopo');
  END IF;

  IF v_id_e IS NULL OR v_id_e <= 0 THEN
    RETURN jsonb_build_object('acao', 'ignorado', 'motivo', 'sem_id_estabelecimento');
  END IF;

  SELECT true INTO v_existe FROM profissionais_ativos WHERE "profissionalId" = v_id_e;
  v_existe := COALESCE(v_existe, false);

  IF v_evento = 7 THEN
    IF NOT v_existe THEN
      RETURN jsonb_build_object('acao', 'ignorado', 'motivo', 'inativacao_de_desconhecido',
                                'profissionalId', v_id_e);
    END IF;
    UPDATE profissionais_ativos
       SET ativo = false, updated_at = now()
     WHERE "profissionalId" = v_id_e;
    RETURN jsonb_build_object('acao', 'inativado', 'profissionalId', v_id_e);
  END IF;

  v_nome    := NULLIF(btrim(p_payload ->> 'Nome'), '');
  v_apelido := NULLIF(btrim(p_payload ->> 'Apelido'), '');
  v_cpf     := NULLIF(btrim(p_payload ->> 'CPF'), '');
  v_funcao  := NULLIF(btrim(p_payload ->> 'Funcao'), '');

  IF jsonb_typeof(p_payload -> 'Telefones') = 'array' THEN
    SELECT btrim(t) INTO v_tel_bruto
      FROM jsonb_array_elements_text(p_payload -> 'Telefones') AS t
     WHERE regexp_replace(COALESCE(t, ''), '[^0-9]', '', 'g') <> ''
     LIMIT 1;
  ELSIF jsonb_typeof(p_payload -> 'Telefones') = 'string' THEN
    v_tel_bruto := NULLIF(btrim(p_payload ->> 'Telefones'), '');
  END IF;

  v_tel_dig := regexp_replace(COALESCE(v_tel_bruto, ''), '[^0-9]', '', 'g');

  IF v_tel_dig = '' THEN
    v_telefone := NULL;
  ELSIF length(v_tel_dig) IN (10, 11) THEN
    v_telefone := '55' || v_tel_dig;
    v_tel_ok   := true;
  ELSIF length(v_tel_dig) IN (12, 13) AND left(v_tel_dig, 2) = '55' THEN
    v_telefone := v_tel_dig;
    v_tel_ok   := true;
  ELSE
    v_telefone := v_tel_dig;
  END IF;

  v_funcao_norm := unaccent(lower(COALESCE(v_funcao, '')));

  SELECT m.categoria, true INTO v_categoria, v_conhecida
    FROM trinks_funcao_categoria_map m
   WHERE m.funcao_norm = v_funcao_norm;
  v_conhecida := COALESCE(v_conhecida, false);

  IF NOT v_conhecida THEN
    v_categoria := NULL;
    INSERT INTO automation_logs (message, is_error)
    VALUES (format('webhook profissional: funcao %L (id %s, %s) fora de trinks_funcao_categoria_map - entrou sem categoria e fica fora dos rankings ate ser mapeada',
                   v_funcao, v_id_e, COALESCE(v_apelido, v_nome, '?')), true);
  END IF;

  BEGIN
    v_nasc := to_date(NULLIF(btrim(p_payload ->> 'DataDeNascimento'), ''), 'DD/MM/YYYY');
  EXCEPTION WHEN OTHERS THEN
    v_nasc := NULL;
  END;

  IF v_existe THEN
    UPDATE profissionais_ativos SET
      nome_profissional = COALESCE(v_apelido, v_nome, nome_profissional),
      nome_completo     = COALESCE(v_nome, nome_completo),
      cpf               = COALESCE(v_cpf, cpf),
      apelido           = COALESCE(v_apelido, apelido),
      telefone          = CASE WHEN v_tel_ok THEN v_telefone
                               ELSE COALESCE(telefone, v_telefone) END,
      categoria         = COALESCE(categoria, v_categoria),
      dia_aniversario   = COALESCE(dia_aniversario, EXTRACT(DAY   FROM v_nasc)::smallint),
      mes_aniversario   = COALESCE(mes_aniversario, EXTRACT(MONTH FROM v_nasc)::smallint),
      updated_at        = now()
    WHERE "profissionalId" = v_id_e
    RETURNING categoria INTO v_cat_final;
    v_acao := 'atualizado';
  ELSE
    INSERT INTO profissionais_ativos
      ("profissionalId", nome_profissional, nome_completo, cpf, apelido, telefone, categoria,
       ativo, dia_aniversario, mes_aniversario, updated_at)
    VALUES (
      v_id_e,
      COALESCE(v_apelido, v_nome),
      v_nome, v_cpf, v_apelido, v_telefone, v_categoria,
      true,
      EXTRACT(DAY   FROM v_nasc)::smallint,
      EXTRACT(MONTH FROM v_nasc)::smallint,
      now())
    RETURNING categoria INTO v_cat_final;
    v_acao := 'inserido';
  END IF;

  -- ===================== acrescimo 20261020120000 =====================
  -- Roda DEPOIS do upsert principal e nunca o desfaz: cada gravacao fica num bloco proprio
  -- (subtransacao) e qualquer conflito vira alerta, nao erro. A linha ja esta travada pelo
  -- UPDATE/INSERT acima nesta transacao.
  v_quem := COALESCE(v_apelido, v_nome, '?');

  -- --- e-mail -------------------------------------------------------------
  -- Tira NBSP (U+00A0), zero-width (U+200B..U+200D) e BOM (U+FEFF) ANTES do btrim/lower, que
  -- nao os removem; depois valida com a mesma regra ASCII do CHECK de formato.
  v_email := lower(btrim(translate(COALESCE(p_payload ->> 'Email', ''),
                                   chr(160) || chr(8203) || chr(8204) || chr(8205) || chr(65279),
                                   '')));
  v_email_presente := v_email <> '';
  v_email_ok := v_email_presente AND v_email ~ '^[!-?A-~]+@[!-?A-~]+\.[!-?A-~]+$';

  IF v_email_presente AND NOT v_email_ok THEN
    v_msgs := v_msgs || format('webhook profissional: email %L do Trinks (id %s, %s) implausivel - ignorado, conferir cadastro no Trinks',
                               v_email, v_id_e, v_quem);
    v_errs := v_errs || false;
  END IF;

  IF v_email_ok THEN
    SELECT email INTO v_email_atual FROM profissionais_ativos WHERE "profissionalId" = v_id_e;

    IF v_email_atual IS NULL THEN
      SELECT "profissionalId" INTO v_email_dono
        FROM profissionais_ativos
       WHERE lower(email) = v_email AND "profissionalId" <> v_id_e
       LIMIT 1;

      IF v_email_dono IS NOT NULL THEN
        v_email_alerta := 'email_de_outra_profissional';
      ELSE
        BEGIN
          UPDATE profissionais_ativos SET email = v_email
           WHERE "profissionalId" = v_id_e AND email IS NULL;
          v_email_gravado := FOUND;
        EXCEPTION WHEN unique_violation THEN
          -- corrida: outra transacao gravou o mesmo e-mail em outra linha entre o SELECT e o UPDATE
          v_email_alerta := 'email_de_outra_profissional';
          SELECT "profissionalId" INTO v_email_dono
            FROM profissionais_ativos
           WHERE lower(email) = v_email AND "profissionalId" <> v_id_e
           LIMIT 1;
        END;
      END IF;
    ELSIF v_email_atual <> v_email THEN
      v_email_alerta := 'email_divergente';
    END IF;

    IF v_email_alerta = 'email_de_outra_profissional' THEN
      v_msgs := v_msgs || format('webhook profissional: email %L do Trinks (id %s, %s) ja pertence a profissional %s em profissionais_ativos - nao gravado, conferir cadastro no Trinks',
                                 v_email, v_id_e, v_quem, COALESCE(v_email_dono::text, '?'));
      v_errs := v_errs || true;
    ELSIF v_email_alerta = 'email_divergente' THEN
      v_msgs := v_msgs || format('webhook profissional: email %L do Trinks (id %s, %s) difere do gravado em profissionais_ativos - nao sobrescrito, decidir manualmente',
                                 v_email, v_id_e, v_quem);
      v_errs := v_errs || true;
    END IF;
  END IF;

  -- --- id da rede (espaco P) ----------------------------------------------
  v_idp_presente := NULLIF(btrim(COALESCE(p_payload ->> 'IdDoProfissional', '')), '') IS NOT NULL;
  BEGIN
    v_idp := NULLIF(btrim(p_payload ->> 'IdDoProfissional'), '')::bigint;
  EXCEPTION WHEN OTHERS THEN
    v_idp := NULL;
  END;
  IF v_idp IS NOT NULL AND v_idp <= 0 THEN
    v_idp := NULL;
  END IF;

  IF v_idp IS NOT NULL THEN
    SELECT trinks_id_profissional INTO v_idp_atual
      FROM profissionais_ativos WHERE "profissionalId" = v_id_e;

    IF v_idp_atual IS NULL THEN
      SELECT "profissionalId" INTO v_idp_dono
        FROM profissionais_ativos
       WHERE trinks_id_profissional = v_idp AND "profissionalId" <> v_id_e
       LIMIT 1;

      IF EXISTS (SELECT 1 FROM trinks_profissional_id_map_quarentena q
                  WHERE q.id_pessoa = v_idp AND q.resolvido_em IS NULL) THEN
        -- mesma regra do backfill: par em disputa nao vira dado
        v_idp_alerta := 'id_rede_em_quarentena';
      ELSIF v_idp_dono IS NOT NULL THEN
        v_idp_alerta := 'id_rede_de_outra_profissional';
      ELSE
        BEGIN
          UPDATE profissionais_ativos SET trinks_id_profissional = v_idp
           WHERE "profissionalId" = v_id_e AND trinks_id_profissional IS NULL;
          v_idp_gravado := FOUND;
        EXCEPTION WHEN unique_violation THEN
          v_idp_alerta := 'id_rede_de_outra_profissional';
          SELECT "profissionalId" INTO v_idp_dono
            FROM profissionais_ativos
           WHERE trinks_id_profissional = v_idp AND "profissionalId" <> v_id_e
           LIMIT 1;
        END;
      END IF;
    ELSIF v_idp_atual <> v_idp THEN
      v_idp_alerta := 'id_rede_divergente';
    END IF;

    IF v_idp_alerta = 'id_rede_em_quarentena' THEN
      v_msgs := v_msgs || format('webhook profissional: IdDoProfissional %s (id %s, %s) esta em quarentena aberta em trinks_profissional_id_map_quarentena - nao gravado, resolver a quarentena',
                                 v_idp, v_id_e, v_quem);
      v_errs := v_errs || true;
    ELSIF v_idp_alerta = 'id_rede_de_outra_profissional' THEN
      v_msgs := v_msgs || format('webhook profissional: IdDoProfissional %s (id %s, %s) ja pertence a profissional %s em profissionais_ativos.trinks_id_profissional - nao gravado, conferir trinks_profissional_id_map',
                                 v_idp, v_id_e, v_quem, COALESCE(v_idp_dono::text, '?'));
      v_errs := v_errs || true;
    ELSIF v_idp_alerta = 'id_rede_divergente' THEN
      v_msgs := v_msgs || format('webhook profissional: IdDoProfissional %s (id %s, %s) difere do trinks_id_profissional gravado (%s) - nao sobrescrito, conferir trinks_profissional_id_map',
                                 v_idp, v_id_e, v_quem, v_idp_atual);
      v_errs := v_errs || true;
    END IF;
  END IF;

  -- --- alertas: a mesma mensagem nao se repete em 24h ------------------------
  -- (evento 6 chega a cada edicao no Trinks; sem isso o mesmo conflito viraria spam)
  FOR i IN 1 .. coalesce(array_length(v_msgs, 1), 0) LOOP
    IF NOT EXISTS (SELECT 1 FROM automation_logs l
                    WHERE l.message = v_msgs[i]
                      AND l.created_at > now() - interval '24 hours') THEN
      INSERT INTO automation_logs (message, is_error) VALUES (v_msgs[i], v_errs[i]);
    END IF;
  END LOOP;
  -- =================== fim do acrescimo 20261020120000 ===================

  RETURN jsonb_build_object(
    'acao',            v_acao,
    'profissionalId',  v_id_e,
    'funcao',          v_funcao,
    'funcao_conhecida', v_conhecida,
    'categoria_mapeada', v_categoria,
    'categoria',       v_cat_final,
    'telefone',        v_telefone,
    'telefone_plausivel', v_tel_ok,
    -- novas (20261020120000)
    'email_presente',  v_email_presente,
    'email_plausivel', v_email_ok,
    'email_gravado',   v_email_gravado,
    'email_alerta',    v_email_alerta,
    'id_rede',         v_idp,
    'id_rede_presente', v_idp_presente,
    'id_rede_gravado', v_idp_gravado,
    'id_rede_alerta',  v_idp_alerta);
END $$;

REVOKE ALL ON FUNCTION public.trinks_profissional_upsert_do_webhook(jsonb)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Guarda: anon NAO le as colunas novas (aborta a migracao se ler)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF has_column_privilege('anon', 'public.profissionais_ativos', 'email', 'SELECT')
     OR has_column_privilege('anon', 'public.profissionais_ativos', 'trinks_id_profissional', 'SELECT') THEN
    RAISE EXCEPTION 'anon consegue ler email/trinks_id_profissional em profissionais_ativos - abortando';
  END IF;
END $$;
