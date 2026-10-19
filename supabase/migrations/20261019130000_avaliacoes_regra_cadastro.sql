-- Estrelas do Google: regra no banco para o INSERT publico (out/2026).
--
-- Por que: o INSERT em avaliacoes_cadastradas e publico (anon, por design) e aceitava
-- qualquer data_hora_cadastro, data_atendimento e cliente_trinks_id.
--   - data_hora_cadastro define o MES em que a estrela pontua e ancora os sinais da fila
--     ("Atendida?"); vinha do relogio do celular (ja ha linhas reais gravadas com 1h de
--     atraso por relogio errado).
--   - o default da coluna era (now() AT TIME ZONE 'America/Manaus') gravado em timestamptz:
--     o timestamp "local" e reinterpretado no fuso da sessao (UTC) e desloca 4h. So nao
--     aparecia porque o bundle sempre manda o valor.
--   - data_atendimento e cliente_trinks_id manipulados por INSERT direto enganavam o sinal
--     "Atendida?" (id + data apontando para um atendimento real de outra cliente/dia).
--
-- Regra (trigger BEFORE INSERT, so quando current_user in ('anon','authenticated');
-- postgres/service_role ficam livres para manutencao e importacao):
--   a. data_hora_cadastro := now() e created_at := now(), ignorando o que vier do cliente.
--   b. data_atendimento nao nulo fora de [hoje-10, hoje] (hoje = dia atual em
--      America/Manaus) -> erro 22023 'O dia do atendimento precisa estar entre hoje e 10
--      dias atras.' (a mesma janela da RPC avaliacao_clientes_do_dia e do modal).
--   c. cliente_trinks_id nao nulo e (data_atendimento nula OU sem linha em trinks_services
--      da mesma profissional, no mesmo service_date 'DD/MM/YYYY', com clienteid numerico
--      igual) -> cliente_trinks_id := NULL. Nao recusa: origem_cliente_trinks fica como
--      veio ('lista' com id NULL ja e valido, e o caso das clientes que so estao na fila).
--      clienteid: btrim + '^[0-9]{1,18}$' antes do ::bigint, igual as RPCs.
--   d. status/aprovado_por/data_aprovacao: nao mexe (a policy de INSERT publico ja exige
--      pendente com aprovacao NULL).
--   Nao ha trigger de UPDATE: UPDATE so e permitido ao admin (policy), e e ele quem
--   decide; linhas existentes NAO sao alteradas por esta migracao.
--
-- SECURITY INVOKER (normal para trigger): le trinks_services com o papel de quem insere;
-- anon/authenticated ja tem leitura publica dela. Se a leitura publica de trinks_services
-- um dia for fechada, a regra c passa a anular todo id (nunca recusa o cadastro).
-- search_path vazio, tudo qualificado.
--
-- Aditiva e idempotente (create or replace function / create or replace trigger / set default).
--
-- Rollback (nesta ordem):
--   drop trigger if exists avaliacoes_cadastradas_antes_inserir on public.avaliacoes_cadastradas;
--   drop function if exists public.avaliacoes_cadastradas_antes_inserir();
--   alter table public.avaliacoes_cadastradas
--     alter column data_hora_cadastro set default (now() at time zone 'America/Manaus');
--   (o default antigo esta errado em 4h; so volte a ele se for desfazer tudo.)

-- 1. Funcao de trigger ---------------------------------------------------------
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

  return new;
end
$$;

comment on function public.avaliacoes_cadastradas_antes_inserir() is
  'BEFORE INSERT em avaliacoes_cadastradas, so para anon/authenticated: data_hora_cadastro/created_at = now(); data_atendimento fora de hoje-10..hoje (Manaus) = erro 22023; cliente_trinks_id sem linha no espelho (profissional+dia+clienteid) vira NULL.';

-- 2. Trigger -------------------------------------------------------------------
create or replace trigger avaliacoes_cadastradas_antes_inserir
  before insert on public.avaliacoes_cadastradas
  for each row
  execute function public.avaliacoes_cadastradas_antes_inserir();

-- 3. Default correto -----------------------------------------------------------
alter table public.avaliacoes_cadastradas
  alter column data_hora_cadastro set default pg_catalog.now();
