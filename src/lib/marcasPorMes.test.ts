import { describe, it, expect } from "vitest";
import {
  isMesValido,
  linhasDoMes,
  listarVersoes,
  mesDaData,
  ultimoMesDaVersao,
  versaoVigente,
} from "./marcasPorMes";

interface Linha {
  profissional_id: number;
  fabricante: string;
  valid_from: string;
}

const l = (profissional_id: number, fabricante: string, valid_from: string): Linha => ({
  profissional_id,
  fabricante,
  valid_from,
});

describe("linhasDoMes", () => {
  it("sem versao anterior ao mes devolve vazio", () => {
    const linhas = [l(1, "Wella", "2026-10"), l(2, "Keune", "2026-10")];
    expect(linhasDoMes(linhas, "2026-09")).toEqual([]);
  });

  it("tabela vazia devolve vazio", () => {
    expect(linhasDoMes([], "2026-10")).toEqual([]);
  });

  it("escolhe a maior versao <= mes", () => {
    const linhas = [
      l(1, "Wella", "2000-01"),
      l(1, "Keune", "2026-04"),
      l(1, "Truss", "2026-10"),
    ];
    expect(linhasDoMes(linhas, "2026-05")).toEqual([l(1, "Keune", "2026-04")]);
    expect(linhasDoMes(linhas, "2026-04")).toEqual([l(1, "Keune", "2026-04")]);
    expect(linhasDoMes(linhas, "2026-03")).toEqual([l(1, "Wella", "2000-01")]);
  });

  it("ignora versao futura", () => {
    const linhas = [l(1, "Wella", "2000-01"), l(1, "Truss", "2026-11")];
    expect(linhasDoMes(linhas, "2026-10")).toEqual([l(1, "Wella", "2000-01")]);
  });

  it("devolve o conjunto inteiro da versao, sem merge com versoes anteriores", () => {
    const linhas = [
      l(1, "Wella", "2000-01"),
      l(2, "Keune", "2000-01"),
      l(3, "Davines", "2000-01"),
      // Versao nova so com a profissional 1: a 2 e a 3 perdem a autorizacao.
      l(1, "Truss", "2026-10"),
    ];
    expect(linhasDoMes(linhas, "2026-10")).toEqual([l(1, "Truss", "2026-10")]);
  });

  it("com so a versao '2000-01', qualquer mes resolve para ela", () => {
    const linhas = [l(1, "Wella", "2000-01"), l(2, "Keune", "2000-01")];
    for (const mes of ["2026-03", "2026-04", "2026-05", "2026-10", "2031-12"]) {
      expect(linhasDoMes(linhas, mes)).toEqual(linhas);
    }
  });

  it("mes invalido ou vazio nao autoriza nada", () => {
    const linhas = [l(1, "Wella", "2000-01")];
    expect(linhasDoMes(linhas, "")).toEqual([]);
    expect(linhasDoMes(linhas, "2026-13")).toEqual([]);
  });
});

describe("utilitarios de versao", () => {
  it("listarVersoes devolve distintos do mais recente ao mais antigo", () => {
    const linhas = [l(1, "A", "2000-01"), l(2, "B", "2026-10"), l(3, "C", "2000-01")];
    expect(listarVersoes(linhas)).toEqual(["2026-10", "2000-01"]);
  });

  it("versaoVigente devolve null sem versao <= mes", () => {
    expect(versaoVigente(["2026-10"], "2026-09")).toBeNull();
    expect(versaoVigente(["2000-01", "2026-10"], "2026-10")).toBe("2026-10");
  });

  it("mesDaData corta 'YYYY-MM-DD' para 'YYYY-MM'", () => {
    expect(mesDaData("2026-04-01")).toBe("2026-04");
  });

  it("isMesValido segue o CHECK do banco", () => {
    expect(isMesValido("2026-01")).toBe(true);
    expect(isMesValido("2026-12")).toBe(true);
    expect(isMesValido("2026-00")).toBe(false);
    expect(isMesValido("2026-13")).toBe(false);
    expect(isMesValido("2026-1")).toBe(false);
    expect(isMesValido("26-01")).toBe(false);
  });

  it("ultimoMesDaVersao aponta o mes anterior a proxima versao", () => {
    const versoes = ["2026-10", "2026-01", "2000-01"];
    expect(ultimoMesDaVersao(versoes, "2000-01")).toBe("2025-12");
    expect(ultimoMesDaVersao(versoes, "2026-01")).toBe("2026-09");
    expect(ultimoMesDaVersao(versoes, "2026-10")).toBeNull();
  });
});
