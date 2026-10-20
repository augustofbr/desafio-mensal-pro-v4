-- Verificacao da Task 4 (login em todas as rotas): o painel passa a ler as estrelas pela RPC
-- destaque_estrelas_periodo em vez da tabela. Compara, POR profissional_id e para o mes atual e
-- o anterior (fuso America/Manaus, fim EXCLUSIVO), a contagem de APROVADAS
-- (status = 'aprovada' and data_aprovacao is not null) e de PENDENTES lida direto da tabela (como
-- postgres) com a mesma contagem feita sobre o retorno da RPC executada como admin simulado.
-- Esperado: zero diferencas (ok = true em todas as linhas e "diferencas = 0").
-- So leitura: roda em begin ... rollback; as unicas tabelas criadas sao temporarias (on commit
-- drop). Pre-condicao: migracao 20261021100000_login_fase_a.sql aplicada e ao menos um usuario ativo
-- com perfil Admin em destaque_users_app (o primeiro, por nome, e o admin simulado).
-- O MCP recusa lotes grandes/sensiveis: mande o arquivo sem as linhas de comentario.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _periodos on commit drop as
select m.mes,
       (date_trunc('month', (now() at time zone 'America/Manaus')) - make_interval(months => m.atras))
         at time zone 'America/Manaus' as ini,
       (date_trunc('month', (now() at time zone 'America/Manaus')) - make_interval(months => m.atras - 1))
         at time zone 'America/Manaus' as fim
  from (values ('atual', 0), ('anterior', 1)) as m(mes, atras);

grant select on _periodos to authenticated;

-- Leitura direta da tabela (postgres).
create temp table _direto on commit drop as
select p.mes, a.profissional_id,
       count(*) filter (where a.status = 'aprovada' and a.data_aprovacao is not null) as aprovadas,
       count(*) filter (where a.status = 'pendente') as pendentes
  from _periodos p
  join public.avaliacoes_cadastradas a
    on a.data_hora_cadastro >= p.ini and a.data_hora_cadastro < p.fim
 group by p.mes, a.profissional_id;

-- Retorno da RPC (admin simulado); a tabela e do postgres, entao o papel autenticado recebe INSERT.
create temp table _rpc (mes text, profissional_id integer, aprovadas bigint, pendentes bigint) on commit drop;
grant insert on _rpc to authenticated;

do $$
declare
  uid uuid;
  x record;
begin
  select u.id into uid
    from public.destaque_users_app u
    join public.destaque_perfis p on p.id = u.perfil_id
   where u.ativo and p.nome = 'Admin'
   order by u.nome, u.id
   limit 1;
  if uid is null then
    raise exception 'login_contagem_estrelas: nenhum usuario ativo com perfil Admin em destaque_users_app';
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for x in select mes, ini, fim from _periodos loop
    insert into _rpc
    select x.mes, r.profissional_id,
           count(*) filter (where r.status = 'aprovada' and r.data_aprovacao is not null),
           count(*) filter (where r.status = 'pendente')
      from public.destaque_estrelas_periodo(x.ini, x.fim) r
     group by r.profissional_id;
  end loop;
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

create temp view _resultado as
select coalesce(d.mes, r.mes) as mes,
       coalesce(d.profissional_id, r.profissional_id) as profissional_id,
       coalesce(d.aprovadas, 0) as aprovadas_direto, coalesce(r.aprovadas, 0) as aprovadas_rpc,
       coalesce(d.pendentes, 0) as pendentes_direto, coalesce(r.pendentes, 0) as pendentes_rpc,
       coalesce(d.aprovadas, 0) = coalesce(r.aprovadas, 0)
         and coalesce(d.pendentes, 0) = coalesce(r.pendentes, 0) as ok
  from _direto d
  full join _rpc r on r.mes = d.mes and r.profissional_id is not distinct from d.profissional_id;

do $$
begin
  if exists (select 1 from _resultado where not ok) then
    raise exception 'login_contagem_estrelas: diferencas: %',
      (select string_agg(format('[%s prof %s] aprovadas %s x %s, pendentes %s x %s', mes, profissional_id,
        aprovadas_direto, aprovadas_rpc, pendentes_direto, pendentes_rpc), ' | ') from _resultado where not ok);
  end if;
  if not exists (select 1 from _rpc) then
    raise exception 'login_contagem_estrelas: a RPC nao devolveu nenhuma linha (admin sem painel:read?)';
  end if;
end $$;

select mes,
       count(*) as profissionais,
       sum(aprovadas_direto) as aprovadas_direto, sum(aprovadas_rpc) as aprovadas_rpc,
       sum(pendentes_direto) as pendentes_direto, sum(pendentes_rpc) as pendentes_rpc,
       count(*) filter (where not ok) as diferencas
  from _resultado group by mes order by mes;

rollback;
