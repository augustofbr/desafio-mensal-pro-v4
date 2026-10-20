import { describe, it, expect } from "vitest";
import {
  casaBuscaCliente,
  casaBuscaHistorico,
  mensagemDoErro,
  mensagemDecisaoParcial,
  DecisaoParcialError,
  linhaTrinks,
  dataCurta,
  statusPorExtenso,
  rotuloAtendida,
  normalizarSinal,
  idsParaSinais,
  LIMITE_IDS_SINAIS,
  LIMITE_DUPLICATAS,
  rotuloContagemDuplicatas,
  rotuloMotivoDuplicata,
  estadoDaLista,
  rotuloContadorPendentes,
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

describe("mensagemDoErro", () => {
  it("Error comum: usa a message", () => {
    expect(mensagemDoErro(new Error("Sessão expirada."))).toBe("Sessão expirada.");
  });

  it("objeto no formato PostgrestError (nao e Error): o 23514 do banco chega ao toast", () => {
    const erro = {
      message: "Informe o motivo da recusa.",
      code: "23514",
      details: "Failing row contains (...)",
      hint: "",
    };
    expect(mensagemDoErro(erro)).toBe("Informe o motivo da recusa.");
  });

  it("objeto sem message em texto cai no String() em vez de quebrar", () => {
    expect(mensagemDoErro({ message: "", code: "x" })).toBe("[object Object]");
    expect(mensagemDoErro({ message: 42 })).toBe("[object Object]");
  });

  it("texto, null e undefined", () => {
    expect(mensagemDoErro("falhou")).toBe("falhou");
    expect(mensagemDoErro(null)).toBe("null");
    expect(mensagemDoErro(undefined)).toBe("undefined");
  });
});

describe("mensagemDecisaoParcial", () => {
  it("lote recusado: diz quantas gravou e quantas ja estavam decididas", () => {
    expect(mensagemDecisaoParcial("rejeitada", 3, 5)).toBe(
      "3 de 5 avaliações foram recusadas. 2 avaliações já tinham sido decididas por outra pessoa e não foram alteradas.",
    );
  });

  it("lote aprovado, com uma so faltando (singular)", () => {
    expect(mensagemDecisaoParcial("aprovada", 4, 5)).toBe(
      "4 de 5 avaliações foram aprovadas. 1 avaliação já tinha sido decidida por outra pessoa e não foi alterada.",
    );
  });

  it("DecisaoParcialError carrega os ids gravados e a mensagem pronta", () => {
    const erro = new DecisaoParcialError("rejeitada", ["a", "b"], 3);
    expect(erro).toBeInstanceOf(Error);
    expect(erro).toBeInstanceOf(DecisaoParcialError);
    expect(erro.gravadas).toEqual(["a", "b"]);
    expect(erro.message).toBe(mensagemDecisaoParcial("rejeitada", 2, 3));
    expect(mensagemDoErro(erro)).toBe(erro.message);
  });
});

describe("casaBuscaHistorico", () => {
  const a = {
    nome_profissional: "Débora Lima",
    nome_cliente: "José da Silva",
    nome_cliente_trinks: "Mariana Souza",
  };

  it("termo vazio casa tudo, com ou sem motivo", () => {
    expect(casaBuscaHistorico(a, "")).toBe(true);
    expect(casaBuscaHistorico(a, "  ", "qualquer coisa")).toBe(true);
  });

  it("continua casando por cliente (Google e Trinks) e por profissional", () => {
    expect(casaBuscaHistorico(a, "jose")).toBe(true);
    expect(casaBuscaHistorico(a, "mariana")).toBe(true);
    expect(casaBuscaHistorico(a, "debora")).toBe(true);
  });

  it("casa pelo texto do motivo, sem acento e sem diferenciar caixa", () => {
    expect(casaBuscaHistorico(a, "DUPLICADA", "Estrela duplicada de outra profissional")).toBe(true);
    expect(casaBuscaHistorico(a, "nao confere", "O nome não confere com o Trinks")).toBe(true);
  });

  it("nao casa quando nem os nomes nem o motivo tem o termo", () => {
    expect(casaBuscaHistorico(a, "duplicada", "Nome não confere")).toBe(false);
  });

  it("sem motivo (aprovada, legado ou ainda carregando) so olha os nomes", () => {
    expect(casaBuscaHistorico(a, "duplicada")).toBe(false);
    expect(casaBuscaHistorico(a, "duplicada", null)).toBe(false);
    expect(casaBuscaHistorico(a, "jose", null)).toBe(true);
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

describe("rotuloContagemDuplicatas", () => {
  it("abaixo do teto da RPC mostra o numero", () => {
    expect(rotuloContagemDuplicatas(1)).toBe("1");
    expect(rotuloContagemDuplicatas(4)).toBe("4");
  });
  it("no teto (5) mostra 5+, porque a RPC corta", () => {
    expect(LIMITE_DUPLICATAS).toBe(5);
    expect(rotuloContagemDuplicatas(5)).toBe("5+");
    expect(rotuloContagemDuplicatas(6)).toBe("5+");
  });
});

describe("rotuloMotivoDuplicata", () => {
  it("so o nome do Trinks bater acrescenta o trecho", () => {
    expect(rotuloMotivoDuplicata("nome_trinks")).toBe(" · o nome do Google dela bate com o nome do Trinks desta estrela");
  });
  it("mesma cliente no Trinks usa o texto do dono, literal", () => {
    expect(rotuloMotivoDuplicata("mesma_cliente_trinks")).toBe(" · Mesma cliente no Trinks. Possível duplicata.");
  });
  it("nome_google, ausente (RPC antiga) ou nulo nao acrescentam nada", () => {
    expect(rotuloMotivoDuplicata("nome_google")).toBe("");
    expect(rotuloMotivoDuplicata(undefined)).toBe("");
    expect(rotuloMotivoDuplicata(null)).toBe("");
  });
});

describe("estadoDaLista", () => {
  it("carregando vence tudo", () => {
    expect(estadoDaLista({ isLoading: true, isError: true, total: 0 })).toBe("carregando");
  });
  it("erro vence vazio — falha nunca vira lista vazia", () => {
    expect(estadoDaLista({ isLoading: false, isError: true, total: 0 })).toBe("erro");
  });
  it("refetch falhou com dados em cache: lista marcada como desatualizada", () => {
    expect(estadoDaLista({ isLoading: false, isError: true, total: 3 })).toBe(
      "lista_desatualizada",
    );
  });
  it("sem erro: vazio ou lista", () => {
    expect(estadoDaLista({ isLoading: false, isError: false, total: 0 })).toBe("vazio");
    expect(estadoDaLista({ isLoading: false, isError: false, total: 2 })).toBe("lista");
  });
});

describe("rotuloContadorPendentes", () => {
  it("falha mostra '!', nunca 0", () => {
    expect(rotuloContadorPendentes({ isLoading: false, isError: true, total: 0 })).toBe("!");
  });
  it("carregando ou fila vazia: nada", () => {
    expect(rotuloContadorPendentes({ isLoading: true, isError: false, total: 0 })).toBeNull();
    expect(rotuloContadorPendentes({ isLoading: false, isError: false, total: 0 })).toBeNull();
  });
  it("com pendentes: o numero", () => {
    expect(rotuloContadorPendentes({ isLoading: false, isError: false, total: 7 })).toBe("7");
  });
});
