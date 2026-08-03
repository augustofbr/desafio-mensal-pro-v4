import { describe, it, expect } from "vitest";
import { diaEmManaus, formatarDiaBR, resolverPeriodo } from "./periodoHistorico";

/** Segunda-feira, 15:00 em Manaus (19:00 UTC). */
const SEGUNDA = new Date("2026-08-03T19:00:00Z");

describe("diaEmManaus", () => {
  it("le o instante no fuso do salao, nao no da maquina", () => {
    expect(diaEmManaus(new Date("2026-08-03T19:00:00Z"))).toBe("2026-08-03");
  });

  it("02:00 UTC ainda e o dia anterior em Manaus (UTC-4)", () => {
    expect(diaEmManaus(new Date("2026-08-04T02:00:00Z"))).toBe("2026-08-03");
  });

  it("04:00 UTC ja e o dia seguinte em Manaus", () => {
    expect(diaEmManaus(new Date("2026-08-04T04:00:00Z"))).toBe("2026-08-04");
  });
});

describe("resolverPeriodo — mes atual", () => {
  it("vai do dia 1 ao ultimo dia do mes", () => {
    const p = resolverPeriodo("mes_atual", SEGUNDA);
    expect([p.de, p.ate]).toEqual(["2026-08-01", "2026-08-31"]);
  });

  it("converte o limite inferior para a meia-noite de Manaus em UTC", () => {
    expect(resolverPeriodo("mes_atual", SEGUNDA).inicioISO).toBe(
      "2026-08-01T04:00:00.000Z",
    );
  });

  it("o limite superior e EXCLUSIVO: meia-noite do 1o dia do mes seguinte", () => {
    expect(resolverPeriodo("mes_atual", SEGUNDA).fimISO).toBe(
      "2026-09-01T04:00:00.000Z",
    );
  });

  it("respeita mes de 30 dias", () => {
    const p = resolverPeriodo("mes_atual", new Date("2026-09-10T15:00:00Z"));
    expect([p.de, p.ate]).toEqual(["2026-09-01", "2026-09-30"]);
  });

  it("respeita fevereiro de 28 e de 29 dias", () => {
    expect(resolverPeriodo("mes_atual", new Date("2026-02-10T15:00:00Z")).ate).toBe(
      "2026-02-28",
    );
    expect(resolverPeriodo("mes_atual", new Date("2028-02-10T15:00:00Z")).ate).toBe(
      "2028-02-29",
    );
  });
});

describe("resolverPeriodo — mes anterior", () => {
  it("cobre o mes cheio anterior", () => {
    const p = resolverPeriodo("mes_anterior", SEGUNDA);
    expect([p.de, p.ate]).toEqual(["2026-07-01", "2026-07-31"]);
  });

  it("em janeiro, volta para dezembro do ano anterior", () => {
    const p = resolverPeriodo("mes_anterior", new Date("2026-01-15T15:00:00Z"));
    expect([p.de, p.ate]).toEqual(["2025-12-01", "2025-12-31"]);
  });

  it("em marco, nao escorrega para fevereiro curto (o bug do dia 31)", () => {
    const p = resolverPeriodo("mes_anterior", new Date("2026-03-31T15:00:00Z"));
    expect([p.de, p.ate]).toEqual(["2026-02-01", "2026-02-28"]);
  });

  it("termina exatamente onde o mes atual comeca", () => {
    expect(resolverPeriodo("mes_anterior", SEGUNDA).fimISO).toBe(
      resolverPeriodo("mes_atual", SEGUNDA).inicioISO,
    );
  });
});

describe("resolverPeriodo — hoje e ontem", () => {
  it("hoje cobre um unico dia", () => {
    const p = resolverPeriodo("hoje", SEGUNDA);
    expect([p.de, p.ate]).toEqual(["2026-08-03", "2026-08-03"]);
    expect(p.fimISO).toBe("2026-08-04T04:00:00.000Z");
  });

  it("hoje usa o dia de Manaus, nao o UTC (23h local = dia seguinte em UTC)", () => {
    const p = resolverPeriodo("hoje", new Date("2026-08-04T02:00:00Z"));
    expect(p.de).toBe("2026-08-03");
  });

  it("ontem atravessa a virada de mes", () => {
    const p = resolverPeriodo("ontem", new Date("2026-08-01T15:00:00Z"));
    expect([p.de, p.ate]).toEqual(["2026-07-31", "2026-07-31"]);
  });

  it("ontem atravessa a virada de ano", () => {
    const p = resolverPeriodo("ontem", new Date("2026-01-01T15:00:00Z"));
    expect([p.de, p.ate]).toEqual(["2025-12-31", "2025-12-31"]);
  });
});

describe("resolverPeriodo — semana passada", () => {
  it("numa segunda, cobre a segunda-domingo imediatamente anteriores", () => {
    const p = resolverPeriodo("semana_passada", SEGUNDA);
    expect([p.de, p.ate]).toEqual(["2026-07-27", "2026-08-02"]);
  });

  it("no domingo, ainda e a semana anterior a que comecou na segunda passada", () => {
    // 2026-08-02 e domingo: pertence a semana iniciada em 27/07.
    const p = resolverPeriodo("semana_passada", new Date("2026-08-02T15:00:00Z"));
    expect([p.de, p.ate]).toEqual(["2026-07-20", "2026-07-26"]);
  });

  it("sempre cobre 7 dias, comecando numa segunda e terminando num domingo", () => {
    for (const dia of ["04", "05", "06", "07", "08", "09", "10"]) {
      const p = resolverPeriodo("semana_passada", new Date(`2026-08-${dia}T15:00:00Z`));
      expect(new Date(`${p.de}T00:00:00Z`).getUTCDay()).toBe(1); // segunda
      expect(new Date(`${p.ate}T00:00:00Z`).getUTCDay()).toBe(0); // domingo
      const dias =
        (new Date(p.fimISO).getTime() - new Date(p.inicioISO).getTime()) / 86_400_000;
      expect(dias).toBe(7);
    }
  });
});

describe("resolverPeriodo — personalizado", () => {
  it("usa as duas datas informadas, com o fim inclusivo no dia digitado", () => {
    const p = resolverPeriodo("personalizado", SEGUNDA, {
      de: "2026-06-10",
      ate: "2026-06-12",
    });
    expect([p.de, p.ate]).toEqual(["2026-06-10", "2026-06-12"]);
    expect(p.fimISO).toBe("2026-06-13T04:00:00.000Z");
  });

  it("desinverte intervalo digitado de tras para frente", () => {
    const p = resolverPeriodo("personalizado", SEGUNDA, {
      de: "2026-06-12",
      ate: "2026-06-10",
    });
    expect([p.de, p.ate]).toEqual(["2026-06-10", "2026-06-12"]);
  });

  it("data ausente nao quebra a busca: cai no mes corrente", () => {
    const p = resolverPeriodo("personalizado", SEGUNDA, { de: "", ate: "" });
    expect([p.de, p.ate]).toEqual(["2026-08-01", "2026-08-03"]);
  });

  it("so o inicio digitado mantem o fim em hoje", () => {
    const p = resolverPeriodo("personalizado", SEGUNDA, { de: "2026-05-02" });
    expect([p.de, p.ate]).toEqual(["2026-05-02", "2026-08-03"]);
  });

  it("data mal formada e tratada como ausente", () => {
    const p = resolverPeriodo("personalizado", SEGUNDA, { de: "02/05/2026" });
    expect(p.de).toBe("2026-08-01");
  });
});

describe("rotulo", () => {
  it("mostra o intervalo em pt-BR", () => {
    expect(resolverPeriodo("mes_atual", SEGUNDA).rotulo).toBe(
      "01/08/2026 a 31/08/2026",
    );
  });

  it("periodo de um dia so mostra a data", () => {
    expect(resolverPeriodo("hoje", SEGUNDA).rotulo).toBe("03/08/2026");
  });

  it("formatarDiaBR converte ISO em data brasileira", () => {
    expect(formatarDiaBR("2026-12-25")).toBe("25/12/2026");
  });
});
