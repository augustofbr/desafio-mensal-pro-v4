import { describe, it, expect } from "vitest";
import {
  bonusDisponivel,
  calcularBonus,
  ehElegivel,
  arredondarCentavos,
  extrasBrutoInvalido,
  extrasDoBonus,
  fraseSoDoBonus,
  valorPorEstrelaValido,
  TETO_VALOR_POR_ESTRELA,
  participaSoDoBonus,
  profissionaisSoDoBonus,
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

  it("com o mesmo valor por estrela, ordena por estrelas desc e desempata por nome", () => {
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

  it("ordena por VALOR em R$, nao por estrelas: Estetica R$ 10 x 3 acima de Cabelo R$ 5 x 4", () => {
    const lista = profissionaisElegiveis(
      [prof(1, "Ana", "Cabelo"), prof(2, "Bia", "Estetica")],
      regras({ estetica: { starBonusValue: 10 } })
    );
    const r = calcularBonus(lista, { "1": 4, "2": 3 });
    expect(r.porId.get("1")?.valor).toBe(20);
    expect(r.porId.get("2")?.valor).toBe(30);
    expect(r.ranking.map((l) => l.nome)).toEqual(["Bia", "Ana"]);
  });

  it("mesmo numero de estrelas com valores distintos: quem recebe mais vem antes", () => {
    const lista = profissionaisElegiveis(
      [prof(1, "Zélia", "Estetica"), prof(2, "Ana", "Cabelo")],
      regras({ estetica: { starBonusValue: 10 } })
    );
    const r = calcularBonus(lista, { "1": 3, "2": 3 });
    expect(r.ranking.map((l) => l.nome)).toEqual(["Zélia", "Ana"]);
    expect(r.ranking.map((l) => l.valor)).toEqual([30, 15]);
  });

  it("mesmo valor com estrelas diferentes: desempata por estrelas e depois por nome", () => {
    // Estetica R$ 10 x 2 = R$ 20 = Cabelo R$ 5 x 4 = R$ 20.
    const lista = profissionaisElegiveis(
      [prof(1, "Ana", "Cabelo"), prof(2, "Bia", "Estetica"), prof(3, "Cris", "Cabelo")],
      regras({ estetica: { starBonusValue: 10 } })
    );
    const r = calcularBonus(lista, { "1": 4, "2": 2, "3": 4 });
    expect(r.ranking.map((l) => l.nome)).toEqual(["Ana", "Cris", "Bia"]);
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

describe("star_bonus_extra (profissionais só do bônus)", () => {
  const ANDRESSA = 648177;
  const KELLE = 783999;

  function comExtras(extra: unknown, overrides: Parameters<typeof regras>[0] = {}): RulesVersion {
    return { ...regras(overrides), starBonusExtra: extra as RulesVersion["starBonusExtra"] };
  }

  const cadastro = [
    prof(1, "Ana", "Cabelo"),
    prof(ANDRESSA, "Andressa", null),
    prof(KELLE, "Kelle", null),
    prof(593837, "Augusto", null),
  ];

  it("extra sem categoria entra com o valor dos extras e categoria null", () => {
    const rules = comExtras({ valuePerStar: 5, profissionalIds: [ANDRESSA, KELLE] });
    const lista = profissionaisElegiveis(cadastro, rules);
    expect(lista.map((e) => e.nome)).toEqual(["Ana", "Andressa", "Kelle"]);
    expect(lista[1]).toEqual({
      id: String(ANDRESSA),
      nome: "Andressa",
      categoria: null,
      valorPorEstrela: 5,
    });
    // Sem categoria e fora dos extras continua fora.
    expect(lista.some((e) => e.nome === "Augusto")).toBe(false);
  });

  it("extras entram no ranking misturados, por valor, e contam em 'sem estrela'", () => {
    const rules = comExtras({ valuePerStar: 5, profissionalIds: [ANDRESSA, KELLE] }, {
      cabelo: { starBonusValue: 3 },
    });
    const elegiveis = profissionaisElegiveis(cadastro, rules);
    const aprovadas = juntarContagens([
      new Map([["1", 4]]),
      // mapa semCategoria do useStarsData
      new Map([[String(ANDRESSA), 3], ["593837", 9]]),
    ]);
    const r = calcularBonus(elegiveis, aprovadas, { [String(KELLE)]: 2 });
    expect(r.ranking.map((l) => [l.nome, l.valor])).toEqual([
      ["Andressa", 15],
      ["Ana", 12],
    ]);
    expect(r.semEstrela).toBe(1); // Kelle (só pendentes)
    expect(r.porId.get(String(KELLE))).toMatchObject({ pendentes: 2, valorPendente: 10 });
    // Augusto tem estrelas mas não é elegível: ignorado.
    expect(r.porId.has("593837")).toBe(false);
  });

  it("extra inativo (ativo=false) fica fora", () => {
    const rules = comExtras({ valuePerStar: 5, profissionalIds: [ANDRESSA] });
    const lista = profissionaisElegiveis([prof(ANDRESSA, "Andressa", null, { ativo: false })], rules);
    expect(lista).toEqual([]);
  });

  it("extra com categoria ativa com bônus usa a regra da categoria, sem duplicar", () => {
    const rules = comExtras({ valuePerStar: 5, profissionalIds: [1] }, { cabelo: { starBonusValue: 3 } });
    const lista = profissionaisElegiveis([prof(1, "Ana", "Cabelo")], rules);
    expect(lista).toEqual([{ id: "1", nome: "Ana", categoria: "Cabelo", valorPorEstrela: 3 }]);
    expect(participaSoDoBonus(prof(1, "Ana", "Cabelo"), rules)).toBe(false);
  });

  it("extra com categoria ATIVA sem bônus fica fora (a regra da categoria manda)", () => {
    const ana = prof(1, "Ana", "Cabelo");
    for (const valor of [0, undefined]) {
      const rules = comExtras({ valuePerStar: 5, profissionalIds: [1] }, { cabelo: { starBonusValue: valor } });
      expect(profissionaisElegiveis([ana], rules)).toEqual([]);
      expect(participaSoDoBonus(ana, rules)).toBe(false);
      expect(profissionaisSoDoBonus([ana], rules)).toEqual([]);
    }
  });

  it("extra cuja categoria está fora do desafio no mês participa só do bônus", () => {
    const rules = comExtras({ valuePerStar: 5, profissionalIds: [7] });
    const maquiadora = prof(7, "Mara", "Maquiagem"); // maquiagem desativada em regras()
    expect(profissionaisElegiveis([maquiadora], rules)).toEqual([
      { id: "7", nome: "Mara", categoria: null, valorPorEstrela: 5 },
    ]);
    expect(participaSoDoBonus(maquiadora, rules)).toBe(true);
  });

  it("extras inválidos são ignorados", () => {
    const invalidos: unknown[] = [
      null,
      undefined,
      "texto",
      [ANDRESSA],
      { valuePerStar: 0, profissionalIds: [ANDRESSA] },
      { valuePerStar: -5, profissionalIds: [ANDRESSA] },
      { valuePerStar: Number.NaN, profissionalIds: [ANDRESSA] },
      { valuePerStar: Number.POSITIVE_INFINITY, profissionalIds: [ANDRESSA] },
      { valuePerStar: "5", profissionalIds: [ANDRESSA] },
      { valuePerStar: 5 },
      { valuePerStar: 5, profissionalIds: "648177" },
      { valuePerStar: 5, profissionalIds: [] },
      { valuePerStar: 5, profissionalIds: ["648177", 1.5, -3, 0, null] },
    ];
    for (const extra of invalidos) {
      const rules = comExtras(extra);
      expect(extrasDoBonus(rules)).toBeNull();
      expect(profissionaisElegiveis(cadastro, rules).map((e) => e.nome)).toEqual(["Ana"]);
    }
  });

  it("ids inválidos são descartados um a um; os válidos continuam", () => {
    const rules = comExtras({ valuePerStar: 2.5, profissionalIds: [KELLE, "x", 1.2, ANDRESSA] });
    expect(extrasDoBonus(rules)).toEqual({
      valorPorEstrela: 2.5,
      ids: new Set([String(KELLE), String(ANDRESSA)]),
    });
  });

  it("mês sem extras fica inalterado", () => {
    const rules = regras();
    expect(extrasDoBonus(rules)).toBeNull();
    expect(profissionaisElegiveis(cadastro, rules).map((e) => e.nome)).toEqual(["Ana"]);
    expect(profissionaisSoDoBonus(cadastro, rules)).toEqual([]);
    expect(fraseSoDoBonus(cadastro, rules)).toBeNull();
    expect(valorUnicoPorEstrela(rules)).toBe(5);
  });

  it("bonusDisponivel: só extras (nenhuma categoria com bônus) já mostra a área", () => {
    const semBonusNasCategorias = {
      cabelo: { starBonusValue: 0 },
      unhas: { starBonusValue: 0 },
      estetica: { starBonusValue: 0 },
    };
    expect(bonusDisponivel(regras(semBonusNasCategorias))).toBe(false);
    const rules = comExtras({ valuePerStar: 5, profissionalIds: [ANDRESSA] }, semBonusNasCategorias);
    expect(bonusDisponivel(rules)).toBe(true);
    expect(valorUnicoPorEstrela(rules)).toBe(5);
  });

  it("valorUnicoPorEstrela considera o valor dos extras", () => {
    expect(valorUnicoPorEstrela(comExtras({ valuePerStar: 5, profissionalIds: [ANDRESSA] }))).toBe(5);
    expect(valorUnicoPorEstrela(comExtras({ valuePerStar: 4, profissionalIds: [ANDRESSA] }))).toBeNull();
  });

  it("profissionaisSoDoBonus e fraseSoDoBonus nomeiam quem participa só do bônus", () => {
    const rules = comExtras({ valuePerStar: 5, profissionalIds: [KELLE, ANDRESSA, 999] });
    expect(profissionaisSoDoBonus(cadastro, rules).map((p) => p.nome_profissional)).toEqual([
      "Andressa",
      "Kelle",
    ]);
    expect(fraseSoDoBonus(cadastro, rules)).toBe(
      "Andressa e Kelle participam só do Bônus Estrelas (R$ 5,00 por estrela aprovada)"
    );
    expect(fraseSoDoBonus([prof(KELLE, "Kelle", null)], rules)).toBe(
      "Kelle participa só do Bônus Estrelas (R$ 5,00 por estrela aprovada)"
    );
  });
});

describe("valores em R$: centavos e teto", () => {
  it("arredonda em centavos no consumo (starBonusValue e valuePerStar)", () => {
    expect(arredondarCentavos(2.345)).toBe(2.35);
    expect(valorPorEstrelaValido(2.333)).toBe(2.33);
    expect(valorPorEstrelaDaCategoria(regras({ cabelo: { starBonusValue: 4.999 } }), "Cabelo")).toBe(5);
    const rules = { ...regras(), starBonusExtra: { valuePerStar: 5.004, profissionalIds: [9] } };
    expect(extrasDoBonus(rules)?.valorPorEstrela).toBe(5);
  });

  it("valor que arredonda para 0 conta como sem bônus", () => {
    expect(valorPorEstrelaValido(0.004)).toBe(0);
    expect(valorPorEstrelaDaCategoria(regras({ cabelo: { starBonusValue: 0.001 } }), "Cabelo")).toBe(0);
  });

  it(`teto de R$ ${TETO_VALOR_POR_ESTRELA}: acima disso é inválido e ignorado`, () => {
    expect(valorPorEstrelaValido(1000)).toBe(1000);
    expect(valorPorEstrelaValido(1000.01)).toBe(0);
    expect(valorPorEstrelaDaCategoria(regras({ cabelo: { starBonusValue: 1500 } }), "Cabelo")).toBe(0);
    const rules = { ...regras(), starBonusExtra: { valuePerStar: 1001, profissionalIds: [9] } };
    expect(extrasDoBonus(rules)).toBeNull();
  });

  it("calcularBonus usa o valor já arredondado", () => {
    const rules = regras({ cabelo: { starBonusValue: 3.333 } });
    const elegiveis = profissionaisElegiveis([prof(1, "Ana", "Cabelo")], rules);
    const r = calcularBonus(elegiveis, { "1": 3 });
    expect(r.porId.get("1")?.valor).toBe(9.99);
  });
});

describe("extrasBrutoInvalido (aviso do editor)", () => {
  it("coluna vazia não é inválida", () => {
    expect(extrasBrutoInvalido(null)).toBe(false);
    expect(extrasBrutoInvalido(undefined)).toBe(false);
  });

  it("forma canônica é válida", () => {
    expect(extrasBrutoInvalido({ valuePerStar: 5, profissionalIds: [648177, 783999] })).toBe(false);
    expect(extrasBrutoInvalido({ valuePerStar: 2.5, profissionalIds: [1] })).toBe(false);
  });

  it("parcial ou totalmente inválido é sinalizado", () => {
    const casos: unknown[] = [
      "texto",
      [1],
      { valuePerStar: 5, profissionalIds: ["648177"] },
      { valuePerStar: 5, profissionalIds: [648177, "x"] },
      { valuePerStar: 5, profissionalIds: [] },
      { valuePerStar: 5 },
      { valuePerStar: 5, profissionalIds: [1], extra: true },
      { valuePerStar: 5.005, profissionalIds: [1] },
      { valuePerStar: 1001, profissionalIds: [1] },
      { valuePerStar: 0, profissionalIds: [1] },
      { valuePerStar: "5", profissionalIds: [1] },
    ];
    for (const caso of casos) expect(extrasBrutoInvalido(caso)).toBe(true);
  });
});
