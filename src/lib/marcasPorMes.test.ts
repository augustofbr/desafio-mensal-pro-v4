import { describe, it, expect } from "vitest";
import {
  estadoMarcas,
  impactoNovaVersao,
  isVersaoPassada,
  mesAnterior,
  mesesFechadosDaVersao,
  planejarSincronizacao,
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

describe("meses fechados e versao passada", () => {
  it("mesAnterior vira o ano em janeiro", () => {
    expect(mesAnterior("2026-01")).toBe("2025-12");
    expect(mesAnterior("2026-10")).toBe("2026-09");
  });

  it("versao base vigente cobre meses fechados ate o mes anterior", () => {
    expect(mesesFechadosDaVersao(["2000-01"], "2000-01", "2026-10")).toEqual({ de: "2000-01", ate: "2026-09" });
  });

  it("versao que comeca no mes corrente ou no futuro nao cobre mes fechado", () => {
    expect(mesesFechadosDaVersao(["2000-01", "2026-10"], "2026-10", "2026-10")).toBeNull();
    expect(mesesFechadosDaVersao(["2000-01", "2026-11"], "2026-11", "2026-10")).toBeNull();
  });

  it("versao passada termina antes do mes anterior", () => {
    const v = ["2000-01", "2026-04", "2026-10"];
    expect(mesesFechadosDaVersao(v, "2026-04", "2026-11")).toEqual({ de: "2026-04", ate: "2026-09" });
    expect(isVersaoPassada(v, "2026-04", "2026-11")).toBe(true);
    expect(isVersaoPassada(v, "2026-10", "2026-11")).toBe(false);
    expect(isVersaoPassada(["2026-12"], "2026-12", "2026-10")).toBe(false);
  });
});

describe("impactoNovaVersao", () => {
  it("origem igual a vigente no destino: ranking nao muda na criacao", () => {
    const r = impactoNovaVersao(["2000-01"], "2000-01", "2026-10", "2026-10");
    expect(r.mudaRankingNaCriacao).toBe(false);
    expect(r.meses).toEqual({ de: "2026-10", ate: null });
    expect(r.mesesFechados).toBeNull();
  });

  it("origem diferente da vigente no destino: muda na criacao, nomeando os meses", () => {
    // Copiar a versao de out/2026 para abr/2026: abr-set passam a usar o conjunto de outubro.
    const r = impactoNovaVersao(["2000-01", "2026-10"], "2026-10", "2026-04", "2026-10");
    expect(r.vigenteNoDestino).toBe("2000-01");
    expect(r.mudaRankingNaCriacao).toBe(true);
    expect(r.meses).toEqual({ de: "2026-04", ate: "2026-09" });
    expect(r.mesesFechados).toEqual({ de: "2026-04", ate: "2026-09" });
  });

  it("destino sem versao anterior: muda (de 'nenhuma marca' para a origem)", () => {
    const r = impactoNovaVersao(["2026-10"], "2026-10", "2026-05", "2026-10");
    expect(r.vigenteNoDestino).toBeNull();
    expect(r.mudaRankingNaCriacao).toBe(true);
  });
});

describe("planejarSincronizacao", () => {
  const linhas = [
    { id: 1, profissional_id: 10, nome_profissional: "Ana" },
    { id: 2, profissional_id: 20, nome_profissional: "Bia" },
  ];

  it("lista de Cabelo vazia nao faz nada", () => {
    const p = planejarSincronizacao(linhas, new Map(), false);
    expect(p).toEqual({ renomear: [], remover: [], bloqueadas: [], bloqueio: "lista-vazia" });
  });

  it("renomeia e remove na versao vigente", () => {
    const p = planejarSincronizacao(linhas, new Map([[10, "Ana Paula"]]), false);
    expect(p.renomear).toEqual([{ id: 1, nome: "Ana Paula" }]);
    expect(p.remover).toEqual([2]);
    expect(p.bloqueio).toBeNull();
  });

  it("versao passada so renomeia", () => {
    const p = planejarSincronizacao(linhas, new Map([[10, "Ana Paula"]]), true);
    expect(p.renomear).toEqual([{ id: 1, nome: "Ana Paula" }]);
    expect(p.remover).toEqual([]);
    expect(p.bloqueadas).toEqual([2]);
    expect(p.bloqueio).toBe("versao-passada");
  });

  it("bloqueia remocao que esvaziaria a versao", () => {
    const p = planejarSincronizacao(linhas, new Map([[99, "Outra"]]), false);
    expect(p.remover).toEqual([]);
    expect(p.bloqueadas).toEqual([1, 2]);
    expect(p.bloqueio).toBe("esvaziaria");
  });
});

describe("estadoMarcas", () => {
  it("erro com a regra ligada bloqueia o ranking; com a regra desligada, irrelevante", () => {
    expect(estadoMarcas(true, false, true)).toBe("erro");
    expect(estadoMarcas(true, true, false)).toBe("carregando");
    expect(estadoMarcas(true, false, false)).toBe("ok");
    expect(estadoMarcas(false, false, true)).toBe("desligado");
  });
});
