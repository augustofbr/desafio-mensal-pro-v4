-- Contencao LGPD (out/2026): anon deixa de ler cpf, telefone e dados fiscais de
-- profissionais_ativos.
--
-- Por que: a policy "Permitir leitura pública de profissionais" (SELECT, using true) e o
-- GRANT de tabela inteira a anon entregavam cpf, documento, cnpj, razao_social,
-- nome_completo, telefone, endereco e dados tributarios a qualquer um com a chave publica
-- (a pagina / fazia select('*') e baixava tudo no navegador).
--
-- Como: privilegio de COLUNA. GRANT de tabela vence REVOKE de coluna, entao primeiro tira
-- tudo de anon e depois devolve SELECT so nas colunas publicas. A policy de leitura
-- publica continua (filtra linhas, nao colunas). select('*') feito por anon passa a dar
-- "permission denied": todo consumidor anon tem de listar colunas.
--
-- Escrita de anon (INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) tambem sai: a RLS ja
-- barrava INSERT/UPDATE/DELETE (policies nfse_* exigem user_has_role), e TRUNCATE ignora RLS.
--
-- Fora do escopo (fica para o login, item 3): authenticated continua lendo todas as colunas
-- pela mesma policy publica. service_role/postgres e as funcoes security definer
-- (trinks_*, financeiro_studiox_dasmei_*) nao sao afetados. fila_trinks_process_webhook e
-- security invoker e executavel por anon, mas so le "profissionalId", nome_profissional e
-- categoria — todas continuam liberadas.
--
-- Consumidores anon conferidos em 2026-10-19: destaque-mensal-pro-v4 (useActiveProfessionals,
-- useAniversariosData), gerenciador-fila-interna-V2, comunicacoes-profissionais-parceiros,
-- emissao-nota-prof-parceiro, financeiro-studiox, site-studiox-next.
--
-- Rollback:
--   grant select, insert, update, delete, truncate, references, trigger
--     on public.profissionais_ativos to anon;

revoke all on table public.profissionais_ativos from anon;

grant select (
  "profissionalId",
  nome_profissional,
  categoria,
  apelido,
  ativo,
  dia_aniversario,
  mes_aniversario,
  created_at,
  updated_at
) on public.profissionais_ativos to anon;
