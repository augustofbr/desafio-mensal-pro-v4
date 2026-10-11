import type { ProfissionalAtivo, CategoriaAtiva } from "@/types/profissionaisAtivos";
import type { RankedProfessional } from "./scoring";

/**
 * Quem pode aparecer nos rankings/pontuacao do dashboard. Funcoes puras (sem
 * React/Supabase).
 *
 * Regra (decisao do dono do produto, out/2026): profissional com
 * `profissionais_ativos.ativo === false` NAO aparece em ranking, premiacao nem
 * pontuacao em NENHUM mes — inclusive meses ja encerrados. `ativo` null/ausente
 * conta como ativo (mesma convencao `ativo !== false` de `bonusEstrelas.ts` e
 * `profissionaisSelecionaveis.ts`).
 *
 * Este e o ponto unico da regra. Ela e aplicada nas DUAS fontes do scoring:
 *  - a lista de profissionais da categoria (`profissionaisDaCategoria`): os
 *    hooks de categoria so consideram servicos cujo `profissionalid` esta nessa
 *    lista, entao os atendimentos de um inativo saem junto;
 *  - o mapa de estrelas (`agruparEstrelasPorCategoria`, em `estrelasPorCategoria.ts`),
 *    porque `computePointsRanking` cria linha para qualquer id presente em
 *    `starsByProfessional`.
 */
export function participaDoRanking(prof: { ativo?: boolean | null }): boolean {
  return prof.ativo !== false;
}

/**
 * Profissionais da categoria como pares { id (chave), name (exibicao) }, sem os
 * inativos. Sem nome ou sem id ficam de fora (como antes).
 */
export function profissionaisDaCategoria(
  profissionais: ProfissionalAtivo[],
  categoria: CategoriaAtiva
): RankedProfessional[] {
  return profissionais
    .filter((p) => p.categoria === categoria && p.nome_profissional && participaDoRanking(p))
    .map((p) => ({ id: String(p.profissionalId), name: p.nome_profissional! }))
    .filter((p) => p.id !== "");
}
