import { describe, it, expect } from "vitest";
import { computePointsRanking, matchesSpecialService, resolveSpecialServiceMatch } from "./scoring";
import type { CategoryRules } from "./rulesConfig";

function makeRules(overrides: Partial<CategoryRules> = {}): CategoryRules {
  return {
    scoringModel: "points",
    clientPointValue: 1,
    specialServicePointValue: 2,
    specialServiceLabel: "Especial",
    starPointValue: 3,
    starsCountInScore: true,
    qualificationGoals: {},
    symbolicGoals: {},
    manufacturerConstraints: false,
    prize: "A definir",
    ...overrides,
  };
}

describe("resolveSpecialServiceMatch", () => {
  it("usa o match configurado quando existe", () => {
    const rules = makeRules({
      specialServiceMatch: { type: "exact", values: ["Cronograma Capilar [pacote]"] },
    });
    expect(resolveSpecialServiceMatch(rules, "cabelo")).toEqual({
      type: "exact",
      values: ["Cronograma Capilar [pacote]"],
    });
  });

  it("cai no fallback legado de Cabelo quando nao ha match configurado", () => {
    expect(resolveSpecialServiceMatch(makeRules(), "cabelo")).toEqual({
      type: "category",
      values: ["Tratamentos para Cabelo"],
    });
  });

  it("cai no fallback legado de Unhas quando nao ha match configurado", () => {
    expect(resolveSpecialServiceMatch(makeRules(), "unhas")).toEqual({
      type: "exact",
      values: ["SPA dos Pés"],
    });
  });

  it("retorna null para Estetica e Maquiagem sem match configurado", () => {
    expect(resolveSpecialServiceMatch(makeRules(), "estetica")).toBeNull();
    expect(resolveSpecialServiceMatch(makeRules(), "maquiagem")).toBeNull();
  });
});

describe("matchesSpecialService", () => {
  const exactRules = makeRules({
    specialServiceMatch: { type: "exact", values: ["Cronograma Capilar [pacote]"] },
  });

  it("casa por nome exato", () => {
    expect(
      matchesSpecialService({ service_name: "Cronograma Capilar [pacote]" }, exactRules, "cabelo")
    ).toBe(true);
  });

  it("ignora espacos e caixa no nome exato", () => {
    expect(
      matchesSpecialService({ service_name: "  cronograma capilar [PACOTE]  " }, exactRules, "cabelo")
    ).toBe(true);
  });

  it("nao casa nome exato diferente", () => {
    expect(
      matchesSpecialService({ service_name: "Wella Luxe Ultimate" }, exactRules, "cabelo")
    ).toBe(false);
  });

  it("nao casa por prefixo quando o tipo e exact", () => {
    expect(
      matchesSpecialService({ service_name: "Cronograma Capilar [pacote] Premium" }, exactRules, "cabelo")
    ).toBe(false);
  });

  const prefixRules = makeRules({
    specialServiceMatch: { type: "prefix", values: ["Limpeza de Pele"] },
  });

  it("casa as duas variacoes de limpeza de pele por prefixo", () => {
    expect(
      matchesSpecialService({ service_name: "Limpeza de Pele Profunda" }, prefixRules, "estetica")
    ).toBe(true);
    expect(
      matchesSpecialService({ service_name: "Limpeza de Pele simples" }, prefixRules, "estetica")
    ).toBe(true);
  });

  it("nao casa outro servico de estetica", () => {
    expect(
      matchesSpecialService({ service_name: "Cilios Fox Eyes" }, prefixRules, "estetica")
    ).toBe(false);
  });

  const categoryRules = makeRules({
    specialServiceMatch: { type: "category", values: ["Tratamentos para Cabelo"] },
  });

  it("casa pelo campo category quando o tipo e category", () => {
    expect(
      matchesSpecialService(
        { service_name: "Wella Luxe Ultimate", category: "Tratamentos para Cabelo" },
        categoryRules,
        "cabelo"
      )
    ).toBe(true);
  });

  it("nao casa quando a category e outra", () => {
    expect(
      matchesSpecialService(
        { service_name: "Wella Luxe Ultimate", category: "Cabelos" },
        categoryRules,
        "cabelo"
      )
    ).toBe(false);
  });

  it("retorna false para servico sem nome nem categoria", () => {
    expect(matchesSpecialService({}, exactRules, "cabelo")).toBe(false);
    expect(matchesSpecialService({ service_name: "   " }, exactRules, "cabelo")).toBe(false);
  });

  it("retorna false quando a lista de valores esta vazia", () => {
    const vazio = makeRules({ specialServiceMatch: { type: "exact", values: [] } });
    expect(matchesSpecialService({ service_name: "Qualquer" }, vazio, "estetica")).toBe(false);
  });

  it("usa o fallback legado quando nao ha match configurado", () => {
    expect(
      matchesSpecialService({ service_name: "SPA dos Pés" }, makeRules(), "unhas")
    ).toBe(true);
    expect(
      matchesSpecialService({ category: "Tratamentos para Cabelo" }, makeRules(), "cabelo")
    ).toBe(true);
    expect(
      matchesSpecialService({ service_name: "Limpeza de Pele Profunda" }, makeRules(), "estetica")
    ).toBe(false);
  });
});

describe("computePointsRanking", () => {
  const v4Cabelo = makeRules({
    clientPointValue: 2,
    specialServicePointValue: 5,
    starPointValue: 3,
    starsCountInScore: true,
    specialServiceMatch: { type: "exact", values: ["Cronograma Capilar [pacote]"] },
  });

  it("pontua servico especial, cliente unico por dia e estrelas", () => {
    const result = computePointsRanking({
      categoryServices: [
        { professional: "Brenda", service_name: "Cronograma Capilar [pacote]", client_name: "Ana", service_date: "01/08/2026" },
        { professional: "Brenda", service_name: "Escova", client_name: "Bia", service_date: "01/08/2026" },
      ],
      categoryProfessionals: ["Brenda"],
      starsByProfessional: new Map([["Brenda", 2]]),
      rules: v4Cabelo,
      categoryKey: "cabelo",
    });

    // 5 (cronograma) + 2 clientes x 2 pts + 2 estrelas x 3 pts = 5 + 4 + 6 = 15
    expect(result).toHaveLength(1);
    expect(result[0].points).toBe(15);
    expect(result[0].specialServices).toBe(1);
    expect(result[0].uniqueClientDays).toBe(2);
    expect(result[0].starCount).toBe(2);
    expect(result[0].starPoints).toBe(6);
    expect(result[0].serviceCount).toBe(2);
  });

  it("conta o mesmo cliente no mesmo dia uma unica vez", () => {
    const result = computePointsRanking({
      categoryServices: [
        { professional: "Ana", service_name: "Corte", client_name: "Maria", service_date: "05/08/2026" },
        { professional: "Ana", service_name: "Escova", client_name: "Maria", service_date: "05/08/2026" },
        { professional: "Ana", service_name: "Corte", client_name: "Maria", service_date: "06/08/2026" },
      ],
      categoryProfessionals: ["Ana"],
      starsByProfessional: new Map(),
      rules: v4Cabelo,
      categoryKey: "cabelo",
    });

    expect(result[0].uniqueClientDays).toBe(2);
    expect(result[0].points).toBe(4);
  });

  it("ignora clientes com nome vazio ou nulo", () => {
    const result = computePointsRanking({
      categoryServices: [
        { professional: "Ana", service_name: "Corte", client_name: "   ", service_date: "05/08/2026" },
        { professional: "Ana", service_name: "Corte", client_name: null, service_date: "05/08/2026" },
      ],
      categoryProfessionals: ["Ana"],
      starsByProfessional: new Map(),
      rules: v4Cabelo,
      categoryKey: "cabelo",
    });

    expect(result[0].uniqueClientDays).toBe(0);
    expect(result[0].points).toBe(0);
  });

  it("inclui profissionais da categoria sem nenhum servico com zero pontos", () => {
    const result = computePointsRanking({
      categoryServices: [],
      categoryProfessionals: ["Ana", "Bia"],
      starsByProfessional: new Map(),
      rules: v4Cabelo,
      categoryKey: "cabelo",
    });

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.points === 0)).toBe(true);
  });

  it("inclui profissional que so tem estrelas", () => {
    const result = computePointsRanking({
      categoryServices: [],
      categoryProfessionals: [],
      starsByProfessional: new Map([["Debora", 3]]),
      rules: v4Cabelo,
      categoryKey: "cabelo",
    });

    expect(result).toHaveLength(1);
    expect(result[0].professional).toBe("Debora");
    expect(result[0].points).toBe(9);
  });

  it("nao soma estrelas quando starsCountInScore e false", () => {
    const semEstrela = makeRules({ starsCountInScore: false, starPointValue: 3, clientPointValue: 1 });
    const result = computePointsRanking({
      categoryServices: [],
      categoryProfessionals: ["Ana"],
      starsByProfessional: new Map([["Ana", 4]]),
      rules: semEstrela,
      categoryKey: "estetica",
    });

    expect(result[0].starCount).toBe(4);
    expect(result[0].starPoints).toBe(0);
    expect(result[0].points).toBe(0);
  });

  it("respeita isSpecialServiceValid e contabiliza os invalidos", () => {
    const result = computePointsRanking({
      categoryServices: [
        { professional: "Ana", service_name: "Cronograma Capilar [pacote]", client_name: "X", service_date: "01/08/2026" },
        { professional: "Ana", service_name: "Cronograma Capilar [pacote]", client_name: "Y", service_date: "02/08/2026" },
      ],
      categoryProfessionals: ["Ana"],
      starsByProfessional: new Map(),
      rules: v4Cabelo,
      categoryKey: "cabelo",
      isSpecialServiceValid: (service) => service.client_name === "X",
    });

    expect(result[0].specialServices).toBe(1);
    expect(result[0].invalidSpecialServices).toBe(1);
    // 5 (1 cronograma valido) + 2 clientes x 2 = 9
    expect(result[0].points).toBe(9);
  });

  it("ordena por pontos decrescente", () => {
    const result = computePointsRanking({
      categoryServices: [
        { professional: "Ana", service_name: "Corte", client_name: "M", service_date: "01/08/2026" },
        { professional: "Bia", service_name: "Cronograma Capilar [pacote]", client_name: "N", service_date: "01/08/2026" },
      ],
      categoryProfessionals: ["Ana", "Bia"],
      starsByProfessional: new Map(),
      rules: v4Cabelo,
      categoryKey: "cabelo",
    });

    expect(result[0].professional).toBe("Bia");
    expect(result[1].professional).toBe("Ana");
  });

  it("reproduz o comportamento legado de Unhas sem match configurado", () => {
    const v3Unhas = makeRules({
      clientPointValue: 1,
      specialServicePointValue: 2,
      starPointValue: 3,
      starsCountInScore: true,
    });

    const result = computePointsRanking({
      categoryServices: [
        { professional: "Jane", service_name: "SPA dos Pés", client_name: "A", service_date: "10/04/2026" },
        { professional: "Jane", service_name: "Manicure", client_name: "B", service_date: "10/04/2026" },
      ],
      categoryProfessionals: ["Jane"],
      starsByProfessional: new Map([["Jane", 1]]),
      rules: v3Unhas,
      categoryKey: "unhas",
    });

    // 2 (SPA) + 2 clientes x 1 + 1 estrela x 3 = 7
    expect(result[0].points).toBe(7);
    expect(result[0].specialServices).toBe(1);
  });
});
