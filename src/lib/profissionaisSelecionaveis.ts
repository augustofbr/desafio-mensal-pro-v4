import { PROF_CATEGORIES, isCategoryActive } from "./categoryDisplayNames";
import { participaSoDoBonus, type ProfissionalParaBonus } from "./bonusEstrelas";
import type { RulesVersion } from "./rulesConfig";

/**
 * Listas de selecao de profissional das paginas PUBLICAS ("Quem e voce?",
 * cadastro de estrela, /minhas-avaliacoes). Funcao pura (sem React/Supabase).
 *
 * Quem aparece:
 *  - profissional ativo (`ativo !== false`) cuja categoria e uma das do desafio
 *    (`PROF_CATEGORIES`) e esta ATIVA no mes (`isCategoryActive`) — categoria
 *    desligada pela regra do mes (ex.: Maquiagem desde ago/2026) fica de fora;
 *  - profissional ativo que participa so do Bonus Estrelas no mes
 *    (`star_bonus_extra`, via `participaSoDoBonus` — que ja valida o JSON).
 * Todo o resto sai: inativos e ativos sem categoria que nao estao nos extras.
 *
 * FALLBACK (`rules` null/undefined = regras do mes ainda nao carregadas ou
 * indisponiveis): sem como saber o que o mes desligou, vale so o filtro
 * estatico — ativos com categoria de `PROF_CATEGORIES` (`isCategoryActive`
 * com rules ausente devolve true se a categoria esta habilitada no app). Os
 * extras nao tem como ser conhecidos sem as regras, entao ficam de fora. A
 * lista nunca fica vazia so porque as regras nao chegaram.
 *
 * Devolve os MESMOS objetos de entrada, na ordem original (quem chama ordena).
 */
export function profissionaisSelecionaveis<T extends ProfissionalParaBonus>(
  ativos: T[],
  rules: RulesVersion | null | undefined
): T[] {
  const categoriasDoDesafio: string[] = Object.values(PROF_CATEGORIES);
  return ativos.filter((prof) => {
    if (prof.ativo === false) return false;
    const categoria = prof.categoria?.trim();
    if (categoria && categoriasDoDesafio.includes(categoria) && isCategoryActive(rules, categoria)) {
      return true;
    }
    return participaSoDoBonus(prof, rules);
  });
}
