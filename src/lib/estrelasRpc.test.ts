import { describe, it, expect } from "vitest";
import {
  ERRO_PERIODO_LONGO,
  LIMITE_LINHAS_RPC,
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
    expect(() => linhasDaRpcEstrelas(n(LIMITE_LINHAS_RPC))).toThrow(ERRO_PERIODO_LONGO);
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
