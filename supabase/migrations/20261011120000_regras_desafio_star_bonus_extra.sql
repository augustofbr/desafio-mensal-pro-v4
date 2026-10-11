-- Bonus Estrelas para profissionais SEM categoria (out/2026).
--
-- Quem tem profissionais_ativos.categoria IS NULL nao entra no desafio
-- (ranking, pontos, premiacao, metas). Esta coluna permite que alguns deles
-- participem APENAS do Bonus Estrelas do mes: R$ por estrela Google aprovada
-- cadastrada no mes (data_hora_cadastro, fuso America/Manaus).
--
-- Forma: {"valuePerStar": 5, "profissionalIds": [648177, 783999]}
--   valuePerStar     numero > 0 (R$ por estrela aprovada)
--   profissionalIds  profissionais_ativos."profissionalId" (inteiros)
-- NULL = ninguem de fora das categorias participa. Versionada junto com a regra
-- do mes (mesma resolucao por valid_from). O app valida no consumo
-- (src/lib/bonusEstrelas.ts -> extrasDoBonus): forma invalida = ignorada.
-- Se um id listado tiver categoria ativa com bonus, vale a regra da categoria.
--
-- Aditiva e idempotente. RLS, policies e grants de regras_desafio NAO mudam:
-- leitura publica (anon) e escrita via regras_desafio_write_admin continuam
-- valendo para a coluna nova.
--
-- Rollback: alter table public.regras_desafio drop column if exists star_bonus_extra;
-- (o app trata a coluna ausente como "sem extras").

alter table public.regras_desafio
  add column if not exists star_bonus_extra jsonb;

comment on column public.regras_desafio.star_bonus_extra is
  'Bonus Estrelas para profissionais sem categoria (so o bonus, nunca o ranking). Forma: {"valuePerStar": number > 0, "profissionalIds": int[]}. NULL = nenhum. Validado no app (extrasDoBonus); forma invalida e ignorada.';
