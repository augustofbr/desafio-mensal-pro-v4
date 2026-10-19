import { describe, it, expect } from "vitest";
import {
  casaBuscaCliente,
  linhaTrinks,
  dataCurta,
  statusPorExtenso,
  rotuloAtendida,
  normalizarSinal,
  idsParaSinais,
  LIMITE_IDS_SINAIS,
} from "./avaliacoesAdmin";

describe("casaBuscaCliente", () => {
  const a = { nome_cliente: "José da Silva", nome_cliente_trinks: "Mariana Souza Lima" };

  it("termo vazio (ou so espacos) casa tudo", () => {
    expect(casaBuscaCliente(a, "")).toBe(true);
    expect(casaBuscaCliente(a, "   ")).toBe(true);
  });

  it("ignora acento e caixa no nome do Google ('jose' casa 'José')", () => {
    expect(casaBuscaCliente(a, "jose")).toBe(true);
    expect(casaBuscaCliente(a, "JOSÉ DA")).toBe(true);
  });

  it("casa so pelo nome do Trinks", () => {
    expect(casaBuscaCliente(a, "mariana")).toBe(true);
    expect(casaBuscaCliente(a, "souza lima")).toBe(true);
  });

  it("nao casa quando nenhum dos dois nomes tem o termo", () => {
    expect(casaBuscaCliente(a, "fernanda")).toBe(false);
  });

  it("legado com nome do Trinks null nao quebra e ainda casa pelo Google", () => {
    const legado = { nome_cliente: "Ana Paula", nome_cliente_trinks: null };
    expect(casaBuscaCliente(legado, "paula")).toBe(true);
    expect(casaBuscaCliente(legado, "mariana")).toBe(false);
  });
});

describe("dataCurta", () => {
  it("YYYY-MM-DD vira DD/MM sem passar por Date (sem deslocar fuso)", () => {
    expect(dataCurta("2026-10-16")).toBe("16/10");
    expect(dataCurta("2026-01-05")).toBe("05/01");
  });
  it("valor ausente ou malformado devolve string vazia", () => {
    expect(dataCurta(null)).toBe("");
    expect(dataCurta("16/10/2026")).toBe("");
  });
});

describe("linhaTrinks", () => {
  it("digitado a mao", () => {
    expect(
      linhaTrinks({
        nome_cliente_trinks: "Fernanda Costa",
        origem_cliente_trinks: "digitado",
        data_atendimento: "2026-10-16",
      }),
    ).toBe("Trinks: Fernanda Costa (digitado à mão) · 16/10");
  });

  it("escolhido na lista", () => {
    expect(
      linhaTrinks({
        nome_cliente_trinks: "Mariana Souza Lima",
        origem_cliente_trinks: "lista",
        data_atendimento: "2026-10-17",
      }),
    ).toBe("Trinks: Mariana Souza Lima · 17/10");
  });

  it("cadastro antigo (sem nome do Trinks)", () => {
    expect(
      linhaTrinks({
        nome_cliente_trinks: null,
        origem_cliente_trinks: null,
        data_atendimento: null,
      }),
    ).toBe("Trinks: — (cadastro antigo)");
  });

  it("nome em branco conta como cadastro antigo", () => {
    expect(
      linhaTrinks({
        nome_cliente_trinks: "   ",
        origem_cliente_trinks: null,
        data_atendimento: null,
      }),
    ).toBe("Trinks: — (cadastro antigo)");
  });

  it("nome sem data nao deixa separador solto", () => {
    expect(
      linhaTrinks({
        nome_cliente_trinks: "Mariana",
        origem_cliente_trinks: "lista",
        data_atendimento: null,
      }),
    ).toBe("Trinks: Mariana");
  });
});

describe("statusPorExtenso", () => {
  it("traduz os tres status", () => {
    expect(statusPorExtenso("aprovada")).toBe("aprovada");
    expect(statusPorExtenso("rejeitada")).toBe("recusada");
    expect(statusPorExtenso("pendente")).toBe("pendente");
  });
  it("status desconhecido volta como veio", () => {
    expect(statusPorExtenso("outra")).toBe("outra");
  });
});

describe("rotuloAtendida", () => {
  it("atendida mostra nome, data e servico quando existem", () => {
    const r = rotuloAtendida({
      atendida: "atendida",
      atendida_nome: "Mariana Souza Lima",
      atendida_data: "2026-10-17",
      atendida_servico: "Escova, Hidratação",
    });
    expect(r.titulo).toBe("Atendida");
    expect(r.detalhe).toBe("Mariana Souza Lima · 17/10 · Escova, Hidratação");
    expect(r.tom).toBe("verde");
  });

  it("provavel mostra o nome mais parecido e a data", () => {
    const r = rotuloAtendida({
      atendida: "provavel",
      atendida_nome: "Mariana S. Lima",
      atendida_data: "2026-10-16",
      atendida_servico: null,
    });
    expect(r.titulo).toBe("Provável");
    expect(r.detalhe).toBe("Mariana S. Lima · 16/10");
    expect(r.tom).toBe("ambar");
  });

  it("aguardando espelho usa o texto combinado e o tom cinza-azulado", () => {
    const r = rotuloAtendida({
      atendida: "aguardando_espelho",
      atendida_nome: null,
      atendida_data: null,
      atendida_servico: null,
    });
    expect(r.titulo).toBe("Aguardando espelho");
    expect(r.detalhe).toBe("a comanda pode não ter fechado ainda");
    expect(r.tom).toBe("cinza");
  });

  it("nao encontrada e vermelha, sem detalhe", () => {
    const r = rotuloAtendida({
      atendida: "nao_encontrada",
      atendida_nome: null,
      atendida_data: null,
      atendida_servico: null,
    });
    expect(r.titulo).toBe("Não encontrada");
    expect(r.detalhe).toBe("");
    expect(r.tom).toBe("vermelho");
  });
});

describe("normalizarSinal", () => {
  it("duplicatas null/ausente vira lista vazia", () => {
    const s = normalizarSinal({
      avaliacao_id: "x",
      atendida: "nao_encontrada",
      atendida_nome: null,
      atendida_data: null,
      atendida_servico: null,
      duplicatas: null,
    } as never);
    expect(s.duplicatas).toEqual([]);
  });
  it("preserva as duplicatas recebidas", () => {
    const d = {
      id: "y",
      nome_profissional: "Debora",
      nome_cliente: "Ana",
      status: "aprovada",
      data_hora_cadastro: "2026-08-01T18:00:00Z",
    };
    const s = normalizarSinal({
      avaliacao_id: "x",
      atendida: "atendida",
      atendida_nome: "Ana",
      atendida_data: "2026-10-01",
      atendida_servico: null,
      duplicatas: [d],
    } as never);
    expect(s.duplicatas).toEqual([d]);
  });
});

describe("idsParaSinais", () => {
  it("mantem ate o teto, na ordem recebida (as mais antigas da fila)", () => {
    const ids = Array.from({ length: LIMITE_IDS_SINAIS + 20 }, (_, i) => `id-${i}`);
    const r = idsParaSinais(ids);
    expect(r).toHaveLength(LIMITE_IDS_SINAIS);
    expect(r[0]).toBe("id-0");
    expect(r[LIMITE_IDS_SINAIS - 1]).toBe(`id-${LIMITE_IDS_SINAIS - 1}`);
  });
  it("lista pequena passa inteira", () => {
    expect(idsParaSinais(["a", "b"])).toEqual(["a", "b"]);
  });
});
