import type { CategoryKey, CategoryRules, SpecialServiceMatch } from "@/lib/rulesConfig";

/** Formato bruto de uma linha de trinks_services usada pelo scoring. */
export interface ServiceRecord {
  professional?: string | null;
  service_name?: string | null;
  category?: string | null;
  client_name?: string | null;
  service_date?: string | null;
  value?: number | string | null;
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
