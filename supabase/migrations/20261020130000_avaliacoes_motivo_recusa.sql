-- Estrelas do Google: motivo obrigatorio na recusa, legivel so pelo admin (out/2026).
--
-- Por que: recusar uma estrela era so status='rejeitada'. A profissional (em
-- /minhas-avaliacoes) e o proprio dono, depois, nao sabiam POR QUE. O motivo passa a ser
-- obrigatorio ao recusar e fica guardado na linha; quem le e so o admin (a pagina publica e
-- anonima e o signup do projeto esta aberto com autoconfirm, entao nem `authenticated` e
-- confiavel para ler texto livre escrito pelo dono).
--
-- O que muda:
--   1. Coluna motivo_recusa text null, check char_length <= 500
--      (avaliacoes_motivo_recusa_tamanho_chk) e check motivo_recusa is null or status =
--      'rejeitada' (avaliacoes_motivo_recusa_so_rejeitada_chk: vale tambem para postgres e
--      service_role, que nao passam pelo trigger de INSERT). Linhas existentes ficam NULL
--      (recusas legadas), entao os dois checks validam sem erro.
--   2. Trigger BEFORE UPDATE avaliacoes_cadastradas_antes_atualizar, para TODOS os papeis
--      (inclusive postgres/service_role):
--        - normaliza: motivo_recusa := nullif(btrim(motivo_recusa, <espaco, \t, \n, \r, \f,
--          \v, nbsp>), '') (o btrim padrao so tira espaco; um motivo so de quebras de linha
--          passaria);
--        - status diferente de 'rejeitada' (inclusive NULL) -> motivo_recusa := NULL
--          (aprovar ou devolver para a fila zera o motivo);
--        - status = 'rejeitada', motivo NULL e (a linha nao era rejeitada OU ja tinha motivo)
--          -> erro 23514 'Informe o motivo da recusa.'
--      Ou seja: recusar exige motivo; editar o motivo de uma recusa nao pode esvazia-lo; uma
--      recusa LEGADA (rejeitada sem motivo) continua aceitando UPDATE de outras colunas.
--      Atencao: o check de tamanho tambem e 23514 (check_violation). O front distingue pela
--      mensagem / constraint_name (o do trigger vem sem constraint).
--   3. INSERT: o motivo nunca nasce preenchido para anon/authenticated. Mecanismo: o trigger
--      BEFORE INSERT ja existente (avaliacoes_cadastradas_antes_inserir) zera motivo_recusa
--      no mesmo ramo anon/authenticated. Escolhido em vez de GRANT de INSERT por colunas:
--        - nao mexe no privilegio de INSERT do cadastro publico (modal em /, bundle antigo e
--          novo), entao nao ha como esta migracao quebrar o cadastro por uma lista de colunas
--          errada ou por coluna nova futura esquecida;
--        - segue o padrao do proprio trigger (data_hora_cadastro/created_at tambem sao
--          sobrescritos em silencio, sem recusar o cadastro);
--        - de qualquer forma a policy de INSERT publico so aceita status='pendente', e uma
--          pendente nunca guarda motivo depois do primeiro UPDATE.
--      O corpo parte EXATAMENTE do de 20261019130000_avaliacoes_regra_cadastro.sql (conferido
--      com pg_get_functiondef em 2026-10-20), acrescentando so a linha do motivo.
--   4. Leitura: anon e authenticated perdem o SELECT de TABELA e ganham SELECT por COLUNA em
--      todas as colunas existentes, MENOS motivo_recusa (mesmo padrao de
--      20261019160000_profissionais_ativos_colunas_anon.sql). GRANT de tabela venceria um
--      REVOKE de coluna, entao e revoke da tabela + grant das colunas.
--        - select('*') feito por anon/authenticated passa a dar 42501 (permission denied).
--          Conferido em 2026-10-20: o bundle atual so usa listas de colunas; pg_stat_statements
--          (acumulado desde 2025-05) tem select * de anon (por profissional_id) e de
--          authenticated (por status), que batem com os apps antigos
--          ranking_por_categoria-estrela_google / ranking-estrela_do_google (MinhasAvaliacoes
--          e PainelAprovacao); os edge_logs de 13/10, 17/10 e 19-20/10 nao mostram nenhum
--          select=* nessa tabela, so x3.studioxbrasil.com.br e previews deste app.
--        - PostgREST: o UPDATE do admin com .in('id').eq('status', ...).select('id') gera
--          WHERE em id/status e RETURNING so de id; o INSERT publico (sem .select()) gera
--          RETURNING de constante. Os dois so precisam de SELECT nessas colunas.
--        - UPDATE/INSERT/DELETE/TRUNCATE e as policies NAO mudam: o UPDATE de motivo_recusa
--          pelo admin continua coberto pelo UPDATE de tabela de authenticated + policy
--          avaliacoes_cadastradas_update_admin.
--        - public.avaliacoes_sinais (security invoker) so le colunas listadas, nenhuma e
--          motivo_recusa.
--        - Coluna NOVA no futuro nao fica legivel por anon/authenticated sozinha: inclua-a no
--          grant de colunas na migracao que a criar.
--   5. RPC public.avaliacoes_motivos_recusa(p_ids uuid[]) -> (id, motivo_recusa): SECURITY
--      DEFINER (le a coluna que os papeis do app nao leem), so para quem le a pagina 'admin'
--      do auth-kit (destaque_can_read_page), maximo 500 ids, so linhas rejeitadas.
--
-- Idempotente: add column if not exists, constraints condicionais, create or replace,
-- create or replace trigger, revoke/grant. Lock: ADD COLUMN/ADD CONSTRAINT pegam ACCESS
-- EXCLUSIVE em avaliacoes_cadastradas por instantes (~1,1 mil linhas, checks em coluna toda
-- NULL). lock_timeout de 3s: se a tabela estiver ocupada, a migracao falha com 55P03 em vez
-- de enfileirar (e travar) todas as leituras do dashboard atras do pedido de lock. E `set`
-- de sessao + `reset` no fim, nao `set local`: vale com ou sem transacao em volta do arquivo
-- (o CLI embrulha cada migracao numa transacao; fora de uma, `set local` seria ignorado com
-- WARNING e o timeout nao valeria). Se falhar por lock, basta rodar de novo (idempotente).
--
-- Rollback (nesta ordem; NAO devolva escrita a anon):
--   1. drop function if exists public.avaliacoes_motivos_recusa(uuid[]);
--   2. drop trigger if exists avaliacoes_cadastradas_antes_atualizar on public.avaliacoes_cadastradas;
--      drop function if exists public.avaliacoes_cadastradas_antes_atualizar();
--   3. reaplicar a funcao avaliacoes_cadastradas_antes_inserir de 20261019130000 (create or replace).
--   4. alter table public.avaliacoes_cadastradas drop constraint if exists avaliacoes_motivo_recusa_so_rejeitada_chk;
--      alter table public.avaliacoes_cadastradas drop constraint if exists avaliacoes_motivo_recusa_tamanho_chk;
--   ENQUANTO A COLUNA motivo_recusa EXISTIR, PARE AQUI: mantenha o grant de SELECT por colunas
--   (sem motivo_recusa). Devolver o SELECT de TABELA com a coluna presente expoe os motivos a
--   anon/authenticated. Os passos 5 e 6 so valem juntos e nessa ordem:
--   5. alter table public.avaliacoes_cadastradas drop column if exists motivo_recusa;
--      -- DESTRUTIVO: apaga os motivos. So com os motivos exportados.
--   6. (so depois do 5) grant select on public.avaliacoes_cadastradas to anon, authenticated;
--      -- opcional: sem a coluna, o grant por colunas ja cobre a tabela inteira.

set lock_timeout = '3s';

-- 1. Coluna e tamanho ---------------------------------------------------------
alter table public.avaliacoes_cadastradas
  add column if not exists motivo_recusa text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.avaliacoes_cadastradas'::regclass
      and conname = 'avaliacoes_motivo_recusa_tamanho_chk'
  ) then
    alter table public.avaliacoes_cadastradas
      add constraint avaliacoes_motivo_recusa_tamanho_chk
      check (pg_catalog.char_length(motivo_recusa) <= 500);
  end if;

  -- invariante: so recusa guarda motivo (recusa legada = rejeitada com motivo NULL, valida)
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.avaliacoes_cadastradas'::regclass
      and conname = 'avaliacoes_motivo_recusa_so_rejeitada_chk'
  ) then
    alter table public.avaliacoes_cadastradas
      add constraint avaliacoes_motivo_recusa_so_rejeitada_chk
      check (motivo_recusa is null or status = 'rejeitada');
  end if;
end $$;

comment on column public.avaliacoes_cadastradas.motivo_recusa is
  'Motivo da recusa (obrigatorio quando status = rejeitada, exceto recusas legadas; max. 500 caracteres; NULL em qualquer outro status). Nao e legivel por anon/authenticated: o admin le pela RPC avaliacoes_motivos_recusa.';

-- 2. Trigger BEFORE UPDATE ----------------------------------------------------
create or replace function public.avaliacoes_cadastradas_antes_atualizar()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- btrim de espaco E das quebras/tabs/nbsp: um motivo so de "\n" nao pode passar
  new.motivo_recusa := nullif(
    pg_catalog.btrim(new.motivo_recusa,
                     E' \t\n\r\f' || pg_catalog.chr(11) || pg_catalog.chr(160)),
    '');

  -- aprovar ou devolver para a fila zera o motivo
  if new.status is distinct from 'rejeitada' then
    new.motivo_recusa := null;
    return new;
  end if;

  -- recusar exige motivo; editar uma recusa nao pode esvaziar o motivo.
  -- Recusa legada (ja rejeitada e sem motivo) segue aceitando UPDATE de outras colunas.
  if new.motivo_recusa is null
     and (old.status is distinct from 'rejeitada' or old.motivo_recusa is not null) then
    raise exception 'Informe o motivo da recusa.'
      using errcode = '23514';  -- check_violation
  end if;

  return new;
end
$$;

comment on function public.avaliacoes_cadastradas_antes_atualizar() is
  'BEFORE UPDATE em avaliacoes_cadastradas, todos os papeis: motivo_recusa = nullif(btrim de espaco/tab/quebra/nbsp, ''''); status <> rejeitada -> motivo NULL; status = rejeitada sem motivo -> erro 23514 ''Informe o motivo da recusa.'', salvo recusa legada (ja rejeitada e sem motivo).';

create or replace trigger avaliacoes_cadastradas_antes_atualizar
  before update on public.avaliacoes_cadastradas
  for each row
  execute function public.avaliacoes_cadastradas_antes_atualizar();

-- 3. INSERT: motivo nunca nasce preenchido para anon/authenticated ------------
-- Corpo de 20261019130000 + a linha "d." abaixo.
create or replace function public.avaliacoes_cadastradas_antes_inserir()
returns trigger
language plpgsql
set search_path = ''
as $$
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
$$;

comment on function public.avaliacoes_cadastradas_antes_inserir() is
  'BEFORE INSERT em avaliacoes_cadastradas, so para anon/authenticated: data_hora_cadastro/created_at = now(); data_atendimento fora de hoje-10..hoje (Manaus) = erro 22023; cliente_trinks_id sem linha no espelho (profissional+dia+clienteid) vira NULL; motivo_recusa vira NULL.';

-- 4. Leitura por coluna, sem motivo_recusa ------------------------------------
revoke select on table public.avaliacoes_cadastradas from anon, authenticated;

grant select (
  id,
  profissional_id,
  nome_profissional,
  nome_cliente,
  data_hora_cadastro,
  status,
  aprovado_por,
  data_aprovacao,
  created_at,
  nome_cliente_trinks,
  cliente_trinks_id,
  data_atendimento,
  origem_cliente_trinks
) on public.avaliacoes_cadastradas to anon, authenticated;

-- 5. RPC do admin --------------------------------------------------------------
create or replace function public.avaliacoes_motivos_recusa(p_ids uuid[])
returns table (id uuid, motivo_recusa text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.destaque_can_read_page('admin') then
    raise exception 'avaliacoes_motivos_recusa: acesso restrito ao admin'
      using errcode = '42501';  -- insufficient_privilege
  end if;

  if p_ids is null or pg_catalog.cardinality(p_ids) = 0 then
    return;
  end if;

  if pg_catalog.cardinality(p_ids) > 500 then
    raise exception 'avaliacoes_motivos_recusa: no maximo 500 ids por chamada (recebidos %)',
      pg_catalog.cardinality(p_ids)
      using errcode = '22023';  -- invalid_parameter_value
  end if;

  return query
  select a.id, a.motivo_recusa
  from public.avaliacoes_cadastradas a
  where a.id = any (p_ids)
    and a.status = 'rejeitada';
end
$$;

comment on function public.avaliacoes_motivos_recusa(uuid[]) is
  'Motivo da recusa das estrelas pedidas (max. 500 ids; so as com status rejeitada; recusa legada vem com motivo NULL). So para quem le a pagina admin do auth-kit (destaque_can_read_page), senao erro 42501. SECURITY DEFINER (motivo_recusa nao e legivel por anon/authenticated), search_path vazio. EXECUTE: authenticated e service_role (anon e public revogados).';

revoke all on function public.avaliacoes_motivos_recusa(uuid[]) from public;
revoke all on function public.avaliacoes_motivos_recusa(uuid[]) from anon;
grant execute on function public.avaliacoes_motivos_recusa(uuid[]) to authenticated, service_role;

-- 6. Cache do PostgREST (a RPC nova) -------------------------------------------
-- O event trigger pgrst_ddl_watch ja recarrega em DDL; o notify garante.
notify pgrst, 'reload schema';

reset lock_timeout;
