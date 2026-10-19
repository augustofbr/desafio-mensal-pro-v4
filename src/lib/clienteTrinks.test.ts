import { describe, it, expect } from "vitest";
import {
  JANELA_DIAS_ATENDIMENTO,
  diaManaus,
  diasPermitidos,
  rotuloDia,
  nomeGoogleEfetivo,
  montarInsertAvaliacao,
} from "./clienteTrinks";

describe("JANELA_DIAS_ATENDIMENTO", () => {
  it("janela de 10 dias", () => {
    expect(JANELA_DIAS_ATENDIMENTO).toBe(10);
  });
});

describe("diaManaus", () => {
  it("usa o fuso de Manaus perto da meia-noite UTC", () => {
    expect(diaManaus(new Date("2026-10-18T02:30:00Z"))).toBe("2026-10-17");
  });
});

describe("diasPermitidos", () => {
  it("vai de hoje a hoje-10", () => {
    const d = diasPermitidos("2026-10-17");
    expect(d).toHaveLength(11);
    expect(d[0]).toBe("2026-10-17");
    expect(d[10]).toBe("2026-10-07");
  });
});

describe("rotuloDia", () => {
  it("hoje/ontem/outro", () => {
    expect(rotuloDia("2026-10-17", "2026-10-17")).toBe("Hoje · sáb 17");
    expect(rotuloDia("2026-10-16", "2026-10-17")).toBe("Ontem · sex 16");
    expect(rotuloDia("2026-10-14", "2026-10-17")).toBe("qua 14/10");
  });
});

describe("nomeGoogleEfetivo", () => {
  it("copia o Trinks quando marcado e acompanha a troca", () => {
    expect(nomeGoogleEfetivo("Mari", "Mariana Lima", true)).toBe("Mariana Lima");
    expect(nomeGoogleEfetivo("Mari", "Beatriz", true)).toBe("Beatriz");
  });
  it("desmarcado mantém o digitado", () => {
    expect(nomeGoogleEfetivo("Mari", "Mariana Lima", false)).toBe("Mari");
  });
});

describe("montarInsertAvaliacao", () => {
  it("monta a linha completa, com trim, status pendente", () => {
    const linha = montarInsertAvaliacao({
      profissionalId: 648177,
      nomeProfissional: "  Ana Souza ",
      nomeGoogle: " Mari ",
      nomeTrinks: " Mariana Lima ",
      clienteTrinksId: 123,
      dataAtendimento: "2026-10-17",
      origem: "lista",
      agoraISO: "2026-10-18T14:00:00.000Z",
    });

    expect(linha).toEqual({
      profissional_id: 648177,
      nome_profissional: "Ana Souza",
      nome_cliente: "Mari",
      nome_cliente_trinks: "Mariana Lima",
      cliente_trinks_id: 123,
      data_atendimento: "2026-10-17",
      origem_cliente_trinks: "lista",
      status: "pendente",
      data_hora_cadastro: "2026-10-18T14:00:00.000Z",
    });
  });

  it("digitado nunca leva id de cliente", () => {
    const linha = montarInsertAvaliacao({
      profissionalId: 648177,
      nomeProfissional: "Ana Souza",
      nomeGoogle: "Mari",
      nomeTrinks: "Mari",
      clienteTrinksId: 555,
      dataAtendimento: "2026-10-17",
      origem: "digitado",
      agoraISO: "2026-10-18T14:00:00.000Z",
    });

    expect(linha.cliente_trinks_id).toBeNull();
    expect(linha.origem_cliente_trinks).toBe("digitado");
  });
});
