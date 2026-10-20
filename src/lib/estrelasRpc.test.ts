import { describe, it, expect } from "vitest";
import {
  AVISO_ESTRELAS_GENERICO,
  AVISO_ESTRELAS_PERIODO_LONGO,
  ERRO_PERIODO_LONGO,
  LIMITE_LINHAS_RPC,
  PeriodoLongoError,
  avisoDoErroEstrelas,
  tipoDoErroEstrelas,
  aprovadasDoPeriodo,
  linhasDaRpcEstrelas,
  pendentesPorProfissional,
  type LinhaEstrelaPeriodo,
} from "./estrelasRpc";

const linha = (p: Partial<LinhaEstrelaPeriodo>): LinhaEstrelaPeriodo => ({
  profissional_id: 1,
  status: "aprovada",
  data_hora_cadastro: "2026-10-05T14:00:00Z",
  data_aprovacao: "2026-10-06T10:00:00Z",
  ...p,
});

describe("aprovadasDoPeriodo", () => {
  it("mantém só aprovada com data_aprovacao", () => {
    const r = aprovadasDoPeriodo([
      linha({ profissional_id: 1 }),
      linha({ profissional_id: 2, data_aprovacao: null }),
      linha({ profissional_id: 3, status: "pendente", data_aprovacao: null }),
      linha({ profissional_id: 4, status: "rejeitada", data_aprovacao: null }),
      linha({ profissional_id: 5, status: "rejeitada" }),
    ]);
    expect(r).toEqual([
      { profissional_id: 1, data_hora_cadastro: "2026-10-05T14:00:00Z" },
    ]);
  });

  it("lista vazia dá lista vazia", () => {
    expect(aprovadasDoPeriodo([])).toEqual([]);
  });
});

describe("pendentesPorProfissional", () => {
  it("conta só pendentes, por id em string", () => {
    const r = pendentesPorProfissional([
      linha({ profissional_id: 7, status: "pendente", data_aprovacao: null }),
      linha({ profissional_id: 7, status: "pendente", data_aprovacao: null }),
      linha({ profissional_id: 8, status: "pendente", data_aprovacao: null }),
      linha({ profissional_id: 8 }),
    ]);
    expect(r).toEqual({ "7": 2, "8": 1 });
  });
});

describe("linhasDaRpcEstrelas", () => {
  it("null vira lista vazia", () => {
    expect(linhasDaRpcEstrelas(null)).toEqual([]);
  });
  it("lista passa", () => {
    const l = [linha({})];
    expect(linhasDaRpcEstrelas(l)).toBe(l);
  });
  it("formato inesperado lança, nunca vira zero", () => {
    expect(() => linhasDaRpcEstrelas({ erro: true })).toThrow();
    expect(() => linhasDaRpcEstrelas("x")).toThrow();
  });
  it("999 linhas passam; 1000 ou mais é possível truncamento e lança", () => {
    const n = (k: number) => Array.from({ length: k }, () => linha({}));
    expect(linhasDaRpcEstrelas(n(LIMITE_LINHAS_RPC - 1))).toHaveLength(LIMITE_LINHAS_RPC - 1);
    expect(() => linhasDaRpcEstrelas(n(LIMITE_LINHAS_RPC))).toThrow(PeriodoLongoError);
    expect(() => linhasDaRpcEstrelas(n(LIMITE_LINHAS_RPC + 5))).toThrow(ERRO_PERIODO_LONGO);
  });
  it("linha fora do formato lança", () => {
    const ruim = (o: unknown) => () => linhasDaRpcEstrelas([linha({}), o]);
    expect(ruim(null)).toThrow();
    expect(ruim("x")).toThrow();
    expect(ruim({ ...linha({}), status: 1 })).toThrow();
    expect(ruim({ ...linha({}), status: undefined })).toThrow();
    expect(ruim({ ...linha({}), profissional_id: null })).toThrow();
    expect(ruim({ ...linha({}), profissional_id: "7" })).toThrow();
    expect(ruim({ ...linha({}), profissional_id: 1.5 })).toThrow();
  });
});

describe("tipoDoErroEstrelas / avisoDoErroEstrelas", () => {
  const capturar = (f: () => unknown): unknown => {
    try {
      f();
    } catch (e) {
      return e;
    }
    return undefined;
  };

  it("o teto de linhas é 'periodo_longo' (pelo tipo do erro, não pelo texto)", () => {
    const erro = capturar(() =>
      linhasDaRpcEstrelas(Array.from({ length: LIMITE_LINHAS_RPC }, () => linha({}))),
    );
    expect(erro).toBeInstanceOf(PeriodoLongoError);
    expect(tipoDoErroEstrelas(erro)).toBe("periodo_longo");
  });

  it("mesma mensagem em outro Error NÃO é 'periodo_longo'", () => {
    expect(tipoDoErroEstrelas(new Error(ERRO_PERIODO_LONGO))).toBe("generico");
  });

  it("outras falhas são genéricas: formato, erro do Supabase, valor qualquer", () => {
    expect(tipoDoErroEstrelas(capturar(() => linhasDaRpcEstrelas({ erro: true })))).toBe("generico");
    expect(tipoDoErroEstrelas(capturar(() => linhasDaRpcEstrelas([{ status: 1 }])))).toBe("generico");
    expect(tipoDoErroEstrelas({ code: "42501", message: "permission denied" })).toBe("generico");
    expect(tipoDoErroEstrelas(null)).toBe("generico");
  });

  it("textos do aviso da home", () => {
    expect(avisoDoErroEstrelas("periodo_longo")).toBe(AVISO_ESTRELAS_PERIODO_LONGO);
    expect(avisoDoErroEstrelas("generico")).toBe(AVISO_ESTRELAS_GENERICO);
    expect(AVISO_ESTRELAS_PERIODO_LONGO).toContain("Escolha um intervalo menor.");
    expect(AVISO_ESTRELAS_GENERICO).toContain("Recarregue a página.");
  });
});
