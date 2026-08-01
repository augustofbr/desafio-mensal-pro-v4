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

  it("(e) modelo revenue-points soma o faturamento do dia (conversao fica no componente)", () => {
    const services = [
      { date: "2026-08-03", points: 0, value: 180 },
      { date: "2026-08-03", points: 0, value: 120 },
      { date: "2026-08-04", points: 0, value: 90 },
      { date: "2026-08-04", points: 0, value: 60 },
    ];

    expect(valorPorDia(services, "revenue-points")).toEqual({
      "2026-08-03": 300,
      "2026-08-04": 150,
    });
  });

  it("(f) servicos sem dia ou sem valor numerico ficam de fora", () => {
    const services = [
      { date: "", points: 0, value: 500 },
      { date: "2026-08-03", points: 0 },
      { date: "2026-08-03", points: 0, value: 200 },
    ];

    expect(valorPorDia(services, "revenue-points")).toEqual({ "2026-08-03": 200 });
    expect(valorPorDia([], "points")).toEqual({});
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
