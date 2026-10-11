import { describe, it, expect } from "vitest";
import { profissionaisSelecionaveis } from "./profissionaisSelecionaveis";
import type { ProfissionalParaBonus } from "./bonusEstrelas";
import type { CategoryRules, RulesVersion } from "./rulesConfig";

function categoria(overrides: Partial<CategoryRules> = {}): CategoryRules {
  return {
    scoringModel: "points",
    clientPointValue: 2,
    specialServicePointValue: 3,
    specialServiceLabel: "Especial",
    starPointValue: 3,
    starsCountInScore: true,
    qualificationGoals: {},
    symbolicGoals: {},
    manufacturerConstraints: false,
    enabled: true,
    prize: "A definir",
    ...overrides,
  };
}

function regras(extra: RulesVersion["starBonusExtra"] = null, maquiagemAtiva = false): RulesVersion {
  return {
    id: "teste",
    validFrom: "2026-10",
    cabelo: categoria(),
    unhas: categoria(),
    estetica: categoria(),
    maquiagem: categoria({ enabled: maquiagemAtiva }),
    starBonusExtra: extra,
  };
}

function prof(
  id: number,
  nome: string,
  cat: string | null,
  extra: Partial<ProfissionalParaBonus> = {}
): ProfissionalParaBonus {
  return { profissionalId: id, nome_profissional: nome, categoria: cat, ...extra };
}

const EXTRAS = { valuePerStar: 5, profissionalIds: [648177, 783999] };

function nomes(lista: ProfissionalParaBonus[]): string[] {
  return lista.map((p) => p.nome_profissional ?? "");
}

describe("profissionaisSelecionaveis", () => {
  it("ativo com categoria ativa no mes entra (ativo nulo/ausente conta como ativo)", () => {
    const lista = [
      prof(1, "Brenda", "Cabelo"),
      prof(2, "Aline", "Unhas", { ativo: true }),
      prof(3, "Debora", "Estetica", { ativo: null }),
    ];
    expect(nomes(profissionaisSelecionaveis(lista, regras()))).toEqual(["Brenda", "Aline", "Debora"]);
  });

  it("inativo sai, mesmo com categoria ativa", () => {
    const lista = [prof(1, "Danielle", "Cabelo", { ativo: false }), prof(2, "Kim", "Cabelo")];
    expect(nomes(profissionaisSelecionaveis(lista, regras()))).toEqual(["Kim"]);
  });

  it("ativo sem categoria e fora dos extras sai", () => {
    const lista = [
      prof(10, "Augusto", null),
      prof(11, "Felipe", ""),
      prof(12, "Paula", "   "),
      prof(13, "Alguem", "Podologia"),
    ];
    expect(profissionaisSelecionaveis(lista, regras(EXTRAS))).toEqual([]);
  });

  it("sem categoria e nos extras entra", () => {
    const lista = [prof(648177, "Andressa", null), prof(783999, "Kelle", null), prof(10, "Augusto", null)];
    expect(nomes(profissionaisSelecionaveis(lista, regras(EXTRAS)))).toEqual(["Andressa", "Kelle"]);
  });

  it("nos extras mas inativo sai", () => {
    const lista = [prof(648177, "Andressa", null, { ativo: false }), prof(783999, "Kelle", null)];
    expect(nomes(profissionaisSelecionaveis(lista, regras(EXTRAS)))).toEqual(["Kelle"]);
  });

  it("categoria desativada no mes (Maquiagem) sai", () => {
    const lista = [prof(1, "Make", "Maquiagem"), prof(2, "Kim", "Cabelo")];
    expect(nomes(profissionaisSelecionaveis(lista, regras()))).toEqual(["Kim"]);
    expect(nomes(profissionaisSelecionaveis(lista, regras(null, true)))).toEqual(["Make", "Kim"]);
  });

  it("categoria desativada no mes mas nos extras entra (como so do bonus)", () => {
    const lista = [prof(648177, "Andressa", "Maquiagem"), prof(1, "Make", "Maquiagem")];
    expect(nomes(profissionaisSelecionaveis(lista, regras(EXTRAS)))).toEqual(["Andressa"]);
  });

  it("extras com forma invalida sao ignorados (sem categoria sai)", () => {
    const invalido = { valuePerStar: -1, profissionalIds: [648177] } as RulesVersion["starBonusExtra"];
    const lista = [prof(648177, "Andressa", null)];
    expect(profissionaisSelecionaveis(lista, regras(invalido))).toEqual([]);
  });

  it("ignora espacos em volta da categoria", () => {
    expect(nomes(profissionaisSelecionaveis([prof(1, "Brenda", " Cabelo ")], regras()))).toEqual(["Brenda"]);
  });

  it("rules null/undefined (fallback): ativos com categoria do desafio, sem extras, nunca vazio por causa das regras", () => {
    const lista = [
      prof(1, "Brenda", "Cabelo"),
      prof(2, "Make", "Maquiagem"),
      prof(3, "Danielle", "Cabelo", { ativo: false }),
      prof(4, "Augusto", null),
      prof(648177, "Andressa", null),
    ];
    expect(nomes(profissionaisSelecionaveis(lista, null))).toEqual(["Brenda", "Make"]);
    expect(nomes(profissionaisSelecionaveis(lista, undefined))).toEqual(["Brenda", "Make"]);
  });

  it("devolve os mesmos objetos de entrada, na ordem original", () => {
    const a = prof(1, "Zoe", "Cabelo");
    const b = prof(2, "Ana", "Unhas");
    const resultado = profissionaisSelecionaveis([a, b], regras());
    expect(resultado[0]).toBe(a);
    expect(resultado[1]).toBe(b);
  });

  it("cenario de outubro/2026", () => {
    const lista = [
      prof(1, "Brenda", "Cabelo"),
      prof(2, "Debora", "Estetica"),
      prof(3, "Aline", "Unhas"),
      prof(4, "Augusto", null),
      prof(5, "Felipe", null),
      prof(6, "Paula", null),
      prof(7, "Danielle", "Unhas", { ativo: false }),
      prof(8, "Jucilene", "Cabelo", { ativo: false }),
      prof(9, "Lincoln", null, { ativo: false }),
      prof(648177, "Andressa", null),
      prof(783999, "Kelle", null),
    ];
    expect(nomes(profissionaisSelecionaveis(lista, regras(EXTRAS)))).toEqual([
      "Brenda",
      "Debora",
      "Aline",
      "Andressa",
      "Kelle",
    ]);
  });
});
