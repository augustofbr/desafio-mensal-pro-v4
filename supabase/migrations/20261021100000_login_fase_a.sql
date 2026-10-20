-- Login em todas as rotas — migracao A (ADITIVA): perfis, vinculo explicito usuario ->
-- profissional, RPCs novas, policies novas para authenticated e fechamento de escrita de
-- authenticated.
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
--   1b) Vinculo EXPLICITO usuario -> profissional (fix round 1 do review de seguranca):
--      destaque_users_app.profissional_id integer null, FK para profissionais_ativos
--      ("profissionalId") on delete set null, UNICO (indice parcial where not null).
--      Por que nao o e-mail do JWT: o projeto tem autoconfirm, entao um usuario logado pode
--      chamar supabase.auth.updateUser({email}) e trocar o proprio e-mail para o de uma colega
--      SEM conta; com o vinculo derivado de auth.email() ele "viraria" ela. Agora o e-mail e lido
--      UMA vez, no INSERT da linha em destaque_users_app (feito pela edge function
--      destaque-auth-admin, com service_role, quando o admin cria/liga a conta) e nunca mais e
--      re-derivado. Trocar o e-mail do Auth depois nao muda o vinculo.
--      Trigger BEFORE INSERT destaque_users_app_vincular_profissional (funcao
--      public.vincular_profissional_usuario_destaque, SECURITY DEFINER, search_path vazio): com
--      new.profissional_id NULL, preenche com o "profissionalId" cujo email = lower(email do
--      auth.users de new.id) e ativo is not false, SO se esse auth user tem email_confirmed_at e
--      nenhuma troca de e-mail pendente (email_change vazio) — fix round 2 do review: protege o
--      religar de uma conta de outro app cujo dono trocou o e-mail. Sem casamento, sem
--      confirmacao, com troca pendente ou com o id ja ligado a outra linha: NULL, sem erro. pg_advisory_xact_lock serializa dois INSERTs
--      concorrentes (o segundo enxerga o commit do primeiro e cai em NULL em vez de violar o
--      UNIQUE). profissional_id passado explicitamente e respeitado (o UNIQUE vale). Sem trigger
--      de UPDATE: religar/desligar e ato manual (SQL do dono) ate existir tela.
--      Nome sem o prefixo destaque_ de proposito: o canario do kit avisaria (search_path vazio).
--      Backfill das linhas existentes pelo mesmo criterio (2026-10-20: Augusto -> 593837; a
--      conta "Augusto teste leitura" nao casa e fica NULL).
--      Compatibilidade conferida: a edge function destaque-auth-admin so faz INSERT com colunas
--      explicitas (id, nome, perfil_id, ativo) — tanto no convite quanto ao ligar um auth user
--      que ja existe (nao ha upsert; se ja for membro, ela recusa) — e UPDATE so de
--      nome/perfil_id/ativo/updated_at; os SELECTs (edge e src/auth/acesso.ts) listam colunas.
--      O canario checa tabelas/policies/triggers do kit por NOME (trigger novo nao interfere),
--      destaque_matriz_valida so olha destaque_perfis.paginas, e o guard anti-lockout continua
--      constraint trigger deferido (a coluna nova nao entra na regra dele). authenticated segue
--      so com SELECT em destaque_users_app (a guarda do fim ASSERTA).
--   2) Funcoes (todas SECURITY DEFINER, `search_path = public, pg_temp` — o formato que o canario
--      do kit exige —, nomes todos qualificados; EXECUTE so para authenticated, revogado de
--      public e anon):
--        destaque_minha_profissional() -> integer: destaque_users_app.profissional_id da linha
--          de auth.uid(), so se essa linha esta ATIVA e a profissional ligada tem ativo is not
--          false; senao NULL. NAO usa auth.email().
--        destaque_estrelas_periodo(p_inicio, p_fim): profissional_id, status, data_hora_cadastro,
--          data_aprovacao das aprovadas e pendentes com p_inicio <= data_hora_cadastro < p_fim.
--          Gate destaque_can_read_page('painel'); sem permissao = 0 linhas. Sem nome de cliente.
--        destaque_minhas_avaliacoes(p_profissional_id): estrelas da profissional, com
--          motivo_recusa. Permitido com write em `estrelas`, ou read em `estrelas` E o id pedido
--          = destaque_minha_profissional(); senao 0 linhas. Ordem data_hora_cadastro desc.
--        destaque_profissionais_sem_conta(): ativas com email nao nulo cujo email nao esta em
--          auth.users ligado a destaque_users_app (ativo ou nao) E cujo id nao esta em nenhum
--          destaque_users_app.profissional_id. Gate write em `usuarios`. Coluna final
--          ja_tem_login: o email ja pertence a um auth.users fora de destaque_users_app (conta de
--          outro app, que criar_usuario religaria sem convite). DROP + CREATE (tipo de retorno).
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
-- Canario do auth-kit: destaque_canario_rls() avisa funcoes destaque_* SECURITY DEFINER cujo
-- search_path nao termina em pg_temp. Por isso as 4 funcoes destaque_* usam
-- `public, pg_temp` (corpos todos qualificados, entao o schema no path nao muda a resolucao);
-- o helper do espelho e a funcao do trigger de vinculo (sem o prefixo) seguem com search_path
-- vazio.
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

-- 5b) vinculo usuario -> profissional (trigger, funcao, indice e coluna; o drop apaga os
--     vinculos gravados — exporte antes se o login ja estiver no ar:
--     select id, profissional_id from public.destaque_users_app where profissional_id is not null)
drop trigger if exists destaque_users_app_vincular_profissional on public.destaque_users_app;
drop function if exists public.vincular_profissional_usuario_destaque();
drop index if exists public.destaque_users_app_profissional_id_uniq;
alter table public.destaque_users_app drop column if exists profissional_id;

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
-- 1b) Vinculo explicito usuario -> profissional
-- ---------------------------------------------------------------------------
ALTER TABLE public.destaque_users_app
  ADD COLUMN IF NOT EXISTS profissional_id integer
    REFERENCES public.profissionais_ativos ("profissionalId") ON DELETE SET NULL;

-- tabela pequena: indice comum, sem CONCURRENTLY (que nao roda em transacao)
CREATE UNIQUE INDEX IF NOT EXISTS destaque_users_app_profissional_id_uniq
  ON public.destaque_users_app (profissional_id)
  WHERE profissional_id IS NOT NULL;

COMMENT ON COLUMN public.destaque_users_app.profissional_id IS
  'Profissional ligada a esta conta (profissionais_ativos."profissionalId"), UNICA. Preenchida no '
  'INSERT pelo trigger destaque_users_app_vincular_profissional (email do auth.users no ato da '
  'criacao da conta pelo admin) e nunca re-derivada: trocar o e-mail do Auth nao muda o vinculo. '
  'Fonte de destaque_minha_profissional(). Migracao 20261021100000.';

CREATE OR REPLACE FUNCTION public.vincular_profissional_usuario_destaque()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
declare
  v_id integer;
begin
  if new.profissional_id is not null then
    return new;
  end if;

  -- dois INSERTs concorrentes para o mesmo e-mail: o segundo espera o commit do primeiro e,
  -- como cada comando abaixo tira snapshot novo (read committed), cai em NULL em vez de
  -- violar o indice UNIQUE
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('destaque_users_app_vinculo'));

  select pa."profissionalId" into v_id
    from auth.users au
    join public.profissionais_ativos pa on pa.email = pg_catalog.lower(au.email)
   where au.id = new.id
     and au.email_confirmed_at is not null           -- e-mail confirmado
     and coalesce(au.email_change, '') = ''          -- sem troca de e-mail pendente
     and pa.ativo is not false
     and not exists (select 1 from public.destaque_users_app o
                      where o.profissional_id = pa."profissionalId")
   limit 1;

  new.profissional_id := v_id;  -- sem casamento ou ja ligado: NULL, sem erro
  return new;
end
$$;

COMMENT ON FUNCTION public.vincular_profissional_usuario_destaque() IS
  'BEFORE INSERT em destaque_users_app: com profissional_id NULL, liga a conta a profissional ativa '
  'cujo email = lower(auth.users.email) de new.id, so com email_confirmed_at preenchido e sem '
  'email_change pendente, e se ela ainda nao estiver ligada; senao NULL. '
  'Migracao 20261021100000.';

-- funcao de trigger: o EXECUTE so e checado na criacao do trigger; ninguem chama direto
REVOKE ALL ON FUNCTION public.vincular_profissional_usuario_destaque() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER destaque_users_app_vincular_profissional
  BEFORE INSERT ON public.destaque_users_app
  FOR EACH ROW
  EXECUTE FUNCTION public.vincular_profissional_usuario_destaque();

-- backfill das contas existentes, mesmo criterio do trigger (dispara o guard anti-lockout
-- deferido no commit; nenhum admin muda de estado)
UPDATE public.destaque_users_app u
   SET profissional_id = pa."profissionalId"
  FROM auth.users au, public.profissionais_ativos pa
 WHERE au.id = u.id
   AND au.email_confirmed_at IS NOT NULL
   AND coalesce(au.email_change, '') = ''
   AND pa.email = lower(au.email)
   AND pa.ativo IS NOT false
   AND u.profissional_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.destaque_users_app o
                    WHERE o.profissional_id = pa."profissionalId");

-- ---------------------------------------------------------------------------
-- 2) Funcoes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.destaque_minha_profissional()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  select u.profissional_id
  from public.destaque_users_app u
  join public.profissionais_ativos pa on pa."profissionalId" = u.profissional_id
  where u.id = auth.uid()
    and u.ativo
    and pa.ativo is not false
$$;

COMMENT ON FUNCTION public.destaque_minha_profissional() IS
  'Login -> profissional: destaque_users_app.profissional_id da conta auth.uid(), so com a conta '
  'ativa e a profissional com ativo is not false; senao NULL. NAO usa auth.email() (o e-mail do '
  'Auth e trocavel pelo proprio usuario com autoconfirm). Migracao 20261021100000.';

CREATE OR REPLACE FUNCTION public.destaque_estrelas_periodo(p_inicio timestamptz, p_fim timestamptz)
RETURNS TABLE (profissional_id integer, status text, data_hora_cadastro timestamptz, data_aprovacao timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
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

-- o tipo de retorno mudou entre revisoes (ja_tem_login): create or replace nao troca tipo
DROP FUNCTION IF EXISTS public.destaque_profissionais_sem_conta();
CREATE FUNCTION public.destaque_profissionais_sem_conta()
RETURNS TABLE ("profissionalId" integer, nome_profissional text, apelido text, categoria text, email text,
               ja_tem_login boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  select pa."profissionalId", pa.nome_profissional, pa.apelido, pa.categoria, pa.email,
         exists (
           select 1 from auth.users au
           where pg_catalog.lower(au.email) = pa.email
             and not exists (select 1 from public.destaque_users_app u where u.id = au.id)
         ) as ja_tem_login
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
    and not exists (
      select 1 from public.destaque_users_app l
      where l.profissional_id = pa."profissionalId"
    )
  order by pa.nome_profissional
$$;

COMMENT ON FUNCTION public.destaque_profissionais_sem_conta() IS
  'Tela de usuarios ("Criar contas das profissionais"): ativas com email cujo email nao esta em '
  'auth.users ligado a destaque_users_app (ativo ou nao) e cujo id nao esta ligado a nenhuma conta '
  '(destaque_users_app.profissional_id). Gate write em usuarios; senao 0 linhas. '
  'ja_tem_login = o email ja e de um usuario do Auth fora de destaque_users_app (conta de outro app): '
  'criar_usuario LIGA essa conta existente sem convite, entao a tela deve avisar e pedir confirmacao. '
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

  -- vinculo explicito
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
                  WHERE attrelid = 'public.destaque_users_app'::regclass
                    AND attname = 'profissional_id' AND NOT attisdropped) THEN
    v_falhas := v_falhas || 'coluna destaque_users_app.profissional_id ausente'::text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
                  WHERE tgrelid = 'public.destaque_users_app'::regclass
                    AND tgname = 'destaque_users_app_vincular_profissional'
                    AND tgenabled IN ('O', 'A')
                    AND tgfoid = 'public.vincular_profissional_usuario_destaque()'::regprocedure) THEN
    v_falhas := v_falhas || 'trigger destaque_users_app_vincular_profissional ausente/desligado'::text;
  END IF;
  IF has_table_privilege('authenticated', 'public.destaque_users_app', 'insert')
     OR has_table_privilege('authenticated', 'public.destaque_users_app', 'update')
     OR has_column_privilege('authenticated', 'public.destaque_users_app', 'profissional_id', 'update') THEN
    v_falhas := v_falhas || 'authenticated consegue INSERT/UPDATE em destaque_users_app'::text;
  END IF;
  -- backfill completo: nenhuma conta sem vinculo cujo e-mail casa com profissional ativa livre
  IF EXISTS (SELECT 1 FROM public.destaque_users_app u
               JOIN auth.users au ON au.id = u.id
               JOIN public.profissionais_ativos pa ON pa.email = lower(au.email)
              WHERE u.profissional_id IS NULL AND pa.ativo IS NOT false
                AND au.email_confirmed_at IS NOT NULL AND coalesce(au.email_change, '') = ''
                AND NOT EXISTS (SELECT 1 FROM public.destaque_users_app o
                                 WHERE o.profissional_id = pa."profissionalId")) THEN
    v_falhas := v_falhas || 'backfill de destaque_users_app.profissional_id incompleto'::text;
  END IF;

  IF array_length(v_falhas, 1) > 0 THEN
    RAISE EXCEPTION 'migracao A abortada: %', array_to_string(v_falhas, ' | ');
  END IF;
END $$;
