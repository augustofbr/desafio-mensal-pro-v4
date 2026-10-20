import { describe, it, expect } from "vitest";
import {
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
      linha({ profissional_id: null, status: "pendente", data_aprovacao: null }),
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
});
