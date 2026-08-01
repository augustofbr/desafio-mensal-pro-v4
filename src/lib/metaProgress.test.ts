import { describe, it, expect } from "vitest";
import { resolveMetas, computeProjecao, contarDiasUteis } from "./metaProgress";
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

/**
 * Agosto/2026: 01/08 e sabado, 02/08 e domingo.
 * Dias uteis (seg-sab) = todos, menos os domingos 2, 9, 16, 23 e 30.
 */
const DIAS_UTEIS_AGOSTO_2026 = [
  1, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 22, 24, 25,
  26, 27, 28, 29, 31,
];

describe("resolveMetas", () => {
  it("(a) modelo points gera clientes e especiais com pct proporcional", () => {
    const rules = makeRules({
      scoringModel: "points",
      specialServiceLabel: "Cronograma Capilar",
      qualificationGoals: { minUniqueClients: 60, minSpecialServices: 10 },
    });

    const metas = resolveMetas({ uniqueClientDays: 42, specialServices: 3 }, rules);

    expect(metas).toHaveLength(2);

    expect(metas[0]).toEqual({
      chave: "clientes",
      rotulo: "Clientes únicos",
      atual: 42,
      alvo: 60,
      pct: 70,
      batida: false,
    });

    expect(metas[1]).toEqual({
      chave: "especiais",
      rotulo: "Cronograma Capilar",
      atual: 3,
      alvo: 10,
      pct: 30,
      batida: false,
    });
  });

  it("(b) meta batida trava o pct em 100 (clamp) e marca batida", () => {
    const rules = makeRules({
      scoringModel: "points",
      qualificationGoals: { minUniqueClients: 60 },
    });

    const metas = resolveMetas({ uniqueClientDays: 65 }, rules);

    expect(metas).toHaveLength(1);
    expect(metas[0].pct).toBe(100);
    expect(metas[0].batida).toBe(true);
    expect(metas[0].atual).toBe(65);
    expect(metas[0].alvo).toBe(60);
  });

  it("omite a meta de especiais quando o goal nao existe", () => {
    const rules = makeRules({
      scoringModel: "points",
      qualificationGoals: { minUniqueClients: 60 },
    });

    const metas = resolveMetas({ uniqueClientDays: 10, specialServices: 4 }, rules);

    expect(metas.map((m) => m.chave)).toEqual(["clientes"]);
  });

  it("(c) modelo revenue-percentage gera uma meta unica com alvo 100", () => {
    const rules = makeRules({
      scoringModel: "revenue-percentage",
      qualificationGoals: { minRevenue: 5000 },
    });

    const metas = resolveMetas({ revenuePercentage: 88.4 }, rules);

    expect(metas).toHaveLength(1);
    expect(metas[0]).toEqual({
      chave: "receita",
      rotulo: "Meta do mês",
      atual: 88.4,
      alvo: 100,
      pct: 88.4,
      batida: false,
    });
  });

  it("modelo revenue-points gera receita e, com minServices, atendimentos", () => {
    const rules = makeRules({
      scoringModel: "revenue-points",
      qualificationGoals: { minRevenue: 3500, minServices: 25 },
    });

    const metas = resolveMetas({ totalRevenue: 1750, totalServices: 25 }, rules);

    expect(metas).toHaveLength(2);
    expect(metas[0]).toMatchObject({
      chave: "receita",
      rotulo: "Meta do mês",
      atual: 1750,
      alvo: 3500,
      pct: 50,
      batida: false,
    });
    expect(metas[1]).toMatchObject({
      chave: "servicos",
      rotulo: "Atendimentos",
      atual: 25,
      alvo: 25,
      pct: 100,
      batida: true,
    });
  });

  it("trata campos ausentes do entry como zero", () => {
    const rules = makeRules({
      scoringModel: "points",
      qualificationGoals: { minUniqueClients: 60, minSpecialServices: 10 },
    });

    const metas = resolveMetas({}, rules);

    expect(metas).toHaveLength(2);
    expect(metas.every((m) => m.atual === 0 && m.pct === 0 && !m.batida)).toBe(true);
  });

  it("retorna lista vazia quando nao ha nenhuma meta configurada", () => {
    expect(resolveMetas({ uniqueClientDays: 42 }, makeRules())).toEqual([]);
  });
});

describe("contarDiasUteis", () => {
  it("(d) conta seg-sab e ignora domingo", () => {
    // 03/08/2026 = segunda ... 08/08 = sabado; 09/08 = domingo (fora).
    expect(contarDiasUteis("2026-08-03", "2026-08-09", [])).toBe(6);
  });

  it("(d) desconta feriados informados", () => {
    expect(contarDiasUteis("2026-08-03", "2026-08-09", ["2026-08-05"])).toBe(5);
  });

  it("conta o proprio dia quando inicio e fim sao iguais", () => {
    expect(contarDiasUteis("2026-08-03", "2026-08-03", [])).toBe(1);
    expect(contarDiasUteis("2026-08-02", "2026-08-02", [])).toBe(0);
  });

  it("retorna 0 quando o fim e anterior ao inicio", () => {
    expect(contarDiasUteis("2026-08-09", "2026-08-03", [])).toBe(0);
  });

  it("conta o mes de agosto/2026 inteiro sem os 5 domingos", () => {
    expect(contarDiasUteis("2026-08-01", "2026-08-31", [])).toBe(26);
  });
});

describe("computeProjecao", () => {
  it("(e) projeta a data prevista quando o ritmo alcanca a meta", () => {
    const projecao = computeProjecao({
      atual: 42,
      alvo: 60,
      diasUteisDecorridos: 10,
      diasUteisRestantes: 12,
      diaDoMesHoje: 12,
      diasUteisPorDiaDoMes: DIAS_UTEIS_AGOSTO_2026,
    });

    // ritmo 4.2/dia; faltam 18 -> ceil(18/4.2) = 5 dias uteis.
    // hoje (dia 12) e o 10o dia util; +5 dias uteis -> dia 18.
    expect(projecao.mostrar).toBe(true);
    expect(projecao.ritmoTexto).toContain("~dia");
    expect(projecao.ritmoTexto).toBe("No seu ritmo: meta ~dia 18");
  });

  it("(f) avisa quando o ritmo nao alcanca a meta", () => {
    const projecao = computeProjecao({
      atual: 10,
      alvo: 60,
      diasUteisDecorridos: 10,
      diasUteisRestantes: 5,
      diaDoMesHoje: 12,
      diasUteisPorDiaDoMes: DIAS_UTEIS_AGOSTO_2026,
    });

    expect(projecao.mostrar).toBe(true);
    expect(projecao.ritmoTexto).toContain("abaixo da meta");
    expect(projecao.ritmoTexto).toBe(
      "Ritmo abaixo da meta — faltam 50 em 5 dias úteis"
    );
  });

  it("(e2) nomeia a meta projetada quando recebe rotuloMeta", () => {
    const projecao = computeProjecao({
      atual: 42,
      alvo: 60,
      diasUteisDecorridos: 10,
      diasUteisRestantes: 12,
      diaDoMesHoje: 12,
      diasUteisPorDiaDoMes: DIAS_UTEIS_AGOSTO_2026,
      rotuloMeta: "Cronograma Capilar",
    });

    expect(projecao.ritmoTexto).toBe(
      "No seu ritmo, Cronograma Capilar: meta ~dia 18"
    );
  });

  it("(f2) nomeia a meta tambem quando o ritmo nao alcanca", () => {
    const projecao = computeProjecao({
      atual: 10,
      alvo: 60,
      diasUteisDecorridos: 10,
      diasUteisRestantes: 5,
      diaDoMesHoje: 12,
      diasUteisPorDiaDoMes: DIAS_UTEIS_AGOSTO_2026,
      rotuloMeta: "Clientes únicos",
    });

    expect(projecao.ritmoTexto).toBe(
      "Ritmo abaixo da meta em Clientes únicos — faltam 50 em 5 dias úteis"
    );
  });

  it("(e3) rotuloMeta vazio nao muda o texto generico", () => {
    const projecao = computeProjecao({
      atual: 42,
      alvo: 60,
      diasUteisDecorridos: 10,
      diasUteisRestantes: 12,
      diaDoMesHoje: 12,
      diasUteisPorDiaDoMes: DIAS_UTEIS_AGOSTO_2026,
      rotuloMeta: "   ",
    });

    expect(projecao.ritmoTexto).toBe("No seu ritmo: meta ~dia 18");
  });

  it("(g) nao mostra projecao quando o periodo nao contem hoje", () => {
    const projecao = computeProjecao({
      atual: 42,
      alvo: 60,
      diasUteisDecorridos: 10,
      diasUteisRestantes: 12,
      diaDoMesHoje: null,
      diasUteisPorDiaDoMes: DIAS_UTEIS_AGOSTO_2026,
    });

    expect(projecao.mostrar).toBe(false);
    expect(projecao.ritmoTexto).toBeNull();
  });

  it("(h) nao mostra projecao com menos de 3 dias uteis decorridos", () => {
    const projecao = computeProjecao({
      atual: 8,
      alvo: 60,
      diasUteisDecorridos: 2,
      diasUteisRestantes: 24,
      diaDoMesHoje: 3,
      diasUteisPorDiaDoMes: DIAS_UTEIS_AGOSTO_2026,
    });

    expect(projecao.mostrar).toBe(false);
    expect(projecao.ritmoTexto).toBeNull();
  });

  it("(i) nao mostra projecao quando a meta ja foi batida", () => {
    const projecao = computeProjecao({
      atual: 65,
      alvo: 60,
      diasUteisDecorridos: 10,
      diasUteisRestantes: 12,
      diaDoMesHoje: 12,
      diasUteisPorDiaDoMes: DIAS_UTEIS_AGOSTO_2026,
    });

    expect(projecao.mostrar).toBe(false);
    expect(projecao.ritmoTexto).toBeNull();
  });

  it("mostra ritmo insuficiente quando o profissional ainda esta zerado", () => {
    const projecao = computeProjecao({
      atual: 0,
      alvo: 60,
      diasUteisDecorridos: 5,
      diasUteisRestantes: 20,
      diaDoMesHoje: 7,
      diasUteisPorDiaDoMes: DIAS_UTEIS_AGOSTO_2026,
    });

    expect(projecao.mostrar).toBe(true);
    expect(projecao.ritmoTexto).toBe(
      "Ritmo abaixo da meta — faltam 60 em 20 dias úteis"
    );
  });

  it("ancora no ultimo dia util quando hoje nao e dia util", () => {
    // Domingo 09/08 nao esta em diasUteisPorDiaDoMes: ancora no sabado 08 (indice 6).
    const projecao = computeProjecao({
      atual: 21,
      alvo: 60,
      diasUteisDecorridos: 7,
      diasUteisRestantes: 19,
      diaDoMesHoje: 9,
      diasUteisPorDiaDoMes: DIAS_UTEIS_AGOSTO_2026,
    });

    // ritmo 3/dia; faltam 39 -> 13 dias uteis; indice 6 + 13 = 19 -> dia 24.
    expect(projecao.mostrar).toBe(true);
    expect(projecao.ritmoTexto).toBe("No seu ritmo: meta ~dia 24");
  });

  it("nao mostra projecao quando o alvo e invalido", () => {
    const projecao = computeProjecao({
      atual: 5,
      alvo: 0,
      diasUteisDecorridos: 10,
      diasUteisRestantes: 12,
      diaDoMesHoje: 12,
      diasUteisPorDiaDoMes: DIAS_UTEIS_AGOSTO_2026,
    });

    expect(projecao.mostrar).toBe(false);
    expect(projecao.ritmoTexto).toBeNull();
  });
});
