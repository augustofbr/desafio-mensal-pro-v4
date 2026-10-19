-- Estrelas do Google: cliente no Trinks ao lado do nome no Google (out/2026).
--
-- `avaliacoes_cadastradas.nome_cliente` continua sendo o NOME DA CLIENTE NO GOOGLE
-- (como ela assinou a avaliacao) e continua NOT NULL. As colunas novas guardam QUEM
-- ela e no Trinks e QUANDO foi atendida, para a fila de aprovacao cruzar com os
-- atendimentos (sinais "Atendida?" / "Possivel duplicata", migracao seguinte):
--
--   nome_cliente_trinks    nome da cliente no Trinks (escolhido da lista ou digitado)
--   cliente_trinks_id      id da cliente no Trinks (trinks_services.clienteid), so quando
--                          escolhida da lista E o id e conhecido; senao NULL
--   data_atendimento       dia do atendimento (America/Manaus)
--   origem_cliente_trinks  'lista' (escolhida da lista do dia) | 'digitado' (a mao)
--
-- Todas NULLABLE e SEM default: linhas antigas ficam com tudo NULL ("cadastro antigo")
-- e o bundle em cache (que insere so os campos legados) continua funcionando. A policy
-- de INSERT publico ("status='pendente' AND aprovado_por/data_aprovacao NULL") NAO muda.
--
-- Funcoes:
--   avaliacao_normalizar_nome(text)  lower + unaccent + espacos colapsados (immutable;
--                                    unaccent com dicionario explicito)
--   avaliacao_clientes_do_dia(int, date)
--       Lista de clientes atendidas pela profissional no dia, para o modal publico.
--       Janela: hoje-10 .. hoje (Manaus), fora disso = erro 22023.
--       Fontes: espelho (trinks_services, todo dia da janela) + fila
--       ("gerencia-fila-trinks-appointments", so quando p_data = hoje; so status
--       'em atendimento'/'finalizado', mesma regra do gerenciador-fila-interna-V2).
--       O id de cliente da fila NAO entra (vai NULL): nao foi provado que trinks_client_id
--       esta no mesmo espaco de trinks_services.clienteid. Uma cliente da fila cujo nome
--       normalizado bate com uma do espelho no mesmo dia/profissional e fundida a ela.
--       SECURITY INVOKER: so le o que anon ja le hoje (as duas tabelas tem SELECT publico).
--
-- Aditiva e idempotente.
--
-- Rollback (nesta ordem):
--   drop function if exists public.avaliacao_clientes_do_dia(integer, date);
--   drop function if exists public.avaliacao_normalizar_nome(text);  -- so se a migracao
--       de sinais (20261019120100) nao estiver aplicada: ela depende desta funcao
--   alter table public.avaliacoes_cadastradas
--     drop constraint if exists avaliacoes_origem_cliente_trinks_chk,
--     drop column if exists origem_cliente_trinks,
--     drop column if exists data_atendimento,
--     drop column if exists cliente_trinks_id,
--     drop column if exists nome_cliente_trinks;
--   (dropar as colunas descarta o que ja tiver sido gravado nelas; o bundle novo precisa
--   ser revertido antes, senao o INSERT com as colunas novas falha.)

-- 1. Colunas -------------------------------------------------------------------
alter table public.avaliacoes_cadastradas
  add column if not exists nome_cliente_trinks text,
  add column if not exists cliente_trinks_id bigint,
  add column if not exists data_atendimento date,
  add column if not exists origem_cliente_trinks text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.avaliacoes_cadastradas'::regclass
      and conname = 'avaliacoes_origem_cliente_trinks_chk'
  ) then
    alter table public.avaliacoes_cadastradas
      add constraint avaliacoes_origem_cliente_trinks_chk
      check (origem_cliente_trinks in ('lista', 'digitado'));
  end if;
end $$;

comment on column public.avaliacoes_cadastradas.nome_cliente is
  'Nome da cliente no GOOGLE (como assinou a avaliacao). O nome no Trinks fica em nome_cliente_trinks.';
comment on column public.avaliacoes_cadastradas.nome_cliente_trinks is
  'Nome da cliente no Trinks (lista do dia ou digitado). NULL = cadastro antigo.';
comment on column public.avaliacoes_cadastradas.cliente_trinks_id is
  'Id da cliente no Trinks (trinks_services.clienteid) quando escolhida da lista com id conhecido; senao NULL.';
comment on column public.avaliacoes_cadastradas.data_atendimento is
  'Dia do atendimento (America/Manaus), de hoje-10 a hoje no momento do cadastro. NULL = cadastro antigo.';
comment on column public.avaliacoes_cadastradas.origem_cliente_trinks is
  '''lista'' = escolhida da lista do dia; ''digitado'' = nome digitado a mao. NULL = cadastro antigo.';

-- 2. Normalizacao de nome -------------------------------------------------------
create or replace function public.avaliacao_normalizar_nome(p text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog, public
as $$
  select lower(public.unaccent('public.unaccent'::regdictionary,
                               regexp_replace(trim(p), '\s+', ' ', 'g')))
$$;

comment on function public.avaliacao_normalizar_nome(text) is
  'lower(unaccent(trim)) com espacos colapsados. Usada para comparar nomes de cliente (Google x Trinks, duplicatas).';

revoke all on function public.avaliacao_normalizar_nome(text) from public;
grant execute on function public.avaliacao_normalizar_nome(text) to anon, authenticated, service_role;

-- 3. Lista de clientes do dia ---------------------------------------------------
create or replace function public.avaliacao_clientes_do_dia(p_profissional_id integer, p_data date)
returns table (cliente_trinks_id bigint, nome text, servicos text[], fonte text)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_hoje date := (now() at time zone 'America/Manaus')::date;
begin
  if p_data is null or p_data < v_hoje - 10 or p_data > v_hoje then
    raise exception 'avaliacao_clientes_do_dia: p_data (%) fora da janela % a %', p_data, v_hoje - 10, v_hoje
      using errcode = '22023';  -- invalid_parameter_value
  end if;

  return query
  with espelho as (
    select case when t.clienteid ~ '^\d+$' then t.clienteid::bigint end as cid,
           btrim(t.client_name)                                          as cnome,
           t.service_name                                                as servico
    from public.trinks_services t
    where t.profissionalid = p_profissional_id::text
      and t.service_date   = to_char(p_data, 'DD/MM/YYYY')
      and t.client_name is not null
      and btrim(t.client_name) <> ''
  ),
  fila as (
    select btrim(f.client_name) as cnome,
           f.service_name       as servico
    from public."gerencia-fila-trinks-appointments" f
    where p_data = v_hoje
      and f.professional_id  = p_profissional_id
      and f.appointment_date = p_data
      and lower(btrim(f.trinks_status)) in ('em atendimento', 'finalizado')
      and btrim(f.client_name) <> ''
  ),
  linhas as (
    select e.cid, e.cnome, e.servico, 'espelho'::text as origem,
           coalesce(e.cid::text, public.avaliacao_normalizar_nome(e.cnome)) as chave
    from espelho e
    union all
    -- fila: id sempre NULL; funde com a cliente do espelho de mesmo nome normalizado
    select null::bigint, fl.cnome, fl.servico, 'fila'::text,
           coalesce(
             (select min(e2.cid)::text from espelho e2
               where e2.cid is not null
                 and public.avaliacao_normalizar_nome(e2.cnome) = public.avaliacao_normalizar_nome(fl.cnome)),
             public.avaliacao_normalizar_nome(fl.cnome))
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
$$;

comment on function public.avaliacao_clientes_do_dia(integer, date) is
  'Clientes atendidas pela profissional (profissionais_ativos.profissionalId) no dia p_data (hoje-10..hoje, Manaus). Espelho trinks_services + fila do dia (so hoje). fonte = espelho|fila; id da fila nao entra.';

revoke all on function public.avaliacao_clientes_do_dia(integer, date) from public;
grant execute on function public.avaliacao_clientes_do_dia(integer, date) to anon, authenticated, service_role;
