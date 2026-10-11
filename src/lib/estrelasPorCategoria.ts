import type { ProfissionalAtivo } from "@/types/profissionaisAtivos";
import { participaDoRanking } from "./rankingProfissionais";

/** Mapas chaveados por profissionalId (string) → total de estrelas aprovadas. */
export interface StarsByCategory {
  cabelo: Map<string, number>;
  unhas: Map<string, number>;
  maquiagem: Map<string, number>;
  estetica: Map<string, number>;
  /**
   * Aprovadas de quem NAO esta numa das quatro categorias (categoria nula ou
   * desconhecida). Nunca entra no scoring: existe so para o Bonus Estrelas
   * contar quem participa apenas do bonus (`star_bonus_extra`). Quem esta numa
   * categoria conta so no mapa dela — os dois nunca somam a mesma estrela.
   */
  semCategoria: Map<string, number>;
}

export function estrelasVazias(): StarsByCategory {
  return {
    cabelo: new Map(),
    unhas: new Map(),
    maquiagem: new Map(),
    estetica: new Map(),
    semCategoria: new Map(),
  };
}

const manausFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Manaus",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getManausDate(isoString: string): string {
  const parts = manausFormatter.formatToParts(new Date(isoString));
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export interface AvaliacaoAprovada {
  profissional_id: number | null;
  data_hora_cadastro: string | null;
}

/**
 * Agrupa as estrelas aprovadas por categoria do profissional, so as do periodo
 * (`startDate`..`endDate`, YYYY-MM-DD, dia no fuso Manaus do `data_hora_cadastro`).
 *
 * Profissional inativo (`ativo === false`) e IGNORADO por inteiro: suas estrelas
 * nao entram em nenhum mapa — nem nos de categoria (viraria linha no ranking)
 * nem em `semCategoria`. O Bonus Estrelas ja exclui inativos por conta propria.
 */
export function agruparEstrelasPorCategoria(
  avaliacoes: AvaliacaoAprovada[],
  profissionais: ProfissionalAtivo[],
  startDate: string,
  endDate: string
): StarsByCategory {
  const idToCategory = new Map<number, string>();
  const inativos = new Set<number>();
  profissionais.forEach((prof) => {
    if (!participaDoRanking(prof)) {
      inativos.add(prof.profissionalId);
      return;
    }
    if (prof.categoria) {
      idToCategory.set(prof.profissionalId, prof.categoria.trim());
    }
  });

  const result = estrelasVazias();

  avaliacoes.forEach((av) => {
    const profId = av.profissional_id;
    const dataHoraCadastro = av.data_hora_cadastro;

    if (!profId || !dataHoraCadastro) return;
    if (inativos.has(profId)) return;

    // Filtrar por mes usando data_hora_cadastro em timezone Manaus
    const manausDate = getManausDate(dataHoraCadastro);
    if (manausDate < startDate || manausDate > endDate) return;

    let categoryMap: Map<string, number>;
    switch (idToCategory.get(profId)) {
      case "Cabelo":
        categoryMap = result.cabelo;
        break;
      case "Unhas":
        categoryMap = result.unhas;
        break;
      case "Maquiagem":
        categoryMap = result.maquiagem;
        break;
      case "Estetica":
        categoryMap = result.estetica;
        break;
      default:
        // Sem categoria do desafio: so o Bonus Estrelas pode usar (extras do
        // mes); o scoring nunca le este mapa.
        categoryMap = result.semCategoria;
    }

    // Chave = profissionalId (mesma chave da associacao de servicos).
    // nome_profissional na avaliacao e apenas um snapshot historico.
    const key = String(profId);
    categoryMap.set(key, (categoryMap.get(key) || 0) + 1);
  });

  return result;
}
