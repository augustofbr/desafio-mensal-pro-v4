-- Login em todas as rotas — migração C: tira `anon` das tabelas do Destaque.
--
-- ============================================================================================
-- AVISO 1 — APLICAR BYTE A BYTE, COM OS COMENTÁRIOS. Os asserts de md5 (início, guarda e
--   ROLLBACK) comparam o prosrc do trigger avaliacoes_cadastradas_antes_inserir e o
--   pg_get_functiondef de avaliacao_clientes_do_dia; os comentários DENTRO desses corpos entram
--   no hash. Aplicar sem eles (ou com espaços trocados) faz o ROLLBACK recusar-se a rodar.
-- AVISO 2 — APLICAR SÓ DEPOIS (a) do deploy do front com login em todas as rotas (Tasks 2-4)
--   e das contas das profissionais (Task 5), e (b) da pré-checagem dos logs (Task 6, Step 1):
--   nenhuma requisição `anon` com referer do Destaque para /rest/v1/{trinks_services,
--   avaliacoes_cadastradas, regras_desafio, feriados, tratamento_fabricante,
--   profissional_fabricante} nem /rpc/avaliacao_clientes_do_dia depois do deploy. Com o bundle
--   antigo ainda no ar, a página pública quebra inteira (42501 em tudo).
--   ORDEM FINAL: migração B (20261021105000_login_fase_b_colunas_authenticated.sql), depois o
--   deploy do front, depois esta C. A C vale com ou sem a B aplicada: a guarda e a verificação
--   conferem só as 9 colunas de profissionais_ativos que a B mantém para authenticated.
-- AVISO 3 — rodar FORA da janela do sync do n8n: a migração pega ACCESS EXCLUSIVE nas seis
--   tabelas de uma vez (LOCK TABLE logo depois dos asserts de partida), até o commit — o site e o
--   n8n esperam alguns segundos. lock_timeout de 5s: se alguma tabela estiver ocupada, a
--   migração falha inteira, sem efeito parcial; basta rodar de novo.
-- ============================================================================================
--
-- Spec: docs/superpowers/specs/2026-10-20-login-todas-as-rotas-design.md.
-- Plano: docs/superpowers/plans/2026-10-20-login-todas-as-rotas.md (Task 6).
-- Verificação: supabase/verificacoes/login_fase_c.sql (begin ... rollback, papel x verificação).
-- Depende da migração A (20261021100000_login_fase_a.sql), já aplicada: as policies novas
-- `to authenticated` dela passam a ser as ÚNICAS de leitura/INSERT destas tabelas.
--
-- O que muda, nesta ordem:
--   0) Asserts do estado de partida: o trigger avaliacoes_cadastradas_antes_inserir é a versão
--      da A (md5 do prosrc a58702fd76f0ee6c5ac53c8cb7e01a2f), o helper do espelho é a versão da
--      A (md5 do prosrc 2a5896c97ead08f705902ded2221bc45) e avaliacao_clientes_do_dia é a
--      versão de 2026-10-19 (md5 do pg_get_functiondef b41650748de4c78723e617f475e1e384, lido em
--      2026-10-20). Se alguém mudou um dos dois depois, a migração aborta antes de tudo.
--      Consequência: NÃO é reaplicável (na segunda vez o assert do trigger aborta, sem efeito).
--      Logo depois, um único LOCK TABLE das seis tabelas IN ACCESS EXCLUSIVE MODE (sob o
--      lock_timeout de 5s): pega todos os locks de uma vez, em vez de cada DROP POLICY
--      enfileirar atrás de leitores, um depois do outro.
--   1) DROP das 7 policies públicas antigas (todas `to public`, então valiam também para
--      authenticated):
--        trinks_services          "Public can view trinks_services"                     SELECT
--        regras_desafio           "Allow public read on regras_desafio"                 SELECT
--        feriados                 "Allow public read on feriados"                       SELECT
--        tratamento_fabricante    "Allow public read access on tratamento_fabricante"   SELECT
--        profissional_fabricante  "Allow public read access on profissional_fabricante" SELECT
--        avaliacoes_cadastradas   "Permitir leitura pública de avaliações"              SELECT
--        avaliacoes_cadastradas   "Permitir inserção pública com status pendente"       INSERT
--      Depois disso, authenticated fica só com as da A: <tabela>_select_painel (read em
--      `painel`), avaliacoes_select_logado e avaliacoes_insert_logado. As de escrita do admin
--      (<tabela>_write_admin e avaliacoes_cadastradas_update_admin) NÃO são tocadas (a guarda
--      confere).
--   2) REVOKE ALL de anon nas seis tabelas. REVOKE de tabela também revoga os privilégios de
--      COLUNA correspondentes, então o SELECT por coluna de avaliacoes_cadastradas (13 colunas,
--      sem motivo_recusa) sai junto. authenticated NÃO muda: segue com o SELECT por coluna (sem
--      motivo_recusa) e com INSERT/UPDATE em avaliacoes_cadastradas; nas outras cinco, com o que
--      tem hoje (a RLS decide).
--   3) profissionais_ativos: anon fica SÓ com SELECT em "profissionalId", nome_profissional,
--      categoria, ativo — o que a fila (gerenciador-fila-interna-V2) lê sem login. Conferido no
--      código da fila em 2026-10-20 (lib/supabase/queries/{client-queue,professionals,
--      attendances}.ts): select de profissionalId/nome_profissional/categoria, filtros em
--      profissionalId/categoria/ativo, order por nome_profissional. fila_trinks_process_webhook
--      (invoker, executável por anon) lê profissionalId/nome_profissional/categoria. Saem de anon:
--      apelido, dia_aniversario, mes_aniversario, created_at, updated_at (o Destaque passa a ler
--      logado). A policy pública de leitura de linhas ("Permitir leitura pública de
--      profissionais") FICA. authenticated NÃO muda aqui (é da migração B).
--   4) avaliacao_clientes_do_dia(p_profissional_id, p_data): ganha no início do corpo o gate
--        write em `estrelas` OR (read em `estrelas` AND p_profissional_id =
--        destaque_minha_profissional())
--      (o mesmo predicado de destaque_minhas_avaliacoes), embrulhado em coalesce(.., false): sem
--      ele, read em estrelas com destaque_minha_profissional() NULL daria NULL, e `if not NULL`
--      NÃO levanta — a conta sem vínculo veria as clientes de qualquer profissional. Sem
--      permissão: exceção errcode 42501 (antes da checagem da janela de datas, para não vazar
--      nada). Perde o EXECUTE de anon (e de PUBLIC, que já não tinha). O resto do corpo é
--      IDÊNTICO ao vigente (pg_get_functiondef de 2026-10-20). Quem chama sem JWT (postgres,
--      service_role, n8n) passa a receber 42501: no código só o modal de cadastro chama.
--   5) Helper avaliacao_espelho_tem_cliente: perde o EXECUTE de anon (a A deu só até aqui).
--      authenticated mantém (o trigger de INSERT, invoker, chama o helper com o papel de quem
--      insere), mas o helper ganha o MESMO gate de avaliacao_clientes_do_dia (achado do security
--      review: sem ele, qualquer logada perguntava "a profissional Y atendeu a cliente X no dia
--      D?" para qualquer Y). Sem permissão devolve FALSE, sem exceção: o trigger só usa o
--      resultado para anular cliente_trinks_id, e quem não tem permissão já é barrado pela
--      policy avaliacoes_insert_logado. Para quem pode inserir, o gate é o mesmo da policy,
--      então o trigger continua confirmando o id da profissional ligada (a própria estrela) e
--      da Recepção/Admin (write em estrelas). postgres/service_role não chegam ao helper (o
--      trigger retorna antes). O trigger continua INVOKER de propósito: como SECURITY DEFINER,
--      current_user viraria o dono e a regra inteira do trigger desligaria. O resto do corpo
--      do helper é o da A (md5 do prosrc 2a5896c97ead08f705902ded2221bc45).
--   6) Trigger avaliacoes_cadastradas_antes_inserir: a regra (b), dia do atendimento fora de
--      hoje-10..hoje, troca o errcode 22023 por PT400, com a MESMA mensagem. SQLSTATE "PTxxx" é
--      convenção do PostgREST: a resposta HTTP sai com o status xxx (400, erro do cliente) em
--      vez de 500. O front (mensagemDiaForaDaJanela em src/lib/clienteTrinks.ts) aceita 22023,
--      P0D01 (rascunho anterior da C, por compatibilidade) e PT400. Corpo = o da A, com só a
--      linha do errcode (e o comentário dela) trocada.
--   7) Guarda final: aborta se anon ainda tiver qualquer privilégio nas seis tabelas, se não ler
--      as 4 colunas da fila, se ler qualquer outra coluna de profissionais_ativos, se executar
--      avaliacao_clientes_do_dia ou o helper, ou se authenticated tiver perdido o necessário (em
--      profissionais_ativos, as 9 colunas da B, uma a uma — não o SELECT de tabela, que a B tira).
--
-- Fora daqui (de propósito, achados no mapeamento de 2026-10-20 — ver relatório da Task 6):
-- a view public.professional_performance (owner postgres, sem security_invoker, SELECT para
-- anon) e as funções SECURITY DEFINER executáveis por anon get_professional_performance_by_period
-- e sync_missing_professionals leem trinks_services e NÃO passam pela RLS nem pelos grants
-- revogados aqui. Não são do Destaque; decidir em separado.
--
-- Rollback autossuficiente (não depende de outro arquivo). Reabre a leitura pública: só faz
-- sentido se o login der problema e o bundle antigo voltar ao ar. Rodar inteiro, BYTE A BYTE,
-- no SQL Editor (como postgres) — NÃO pelo apply_migration: o bloco tem begin/commit próprios.
-- O DO final confere que os privilégios de anon voltaram; se não, aborta e nada é desfeito.
-- Restaura SELECT (e INSERT em avaliacoes) para anon, mas NÃO devolve REFERENCES/TRIGGER que
-- anon tinha em trinks_services (não eram usados e não deviam existir).
/* ---- ROLLBACK ----
begin;
set local lock_timeout = '5s';

-- 0) só desfaz se as duas funções ainda são as desta migração (md5 da versão da C); se alguém
--    as mudou depois, pare e reavalie
DO $$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.avaliacoes_cadastradas_antes_inserir()'::regprocedure))
     <> 'cec084c52ae3909300aed54850ee3910'
     OR md5(pg_get_functiondef('public.avaliacao_clientes_do_dia(integer, date)'::regprocedure))
     <> '067fcc9513ebfa0a9014478c63988716'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.avaliacao_espelho_tem_cliente(integer, date, bigint)'::regprocedure))
     <> '62ca6957199d076ff2eea1e0769e85a6' THEN
    RAISE EXCEPTION 'trigger de avaliacoes, avaliacao_clientes_do_dia ou o helper do espelho mudou depois da migracao C: rollback abortado';
  END IF;
END $$;

-- 0b) helper do espelho: volta a versão da A (sem gate)
CREATE OR REPLACE FUNCTION public.avaliacao_espelho_tem_cliente(
  p_profissional_id integer, p_dia date, p_cliente_id bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  select coalesce(
    p_profissional_id is not null
    and p_dia is not null
    and p_cliente_id is not null
    and exists (
      select 1
      from public.trinks_services t
      where t.profissionalid = p_profissional_id::text
        and t.service_date   = pg_catalog.to_char(p_dia, 'DD/MM/YYYY')
        and case when pg_catalog.btrim(t.clienteid) ~ '^[0-9]{1,18}$'
                 then pg_catalog.btrim(t.clienteid)::bigint
            end = p_cliente_id
    ),
    false)
$$;

-- 1) trigger: volta a versão da A (errcode 22023)
CREATE OR REPLACE FUNCTION public.avaliacoes_cadastradas_antes_inserir()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
declare
  v_hoje date;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  -- a. relogio do servidor, nunca o do celular
  new.data_hora_cadastro := pg_catalog.now();
  new.created_at := pg_catalog.now();

  -- b. janela do dia do atendimento
  v_hoje := (pg_catalog.now() at time zone 'America/Manaus')::date;
  if new.data_atendimento is not null
     and (new.data_atendimento < v_hoje - 10 or new.data_atendimento > v_hoje) then
    raise exception 'O dia do atendimento precisa estar entre hoje e 10 dias atrás.'
      using errcode = '22023';  -- invalid_parameter_value
  end if;

  -- c. id da cliente so fica se o espelho confirma profissional + dia + cliente
  --    (leitura do espelho no helper SECURITY DEFINER; este trigger continua invoker)
  if new.cliente_trinks_id is not null then
    if new.data_atendimento is null
       or not public.avaliacao_espelho_tem_cliente(
                new.profissional_id, new.data_atendimento, new.cliente_trinks_id) then
      new.cliente_trinks_id := null;
    end if;
  end if;

  -- d. motivo da recusa e do admin, nunca do cadastro publico
  new.motivo_recusa := null;

  return new;
end
$function$;

-- 2) avaliacao_clientes_do_dia: volta a versão sem gate (pg_get_functiondef de 2026-10-20)
CREATE OR REPLACE FUNCTION public.avaliacao_clientes_do_dia(p_profissional_id integer, p_data date)
 RETURNS TABLE(cliente_trinks_id bigint, nome text, servicos text[], fonte text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_hoje date := (pg_catalog.now() at time zone 'America/Manaus')::date;
begin
  if p_data is null or p_data < v_hoje - 10 or p_data > v_hoje then
    raise exception 'avaliacao_clientes_do_dia: p_data (%) fora da janela % a %', p_data, v_hoje - 10, v_hoje
      using errcode = '22023';  -- invalid_parameter_value
  end if;

  return query
  with espelho as (
    select case when pg_catalog.btrim(t.clienteid) ~ '^[0-9]{1,18}$'
                then pg_catalog.btrim(t.clienteid)::bigint end           as cid,
           pg_catalog.btrim(t.client_name)                               as cnome,
           t.service_name                                                as servico
    from public.trinks_services t
    where t.profissionalid = p_profissional_id::text
      and t.service_date   = pg_catalog.to_char(p_data, 'DD/MM/YYYY')
      and t.client_name is not null
      and pg_catalog.btrim(t.client_name) <> ''
  ),
  fila as (
    select pg_catalog.btrim(f.client_name) as cnome,
           f.service_name                  as servico
    from public."gerencia-fila-trinks-appointments" f
    where p_data = v_hoje
      and f.professional_id  = p_profissional_id
      and f.appointment_date = p_data
      and pg_catalog.lower(pg_catalog.btrim(f.trinks_status)) in ('em atendimento', 'finalizado')
      and pg_catalog.btrim(f.client_name) <> ''
  ),
  linhas as (
    select e.cid, e.cnome, e.servico, 'espelho'::text as origem,
           case when e.cid is not null then 'id:' || e.cid::text
                else 'nm:' || public.avaliacao_normalizar_nome(e.cnome) end as chave
    from espelho e
    union all
    select null::bigint, fl.cnome, fl.servico, 'fila'::text,
           coalesce(
             (select 'id:' || min(e2.cid)::text from espelho e2
               where e2.cid is not null
                 and public.avaliacao_normalizar_nome(e2.cnome) = public.avaliacao_normalizar_nome(fl.cnome)),
             'nm:' || public.avaliacao_normalizar_nome(fl.cnome))
    from fila fl
  )
  select max(l.cid),
         coalesce(min(l.cnome) filter (where l.origem = 'espelho'), min(l.cnome)),
         coalesce(array_agg(distinct l.servico) filter (where l.servico is not null), '{}'::text[]),
         case when bool_or(l.origem = 'espelho') then 'espelho' else 'fila' end
  from linhas l
  group by l.chave
  order by 2, 1;
end
$function$
;

-- 2b) conferência: as duas funções voltaram exatamente ao estado anterior à C
DO $$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.avaliacoes_cadastradas_antes_inserir()'::regprocedure))
     <> 'a58702fd76f0ee6c5ac53c8cb7e01a2f'
     OR md5(pg_get_functiondef('public.avaliacao_clientes_do_dia(integer, date)'::regprocedure))
     <> 'b41650748de4c78723e617f475e1e384'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.avaliacao_espelho_tem_cliente(integer, date, bigint)'::regprocedure))
     <> '2a5896c97ead08f705902ded2221bc45' THEN
    RAISE EXCEPTION 'funcoes nao voltaram ao estado anterior a C';
  END IF;
END $$;

-- 3) EXECUTE de anon nas duas funções
GRANT EXECUTE ON FUNCTION public.avaliacao_clientes_do_dia(integer, date) TO anon;
GRANT EXECUTE ON FUNCTION public.avaliacao_espelho_tem_cliente(integer, date, bigint) TO anon;
COMMENT ON FUNCTION public.avaliacao_espelho_tem_cliente(integer, date, bigint) IS
  'true se trinks_services tem linha da profissional, no dia (service_date DD/MM/YYYY), com '
  'clienteid numerico igual. Usado pelo trigger avaliacoes_cadastradas_antes_inserir (invoker) '
  'para nao depender da leitura de trinks_services de quem insere. EXECUTE para anon e '
  'authenticated porque o trigger roda com o papel do INSERT; a migracao C revoga de anon. '
  'Migracao 20261021100000.';

-- 4) profissionais_ativos: as 9 colunas de anon (migração 20261019160000)
REVOKE SELECT ON public.profissionais_ativos FROM anon;
GRANT SELECT ("profissionalId", nome_profissional, categoria, apelido, ativo,
              dia_aniversario, mes_aniversario, created_at, updated_at)
  ON public.profissionais_ativos TO anon;

-- 5) grants de anon nas seis tabelas (sem REFERENCES/TRIGGER em trinks_services)
GRANT SELECT ON public.trinks_services TO anon;
GRANT SELECT ON public.regras_desafio TO anon;
GRANT SELECT ON public.feriados TO anon;
GRANT SELECT ON public.tratamento_fabricante TO anon;
GRANT SELECT ON public.profissional_fabricante TO anon;
GRANT INSERT ON public.avaliacoes_cadastradas TO anon;
GRANT SELECT (id, profissional_id, nome_profissional, nome_cliente, nome_cliente_trinks,
              cliente_trinks_id, data_atendimento, origem_cliente_trinks, status,
              data_hora_cadastro, aprovado_por, data_aprovacao, created_at)
  ON public.avaliacoes_cadastradas TO anon;

-- 6) policies públicas antigas (definições lidas de pg_policies em 2026-10-20)
DROP POLICY IF EXISTS "Public can view trinks_services" ON public.trinks_services;
CREATE POLICY "Public can view trinks_services" ON public.trinks_services
  FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Allow public read on regras_desafio" ON public.regras_desafio;
CREATE POLICY "Allow public read on regras_desafio" ON public.regras_desafio
  FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Allow public read on feriados" ON public.feriados;
CREATE POLICY "Allow public read on feriados" ON public.feriados
  FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Allow public read access on tratamento_fabricante" ON public.tratamento_fabricante;
CREATE POLICY "Allow public read access on tratamento_fabricante" ON public.tratamento_fabricante
  FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Allow public read access on profissional_fabricante" ON public.profissional_fabricante;
CREATE POLICY "Allow public read access on profissional_fabricante" ON public.profissional_fabricante
  FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Permitir leitura pública de avaliações" ON public.avaliacoes_cadastradas;
CREATE POLICY "Permitir leitura pública de avaliações" ON public.avaliacoes_cadastradas
  FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Permitir inserção pública com status pendente" ON public.avaliacoes_cadastradas;
CREATE POLICY "Permitir inserção pública com status pendente" ON public.avaliacoes_cadastradas
  FOR INSERT TO public
  WITH CHECK (status = 'pendente' AND aprovado_por IS NULL AND data_aprovacao IS NULL);

-- 7) conferência: anon voltou a ter o que o bundle antigo usa (senão aborta, nada é desfeito)
DO $$
DECLARE
  v_falhas text[] := '{}';
  t text;
  c text;
BEGIN
  FOREACH t IN ARRAY ARRAY['public.trinks_services', 'public.regras_desafio', 'public.feriados',
                           'public.tratamento_fabricante', 'public.profissional_fabricante'] LOOP
    IF NOT has_table_privilege('anon', t, 'select') THEN
      v_falhas := v_falhas || format('anon sem SELECT em %s', t);
    END IF;
  END LOOP;
  IF NOT has_table_privilege('anon', 'public.avaliacoes_cadastradas', 'insert') THEN
    v_falhas := v_falhas || 'anon sem INSERT em avaliacoes_cadastradas'::text;
  END IF;
  FOREACH c IN ARRAY ARRAY['id', 'profissional_id', 'nome_profissional', 'nome_cliente',
                           'nome_cliente_trinks', 'cliente_trinks_id', 'data_atendimento',
                           'origem_cliente_trinks', 'status', 'data_hora_cadastro',
                           'aprovado_por', 'data_aprovacao', 'created_at'] LOOP
    IF NOT has_column_privilege('anon', 'public.avaliacoes_cadastradas', c, 'select') THEN
      v_falhas := v_falhas || format('anon nao le avaliacoes_cadastradas.%s', c);
    END IF;
  END LOOP;
  IF has_column_privilege('anon', 'public.avaliacoes_cadastradas', 'motivo_recusa', 'select') THEN
    v_falhas := v_falhas || 'anon le motivo_recusa'::text;
  END IF;
  FOREACH c IN ARRAY ARRAY['profissionalId', 'nome_profissional', 'categoria', 'apelido', 'ativo',
                           'dia_aniversario', 'mes_aniversario', 'created_at', 'updated_at'] LOOP
    IF NOT has_column_privilege('anon', 'public.profissionais_ativos', c, 'select') THEN
      v_falhas := v_falhas || format('anon nao le profissionais_ativos.%s', c);
    END IF;
  END LOOP;
  IF NOT has_function_privilege('anon', 'public.avaliacao_clientes_do_dia(integer, date)', 'execute')
     OR NOT has_function_privilege('anon', 'public.avaliacao_espelho_tem_cliente(integer, date, bigint)', 'execute') THEN
    v_falhas := v_falhas || 'anon sem EXECUTE em clientes_do_dia ou no helper'::text;
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_policies
       WHERE schemaname = 'public' AND roles = ARRAY['public']::name[]
         AND policyname IN ('Public can view trinks_services', 'Allow public read on regras_desafio',
                            'Allow public read on feriados',
                            'Allow public read access on tratamento_fabricante',
                            'Allow public read access on profissional_fabricante',
                            'Permitir leitura pública de avaliações',
                            'Permitir inserção pública com status pendente')) <> 7 THEN
    v_falhas := v_falhas || 'policies publicas antigas nao voltaram (7)'::text;
  END IF;
  IF array_length(v_falhas, 1) > 0 THEN
    RAISE EXCEPTION 'rollback da C incompleto: %', array_to_string(v_falhas, ' | ');
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
BEGIN
  IF to_regprocedure('public.destaque_minha_profissional()') IS NULL
     OR to_regprocedure('public.avaliacao_espelho_tem_cliente(integer, date, bigint)') IS NULL
     OR (SELECT count(*) FROM pg_catalog.pg_policies
          WHERE schemaname = 'public'
            AND policyname IN ('trinks_services_select_painel', 'regras_desafio_select_painel',
                               'feriados_select_painel', 'tratamento_fabricante_select_painel',
                               'profissional_fabricante_select_painel', 'avaliacoes_select_logado',
                               'avaliacoes_insert_logado')) <> 7 THEN
    RAISE EXCEPTION 'migracao A ausente (funcoes/policies novas): aplique 20261021100000_login_fase_a.sql antes';
  END IF;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.avaliacoes_cadastradas_antes_inserir()'::regprocedure))
     <> 'a58702fd76f0ee6c5ac53c8cb7e01a2f' THEN
    RAISE EXCEPTION 'avaliacoes_cadastradas_antes_inserir nao e a versao da migracao A (ja aplicou a C? alguem mudou?): abortando';
  END IF;
  IF md5(pg_get_functiondef('public.avaliacao_clientes_do_dia(integer, date)'::regprocedure))
     <> 'b41650748de4c78723e617f475e1e384' THEN
    RAISE EXCEPTION 'avaliacao_clientes_do_dia mudou desde 2026-10-20: o corpo abaixo nao e mais o vigente - abortando';
  END IF;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.avaliacao_espelho_tem_cliente(integer, date, bigint)'::regprocedure))
     <> '2a5896c97ead08f705902ded2221bc45' THEN
    RAISE EXCEPTION 'avaliacao_espelho_tem_cliente nao e a versao da migracao A: abortando';
  END IF;
END $$;

-- todos os locks de uma vez (sob o lock_timeout de 5s), em vez de um DROP POLICY por vez.
-- avaliacoes_cadastradas PRIMEIRO: o INSERT de estrela pega avaliacoes e depois le
-- trinks_services (trigger -> helper); a mesma ordem aqui evita deadlock com ele.
LOCK TABLE public.avaliacoes_cadastradas, public.trinks_services, public.regras_desafio,
           public.feriados, public.tratamento_fabricante, public.profissional_fabricante
  IN ACCESS EXCLUSIVE MODE;

-- ---------------------------------------------------------------------------
-- 1) Policies públicas antigas
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view trinks_services" ON public.trinks_services;
DROP POLICY IF EXISTS "Allow public read on regras_desafio" ON public.regras_desafio;
DROP POLICY IF EXISTS "Allow public read on feriados" ON public.feriados;
DROP POLICY IF EXISTS "Allow public read access on tratamento_fabricante" ON public.tratamento_fabricante;
DROP POLICY IF EXISTS "Allow public read access on profissional_fabricante" ON public.profissional_fabricante;
DROP POLICY IF EXISTS "Permitir leitura pública de avaliações" ON public.avaliacoes_cadastradas;
DROP POLICY IF EXISTS "Permitir inserção pública com status pendente" ON public.avaliacoes_cadastradas;

-- ---------------------------------------------------------------------------
-- 2) anon fora das seis tabelas (REVOKE de tabela leva junto os de coluna)
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.trinks_services FROM anon;
REVOKE ALL ON TABLE public.regras_desafio FROM anon;
REVOKE ALL ON TABLE public.feriados FROM anon;
REVOKE ALL ON TABLE public.tratamento_fabricante FROM anon;
REVOKE ALL ON TABLE public.profissional_fabricante FROM anon;
REVOKE ALL ON TABLE public.avaliacoes_cadastradas FROM anon;

-- ---------------------------------------------------------------------------
-- 3) profissionais_ativos: anon só com as 4 colunas da fila
-- ---------------------------------------------------------------------------
REVOKE SELECT ON public.profissionais_ativos FROM anon;
GRANT SELECT ("profissionalId", nome_profissional, categoria, ativo)
  ON public.profissionais_ativos TO anon;

-- ---------------------------------------------------------------------------
-- 4) avaliacao_clientes_do_dia: gate de estrelas; sem EXECUTE para anon
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.avaliacao_clientes_do_dia(p_profissional_id integer, p_data date)
 RETURNS TABLE(cliente_trinks_id bigint, nome text, servicos text[], fonte text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_hoje date := (pg_catalog.now() at time zone 'America/Manaus')::date;
begin
  -- gate (migracao C): write em estrelas, ou read em estrelas e a propria profissional.
  -- coalesce: com destaque_minha_profissional() NULL o predicado daria NULL, e `if not NULL`
  -- nao levanta.
  if not coalesce(
       public.destaque_can_write_page('estrelas')
       or (public.destaque_can_read_page('estrelas')
           and p_profissional_id = public.destaque_minha_profissional()),
       false) then
    raise exception 'avaliacao_clientes_do_dia: sem permissão para ver as clientes desta profissional'
      using errcode = '42501';  -- insufficient_privilege
  end if;

  if p_data is null or p_data < v_hoje - 10 or p_data > v_hoje then
    raise exception 'avaliacao_clientes_do_dia: p_data (%) fora da janela % a %', p_data, v_hoje - 10, v_hoje
      using errcode = '22023';  -- invalid_parameter_value
  end if;

  return query
  with espelho as (
    select case when pg_catalog.btrim(t.clienteid) ~ '^[0-9]{1,18}$'
                then pg_catalog.btrim(t.clienteid)::bigint end           as cid,
           pg_catalog.btrim(t.client_name)                               as cnome,
           t.service_name                                                as servico
    from public.trinks_services t
    where t.profissionalid = p_profissional_id::text
      and t.service_date   = pg_catalog.to_char(p_data, 'DD/MM/YYYY')
      and t.client_name is not null
      and pg_catalog.btrim(t.client_name) <> ''
  ),
  fila as (
    select pg_catalog.btrim(f.client_name) as cnome,
           f.service_name                  as servico
    from public."gerencia-fila-trinks-appointments" f
    where p_data = v_hoje
      and f.professional_id  = p_profissional_id
      and f.appointment_date = p_data
      and pg_catalog.lower(pg_catalog.btrim(f.trinks_status)) in ('em atendimento', 'finalizado')
      and pg_catalog.btrim(f.client_name) <> ''
  ),
  linhas as (
    select e.cid, e.cnome, e.servico, 'espelho'::text as origem,
           case when e.cid is not null then 'id:' || e.cid::text
                else 'nm:' || public.avaliacao_normalizar_nome(e.cnome) end as chave
    from espelho e
    union all
    select null::bigint, fl.cnome, fl.servico, 'fila'::text,
           coalesce(
             (select 'id:' || min(e2.cid)::text from espelho e2
               where e2.cid is not null
                 and public.avaliacao_normalizar_nome(e2.cnome) = public.avaliacao_normalizar_nome(fl.cnome)),
             'nm:' || public.avaliacao_normalizar_nome(fl.cnome))
    from fila fl
  )
  select max(l.cid),
         coalesce(min(l.cnome) filter (where l.origem = 'espelho'), min(l.cnome)),
         coalesce(array_agg(distinct l.servico) filter (where l.servico is not null), '{}'::text[]),
         case when bool_or(l.origem = 'espelho') then 'espelho' else 'fila' end
  from linhas l
  group by l.chave
  order by 2, 1;
end
$function$
;

REVOKE ALL ON FUNCTION public.avaliacao_clientes_do_dia(integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.avaliacao_clientes_do_dia(integer, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Helper do espelho: gate de estrelas (sem permissão = false); sem EXECUTE para anon
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.avaliacao_espelho_tem_cliente(
  p_profissional_id integer, p_dia date, p_cliente_id bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  -- gate (migracao C): so responde quem pode ver as clientes desta profissional (o mesmo
  -- predicado de avaliacao_clientes_do_dia); sem permissao = false, sem excecao
  select coalesce(
    p_profissional_id is not null
    and p_dia is not null
    and p_cliente_id is not null
    and (public.destaque_can_write_page('estrelas')
         or (public.destaque_can_read_page('estrelas')
             and p_profissional_id = public.destaque_minha_profissional()))
    and exists (
      select 1
      from public.trinks_services t
      where t.profissionalid = p_profissional_id::text
        and t.service_date   = pg_catalog.to_char(p_dia, 'DD/MM/YYYY')
        and case when pg_catalog.btrim(t.clienteid) ~ '^[0-9]{1,18}$'
                 then pg_catalog.btrim(t.clienteid)::bigint
            end = p_cliente_id
    ),
    false)
$$;

REVOKE ALL ON FUNCTION public.avaliacao_espelho_tem_cliente(integer, date, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.avaliacao_espelho_tem_cliente(integer, date, bigint) TO authenticated;

COMMENT ON FUNCTION public.avaliacao_espelho_tem_cliente(integer, date, bigint) IS
  'true se trinks_services tem linha da profissional, no dia (service_date DD/MM/YYYY), com '
  'clienteid numerico igual. Usado pelo trigger avaliacoes_cadastradas_antes_inserir (invoker) '
  'para nao depender da leitura de trinks_services de quem insere. EXECUTE so para authenticated '
  '(o trigger roda com o papel do INSERT; anon perdeu o INSERT e o EXECUTE na migracao C). '
  'Gate (migracao C): write em estrelas, ou read em estrelas e p_profissional_id = '
  'destaque_minha_profissional(); sem permissao devolve false (nao e oraculo). '
  'Migracoes 20261021100000 e 20261021110000.';

-- ---------------------------------------------------------------------------
-- 6) Trigger de INSERT: dia fora da janela passa a ser PT400 (mesma mensagem)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.avaliacoes_cadastradas_antes_inserir()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
declare
  v_hoje date;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  -- a. relogio do servidor, nunca o do celular
  new.data_hora_cadastro := pg_catalog.now();
  new.created_at := pg_catalog.now();

  -- b. janela do dia do atendimento
  v_hoje := (pg_catalog.now() at time zone 'America/Manaus')::date;
  if new.data_atendimento is not null
     and (new.data_atendimento < v_hoje - 10 or new.data_atendimento > v_hoje) then
    raise exception 'O dia do atendimento precisa estar entre hoje e 10 dias atrás.'
      using errcode = 'PT400';  -- PostgREST responde HTTP 400 (era 22023 ate a migracao C)
  end if;

  -- c. id da cliente so fica se o espelho confirma profissional + dia + cliente
  --    (leitura do espelho no helper SECURITY DEFINER; este trigger continua invoker)
  if new.cliente_trinks_id is not null then
    if new.data_atendimento is null
       or not public.avaliacao_espelho_tem_cliente(
                new.profissional_id, new.data_atendimento, new.cliente_trinks_id) then
      new.cliente_trinks_id := null;
    end if;
  end if;

  -- d. motivo da recusa e do admin, nunca do cadastro publico
  new.motivo_recusa := null;

  return new;
end
$function$;

-- ---------------------------------------------------------------------------
-- 7) Guarda: estado final esperado (aborta a migração inteira se algo não bater)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_falhas text[] := '{}';
  v_tabelas text[] := ARRAY['public.trinks_services', 'public.regras_desafio', 'public.feriados',
                            'public.tratamento_fabricante', 'public.profissional_fabricante',
                            'public.avaliacoes_cadastradas'];
  v_fila text[] := ARRAY['profissionalId', 'nome_profissional', 'categoria', 'ativo'];
  v_aval_cols text[] := ARRAY['id', 'profissional_id', 'nome_profissional', 'nome_cliente',
                              'nome_cliente_trinks', 'cliente_trinks_id', 'data_atendimento',
                              'origem_cliente_trinks', 'status', 'data_hora_cadastro',
                              'aprovado_por', 'data_aprovacao', 'created_at'];
  t text;
  c text;
BEGIN
  -- anon: nada nas seis tabelas (tabela ou coluna; inclui o que viria de PUBLIC)
  FOREACH t IN ARRAY v_tabelas LOOP
    IF has_table_privilege('anon', t, 'select, insert, update, delete, truncate, references, trigger')
       OR has_any_column_privilege('anon', t, 'select, insert, update, references') THEN
      v_falhas := v_falhas || format('anon ainda tem privilegio em %s', t);
    END IF;
  END LOOP;

  -- anon em profissionais_ativos: exatamente as 4 colunas da fila
  IF has_table_privilege('anon', 'public.profissionais_ativos', 'select, insert, update, delete, truncate, references, trigger') THEN
    v_falhas := v_falhas || 'anon com privilegio de TABELA em profissionais_ativos'::text;
  END IF;
  FOREACH c IN ARRAY v_fila LOOP
    IF NOT has_column_privilege('anon', 'public.profissionais_ativos', c, 'select') THEN
      v_falhas := v_falhas || format('anon nao le profissionais_ativos.%s (fila quebra)', c);
    END IF;
  END LOOP;
  FOR c IN SELECT a.attname FROM pg_catalog.pg_attribute a
            WHERE a.attrelid = 'public.profissionais_ativos'::regclass AND a.attnum > 0
              AND NOT a.attisdropped AND a.attname <> ALL (v_fila) LOOP
    IF has_column_privilege('anon', 'public.profissionais_ativos', c, 'select, insert, update, references') THEN
      v_falhas := v_falhas || format('anon ainda acessa profissionais_ativos.%s', c);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies
                  WHERE schemaname = 'public' AND tablename = 'profissionais_ativos'
                    AND policyname = 'Permitir leitura pública de profissionais' AND cmd = 'SELECT') THEN
    v_falhas := v_falhas || 'policy de leitura publica de profissionais_ativos sumiu (fila quebra)'::text;
  END IF;

  -- funções: anon fora; authenticated dentro
  IF has_function_privilege('anon', 'public.avaliacao_clientes_do_dia(integer, date)', 'execute')
     OR has_function_privilege('anon', 'public.avaliacao_espelho_tem_cliente(integer, date, bigint)', 'execute') THEN
    v_falhas := v_falhas || 'anon executa avaliacao_clientes_do_dia ou o helper do espelho'::text;
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.avaliacao_clientes_do_dia(integer, date)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.avaliacao_espelho_tem_cliente(integer, date, bigint)', 'execute') THEN
    v_falhas := v_falhas || 'authenticated perdeu EXECUTE em avaliacao_clientes_do_dia ou no helper'::text;
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.avaliacao_clientes_do_dia(integer, date)'::regprocedure)
       NOT LIKE '%public.destaque_can_write_page(''estrelas'')%' THEN
    v_falhas := v_falhas || 'avaliacao_clientes_do_dia sem o gate de estrelas'::text;
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.avaliacao_espelho_tem_cliente(integer, date, bigint)'::regprocedure)
       NOT LIKE '%public.destaque_can_write_page(''estrelas'')%public.destaque_minha_profissional()%'
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.avaliacao_espelho_tem_cliente(integer, date, bigint)'::regprocedure) THEN
    v_falhas := v_falhas || 'helper do espelho sem o gate de estrelas (ou deixou de ser SECURITY DEFINER)'::text;
  END IF;
  -- o trigger tem de continuar INVOKER: como definer, current_user viraria o dono e a regra desligaria
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.avaliacoes_cadastradas_antes_inserir()'::regprocedure) THEN
    v_falhas := v_falhas || 'trigger avaliacoes_cadastradas_antes_inserir virou SECURITY DEFINER'::text;
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.avaliacoes_cadastradas_antes_inserir()'::regprocedure)
       !~ 'errcode = ''PT400'''
     OR (SELECT prosrc FROM pg_proc WHERE oid = 'public.avaliacoes_cadastradas_antes_inserir()'::regprocedure)
       ~ '''22023''' THEN
    v_falhas := v_falhas || 'trigger de avaliacoes sem o errcode PT400'::text;
  END IF;

  -- policies: públicas antigas fora; novas da A e de escrita do admin intactas
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_policies
              WHERE schemaname = 'public'
                AND tablename IN ('trinks_services', 'regras_desafio', 'feriados', 'tratamento_fabricante',
                                  'profissional_fabricante', 'avaliacoes_cadastradas')
                AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['anon']::name[])) THEN
    v_falhas := v_falhas || 'sobrou policy para public/anon numa das seis tabelas'::text;
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_policies
       WHERE schemaname = 'public' AND roles = ARRAY['authenticated']::name[]
         AND policyname IN ('trinks_services_select_painel', 'regras_desafio_select_painel',
                            'feriados_select_painel', 'tratamento_fabricante_select_painel',
                            'profissional_fabricante_select_painel', 'avaliacoes_select_logado',
                            'avaliacoes_insert_logado')) <> 7 THEN
    v_falhas := v_falhas || 'policies novas da migracao A incompletas'::text;
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_policies
       WHERE schemaname = 'public' AND roles = ARRAY['authenticated']::name[]
         AND qual LIKE '%destaque_can_write_page%admin%' AND with_check LIKE '%destaque_can_write_page%admin%'
         AND ((policyname IN ('regras_desafio_write_admin', 'feriados_write_admin',
                              'tratamento_fabricante_write_admin', 'profissional_fabricante_write_admin')
               AND cmd = 'ALL')
              OR (policyname = 'avaliacoes_cadastradas_update_admin' AND cmd = 'UPDATE'))) <> 5 THEN
    v_falhas := v_falhas || 'policies de escrita do admin alteradas'::text;
  END IF;

  -- authenticated: o que o app logado usa
  FOREACH t IN ARRAY ARRAY['public.trinks_services', 'public.regras_desafio', 'public.feriados',
                           'public.tratamento_fabricante', 'public.profissional_fabricante'] LOOP
    IF NOT has_table_privilege('authenticated', t, 'select') THEN
      v_falhas := v_falhas || format('authenticated perdeu SELECT em %s', t);
    END IF;
  END LOOP;
  -- profissionais_ativos: as 9 colunas do app, uma a uma (vale antes e depois da migração B,
  -- que troca o SELECT de tabela de authenticated por SELECT só nessas 9; as outras colunas
  -- dependem da B e não são conferidas aqui)
  FOREACH c IN ARRAY ARRAY['profissionalId', 'nome_profissional', 'categoria', 'apelido', 'ativo',
                           'dia_aniversario', 'mes_aniversario', 'created_at', 'updated_at'] LOOP
    IF NOT has_column_privilege('authenticated', 'public.profissionais_ativos', c, 'select') THEN
      v_falhas := v_falhas || format('authenticated nao le profissionais_ativos.%s', c);
    END IF;
  END LOOP;
  FOREACH c IN ARRAY v_aval_cols LOOP
    IF NOT has_column_privilege('authenticated', 'public.avaliacoes_cadastradas', c, 'select') THEN
      v_falhas := v_falhas || format('authenticated nao le avaliacoes_cadastradas.%s', c);
    END IF;
  END LOOP;
  IF has_column_privilege('authenticated', 'public.avaliacoes_cadastradas', 'motivo_recusa', 'select') THEN
    v_falhas := v_falhas || 'motivo_recusa legivel direto na tabela'::text;
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.avaliacoes_cadastradas', 'insert')
     OR NOT has_table_privilege('authenticated', 'public.avaliacoes_cadastradas', 'update') THEN
    v_falhas := v_falhas || 'authenticated perdeu INSERT/UPDATE em avaliacoes_cadastradas'::text;
  END IF;

  IF array_length(v_falhas, 1) > 0 THEN
    RAISE EXCEPTION 'migracao C abortada: %', array_to_string(v_falhas, ' | ');
  END IF;
END $$;
