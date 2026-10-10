-- 20261010120000_profissional_fabricante_versionada_por_mes.sql
--
-- Versiona por mes as marcas autorizadas de cada profissional (profissional_fabricante).
--
-- Por que: a regra "tratamento so pontua se for da marca autorizada"
-- (regras_desafio.cabelo.manufacturerConstraints) valeu em mar-mai/2026 (V2/V3) e volta
-- em out/2026 (V5). Sem versao, mudar as autorizacoes de outubro reescreveria o ranking
-- exibido de marco a maio.
--
-- Modelo (o mesmo de regras_desafio): uma VERSAO e o conjunto inteiro de linhas com o
-- mesmo valid_from ('YYYY-MM'). Para o mes M vale a versao com o MAIOR valid_from <= M,
-- inteira (sem merge linha a linha). Sem versao <= M, nenhuma marca autorizada.
-- A resolucao roda no cliente: src/lib/marcasPorMes.ts.
--
-- Dados existentes: recebem valid_from = '2000-01' pelo DEFAULT usado SO no backfill
-- (o ADD COLUMN preenche as linhas existentes), entao continuam valendo para qualquer
-- mes — nada muda na tela ate alguem criar uma versao. Logo em seguida o DEFAULT e
-- removido: todo escritor TEM de informar a versao. Um INSERT sem valid_from falha com
-- NOT NULL em vez de cair calado na versao-base (o que reescreveria o historico inteiro).
--
-- tratamento_fabricante (marca de cada tratamento) NAO e versionada e nao e tocada.
--
-- Idempotente: pode ser reaplicada sem erro e sem efeito adicional.
--
-- Seguranca (conferido em producao em 2026-10-10, antes desta migracao):
--   RLS enabled + forced; policy de leitura publica (SELECT using true);
--   profissional_fabricante_write_admin: FOR ALL TO authenticated com
--   (select destaque_can_write_page('admin')) em USING e WITH CHECK;
--   grants: anon SELECT; authenticated com tudo, INCLUSIVE TRUNCATE.
-- TRUNCATE ignora RLS por completo. Com a tabela guardando historico de meses fechados,
-- um TRUNCATE apagaria todas as versoes de uma vez sem passar pela policy de admin.
-- O app nao usa TRUNCATE (PostgREST nem expoe o verbo); mesmo racional de
-- 20260801_revogar_truncate_publico_trinks_services.sql. Revogado aqui.
-- As policies sao recriadas com o MESMO texto, para que o repo documente o estado
-- esperado (a de escrita foi criada fora dos arquivos versionados).
--
-- Rollback (manual, so se nao existir mais de uma versao — senao o UNIQUE antigo falha):
--   alter table public.profissional_fabricante
--     drop constraint profissional_fabricante_prof_fab_valid_from_key,
--     add constraint profissional_fabricante_profissional_id_fabricante_key
--       unique (profissional_id, fabricante),
--     drop constraint profissional_fabricante_valid_from_formato,
--     drop column valid_from;
--   (o drop default nao precisa de rollback: some junto com a coluna)
--   grant truncate on public.profissional_fabricante to authenticated;
--
-- Ordem de deploy e compatibilidade:
--   1. Esta migracao ANTES do app novo: o app novo seleciona e grava valid_from; sem a
--      coluna, a leitura falha (o dashboard entao suprime o ranking de Cabelo e avisa,
--      nos meses com manufacturerConstraints) e a escrita do admin falha.
--   2. Entre a migracao e o deploy do app, o app ANTIGO:
--      - le normalmente (ignora valid_from; com so a versao '2000-01' o resultado e igual);
--      - "Autorizar" no admin FALHA (NOT NULL em valid_from, sem default) — intencional;
--      - remover e "Sincronizar" continuam funcionando sobre a versao '2000-01'.
--      Publicar o app logo depois da migracao. Abas com o bundle antigo abertas depois que
--      existir uma 2a versao enxergam a uniao das versoes ate recarregar.

begin;

-- 1. Coluna de versao. O default existe so para o backfill das linhas atuais
--    ('2000-01') e e removido logo abaixo. Reaplicar: o ADD e pulado e o DROP DEFAULT
--    e no-op.
alter table public.profissional_fabricante
  add column if not exists valid_from text not null default '2000-01';
alter table public.profissional_fabricante
  alter column valid_from drop default;

-- 2. Formato 'YYYY-MM' (mesmo formato de regras_desafio.valid_from).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profissional_fabricante'::regclass
      and conname = 'profissional_fabricante_valid_from_formato'
  ) then
    alter table public.profissional_fabricante
      add constraint profissional_fabricante_valid_from_formato
      check (valid_from ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  end if;
end $$;

-- 3. Unicidade passa a ser por versao: a mesma marca pode existir em varias versoes.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profissional_fabricante'::regclass
      and conname = 'profissional_fabricante_prof_fab_valid_from_key'
  ) then
    alter table public.profissional_fabricante
      add constraint profissional_fabricante_prof_fab_valid_from_key
      unique (profissional_id, fabricante, valid_from);
  end if;
end $$;

alter table public.profissional_fabricante
  drop constraint if exists profissional_fabricante_profissional_id_fabricante_key;

-- 4. RLS e policies no padrao do auth-kit (docs/convencao-policies.md).
alter table public.profissional_fabricante enable row level security;
alter table public.profissional_fabricante force row level security;

drop policy if exists "Allow public read access on profissional_fabricante"
  on public.profissional_fabricante;
create policy "Allow public read access on profissional_fabricante"
  on public.profissional_fabricante
  for select
  using (true);

drop policy if exists profissional_fabricante_write_admin
  on public.profissional_fabricante;
create policy profissional_fabricante_write_admin
  on public.profissional_fabricante
  for all
  to authenticated
  using ((select public.destaque_can_write_page('admin')))
  with check ((select public.destaque_can_write_page('admin')));

-- 5. Grants: anon so le; ninguem fora de postgres/service_role faz TRUNCATE.
revoke insert, update, delete, truncate, references, trigger
  on public.profissional_fabricante from anon;
grant select on public.profissional_fabricante to anon;
revoke truncate on public.profissional_fabricante from authenticated;

commit;
