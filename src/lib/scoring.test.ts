import { describe, it, expect } from "vitest";
import { matchesSpecialService, resolveSpecialServiceMatch } from "./scoring";
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
