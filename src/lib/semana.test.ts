import { describe, it, expect } from "vitest";
import { valorPorDia, montarSemana, referenciaDaSemana } from "./semana";

/** Range do mes corrente de agosto/2026 (1o = sabado). */
const AGOSTO = { startDate: "2026-08-01", endDate: "2026-08-31" };

describe("valorPorDia", () => {
  it("(a) modelo points soma os pontos de cada dia", () => {
    const services = [
      { date: "2026-08-03", points: 2, name: "Cliente: Ana" },
      { date: "2026-08-03", points: 5, name: "Cronograma Capilar [pacote]" },
      { date: "2026-08-04", points: 2, name: "Cliente: Bia" },
      { date: "2026-08-04", points: 2, name: "Cliente: Cris" },
    ];

    expect(valorPorDia(services, "points")).toEqual({
      "2026-08-03": 7,
      "2026-08-04": 4,
    });
  });

  it("(b) modelo points ignora a entrada de estrelas (date vazia)", () => {
    const services = [
      { date: "2026-08-03", points: 2 },
      { date: "", points: 3 }, // estrelas Google: sem dia, nunca entram na semana
    ];

    const valores = valorPorDia(services, "points");

    expect(valores).toEqual({ "2026-08-03": 2 });
    expect(valores[""]).toBeUndefined();
  });

  it("(c) modelo revenue-percentage converte o faturamento do dia em % da meta", () => {
    const services = [
      { date: "2026-08-03", points: 1, value: 500 },
      { date: "2026-08-03", points: 1, value: 250 },
      { date: "2026-08-04", points: 1, value: 100 },
      { date: "2026-08-04", points: 1, value: 25 },
    ];

    // meta 5000: 750 -> 15%; 125 -> 2.5%
    expect(valorPorDia(services, "revenue-percentage", 5000)).toEqual({
      "2026-08-03": 15,
      "2026-08-04": 2.5,
    });
  });

  it("(d) revenue-percentage sem meta configurada nao inventa percentual", () => {
    const services = [{ date: "2026-08-03", points: 1, value: 500 }];

    expect(valorPorDia(services, "revenue-percentage")).toEqual({});
    expect(valorPorDia(services, "revenue-percentage", 0)).toEqual({});
  });

  it("(e) modelo revenue-points converte pelo delta do acumulado, nao dia a dia", () => {
    const services = [
      { date: "2026-08-03", points: 0, value: 180 },
      { date: "2026-08-03", points: 0, value: 120 }, // dia = 300
      { date: "2026-08-04", points: 0, value: 90 },
      { date: "2026-08-04", points: 0, value: 60 }, // dia = 150
    ];

    // Isolado o 2o dia daria floor(150/100) = 1 e o troco de 50 do 1o dia
    // sumiria; pelo acumulado (450) ele vale 1... e o total fecha em 4 = floor(450/100).
    expect(valorPorDia(services, "revenue-points", undefined, 100)).toEqual({
      "2026-08-03": 3,
      "2026-08-04": 1,
    });
  });

  it("(f) revenue-points sem conversao configurada nao inventa pontos", () => {
    const services = [{ date: "2026-08-03", points: 0, value: 500 }];

    expect(valorPorDia(services, "revenue-points")).toEqual({});
    expect(valorPorDia(services, "revenue-points", undefined, 0)).toEqual({});
  });

  it("(g) servicos sem dia ou sem valor numerico ficam de fora", () => {
    const services = [
      { date: "", points: 0, value: 500 },
      { date: "2026-08-03", points: 0 },
      { date: "2026-08-03", points: 0, value: 200 },
    ];

    expect(valorPorDia(services, "revenue-points", undefined, 100)).toEqual({
      "2026-08-03": 2,
    });
    expect(valorPorDia([], "points")).toEqual({});
  });
});

/**
 * Faturamento diario REAL da Debora em Estetica/maio-2026 (conversao 100), o mes
 * que o review mediu: o cartao mostra 59 pts e a conversao dia a dia somava 52,
 * com 4 dias trabalhados exibidos como "0".
 */
const DEBORA_MAIO_2026: Record<string, number> = {
  "2026-05-01": 340,
  "2026-05-02": 390,
  "2026-05-04": 100,
  "2026-05-07": 190,
  "2026-05-08": 635,
  "2026-05-09": 560,
  "2026-05-12": 50,
  "2026-05-13": 360,
  "2026-05-14": 120,
  "2026-05-15": 525,
  "2026-05-16": 525,
  "2026-05-18": 25,
  "2026-05-19": 110,
  "2026-05-22": 410,
  "2026-05-23": 620,
  "2026-05-26": 99.99,
  "2026-05-27": 200,
  "2026-05-28": 215,
  "2026-05-29": 50,
  "2026-05-30": 460,
};

const SERVICOS_DEBORA_MAIO = Object.entries(DEBORA_MAIO_2026).flatMap(([date, valor]) =>
  // Dois servicos no mesmo dia em um deles, para exercitar a soma intradia.
  date === "2026-05-27"
    ? [
        { date, points: 1, value: 120 },
        { date, points: 1, value: 80 },
      ]
    : [{ date, points: 1, value: valor }]
);

const CONVERSAO = 100;

describe("valorPorDia — revenue-points com dados reais (Estetica, maio/2026)", () => {
  const valores = valorPorDia(SERVICOS_DEBORA_MAIO, "revenue-points", undefined, CONVERSAO);
  const receitaTotal = Object.values(DEBORA_MAIO_2026).reduce((a, b) => a + b, 0);

  it("(a) o mes inteiro soma exatamente os pontos de faturamento do cartao", () => {
    const somaDosBlocos = Object.values(valores).reduce((a, b) => a + b, 0);

    // O cartao/ranking usa floor(faturamento do mes / conversao).
    expect(somaDosBlocos).toBe(Math.floor(receitaTotal / CONVERSAO));
    expect(somaDosBlocos).toBe(59); // era 52 com o floor dia a dia
  });

  it("(b) dias trabalhados abaixo da conversao deixam de valer 0", () => {
    // 26/05 (R$ 99,99) e 29/05 (R$ 50,00): floor(dia/100) = 0 nos dois.
    expect(valores["2026-05-26"]).toBe(1);
    expect(valores["2026-05-29"]).toBe(1);
    expect(valores["2026-05-18"]).toBe(1); // R$ 25,00
  });

  it("(c) a soma de uma semana e o delta dos acumulados nas bordas", () => {
    const acumuladoAte = (limite: string) =>
      Object.entries(DEBORA_MAIO_2026)
        .filter(([dia]) => dia <= limite)
        .reduce((total, [, valor]) => total + valor, 0);

    // Semana de seg 25/05 a sab 30/05.
    const semana = montarSemana(new Date(2026, 4, 27), valores, {
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    const somaDaSemana = semana.reduce((total, dia) => total + (dia.valor ?? 0), 0);

    const delta =
      Math.floor(acumuladoAte("2026-05-30") / CONVERSAO) -
      Math.floor(acumuladoAte("2026-05-23") / CONVERSAO);

    expect(somaDaSemana).toBe(delta);
    expect(somaDaSemana).toBe(10);
  });

  it("(d) nenhum dia fica negativo e a serie acompanha o acumulado", () => {
    expect(Object.values(valores).every((valor) => valor >= 0)).toBe(true);

    let acumulado = 0;
    let somaParcial = 0;
    for (const [dia, receita] of Object.entries(DEBORA_MAIO_2026)) {
      acumulado += receita;
      somaParcial += valores[dia];
      expect(somaParcial).toBe(Math.floor(Math.round(acumulado * 100) / 100 / CONVERSAO));
    }
  });
});

describe("montarSemana", () => {
  it("(a) monta segunda a sabado da semana da referencia", () => {
    const valores = { "2026-08-03": 7, "2026-08-05": 4 };
    const semana = montarSemana(new Date(2026, 7, 5), valores, AGOSTO);

    expect(semana).toHaveLength(6);
    expect(semana.map((dia) => dia.data)).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
    ]);
    expect(semana.map((dia) => dia.diaDoMes)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(semana.map((dia) => dia.diaLabel)).toEqual(["S", "T", "Q", "Q", "S", "S"]);
    // Dia dentro do periodo e sem atendimento vale 0 (nao null).
    expect(semana.map((dia) => dia.valor)).toEqual([7, 0, 4, 0, 0, 0]);
  });

  it("(b) semana que cruza a virada do mes: dias fora do range ficam null", () => {
    // Caso REAL de hoje: sabado 01/08/2026 e o 1o dia do mes corrente.
    // A semana comeca na segunda 27/07, que esta fora do range filtrado.
    const semana = montarSemana(new Date(2026, 7, 1), { "2026-08-01": 9 }, AGOSTO);

    expect(semana.map((dia) => dia.data)).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
    ]);
    expect(semana.map((dia) => dia.valor)).toEqual([null, null, null, null, null, 9]);
    expect(semana.map((dia) => dia.diaDoMes)).toEqual([27, 28, 29, 30, 31, 1]);
  });

  it("(c) domingo pertence a semana que acabou de terminar", () => {
    const semana = montarSemana(new Date(2026, 7, 2), {}, AGOSTO);

    expect(semana[0].data).toBe("2026-07-27");
    expect(semana[5].data).toBe("2026-08-01");
  });

  it("(d) valores de fora da semana nao vazam para os blocos", () => {
    const valores = { "2026-08-03": 7, "2026-08-12": 99 };
    const semana = montarSemana(new Date(2026, 7, 3), valores, AGOSTO);

    expect(semana.map((dia) => dia.valor)).toEqual([7, 0, 0, 0, 0, 0]);
  });

  it("(e) range vazio deixa a semana inteira fora do periodo", () => {
    const semana = montarSemana(new Date(2026, 7, 5), { "2026-08-05": 4 }, {
      startDate: "",
      endDate: "",
    });

    expect(semana.every((dia) => dia.valor === null)).toBe(true);
  });
});

describe("referenciaDaSemana", () => {
  it("(a) periodo que contem hoje ancora no proprio hoje", () => {
    const hoje = new Date(2026, 7, 1);
    expect(referenciaDaSemana(hoje, AGOSTO)).toEqual(hoje);
  });

  it("(b) periodo encerrado ancora no ultimo dia do periodo", () => {
    const hoje = new Date(2026, 7, 1);
    const julho = { startDate: "2026-07-01", endDate: "2026-07-31" };

    expect(referenciaDaSemana(hoje, julho)).toEqual(new Date(2026, 6, 31));
  });

  it("(c) periodo futuro ancora no primeiro dia do periodo", () => {
    const hoje = new Date(2026, 7, 1);
    const setembro = { startDate: "2026-09-01", endDate: "2026-09-30" };

    expect(referenciaDaSemana(hoje, setembro)).toEqual(new Date(2026, 8, 1));
  });

  it("(d) range vazio nao tem semana de referencia", () => {
    expect(referenciaDaSemana(new Date(2026, 7, 1), { startDate: "", endDate: "" })).toBeNull();
  });
});
