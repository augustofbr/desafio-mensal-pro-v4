import type { CategoryKey, CategoryRules, SpecialServiceMatch } from "@/lib/rulesConfig";

/** Formato bruto de uma linha de trinks_services usada pelo scoring. */
export interface ServiceRecord {
  /** Chave de associacao com o profissional (id do espaco E, TEXT). */
  profissionalid?: string | null;
  /** Apenas exibicao/diagnostico — NAO usar para associar servico a profissional. */
  professional?: string | null;
  service_name?: string | null;
  category?: string | null;
  client_name?: string | null;
  service_date?: string | null;
  value?: number | string | null;
}

/**
 * Profissional da categoria: `id` e a chave de associacao (profissionais_ativos.profissionalId
 * convertido para string) e `name` e apenas o rotulo exibido.
 */
export interface RankedProfessional {
  id: string;
  name: string;
}

/**
 * Normaliza a chave de associacao vinda do banco (TEXT em trinks_services,
 * INTEGER em profissionais_ativos) para uma forma unica: string com trim.
 * Retorna null quando nao ha id — linhas sem id ficam FORA do ranking
 * (produtos de balcao/payload sem id). Nao existe fallback por nome.
 */
export function normalizeProfessionalId(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized === "" ? null : normalized;
}

/**
 * Deteccao usada pelas versoes de regra anteriores a V4, que nao possuem
 * specialServiceMatch. Preserva o comportamento historico de V1/V2/V3.
 */
const LEGACY_MATCH: Partial<Record<CategoryKey, SpecialServiceMatch>> = {
  cabelo: { type: "category", values: ["Tratamentos para Cabelo"] },
  unhas: { type: "exact", values: ["SPA dos Pés"] },
};

export function resolveSpecialServiceMatch(
  rules: CategoryRules,
  categoryKey: CategoryKey
): SpecialServiceMatch | null {
  if (rules.specialServiceMatch) return rules.specialServiceMatch;
  return LEGACY_MATCH[categoryKey] ?? null;
}

export function matchesSpecialService(
  service: ServiceRecord,
  rules: CategoryRules,
  categoryKey: CategoryKey
): boolean {
  const match = resolveSpecialServiceMatch(rules, categoryKey);
  if (!match || match.values.length === 0) return false;

  const rawField = match.type === "category" ? service.category : service.service_name;
  const field = (rawField ?? "").trim().toLowerCase();
  if (!field) return false;

  return match.values.some((value) => {
    const target = value.trim().toLowerCase();
    if (!target) return false;
    return match.type === "prefix" ? field.startsWith(target) : field === target;
  });
}

export interface ScoredService {
  date: string;
  name: string;
  points: number;
  type: "treatment" | "spa" | "special" | "client" | "star";
  clientName?: string;
}

export interface PointsRankingEntry {
  /** Chave de associacao (profissionalId como string). */
  professionalId: string;
  /** Nome de exibicao. */
  professional: string;
  points: number;
  services: ScoredService[];
  specialServices: number;
  invalidSpecialServices: number;
  uniqueClientDays: number;
  serviceCount: number;
  starCount: number;
  starPoints: number;
}

export interface PointsRankingInput {
  categoryServices: ServiceRecord[];
  categoryProfessionals: RankedProfessional[];
  /** Chaveado por profissionalId (string), nao por nome. */
  starsByProfessional: Map<string, number>;
  rules: CategoryRules;
  categoryKey: CategoryKey;
  /** Rotulo do tipo no detalhamento de servicos. Default: 'special'. */
  specialServiceType?: ScoredService["type"];
  /** Quando informado, servicos especiais reprovados nao pontuam e entram em invalidSpecialServices. */
  isSpecialServiceValid?: (service: ServiceRecord) => boolean;
}

interface Accumulator extends PointsRankingEntry {
  clientDays: Set<string>;
}

function createEntry(professionalId: string, professional: string): Accumulator {
  return {
    professionalId,
    professional,
    points: 0,
    services: [],
    specialServices: 0,
    invalidSpecialServices: 0,
    uniqueClientDays: 0,
    serviceCount: 0,
    starCount: 0,
    starPoints: 0,
    clientDays: new Set<string>(),
  };
}

/**
 * Calcula o ranking do modelo 'points': servico especial + cliente unico por dia + estrelas.
 * Usado por Cabelo, Unhas e (a partir da V4) Estetica.
 */
export function computePointsRanking(input: PointsRankingInput): PointsRankingEntry[] {
  const {
    categoryServices,
    categoryProfessionals,
    starsByProfessional,
    rules,
    categoryKey,
    specialServiceType = "special",
    isSpecialServiceValid,
  } = input;

  // Acumuladores chaveados por profissionalId — o nome e so rotulo.
  const accumulators = new Map<string, Accumulator>();

  for (const { id, name } of categoryProfessionals) {
    accumulators.set(id, createEntry(id, name));
  }

  for (const service of categoryServices) {
    const professionalId = normalizeProfessionalId(service.profissionalid);
    if (!professionalId) continue;

    let entry = accumulators.get(professionalId);
    if (!entry) {
      entry = createEntry(professionalId, service.professional || professionalId);
      accumulators.set(professionalId, entry);
    }

    entry.serviceCount += 1;

    if (matchesSpecialService(service, rules, categoryKey)) {
      const isValid = isSpecialServiceValid ? isSpecialServiceValid(service) : true;

      if (isValid) {
        entry.points += rules.specialServicePointValue;
        entry.specialServices += 1;
        entry.services.push({
          date: service.service_date ?? "",
          name: service.service_name || "Servico sem nome",
          points: rules.specialServicePointValue,
          type: specialServiceType,
        });
      } else {
        entry.invalidSpecialServices += 1;
      }
    }

    const clientName = service.client_name;
    if (clientName && clientName.trim()) {
      const clientDayKey = `${clientName.trim()}-${service.service_date}`;
      if (!entry.clientDays.has(clientDayKey)) {
        entry.clientDays.add(clientDayKey);
        entry.uniqueClientDays += 1;
        entry.points += rules.clientPointValue;
        entry.services.push({
          date: service.service_date ?? "",
          name: `Cliente: ${clientName}`,
          points: rules.clientPointValue,
          type: "client",
          clientName,
        });
      }
    }
  }

  starsByProfessional.forEach((starCount, professionalId) => {
    let entry = accumulators.get(professionalId);
    if (!entry) {
      entry = createEntry(professionalId, professionalId);
      accumulators.set(professionalId, entry);
    }

    const starPoints = rules.starsCountInScore ? starCount * rules.starPointValue : 0;
    entry.starCount = starCount;
    entry.starPoints = starPoints;
    entry.points += starPoints;

    if (starPoints > 0) {
      entry.services.push({
        date: "",
        name: `Estrelas Google: ${starCount} estrela${starCount > 1 ? "s" : ""} aprovada${starCount > 1 ? "s" : ""}`,
        points: starPoints,
        type: "star",
      });
    }
  });

  return Array.from(accumulators.values())
    .map(({ clientDays, ...entry }) => entry)
    .sort((a, b) => b.points - a.points);
}
