-- Login em todas as rotas — migracao A (ADITIVA): perfis, vinculo e-mail -> profissional,
-- RPCs novas, policies novas para authenticated e fechamento de escrita de authenticated.
--
-- Spec: docs/superpowers/specs/2026-10-20-login-todas-as-rotas-design.md (§2, §3, §5 item 3).
-- Plano: docs/superpowers/plans/2026-10-20-login-todas-as-rotas.md (Task 1).
-- Verificacao: supabase/verificacoes/login_fase_a.sql (begin ... rollback, papel x verificacao).
--
-- Por que "aditiva": o bundle que esta no ar hoje le e grava como `anon` (pagina publica) e o
-- /admin le como `authenticated`. Nada que ele usa muda aqui:
--   * as policies publicas antigas (SELECT using true; INSERT publico de pendente) FICAM. As
--     policies novas sao PERMISSIVAS e so `to authenticated`; enquanto as publicas existirem
--     (ate a migracao C), elas nao restringem nada — so passam a valer quando a C dropar as
--     publicas. Ate la, o efeito real desta migracao e: perfis/paginas, as 4 RPCs, o helper do
--     trigger e os REVOKEs abaixo;
--   * nenhum grant de `anon` muda (o bloco de guarda no fim ASSERTA isso).
--
-- O que entra, nesta ordem:
--   1) destaque_perfis: Admin e Somente Leitura ganham `painel`/`estrelas` (merge com ||, as
--      chaves existentes ficam); insere Recepcao e Profissional (is_system = false). Matriz
--      (spec §2.1):
--        Admin            painel read  estrelas write  admin write  usuarios write
--        Recepção         painel read  estrelas write  admin none   usuarios none
--        Profissional     painel read  estrelas read   admin none   usuarios none
--        Somente Leitura  painel read  estrelas none   admin read   usuarios none
--      Perfil que ja exista com o mesmo nome NAO e sobrescrito (on conflict do nothing); a
--      guarda do fim aborta se a matriz final nao for exatamente a de cima.
--   2) Funcoes (todas SECURITY DEFINER, search_path vazio, nomes qualificados; EXECUTE so para
--      authenticated — revogado de public e anon):
--        destaque_minha_profissional() -> integer: "profissionalId" com email = lower(auth.email())
--          e ativo is not false, so se auth.uid() esta ATIVO em destaque_users_app; senao NULL.
--        destaque_estrelas_periodo(p_inicio, p_fim): profissional_id, status, data_hora_cadastro,
--          data_aprovacao das aprovadas e pendentes com p_inicio <= data_hora_cadastro < p_fim.
--          Gate destaque_can_read_page('painel'); sem permissao = 0 linhas. Sem nome de cliente.
--        destaque_minhas_avaliacoes(p_profissional_id): estrelas da profissional, com
--          motivo_recusa. Permitido com write em `estrelas`, ou read em `estrelas` E o id pedido
--          = destaque_minha_profissional(); senao 0 linhas. Ordem data_hora_cadastro desc.
--        destaque_profissionais_sem_conta(): ativas com email nao nulo cujo email nao esta em
--          auth.users ligado a destaque_users_app (ativo ou nao). Gate write em `usuarios`.
--   3) Policies novas, permissivas, `to authenticated`, predicado em (select ...) (InitPlan):
--        <tabela>_select_painel em trinks_services, regras_desafio, feriados,
--          tratamento_fabricante, profissional_fabricante: read em `painel`;
--        avaliacoes_select_logado: read em `admin` OR write em `estrelas` OR (read em `estrelas`
--          AND profissional_id = destaque_minha_profissional()). (O SELECT por COLUNA de
--          authenticated continua sem motivo_recusa: a policy nao expoe o motivo.)
--        avaliacoes_insert_logado: pendente sem aprovacao e sem motivo AND (write em `estrelas`
--          OR (read em `estrelas` AND profissional_id = destaque_minha_profissional())).
--          "De hoje": o trigger BEFORE INSERT (que roda ANTES do with check) ja forca
--          data_hora_cadastro = now() e recusa data_atendimento fora de hoje-10..hoje.
--   4) REVOKE de authenticated:
--        profissionais_ativos: INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER (fica so o
--          SELECT). Nenhum escritor usa authenticated: NFS-e e financeiro gravam com
--          service_role; o app nao grava nela; pg_stat_statements (2026-10-20) nao tem escrita
--          de authenticated nessa tabela. Efeito: as policies nfse_insert/update/delete_* deixam
--          de ter efeito para authenticated (continuam valendo para quem tiver o grant).
--        avaliacoes_cadastradas: DELETE, TRUNCATE, REFERENCES, TRIGGER (INSERT/UPDATE ficam: o
--          cadastro e a aprovacao dependem deles). Recusar nunca apaga (CLAUDE.md).
--   5) Helper public.avaliacao_espelho_tem_cliente(profissional, dia, cliente) -> boolean,
--      SECURITY DEFINER, com o EXISTS que estava no trigger avaliacoes_cadastradas_antes_inserir.
--      Motivo: o trigger e invoker e lia trinks_services com o papel de quem insere; quando a
--      migracao C fechar a leitura de anon (e a de authenticated passar a depender de `painel`),
--      a regra (c) do trigger passaria a anular TODO cliente_trinks_id sem avisar. O trigger
--      continua INVOKER (so a leitura do espelho sobe de privilegio, e devolve so um boolean).
--      Diferenca deliberada em relacao ao EXISTS antigo: o cast ::bigint fica atras de um CASE
--      (antes era `btrim(..) ~ '^[0-9]{1,18}$' AND btrim(..)::bigint = x`, e o AND do SQL nao
--      garante ordem de avaliacao: um clienteid nao numerico podia estourar 22P02 no INSERT).
--      Resultado identico para toda linha numerica; nao numerica agora so "nao casa".
--      EXECUTE do helper: anon E authenticated — EXCECAO a regra "definer so para authenticated":
--      o trigger roda com o papel de quem insere, e o INSERT publico (anon) do bundle atual
--      chama o helper sempre que manda cliente_trinks_id. Sem o grant a anon, o cadastro
--      publico quebraria com 42501. O que anon passa a "perguntar" (a profissional X atendeu a
--      cliente Y no dia D?) ele ja le hoje inteiro em trinks_services. A migracao C revoga.
--      O corpo do trigger parte EXATAMENTE da definicao vigente (pg_get_functiondef de
--      2026-10-20, md5 23f95a5c165b345d62d0fae957f97d1a, a versao com a linha do motivo do PR #9)
--      e troca so o EXISTS pela chamada.
--
-- Fora daqui (de proposito): revogar SELECT de anon (migracao C), restringir as colunas que
-- authenticated le em profissionais_ativos (migracao B, depois do fix do NFS-e), gate em
-- avaliacao_clientes_do_dia e troca do errcode 22023 (migracao C / Task 6).
--
-- Aviso do canario do auth-kit: destaque_canario_rls() emite o AVISO (nao falha)
-- `aviso_security_definer_sem_pg_temp_app` para funcoes destaque_* SECURITY DEFINER cujo
-- search_path nao termina em pg_temp. As 4 funcoes destaque_* daqui usam search_path vazio
-- (regra do plano), tudo qualificado — mais restrito que `public, pg_temp`. O aviso e esperado
-- (ensaio de 2026-10-20: canario ok=true, falhas=[], esse unico aviso listando as 4).
--
-- Transacao e lock: o corpo roda numa transacao (apply_migration manda o arquivo como um lote).
-- CREATE POLICY / REVOKE pegam lock em tabelas compartilhadas (trinks_services e escrita pelo
-- n8n; profissionais_ativos pela fila/NFS-e/financeiro), entao `SET LOCAL lock_timeout = '5s'`:
-- com transacao longa segurando a tabela, a migracao falha inteira (sem efeito parcial) em vez
-- de enfileirar todo mundo atras dela. Basta rodar de novo. O DO logo abaixo ASSERTA que o
-- lock_timeout pegou (fora de transacao o SET LOCAL nao vale e a migracao aborta antes de tudo).
--
-- Idempotente: create or replace function; drop policy if exists + create policy; revoke;
-- insert ... on conflict do nothing; merge || de jsonb.
--
-- Rollback autossuficiente (nao depende de outro arquivo). So faz sentido ANTES do deploy do
-- front com login (Tasks 2-4 chamam as RPCs e usam `painel`/`estrelas`). Rodar inteiro, nesta
-- ordem (trigger antes do helper, porque ele chama o helper). Conferencia do passo 1:
--   select md5(pg_get_functiondef('public.avaliacoes_cadastradas_antes_inserir()'::regprocedure))
-- tem de dar 23f95a5c165b345d62d0fae957f97d1a.
/* ---- ROLLBACK ----
begin;
set local lock_timeout = '5s';

-- 1) trigger function vigente antes desta migracao (pg_get_functiondef de 2026-10-20,
--    md5 23f95a5c165b345d62d0fae957f97d1a; owner postgres, trigger inalterado)
CREATE OR REPLACE FUNCTION public.avaliacoes_cadastradas_antes_inserir()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
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
  if new.cliente_trinks_id is not null then
    if new.data_atendimento is null
       or not exists (
         select 1
         from public.trinks_services t
         where t.profissionalid = new.profissional_id::text
           and t.service_date   = pg_catalog.to_char(new.data_atendimento, 'DD/MM/YYYY')
           and pg_catalog.btrim(t.clienteid) ~ '^[0-9]{1,18}$'
           and pg_catalog.btrim(t.clienteid)::bigint = new.cliente_trinks_id
       ) then
      new.cliente_trinks_id := null;
    end if;
  end if;

  -- d. motivo da recusa e do admin, nunca do cadastro publico
  new.motivo_recusa := null;

  return new;
end
$function$
;

-- 2) helper
drop function if exists public.avaliacao_espelho_tem_cliente(integer, date, bigint);

-- 3) grants de authenticated como estavam (profissionais_ativos arwdDxt; avaliacoes awdDxt +
--    SELECT por coluna, que esta migracao nao tocou). Reabre a escrita de authenticated.
grant insert, update, delete, truncate, references, trigger on public.profissionais_ativos to authenticated;
grant delete, truncate, references, trigger on public.avaliacoes_cadastradas to authenticated;

-- 4) policies novas
drop policy if exists trinks_services_select_painel on public.trinks_services;
drop policy if exists regras_desafio_select_painel on public.regras_desafio;
drop policy if exists feriados_select_painel on public.feriados;
drop policy if exists tratamento_fabricante_select_painel on public.tratamento_fabricante;
drop policy if exists profissional_fabricante_select_painel on public.profissional_fabricante;
drop policy if exists avaliacoes_select_logado on public.avaliacoes_cadastradas;
drop policy if exists avaliacoes_insert_logado on public.avaliacoes_cadastradas;

-- 5) funcoes novas
drop function if exists public.destaque_minhas_avaliacoes(integer);
drop function if exists public.destaque_estrelas_periodo(timestamptz, timestamptz);
drop function if exists public.destaque_profissionais_sem_conta();
drop function if exists public.destaque_minha_profissional();

-- 6) perfis. Usuario com perfil Recepcao/Profissional bloqueia o delete (FK): mova-o antes
--    (ex.: para 'Somente Leitura') pela tela de usuarios. O delete abaixo aborta se houver.
delete from public.destaque_perfis where nome in ('Recepção', 'Profissional');
update public.destaque_perfis
   set paginas = paginas - 'painel' - 'estrelas', updated_at = now()
 where nome in ('Admin', 'Somente Leitura');
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
-- 1) Perfis e paginas
-- ---------------------------------------------------------------------------
UPDATE public.destaque_perfis
   SET paginas = paginas || '{"painel": "read", "estrelas": "write"}'::jsonb,
       updated_at = now()
 WHERE nome = 'Admin';

UPDATE public.destaque_perfis
   SET paginas = paginas || '{"painel": "read", "estrelas": "none"}'::jsonb,
       updated_at = now()
 WHERE nome = 'Somente Leitura';

INSERT INTO public.destaque_perfis (nome, descricao, paginas, is_system) VALUES
  ('Recepção',
   'Vê o painel, cadastra estrela para qualquer profissional e vê todas as estrelas, com o motivo das recusadas.',
   '{"painel": "read", "estrelas": "write", "admin": "none", "usuarios": "none"}'::jsonb,
   false),
  ('Profissional',
   'Vê o painel, cadastra estrela só no próprio nome e vê só as próprias estrelas, com o motivo das recusadas.',
   '{"painel": "read", "estrelas": "read", "admin": "none", "usuarios": "none"}'::jsonb,
   false)
ON CONFLICT (nome) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Funcoes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.destaque_minha_profissional()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  select pa."profissionalId"
  from public.profissionais_ativos pa
  where pa.email = pg_catalog.lower(auth.email())
    and pa.ativo is not false
    and exists (
      select 1 from public.destaque_users_app u
      where u.id = auth.uid() and u.ativo
    )
$$;

COMMENT ON FUNCTION public.destaque_minha_profissional() IS
  'Login -> profissional: "profissionalId" de profissionais_ativos com email = lower(auth.email()) e '
  'ativo is not false, so se auth.uid() esta ativo em destaque_users_app; senao NULL. '
  'auth.email() vem do JWT (claim email). Migracao 20261021100000.';

CREATE OR REPLACE FUNCTION public.destaque_estrelas_periodo(p_inicio timestamptz, p_fim timestamptz)
RETURNS TABLE (profissional_id integer, status text, data_hora_cadastro timestamptz, data_aprovacao timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  select a.profissional_id, a.status, a.data_hora_cadastro, a.data_aprovacao
  from public.avaliacoes_cadastradas a
  where (select public.destaque_can_read_page('painel'))
    and a.status in ('aprovada', 'pendente')
    and a.data_hora_cadastro >= p_inicio
    and a.data_hora_cadastro <  p_fim
$$;

COMMENT ON FUNCTION public.destaque_estrelas_periodo(timestamptz, timestamptz) IS
  'Ranking/Bonus Estrelas: aprovadas e pendentes com p_inicio <= data_hora_cadastro < p_fim, so '
  'profissional_id/status/datas (sem nome de cliente). Gate destaque_can_read_page(''painel''): '
  'sem permissao = 0 linhas. O score ainda filtra status = aprovada AND data_aprovacao IS NOT NULL. '
  'Migracao 20261021100000.';

CREATE OR REPLACE FUNCTION public.destaque_minhas_avaliacoes(p_profissional_id integer)
RETURNS TABLE (id uuid, nome_profissional text, nome_cliente text, nome_cliente_trinks text,
               status text, data_hora_cadastro timestamptz, data_aprovacao timestamptz,
               motivo_recusa text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  select a.id, a.nome_profissional, a.nome_cliente, a.nome_cliente_trinks,
         a.status, a.data_hora_cadastro, a.data_aprovacao, a.motivo_recusa
  from public.avaliacoes_cadastradas a
  where a.profissional_id = p_profissional_id
    and (
      (select public.destaque_can_write_page('estrelas'))
      or (
        (select public.destaque_can_read_page('estrelas'))
        and p_profissional_id = (select public.destaque_minha_profissional())
      )
    )
  order by a.data_hora_cadastro desc
$$;

COMMENT ON FUNCTION public.destaque_minhas_avaliacoes(integer) IS
  '/minhas-avaliacoes: estrelas da profissional, com motivo_recusa (decisao do dono 2026-10-20: '
  'a propria, a Recepcao e o Admin veem o motivo). Write em estrelas: qualquer id; read em '
  'estrelas: so o id de destaque_minha_profissional(); senao 0 linhas. Migracao 20261021100000.';

CREATE OR REPLACE FUNCTION public.destaque_profissionais_sem_conta()
RETURNS TABLE ("profissionalId" integer, nome_profissional text, apelido text, categoria text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  select pa."profissionalId", pa.nome_profissional, pa.apelido, pa.categoria, pa.email
  from public.profissionais_ativos pa
  where (select public.destaque_can_write_page('usuarios'))
    and pa.ativo is not false
    and pa.email is not null
    and not exists (
      select 1
      from auth.users au
      join public.destaque_users_app u on u.id = au.id
      where pg_catalog.lower(au.email) = pa.email
    )
  order by pa.nome_profissional
$$;

COMMENT ON FUNCTION public.destaque_profissionais_sem_conta() IS
  'Tela de usuarios ("Criar contas das profissionais"): ativas com email cujo email nao esta em '
  'auth.users ligado a destaque_users_app (ativo ou nao). Gate write em usuarios; senao 0 linhas. '
  'O email vem do webhook Trinks SEM autenticacao: a lista e conferida pelo dono antes de criar. '
  'Migracao 20261021100000.';

REVOKE ALL ON FUNCTION public.destaque_minha_profissional() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.destaque_estrelas_periodo(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.destaque_minhas_avaliacoes(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.destaque_profissionais_sem_conta() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.destaque_minha_profissional() TO authenticated;
GRANT EXECUTE ON FUNCTION public.destaque_estrelas_periodo(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.destaque_minhas_avaliacoes(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.destaque_profissionais_sem_conta() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Policies novas (so authenticated; as publicas antigas ficam ate a migracao C)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS trinks_services_select_painel ON public.trinks_services;
CREATE POLICY trinks_services_select_painel ON public.trinks_services
  FOR SELECT TO authenticated
  USING ((select public.destaque_can_read_page('painel')));

DROP POLICY IF EXISTS regras_desafio_select_painel ON public.regras_desafio;
CREATE POLICY regras_desafio_select_painel ON public.regras_desafio
  FOR SELECT TO authenticated
  USING ((select public.destaque_can_read_page('painel')));

DROP POLICY IF EXISTS feriados_select_painel ON public.feriados;
CREATE POLICY feriados_select_painel ON public.feriados
  FOR SELECT TO authenticated
  USING ((select public.destaque_can_read_page('painel')));

DROP POLICY IF EXISTS tratamento_fabricante_select_painel ON public.tratamento_fabricante;
CREATE POLICY tratamento_fabricante_select_painel ON public.tratamento_fabricante
  FOR SELECT TO authenticated
  USING ((select public.destaque_can_read_page('painel')));

DROP POLICY IF EXISTS profissional_fabricante_select_painel ON public.profissional_fabricante;
CREATE POLICY profissional_fabricante_select_painel ON public.profissional_fabricante
  FOR SELECT TO authenticated
  USING ((select public.destaque_can_read_page('painel')));

DROP POLICY IF EXISTS avaliacoes_select_logado ON public.avaliacoes_cadastradas;
CREATE POLICY avaliacoes_select_logado ON public.avaliacoes_cadastradas
  FOR SELECT TO authenticated
  USING (
    (select public.destaque_can_read_page('admin'))
    or (select public.destaque_can_write_page('estrelas'))
    or (
      (select public.destaque_can_read_page('estrelas'))
      and profissional_id = (select public.destaque_minha_profissional())
    )
  );

DROP POLICY IF EXISTS avaliacoes_insert_logado ON public.avaliacoes_cadastradas;
CREATE POLICY avaliacoes_insert_logado ON public.avaliacoes_cadastradas
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pendente'
    and aprovado_por is null
    and data_aprovacao is null
    and motivo_recusa is null
    and (
      (select public.destaque_can_write_page('estrelas'))
      or (
        (select public.destaque_can_read_page('estrelas'))
        and profissional_id = (select public.destaque_minha_profissional())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Escrita de authenticated
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.profissionais_ativos FROM authenticated;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.avaliacoes_cadastradas FROM authenticated;

-- ---------------------------------------------------------------------------
-- 5) Helper do espelho + trigger de INSERT chamando o helper
-- ---------------------------------------------------------------------------
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

COMMENT ON FUNCTION public.avaliacao_espelho_tem_cliente(integer, date, bigint) IS
  'true se trinks_services tem linha da profissional, no dia (service_date DD/MM/YYYY), com '
  'clienteid numerico igual. Usado pelo trigger avaliacoes_cadastradas_antes_inserir (invoker) '
  'para nao depender da leitura de trinks_services de quem insere. EXECUTE para anon e '
  'authenticated porque o trigger roda com o papel do INSERT; a migracao C revoga de anon. '
  'Migracao 20261021100000.';

REVOKE ALL ON FUNCTION public.avaliacao_espelho_tem_cliente(integer, date, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.avaliacao_espelho_tem_cliente(integer, date, bigint) TO anon, authenticated;

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

-- ---------------------------------------------------------------------------
-- 6) Guarda: estado final esperado (aborta a migracao inteira se algo nao bater)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_falhas text[] := '{}';
  v_esperado jsonb := '{
    "Admin":           {"painel": "read", "estrelas": "write", "admin": "write", "usuarios": "write"},
    "Recepção":        {"painel": "read", "estrelas": "write", "admin": "none",  "usuarios": "none"},
    "Profissional":    {"painel": "read", "estrelas": "read",  "admin": "none",  "usuarios": "none"},
    "Somente Leitura": {"painel": "read", "estrelas": "none",  "admin": "read",  "usuarios": "none"}
  }'::jsonb;
  r record;
  f text;
BEGIN
  -- matriz dos 4 perfis
  FOR r IN SELECT key AS nome, value AS paginas FROM jsonb_each(v_esperado) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.destaque_perfis p
                    WHERE p.nome = r.nome AND p.paginas = r.paginas) THEN
      v_falhas := v_falhas || format('perfil %s com matriz diferente de %s', r.nome, r.paginas);
    END IF;
  END LOOP;

  -- RPCs: authenticated executa, anon nao
  FOREACH f IN ARRAY ARRAY[
    'public.destaque_minha_profissional()',
    'public.destaque_estrelas_periodo(timestamptz, timestamptz)',
    'public.destaque_minhas_avaliacoes(integer)',
    'public.destaque_profissionais_sem_conta()'] LOOP
    IF has_function_privilege('anon', f::regprocedure, 'execute') THEN
      v_falhas := v_falhas || format('anon executa %s', f);
    END IF;
    IF NOT has_function_privilege('authenticated', f::regprocedure, 'execute') THEN
      v_falhas := v_falhas || format('authenticated nao executa %s', f);
    END IF;
  END LOOP;

  -- helper: o INSERT publico (anon) e o logado precisam dele
  IF NOT has_function_privilege('anon', 'public.avaliacao_espelho_tem_cliente(integer, date, bigint)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.avaliacao_espelho_tem_cliente(integer, date, bigint)', 'execute') THEN
    v_falhas := v_falhas || 'helper avaliacao_espelho_tem_cliente sem EXECUTE para anon/authenticated'::text;
  END IF;

  -- bundle antigo: leituras de anon intactas
  IF NOT has_table_privilege('anon', 'public.trinks_services', 'select')
     OR NOT has_table_privilege('anon', 'public.regras_desafio', 'select')
     OR NOT has_table_privilege('anon', 'public.feriados', 'select')
     OR NOT has_table_privilege('anon', 'public.tratamento_fabricante', 'select')
     OR NOT has_table_privilege('anon', 'public.profissional_fabricante', 'select')
     OR NOT has_table_privilege('anon', 'public.avaliacoes_cadastradas', 'insert')
     OR NOT has_column_privilege('anon', 'public.avaliacoes_cadastradas', 'profissional_id', 'select')
     OR NOT has_column_privilege('anon', 'public.profissionais_ativos', 'nome_profissional', 'select') THEN
    v_falhas := v_falhas || 'anon perdeu leitura/insert do bundle atual'::text;
  END IF;

  -- authenticated: escrita fechada onde devia, aberta onde o app usa
  IF has_table_privilege('authenticated', 'public.profissionais_ativos', 'insert, update, delete, truncate, references, trigger') THEN
    v_falhas := v_falhas || 'authenticated ainda escreve em profissionais_ativos'::text;
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.profissionais_ativos', 'select') THEN
    v_falhas := v_falhas || 'authenticated perdeu SELECT em profissionais_ativos (e da migracao B)'::text;
  END IF;
  IF has_table_privilege('authenticated', 'public.avaliacoes_cadastradas', 'delete, truncate, references, trigger') THEN
    v_falhas := v_falhas || 'authenticated ainda tem DELETE/TRUNCATE em avaliacoes_cadastradas'::text;
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.avaliacoes_cadastradas', 'insert')
     OR NOT has_table_privilege('authenticated', 'public.avaliacoes_cadastradas', 'update') THEN
    v_falhas := v_falhas || 'authenticated perdeu INSERT/UPDATE em avaliacoes_cadastradas'::text;
  END IF;
  IF has_column_privilege('authenticated', 'public.avaliacoes_cadastradas', 'motivo_recusa', 'select')
     OR has_column_privilege('anon', 'public.avaliacoes_cadastradas', 'motivo_recusa', 'select') THEN
    v_falhas := v_falhas || 'motivo_recusa legivel direto na tabela'::text;
  END IF;

  -- policies publicas antigas continuam (o bundle atual depende delas)
  IF (SELECT count(*) FROM pg_catalog.pg_policies
       WHERE schemaname = 'public'
         AND policyname IN ('Public can view trinks_services',
                            'Allow public read on regras_desafio',
                            'Allow public read on feriados',
                            'Allow public read access on tratamento_fabricante',
                            'Allow public read access on profissional_fabricante',
                            'Permitir leitura pública de avaliações',
                            'Permitir inserção pública com status pendente')) <> 7 THEN
    v_falhas := v_falhas || 'alguma policy publica antiga sumiu'::text;
  END IF;

  IF array_length(v_falhas, 1) > 0 THEN
    RAISE EXCEPTION 'migracao A abortada: %', array_to_string(v_falhas, ' | ');
  END IF;
END $$;
