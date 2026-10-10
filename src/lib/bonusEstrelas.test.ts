import { describe, it, expect } from "vitest";
import {
  bonusDisponivel,
  calcularBonus,
  ehElegivel,
  formatarBRL,
  formatarBRLCompacto,
  juntarContagens,
  limitesDoPeriodoISO,
  nomeDoMes,
  periodoEncerrado,
  profissionaisElegiveis,
  valorPorEstrelaDaCategoria,
  valorUnicoPorEstrela,
  valoresPorCategoria,
  type ProfissionalParaBonus,
} from "./bonusEstrelas";
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

function regras(overrides: Partial<Record<"cabelo" | "unhas" | "estetica" | "maquiagem", Partial<CategoryRules>>> = {}): RulesVersion {
  return {
    id: "teste",
    validFrom: "2026-10",
    cabelo: categoria({ starBonusValue: 5, ...overrides.cabelo }),
    unhas: categoria({ starBonusValue: 5, ...overrides.unhas }),
    estetica: categoria({ starBonusValue: 5, ...overrides.estetica }),
    maquiagem: categoria({ enabled: false, ...overrides.maquiagem }),
  };
}

function prof(
  id: number,
  nome: string,
  categoriaNome: string | null,
  extra: Partial<ProfissionalParaBonus> = {}
): ProfissionalParaBonus {
  return { profissionalId: id, nome_profissional: nome, categoria: categoriaNome, ...extra };
}

describe("valorPorEstrelaDaCategoria", () => {
  it("devolve o starBonusValue da categoria ativa", () => {
    expect(valorPorEstrelaDaCategoria(regras(), "Cabelo")).toBe(5);
    expect(valorPorEstrelaDaCategoria(regras(), "Estetica")).toBe(5);
  });

  it("categoria desativada no mes fica fora, mesmo com valor configurado", () => {
    const r = regras({ unhas: { enabled: false } });
    expect(valorPorEstrelaDaCategoria(r, "Unhas")).toBe(0);
    const maq = regras({ maquiagem: { enabled: false, starBonusValue: 5 } });
    expect(valorPorEstrelaDaCategoria(maq, "Maquiagem")).toBe(0);
  });

  it("starBonusValue ausente, zero, negativo ou invalido = sem bonus", () => {
    const r = regras({
      cabelo: { starBonusValue: undefined },
      unhas: { starBonusValue: 0 },
      estetica: { starBonusValue: -3 },
    });
    expect(valorPorEstrelaDaCategoria(r, "Cabelo")).toBe(0);
    expect(valorPorEstrelaDaCategoria(r, "Unhas")).toBe(0);
    expect(valorPorEstrelaDaCategoria(r, "Estetica")).toBe(0);
    const nan = regras({ cabelo: { starBonusValue: Number.NaN } });
    expect(valorPorEstrelaDaCategoria(nan, "Cabelo")).toBe(0);
  });

  it("categoria nula, vazia ou desconhecida = sem bonus", () => {
    expect(valorPorEstrelaDaCategoria(regras(), null)).toBe(0);
    expect(valorPorEstrelaDaCategoria(regras(), "  ")).toBe(0);
    expect(valorPorEstrelaDaCategoria(regras(), "Podologia")).toBe(0);
    expect(valorPorEstrelaDaCategoria(null, "Cabelo")).toBe(0);
  });

  it("ignora espacos em volta do nome da categoria", () => {
    expect(valorPorEstrelaDaCategoria(regras(), " Cabelo ")).toBe(5);
  });
});

describe("bonusDisponivel / valorUnicoPorEstrela", () => {
  it("so existe se alguma categoria ativa tiver bonus", () => {
    expect(bonusDisponivel(regras())).toBe(true);
    const sem = regras({
      cabelo: { starBonusValue: undefined },
      unhas: { starBonusValue: 0 },
      estetica: { starBonusValue: undefined },
    });
    expect(bonusDisponivel(sem)).toBe(false);
  });

  it("bonus so em categoria desativada nao conta", () => {
    const r = regras({
      cabelo: { starBonusValue: undefined },
      unhas: { starBonusValue: undefined },
      estetica: { starBonusValue: undefined },
      maquiagem: { enabled: false, starBonusValue: 9 },
    });
    expect(bonusDisponivel(r)).toBe(false);
  });

  it("valor unico quando todas pagam igual; null quando diferem", () => {
    expect(valorUnicoPorEstrela(regras())).toBe(5);
    expect(valorUnicoPorEstrela(regras({ unhas: { starBonusValue: 3 } }))).toBeNull();
    expect(valoresPorCategoria(regras({ unhas: { starBonusValue: 3 } }))).toEqual([
      { categoria: "Cabelo", valor: 5 },
      { categoria: "Unhas", valor: 3 },
      { categoria: "Estetica", valor: 5 },
    ]);
  });
});

describe("profissionaisElegiveis", () => {
  it("inclui ativos de categorias ativas com bonus", () => {
    const lista = profissionaisElegiveis(
      [prof(1, "Ana", "Cabelo"), prof(2, "Bia", "Unhas")],
      regras()
    );
    expect(lista.map((e) => e.id)).toEqual(["1", "2"]);
    expect(lista[0]).toMatchObject({ nome: "Ana", categoria: "Cabelo", valorPorEstrela: 5 });
  });

  it("categoria desativada fica fora", () => {
    const lista = profissionaisElegiveis(
      [prof(1, "Ana", "Cabelo"), prof(2, "Bia", "Unhas")],
      regras({ unhas: { enabled: false } })
    );
    expect(lista.map((e) => e.nome)).toEqual(["Ana"]);
  });

  it("maquiagem (desativada no mes) fica fora", () => {
    const lista = profissionaisElegiveis([prof(3, "Cris", "Maquiagem")], regras());
    expect(lista).toEqual([]);
  });

  it("categoria null ou vazia fica fora", () => {
    const lista = profissionaisElegiveis(
      [prof(1, "Ana", null), prof(2, "Bia", "  "), prof(3, "Cris", "Cabelo")],
      regras()
    );
    expect(lista.map((e) => e.nome)).toEqual(["Cris"]);
  });

  it("starBonusValue ausente na categoria deixa a categoria inteira fora", () => {
    const lista = profissionaisElegiveis(
      [prof(1, "Ana", "Cabelo"), prof(2, "Bia", "Unhas")],
      regras({ cabelo: { starBonusValue: undefined } })
    );
    expect(lista.map((e) => e.nome)).toEqual(["Bia"]);
  });

  it("profissional inativo (ativo=false) fica fora; ativo nulo/true entra", () => {
    const lista = profissionaisElegiveis(
      [
        prof(1, "Ana", "Cabelo", { ativo: false }),
        prof(2, "Bia", "Cabelo", { ativo: true }),
        prof(3, "Cris", "Cabelo", { ativo: null }),
      ],
      regras()
    );
    expect(lista.map((e) => e.nome)).toEqual(["Bia", "Cris"]);
  });

  it("usa o apelido quando existe e cai no nome completo", () => {
    const lista = profissionaisElegiveis(
      [
        prof(1, "Ana Maria Souza", "Cabelo", { apelido: "Aninha" }),
        prof(2, "Bia Lima", "Cabelo", { apelido: "  " }),
        prof(3, "", "Cabelo"),
      ],
      regras()
    );
    expect(lista.map((e) => e.nome)).toEqual(["Aninha", "Bia Lima", "Profissional 3"]);
  });

  it("valor por estrela vem da categoria de cada um", () => {
    const lista = profissionaisElegiveis(
      [prof(1, "Ana", "Cabelo"), prof(2, "Bia", "Unhas")],
      regras({ unhas: { starBonusValue: 2.5 } })
    );
    expect(lista.map((e) => e.valorPorEstrela)).toEqual([5, 2.5]);
  });

  it("ehElegivel segue a mesma regra para um perfil isolado", () => {
    expect(ehElegivel(prof(1, "Ana", "Cabelo"), regras())).toBe(true);
    expect(ehElegivel(prof(3, "Cris", "Maquiagem"), regras())).toBe(false);
    expect(ehElegivel(null, regras())).toBe(false);
  });
});

describe("calcularBonus", () => {
  const elegiveis = profissionaisElegiveis(
    [
      prof(1, "Carla", "Cabelo"),
      prof(2, "Bruna", "Unhas"),
      prof(3, "Alice", "Estetica"),
      prof(4, "Dani", "Cabelo"),
    ],
    regras()
  );

  it("valor = aprovadas x valor por estrela (R$ 25,00 com 5 estrelas)", () => {
    const r = calcularBonus(elegiveis, { "1": 5 });
    expect(r.porId.get("1")?.valor).toBe(25);
    expect(formatarBRL(r.porId.get("1")!.valor)).toBe("R$ 25,00");
  });

  it("ordena por estrelas desc e desempata por nome", () => {
    const r = calcularBonus(elegiveis, { "1": 3, "2": 3, "3": 7 });
    expect(r.ranking.map((l) => l.nome)).toEqual(["Alice", "Bruna", "Carla"]);
  });

  it("empate ordena por nome ignorando acento e caixa", () => {
    const lista = profissionaisElegiveis(
      [prof(1, "Érica", "Cabelo"), prof(2, "ana", "Cabelo"), prof(3, "Bia", "Cabelo")],
      regras()
    );
    const r = calcularBonus(lista, { "1": 2, "2": 2, "3": 2 });
    expect(r.ranking.map((l) => l.nome)).toEqual(["ana", "Bia", "Érica"]);
  });

  it("so entra no ranking quem tem >= 1 aprovada; o resto vira 'sem estrela'", () => {
    const r = calcularBonus(elegiveis, { "1": 2, "4": 0 });
    expect(r.ranking.map((l) => l.nome)).toEqual(["Carla"]);
    expect(r.semEstrela).toBe(3);
  });

  it("contagens de quem nao e elegivel sao ignoradas", () => {
    const r = calcularBonus(elegiveis, { "1": 1, "99": 10 });
    expect(r.ranking).toHaveLength(1);
    expect(r.semEstrela).toBe(3);
    expect(r.porId.has("99")).toBe(false);
  });

  it("pendentes valem o valor da categoria e nao entram no valor acumulado", () => {
    const r = calcularBonus(elegiveis, { "1": 1 }, { "1": 2, "2": 1 });
    const carla = r.porId.get("1")!;
    expect(carla.valor).toBe(5);
    expect(carla.pendentes).toBe(2);
    expect(carla.valorPendente).toBe(10);
    // Pendente sem aprovada nao coloca ninguem no ranking.
    expect(r.ranking.map((l) => l.nome)).toEqual(["Carla"]);
    expect(r.porId.get("2")?.valorPendente).toBe(5);
  });

  it("mesmo valor com categorias diferentes: cada um usa o da propria categoria", () => {
    const lista = profissionaisElegiveis(
      [prof(1, "Ana", "Cabelo"), prof(2, "Bia", "Unhas")],
      regras({ unhas: { starBonusValue: 2.5 } })
    );
    const r = calcularBonus(lista, { "1": 2, "2": 3 });
    expect(r.porId.get("1")?.valor).toBe(10);
    expect(r.porId.get("2")?.valor).toBe(7.5);
  });

  it("nao vaza ponto flutuante nos centavos", () => {
    const lista = profissionaisElegiveis([prof(1, "Ana", "Cabelo")], regras({ cabelo: { starBonusValue: 0.1 } }));
    expect(calcularBonus(lista, { "1": 3 }).porId.get("1")?.valor).toBe(0.3);
  });

  it("sem elegiveis: ranking vazio e semEstrela 0", () => {
    const r = calcularBonus([], { "1": 3 });
    expect(r.ranking).toEqual([]);
    expect(r.semEstrela).toBe(0);
  });
});

describe("juntarContagens", () => {
  it("soma os mapas por categoria num Record por id", () => {
    const r = juntarContagens([
      new Map([["1", 2], ["2", 1]]),
      new Map([["3", 4]]),
      new Map<string, number>(),
    ]);
    expect(r).toEqual({ "1": 2, "2": 1, "3": 4 });
  });
});

describe("formatarBRL", () => {
  it("formata em reais com espaco comum", () => {
    expect(formatarBRL(25)).toBe("R$ 25,00");
    expect(formatarBRL(7.5)).toBe("R$ 7,50");
    expect(formatarBRL(0)).toBe("R$ 0,00");
    expect(formatarBRL(1234.5)).toBe("R$ 1.234,50");
  });

  it("compacto: inteiro sem centavos, fracionado completo", () => {
    expect(formatarBRLCompacto(5)).toBe("R$ 5");
    expect(formatarBRLCompacto(2.5)).toBe("R$ 2,50");
  });
});

describe("limitesDoPeriodoISO", () => {
  it("outubro/2026: de 00:00 do dia 1 a 00:00 de 1/11 em Manaus (-04:00)", () => {
    expect(limitesDoPeriodoISO("2026-10-01", "2026-10-31")).toEqual({
      inicioISO: "2026-10-01T04:00:00.000Z",
      fimISO: "2026-11-01T04:00:00.000Z",
    });
  });

  it("virada de ano e fevereiro bissexto", () => {
    expect(limitesDoPeriodoISO("2026-12-01", "2026-12-31")?.fimISO).toBe("2027-01-01T04:00:00.000Z");
    expect(limitesDoPeriodoISO("2028-02-01", "2028-02-29")?.fimISO).toBe("2028-03-01T04:00:00.000Z");
  });

  it("datas vazias, invalidas ou invertidas = null", () => {
    expect(limitesDoPeriodoISO("", "")).toBeNull();
    expect(limitesDoPeriodoISO("2026-10-01", "")).toBeNull();
    expect(limitesDoPeriodoISO("2026-10-31", "2026-10-01")).toBeNull();
  });
});

describe("nomeDoMes / periodoEncerrado", () => {
  it("nome do mes por extenso em pt-BR", () => {
    expect(nomeDoMes("2026-10-01")).toBe("outubro de 2026");
    expect(nomeDoMes("2026-03-01")).toBe("março de 2026");
    expect(nomeDoMes("")).toBe("");
  });

  it("encerrado so depois do ultimo dia do periodo", () => {
    expect(periodoEncerrado("2026-09-30", "2026-10-01")).toBe(true);
    expect(periodoEncerrado("2026-10-31", "2026-10-31")).toBe(false);
    expect(periodoEncerrado("2026-10-31", "2026-10-10")).toBe(false);
    expect(periodoEncerrado("", "2026-10-10")).toBe(false);
  });
});
