-- Aposentadoria do app studio-x1-rank-up — fecha o acesso de anon/authenticated aos objetos
-- de banco dele e remove os 2 triggers de auditoria quebrados. NADA é apagado (tabela, dado,
-- função, tipo ou policy): só grants e 2 triggers.
--
-- Decisão do dono (2026-10-20): o studio-x1 está aposentado (repo movido para
-- aposentados/studio-x1-rank-up); nada de apagar tabela nem dado; nenhum objeto usado por app
-- ativo pode ser afetado; remover os 2 triggers de auditoria quebrados.
-- Verificação: supabase/verificacoes/aposenta_studio_x1.sql (begin ... RAISE, nada persiste).
--
-- Banco COMPARTILHADO (kxgrprxyqeuffhczaznl): Destaque, fila V2, NFS-e, financeiro e n8n.
--
-- O que fecha:
--   1) REVOKE EXECUTE de PUBLIC, anon e authenticated (ficam postgres e service_role) em 22
--      funções do studio:
--        reset_daily_queue(); revert_start_attendance(uuid); revert_finish_attendance(uuid);
--        revert_cancel_attendance(uuid); revert_presence_confirmation(text);
--        revert_toggle_external(text); get_queue_metrics();
--        get_professional_performance_by_period(integer, integer); sync_missing_professionals();
--        get_user_filters(uuid); upsert_user_filters(uuid, service_category[], integer, integer);
--        get_user_role(); get_supervisor_goal_config();
--        update_supervisor_goal_config(integer, numeric, integer, numeric, integer, numeric);
--        is_supervisor_or_admin();
--        log_permission_change(uuid, permission_audit_action, text, text, text, text, jsonb);
--        get_worked_days_current_month(); get_remaining_days_current_month();
--        get_total_working_days_current_month();
--        is_admin(); is_admin_user(); is_own_professional(text)  <- revogadas DEPOIS das tabelas
--      is_admin/is_admin_user/is_own_professional aparecem em policies, mas SÓ de tabelas do
--      studio (pg_depend + pg_policies em public e storage, conferido em 2026-10-20 e asserido
--      no bloco de pré-condições abaixo). Com o grant das tabelas revogado, nenhuma policy que as
--      chama é mais avaliada para anon/authenticated.
--   2) REVOKE ALL de anon e authenticated (ficam postgres e service_role) em:
--        tabelas: monthly_goals, system_config, supervisor_goal_config, user_filters,
--          user_permissions, queue_attendances, queue_professionals, queue_events, queue_config,
--          queue_automation_config, professionals, profiles;
--        views: professional_performance, professional_forecast_details, supervisor_performance,
--          supervisor_performance_with_forecast.
--      Sequences: NENHUMA dessas tabelas tem sequence (ids uuid/text; conferido em pg_depend e
--      nos defaults). A pré-condição aborta se aparecer uma, porque o ROLLBACK não a cobriria.
--   3) DROP TRIGGER trigger_profiles_permission_audit ON public.profiles e
--      trigger_user_permissions_audit ON public.user_permissions. Eles chamam
--      log_permission_change(), que grava em permission_audit_log — tabela que NÃO existe —, e
--      fazem falhar operações que os disparam (exclusão de usuário do Auth, via cascata). As
--      funções de trigger (trigger_log_role_change, trigger_log_user_permissions_change) FICAM.
--
-- O que NÃO toca (a guarda final compara um retrato do catálogo antes x depois, dentro da
-- própria transação, e aborta se qualquer outra coisa mudou):
--   * trinks_services: grants, policies e o trigger trigger_sync_new_professional;
--   * sync_new_professional(): SECURITY DEFINER, owner postgres (asserido). Ela insere em
--     public.professionals na ingestão do Destaque; como roda com o papel do owner (postgres),
--     o REVOKE em professionals não a afeta;
--   * handle_new_user() + trigger on_auth_user_created (Auth compartilhado): SECURITY DEFINER,
--     owner postgres (asserido); continua criando a linha em profiles;
--   * user_roles e user_has_role (NFS-e); update_updated_at_column (e os triggers de
--     updated_at das tabelas do studio, que ficam);
--   * servicos, prof_servicos, profissionais_ativos, "gerencia-fila-*", fila_*,
--     increment_real_attendances; tudo do Destaque (destaque_*, avaliacao*), do NFS-e (nfse*,
--     lotes_emissao, emissoes...) e do financeiro (financeiro_studiox_*).
--   Retrato: ACL/owner/RLS de toda relação em public/storage/auth, ACL de coluna, ACL/owner/
--   SECURITY DEFINER/config/md5 do corpo de toda função em public/storage/auth, toda policy
--   (qualquer schema) e todo trigger não interno (habilitação + md5 da definição). Dos objetos
--   do studio só a ACL fica fora do retrato (é o que esta migração muda); o resto deles também
--   tem de ficar igual. Os 2 triggers removidos ficam fora e têm assert próprio.
--
-- Uso pelos apps ativos (conferido em 2026-10-20): nenhum repo ativo em ~/Projetos/claude-code
-- (fila V2, NFS-e, financeiro, CRM, site, Destaque) chama essas tabelas/views/RPCs pelo
-- supabase-js; fila_trinks_process_webhook/fila_trinks_reconcile só citam
-- "gerencia-fila-professionals" (outra tabela). Nenhum pg_cron chama função do studio.
-- Escritas nas tabelas do studio pararam em jul–ago/2025, exceto profiles (handle_new_user) e
-- professionals (sync_new_professional), que seguem pelos triggers DEFINER.
--
-- Transação e lock: o arquivo roda numa transação (apply_migration manda um lote). DROP
-- TRIGGER pega ACCESS EXCLUSIVE em profiles e user_permissions (profiles recebe INSERT a cada
-- cadastro no Auth), então `SET LOCAL lock_timeout = '5s'`: se algo segura a tabela, a
-- migração falha inteira, sem efeito parcial; basta rodar de novo. O DO logo abaixo ASSERTA
-- que o lock_timeout pegou (fora de transação o SET LOCAL não vale e a migração aborta).
--
-- Idempotente: REVOKE repetido não falha; DROP TRIGGER IF EXISTS. A pré-condição dos triggers
-- aceita "já removido".
--
-- Rollback autossuficiente (não depende de outro arquivo). Devolve os grants EXATOS de
-- 2026-10-20 (ACLs lidas do catálogo):
--   tabelas e views: {postgres=arwdDxt/postgres,anon=arwdDxt/postgres,
--                     authenticated=arwdDxt/postgres,service_role=arwdDxt/postgres}
--   funções:         {=X/postgres,postgres=X/postgres,anon=X/postgres,
--                     authenticated=X/postgres,service_role=X/postgres}
-- O GRANT de volta reacrescenta as entradas no fim do array (a ordem do texto da ACL muda; o
-- conjunto de privilégios é idêntico — o assert do rollback compara o conjunto). Os triggers
-- voltam com a definição de pg_get_triggerdef de 2026-10-20 (função qualificada com public.).
-- Reabrir os grants devolve o acesso que anon/authenticated tinham (inclusive escrita) — só
-- faça se algum app ativo quebrou. Recriar os triggers traz de volta a falha deles.
/* ---- ROLLBACK ----
begin;
set local lock_timeout = '5s';

-- 1) tabelas e views: anon e authenticated com tudo (arwdDxt), como estavam
grant select, insert, update, delete, truncate, references, trigger on
  public.monthly_goals, public.system_config, public.supervisor_goal_config,
  public.user_filters, public.user_permissions, public.queue_attendances,
  public.queue_professionals, public.queue_events, public.queue_config,
  public.queue_automation_config, public.professionals, public.profiles,
  public.professional_performance, public.professional_forecast_details,
  public.supervisor_performance, public.supervisor_performance_with_forecast
  to anon, authenticated;

-- 2) funções: EXECUTE para PUBLIC, anon e authenticated, como estava
grant execute on function
  public.reset_daily_queue(),
  public.revert_start_attendance(uuid),
  public.revert_finish_attendance(uuid),
  public.revert_cancel_attendance(uuid),
  public.revert_presence_confirmation(text),
  public.revert_toggle_external(text),
  public.get_queue_metrics(),
  public.get_professional_performance_by_period(integer, integer),
  public.sync_missing_professionals(),
  public.get_user_filters(uuid),
  public.upsert_user_filters(uuid, public.service_category[], integer, integer),
  public.get_user_role(),
  public.get_supervisor_goal_config(),
  public.update_supervisor_goal_config(integer, numeric, integer, numeric, integer, numeric),
  public.is_supervisor_or_admin(),
  public.log_permission_change(uuid, public.permission_audit_action, text, text, text, text, jsonb),
  public.get_worked_days_current_month(),
  public.get_remaining_days_current_month(),
  public.get_total_working_days_current_month(),
  public.is_admin(),
  public.is_admin_user(),
  public.is_own_professional(text)
  to public, anon, authenticated;

-- 3) triggers de auditoria (pg_get_triggerdef de 2026-10-20)
drop trigger if exists trigger_profiles_permission_audit on public.profiles;
CREATE TRIGGER trigger_profiles_permission_audit AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.trigger_log_role_change();
drop trigger if exists trigger_user_permissions_audit on public.user_permissions;
CREATE TRIGGER trigger_user_permissions_audit AFTER INSERT OR DELETE OR UPDATE ON public.user_permissions FOR EACH ROW EXECUTE FUNCTION public.trigger_log_user_permissions_change();

-- 4) conferência: o conjunto de privilégios voltou ao de antes
DO $$
DECLARE
  v_falhas text[] := '{}';
  r text;
  f regprocedure;
  p text;
BEGIN
  FOREACH r IN ARRAY ARRAY['monthly_goals','system_config','supervisor_goal_config',
    'user_filters','user_permissions','queue_attendances','queue_professionals','queue_events',
    'queue_config','queue_automation_config','professionals','profiles',
    'professional_performance','professional_forecast_details','supervisor_performance',
    'supervisor_performance_with_forecast'] LOOP
    FOREACH p IN ARRAY ARRAY['select','insert','update','delete','truncate','references','trigger'] LOOP
      IF NOT has_table_privilege('anon', 'public.' || r, p)
         OR NOT has_table_privilege('authenticated', 'public.' || r, p) THEN
        v_falhas := v_falhas || format('%s sem %s para anon/authenticated', r, p);
      END IF;
    END LOOP;
  END LOOP;
  FOR f IN SELECT p2.oid::regprocedure FROM pg_proc p2 JOIN pg_namespace n ON n.oid = p2.pronamespace
            WHERE n.nspname = 'public' AND p2.proname IN ('reset_daily_queue','revert_start_attendance',
              'revert_finish_attendance','revert_cancel_attendance','revert_presence_confirmation',
              'revert_toggle_external','get_queue_metrics','get_professional_performance_by_period',
              'sync_missing_professionals','get_user_filters','upsert_user_filters','get_user_role',
              'get_supervisor_goal_config','update_supervisor_goal_config','is_supervisor_or_admin',
              'log_permission_change','get_worked_days_current_month','get_remaining_days_current_month',
              'get_total_working_days_current_month','is_admin','is_admin_user','is_own_professional') LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc x, aclexplode(x.proacl) a
                    WHERE x.oid = f AND a.grantee = 0 AND a.privilege_type = 'EXECUTE')
       OR NOT has_function_privilege('anon', f, 'execute')
       OR NOT has_function_privilege('authenticated', f, 'execute') THEN
      v_falhas := v_falhas || format('%s sem EXECUTE para PUBLIC/anon/authenticated', f);
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_trigger
       WHERE (tgrelid = 'public.profiles'::regclass AND tgname = 'trigger_profiles_permission_audit'
              AND tgfoid = 'public.trigger_log_role_change()'::regprocedure AND tgtype = 17)
          OR (tgrelid = 'public.user_permissions'::regclass AND tgname = 'trigger_user_permissions_audit'
              AND tgfoid = 'public.trigger_log_user_permissions_change()'::regprocedure AND tgtype = 29)) <> 2 THEN
    v_falhas := v_falhas || 'triggers de auditoria não voltaram'::text;
  END IF;
  IF array_length(v_falhas, 1) > 0 THEN
    RAISE EXCEPTION 'rollback da aposentadoria do studio-x1 incompleto: %', array_to_string(v_falhas, ' | ');
  END IF;
END $$;
commit;
---- FIM DO ROLLBACK ---- */

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_setting('lock_timeout') <> '5s' THEN
    RAISE EXCEPTION 'lock_timeout não ficou em 5s (%): o arquivo não está rodando numa transação - abortando',
      current_setting('lock_timeout');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 0) Pré-condições: objetos com as assinaturas esperadas, nenhuma dependência de fora do
--    studio, triggers DEFINER do "NÃO TOCAR" como esperado. Qualquer surpresa aborta.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_falhas text[] := '{}';
  v_rels text[] := ARRAY['monthly_goals','system_config','supervisor_goal_config','user_filters',
    'user_permissions','queue_attendances','queue_professionals','queue_events','queue_config',
    'queue_automation_config','professionals','profiles','professional_performance',
    'professional_forecast_details','supervisor_performance','supervisor_performance_with_forecast'];
  v_fns regprocedure[];
  v_rel_oids oid[];
  r record;
BEGIN
  -- as 22 funções existem com estas assinaturas (o cast aborta se alguma sumiu/mudou)
  v_fns := ARRAY[
    'public.reset_daily_queue()'::regprocedure,
    'public.revert_start_attendance(uuid)',
    'public.revert_finish_attendance(uuid)',
    'public.revert_cancel_attendance(uuid)',
    'public.revert_presence_confirmation(text)',
    'public.revert_toggle_external(text)',
    'public.get_queue_metrics()',
    'public.get_professional_performance_by_period(integer, integer)',
    'public.sync_missing_professionals()',
    'public.get_user_filters(uuid)',
    'public.upsert_user_filters(uuid, public.service_category[], integer, integer)',
    'public.get_user_role()',
    'public.get_supervisor_goal_config()',
    'public.update_supervisor_goal_config(integer, numeric, integer, numeric, integer, numeric)',
    'public.is_supervisor_or_admin()',
    'public.log_permission_change(uuid, public.permission_audit_action, text, text, text, text, jsonb)',
    'public.get_worked_days_current_month()',
    'public.get_remaining_days_current_month()',
    'public.get_total_working_days_current_month()',
    'public.is_admin()',
    'public.is_admin_user()',
    'public.is_own_professional(text)'];

  -- as 16 relações existem (12 tabelas + 4 views)
  SELECT array_agg(c.oid) INTO v_rel_oids
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = ANY (v_rels) AND c.relkind IN ('r', 'v');
  IF coalesce(array_length(v_rel_oids, 1), 0) <> 16 THEN
    v_falhas := v_falhas || format('esperava 16 relações do studio, achei %s', coalesce(array_length(v_rel_oids, 1), 0));
  END IF;

  -- nenhuma sequence ligada a elas (o ROLLBACK não cobriria)
  IF EXISTS (SELECT 1 FROM pg_depend d JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
              WHERE d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass
                AND d.refobjid = ANY (v_rel_oids)) THEN
    v_falhas := v_falhas || 'apareceu sequence ligada a tabela do studio'::text;
  END IF;

  -- nenhuma view/regra de FORA da lista depende delas
  FOR r IN SELECT DISTINCT rw.ev_class::regclass::text AS dep
             FROM pg_depend d JOIN pg_rewrite rw ON rw.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
            WHERE d.refobjid = ANY (v_rel_oids) AND rw.ev_class <> ALL (v_rel_oids) LOOP
    v_falhas := v_falhas || format('view de fora depende do studio: %s', r.dep);
  END LOOP;

  -- nenhuma FK de tabela de fora aponta para elas
  FOR r IN SELECT conrelid::regclass::text || '.' || conname AS dep FROM pg_constraint
            WHERE contype = 'f' AND confrelid = ANY (v_rel_oids) AND conrelid <> ALL (v_rel_oids) LOOP
    v_falhas := v_falhas || format('FK de fora aponta para o studio: %s', r.dep);
  END LOOP;

  -- nenhuma policy de tabela de fora (qualquer schema, inclusive storage) usa as funções do
  -- studio ou as tabelas dele
  FOR r IN SELECT DISTINCT pol.polrelid::regclass::text || ' / ' || pol.polname AS dep
             FROM pg_policy pol
             JOIN pg_depend d ON d.classid = 'pg_policy'::regclass AND d.objid = pol.oid
            WHERE pol.polrelid <> ALL (v_rel_oids)
              AND ((d.refclassid = 'pg_proc'::regclass AND d.refobjid = ANY (v_fns::oid[]))
                   OR (d.refclassid = 'pg_class'::regclass AND d.refobjid = ANY (v_rel_oids))) LOOP
    v_falhas := v_falhas || format('policy de fora depende do studio: %s', r.dep);
  END LOOP;
  FOR r IN SELECT schemaname || '.' || tablename || ' / ' || policyname AS dep FROM pg_policies
            WHERE NOT (schemaname = 'public' AND tablename = ANY (v_rels))
              AND coalesce(qual, '') || ' ' || coalesce(with_check, '')
                  ~* '(^|[^-a-z0-9_"])(is_admin|is_admin_user|is_own_professional|is_supervisor_or_admin|get_user_role|profiles|professionals|user_permissions|monthly_goals|system_config|supervisor_goal_config)([^a-z0-9_-]|$)' LOOP
    v_falhas := v_falhas || format('policy de fora cita o studio: %s', r.dep);
  END LOOP;

  -- funções que citam objetos do studio: só as do próprio studio e as 4 conhecidas
  -- (sync_new_professional e handle_new_user são DEFINER/postgres; as 2 de trigger de auditoria
  -- são do studio e só são chamadas pelos triggers removidos aqui)
  FOR r IN SELECT p.oid::regprocedure::text AS dep
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname !~ '^pg_'
              AND p.oid <> ALL (v_fns::oid[])
              AND p.oid NOT IN ('public.sync_new_professional()'::regprocedure,
                                'public.handle_new_user()'::regprocedure,
                                'public.trigger_log_role_change()'::regprocedure,
                                'public.trigger_log_user_permissions_change()'::regprocedure)
              AND p.prosrc ~* '(^|[^-a-z0-9_"])(monthly_goals|system_config|supervisor_goal_config|user_filters|user_permissions|queue_attendances|queue_professionals|queue_events|queue_config|queue_automation_config|professionals|profiles|professional_performance|professional_forecast_details|supervisor_performance|supervisor_performance_with_forecast|reset_daily_queue|revert_start_attendance|revert_finish_attendance|revert_cancel_attendance|revert_presence_confirmation|revert_toggle_external|get_queue_metrics|get_professional_performance_by_period|sync_missing_professionals|get_user_filters|upsert_user_filters|get_user_role|get_supervisor_goal_config|update_supervisor_goal_config|is_supervisor_or_admin|log_permission_change|get_worked_days_current_month|get_remaining_days_current_month|get_total_working_days_current_month|is_admin|is_admin_user|is_own_professional)([^a-z0-9_-]|$)' LOOP
    v_falhas := v_falhas || format('função de fora cita o studio: %s', r.dep);
  END LOOP;

  -- pg_cron não chama nada do studio
  IF EXISTS (SELECT 1 FROM cron.job
              WHERE command ~* '(reset_daily_queue|revert_|get_queue_metrics|sync_missing_professionals|_current_month|is_admin|is_own_professional|get_user_role|supervisor_goal_config|log_permission_change|get_professional_performance_by_period|user_filters)') THEN
    v_falhas := v_falhas || 'pg_cron chama função do studio'::text;
  END IF;

  -- triggers DEFINER do "NÃO TOCAR": a revogação de grants não os afeta só se forem DEFINER e
  -- o owner for postgres (dono das tabelas do studio)
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.sync_new_professional()'::regprocedure
                    AND prosecdef AND pg_get_userbyid(proowner) = 'postgres') THEN
    v_falhas := v_falhas || 'sync_new_professional não é SECURITY DEFINER de postgres'::text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.handle_new_user()'::regprocedure
                    AND prosecdef AND pg_get_userbyid(proowner) = 'postgres') THEN
    v_falhas := v_falhas || 'handle_new_user não é SECURITY DEFINER de postgres'::text;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE c.oid = ANY (v_rel_oids) AND pg_get_userbyid(c.relowner) <> 'postgres') THEN
    v_falhas := v_falhas || 'alguma relação do studio não pertence a postgres'::text;
  END IF;

  -- os 2 triggers a remover: ou ainda são os de 2026-10-20 (função e tipo), ou já não existem
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass
                AND tgname = 'trigger_profiles_permission_audit'
                AND (tgfoid <> 'public.trigger_log_role_change()'::regprocedure OR tgtype <> 17)) THEN
    v_falhas := v_falhas || 'trigger_profiles_permission_audit mudou desde 2026-10-20 (o ROLLBACK não o reproduziria)'::text;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.user_permissions'::regclass
                AND tgname = 'trigger_user_permissions_audit'
                AND (tgfoid <> 'public.trigger_log_user_permissions_change()'::regprocedure OR tgtype <> 29)) THEN
    v_falhas := v_falhas || 'trigger_user_permissions_audit mudou desde 2026-10-20 (o ROLLBACK não o reproduziria)'::text;
  END IF;

  IF array_length(v_falhas, 1) > 0 THEN
    RAISE EXCEPTION 'aposentadoria do studio-x1 abortada (pré-condição): %', array_to_string(v_falhas, ' | ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Retrato do catálogo ANTES (comparado na guarda final). Temporários: a view é removida no
-- fim; a tabela some no commit. Se a migração abortar, os dois somem no rollback.
-- ---------------------------------------------------------------------------
CREATE TEMP VIEW aposenta_x1_estado AS
WITH studio_rel AS (
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN ('monthly_goals','system_config',
     'supervisor_goal_config','user_filters','user_permissions','queue_attendances',
     'queue_professionals','queue_events','queue_config','queue_automation_config',
     'professionals','profiles','professional_performance','professional_forecast_details',
     'supervisor_performance','supervisor_performance_with_forecast')
), studio_fn AS (
  SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN ('reset_daily_queue','revert_start_attendance',
     'revert_finish_attendance','revert_cancel_attendance','revert_presence_confirmation',
     'revert_toggle_external','get_queue_metrics','get_professional_performance_by_period',
     'sync_missing_professionals','get_user_filters','upsert_user_filters','get_user_role',
     'get_supervisor_goal_config','update_supervisor_goal_config','is_supervisor_or_admin',
     'log_permission_change','get_worked_days_current_month','get_remaining_days_current_month',
     'get_total_working_days_current_month','is_admin','is_admin_user','is_own_professional')
)
SELECT 'rel'::text AS tipo, c.oid::regclass::text AS objeto,
       concat_ws(' | ', pg_get_userbyid(c.relowner),
                 CASE WHEN c.oid IN (SELECT oid FROM studio_rel) THEN '<acl do studio>' ELSE c.relacl::text END,
                 c.relrowsecurity::text, c.relforcerowsecurity::text) AS estado
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname IN ('public', 'storage', 'auth') AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
UNION ALL
SELECT 'col', a.attrelid::regclass::text || '.' || a.attname, a.attacl::text
  FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname IN ('public', 'storage', 'auth') AND a.attacl IS NOT NULL AND NOT a.attisdropped
UNION ALL
SELECT 'fn', p.oid::regprocedure::text,
       concat_ws(' | ', pg_get_userbyid(p.proowner),
                 CASE WHEN p.oid IN (SELECT oid FROM studio_fn) THEN '<acl do studio>' ELSE p.proacl::text END,
                 p.prosecdef::text, p.proconfig::text, md5(p.prosrc))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname IN ('public', 'storage', 'auth')
UNION ALL
SELECT 'pol', schemaname || '.' || tablename || '.' || policyname,
       md5(concat_ws(' | ', permissive, roles::text, cmd, qual, with_check))
  FROM pg_policies
UNION ALL
SELECT 'trg', t.tgrelid::regclass::text || '.' || t.tgname,
       t.tgenabled::text || ' | ' || md5(pg_get_triggerdef(t.oid))
  FROM pg_trigger t
 WHERE NOT t.tgisinternal
   AND NOT (t.tgrelid = 'public.profiles'::regclass AND t.tgname = 'trigger_profiles_permission_audit')
   AND NOT (t.tgrelid = 'public.user_permissions'::regclass AND t.tgname = 'trigger_user_permissions_audit');

CREATE TEMP TABLE aposenta_x1_antes ON COMMIT DROP AS SELECT * FROM aposenta_x1_estado;

-- ---------------------------------------------------------------------------
-- 2) Tabelas e views: anon e authenticated sem nenhum privilégio
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE
  public.monthly_goals, public.system_config, public.supervisor_goal_config,
  public.user_filters, public.user_permissions, public.queue_attendances,
  public.queue_professionals, public.queue_events, public.queue_config,
  public.queue_automation_config, public.professionals, public.profiles,
  public.professional_performance, public.professional_forecast_details,
  public.supervisor_performance, public.supervisor_performance_with_forecast
  FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1) Funções: sem EXECUTE para PUBLIC, anon e authenticated
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public.reset_daily_queue(),
  public.revert_start_attendance(uuid),
  public.revert_finish_attendance(uuid),
  public.revert_cancel_attendance(uuid),
  public.revert_presence_confirmation(text),
  public.revert_toggle_external(text),
  public.get_queue_metrics(),
  public.get_professional_performance_by_period(integer, integer),
  public.sync_missing_professionals(),
  public.get_user_filters(uuid),
  public.upsert_user_filters(uuid, public.service_category[], integer, integer),
  public.get_user_role(),
  public.get_supervisor_goal_config(),
  public.update_supervisor_goal_config(integer, numeric, integer, numeric, integer, numeric),
  public.is_supervisor_or_admin(),
  public.log_permission_change(uuid, public.permission_audit_action, text, text, text, text, jsonb),
  public.get_worked_days_current_month(),
  public.get_remaining_days_current_month(),
  public.get_total_working_days_current_month()
  FROM PUBLIC, anon, authenticated;

-- helpers das policies do studio: só depois de fechar as tabelas que as usam
REVOKE EXECUTE ON FUNCTION
  public.is_admin(),
  public.is_admin_user(),
  public.is_own_professional(text)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Triggers de auditoria quebrados (as funções de trigger ficam)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_profiles_permission_audit ON public.profiles;
DROP TRIGGER IF EXISTS trigger_user_permissions_audit ON public.user_permissions;

-- ---------------------------------------------------------------------------
-- Guarda final
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_falhas text[] := '{}';
  v_rels text[] := ARRAY['monthly_goals','system_config','supervisor_goal_config','user_filters',
    'user_permissions','queue_attendances','queue_professionals','queue_events','queue_config',
    'queue_automation_config','professionals','profiles','professional_performance',
    'professional_forecast_details','supervisor_performance','supervisor_performance_with_forecast'];
  v_fns regprocedure[] := ARRAY[
    'public.reset_daily_queue()'::regprocedure,
    'public.revert_start_attendance(uuid)',
    'public.revert_finish_attendance(uuid)',
    'public.revert_cancel_attendance(uuid)',
    'public.revert_presence_confirmation(text)',
    'public.revert_toggle_external(text)',
    'public.get_queue_metrics()',
    'public.get_professional_performance_by_period(integer, integer)',
    'public.sync_missing_professionals()',
    'public.get_user_filters(uuid)',
    'public.upsert_user_filters(uuid, public.service_category[], integer, integer)',
    'public.get_user_role()',
    'public.get_supervisor_goal_config()',
    'public.update_supervisor_goal_config(integer, numeric, integer, numeric, integer, numeric)',
    'public.is_supervisor_or_admin()',
    'public.log_permission_change(uuid, public.permission_audit_action, text, text, text, text, jsonb)',
    'public.get_worked_days_current_month()',
    'public.get_remaining_days_current_month()',
    'public.get_total_working_days_current_month()',
    'public.is_admin()',
    'public.is_admin_user()',
    'public.is_own_professional(text)'];
  v_privs text[] := ARRAY['select','insert','update','delete','truncate','references','trigger'];
  r text;
  p text;
  f regprocedure;
  d record;
BEGIN
  -- a) anon/authenticated não leem nem escrevem nada da lista; postgres e service_role seguem
  FOREACH r IN ARRAY v_rels LOOP
    FOREACH p IN ARRAY v_privs LOOP
      IF has_table_privilege('anon', 'public.' || r, p) THEN
        v_falhas := v_falhas || format('anon ainda tem %s em %s', p, r);
      END IF;
      IF has_table_privilege('authenticated', 'public.' || r, p) THEN
        v_falhas := v_falhas || format('authenticated ainda tem %s em %s', p, r);
      END IF;
      IF NOT has_table_privilege('service_role', 'public.' || r, p)
         OR NOT has_table_privilege('postgres', 'public.' || r, p) THEN
        v_falhas := v_falhas || format('service_role/postgres perdeu %s em %s', p, r);
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = ('public.' || r)::regclass
                  AND a.attacl IS NOT NULL AND NOT a.attisdropped) THEN
      v_falhas := v_falhas || format('%s tem grant de coluna', r);
    END IF;
  END LOOP;

  -- b) ninguém além de postgres/service_role executa as funções (nem via PUBLIC)
  FOREACH f IN ARRAY v_fns LOOP
    IF has_function_privilege('anon', f, 'execute') THEN
      v_falhas := v_falhas || format('anon ainda executa %s', f);
    END IF;
    IF has_function_privilege('authenticated', f, 'execute') THEN
      v_falhas := v_falhas || format('authenticated ainda executa %s', f);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc x, aclexplode(x.proacl) a
                WHERE x.oid = f AND a.grantee = 0) THEN
      v_falhas := v_falhas || format('PUBLIC ainda executa %s', f);
    END IF;
    IF NOT has_function_privilege('service_role', f, 'execute')
       OR NOT has_function_privilege('postgres', f, 'execute') THEN
      v_falhas := v_falhas || format('service_role/postgres perdeu EXECUTE em %s', f);
    END IF;
  END LOOP;

  -- c) os 2 triggers sumiram; as funções deles ficaram
  IF EXISTS (SELECT 1 FROM pg_trigger
              WHERE (tgrelid = 'public.profiles'::regclass AND tgname = 'trigger_profiles_permission_audit')
                 OR (tgrelid = 'public.user_permissions'::regclass AND tgname = 'trigger_user_permissions_audit')) THEN
    v_falhas := v_falhas || 'trigger de auditoria ainda existe'::text;
  END IF;
  IF to_regprocedure('public.trigger_log_role_change()') IS NULL
     OR to_regprocedure('public.trigger_log_user_permissions_change()') IS NULL THEN
    v_falhas := v_falhas || 'função de trigger de auditoria sumiu (não devia ser dropada)'::text;
  END IF;

  -- d) "NÃO TOCAR" explícito: triggers presentes e habilitados, funções DEFINER de postgres
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.trinks_services'::regclass
                    AND tgname = 'trigger_sync_new_professional' AND tgenabled IN ('O', 'A')
                    AND tgfoid = 'public.sync_new_professional()'::regprocedure) THEN
    v_falhas := v_falhas || 'trigger_sync_new_professional ausente/desligado'::text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass
                    AND tgname = 'on_auth_user_created' AND tgenabled IN ('O', 'A')
                    AND tgfoid = 'public.handle_new_user()'::regprocedure) THEN
    v_falhas := v_falhas || 'on_auth_user_created ausente/desligado'::text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.sync_new_professional()'::regprocedure
                    AND prosecdef AND pg_get_userbyid(proowner) = 'postgres')
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.handle_new_user()'::regprocedure
                    AND prosecdef AND pg_get_userbyid(proowner) = 'postgres') THEN
    v_falhas := v_falhas || 'sync_new_professional/handle_new_user deixou de ser DEFINER de postgres'::text;
  END IF;

  -- e) retrato: nada fora das ACLs do studio e dos 2 triggers mudou
  FOR d IN
    SELECT coalesce(a.tipo, b.tipo) AS tipo, coalesce(a.objeto, b.objeto) AS objeto,
           a.estado AS antes, b.estado AS depois
      FROM aposenta_x1_antes a
      FULL JOIN aposenta_x1_estado b ON b.tipo = a.tipo AND b.objeto = a.objeto
     WHERE a.estado IS DISTINCT FROM b.estado
        OR a.objeto IS NULL OR b.objeto IS NULL
     LIMIT 20
  LOOP
    v_falhas := v_falhas || format('mudou fora do escopo: %s %s (antes %s, depois %s)',
                                   d.tipo, d.objeto, coalesce(d.antes, '<ausente>'), coalesce(d.depois, '<ausente>'));
  END LOOP;

  IF array_length(v_falhas, 1) > 0 THEN
    RAISE EXCEPTION 'aposentadoria do studio-x1 abortada: %', array_to_string(v_falhas, ' | ');
  END IF;
END $$;

DROP VIEW aposenta_x1_estado;
