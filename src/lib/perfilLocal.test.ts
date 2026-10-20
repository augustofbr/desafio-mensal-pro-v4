import { describe, it, expect } from "vitest";
import { PERFIL_KEY, lerPerfil, gravarPerfil, validarPerfil } from "./perfilLocal";

/**
 * Storage fake em memoria — o vitest roda em ambiente node, entao nada aqui
 * pode tocar `window`/`localStorage`. A lib recebe o storage injetado.
 */
function criarStorage(inicial: Record<string, string> = {}) {
  const dados = new Map<string, string>(Object.entries(inicial));
  return {
    getItem: (chave: string): string | null => (dados.has(chave) ? dados.get(chave)! : null),
    setItem: (chave: string, valor: string): void => {
      dados.set(chave, valor);
    },
    removeItem: (chave: string): void => {
      dados.delete(chave);
    },
    dados,
  };
}

const CONTA_A = "11111111-aaaa-aaaa-aaaa-111111111111";
const CONTA_B = "22222222-bbbb-bbbb-bbbb-222222222222";

describe("PERFIL_KEY", () => {
  it("e a chave versionada combinada com o app", () => {
    expect(PERFIL_KEY).toBe("destaque.perfil.v1");
  });
});

describe("lerPerfil", () => {
  it("retorna null quando nao ha nada gravado", () => {
    expect(lerPerfil(criarStorage(), CONTA_A)).toBeNull();
  });

  it("le o id gravado", () => {
    const storage = criarStorage({ [PERFIL_KEY]: JSON.stringify({ id: "103", userId: CONTA_A }) });
    expect(lerPerfil(storage, CONTA_A)).toBe("103");
  });

  it("normaliza id gravado como numero", () => {
    const storage = criarStorage({ [PERFIL_KEY]: JSON.stringify({ id: 103, userId: CONTA_A }) });
    expect(lerPerfil(storage, CONTA_A)).toBe("103");
  });

  it("normaliza id com espacos em volta", () => {
    const storage = criarStorage({ [PERFIL_KEY]: JSON.stringify({ id: " 103 ", userId: CONTA_A }) });
    expect(lerPerfil(storage, CONTA_A)).toBe("103");
  });

  it("retorna null quando o id gravado e vazio", () => {
    const storage = criarStorage({ [PERFIL_KEY]: JSON.stringify({ id: "   ", userId: CONTA_A }) });
    expect(lerPerfil(storage, CONTA_A)).toBeNull();
  });

  it("retorna null quando o JSON e invalido", () => {
    const storage = criarStorage({ [PERFIL_KEY]: "{{{ isto nao e json" });
    expect(lerPerfil(storage, CONTA_A)).toBeNull();
  });

  it("retorna null quando o JSON e valido mas nao tem id", () => {
    const storage = criarStorage({ [PERFIL_KEY]: JSON.stringify({ nome: "Brenda", userId: CONTA_A }) });
    expect(lerPerfil(storage, CONTA_A)).toBeNull();
  });

  it("retorna null quando o valor gravado e o JSON null", () => {
    const storage = criarStorage({ [PERFIL_KEY]: "null" });
    expect(lerPerfil(storage, CONTA_A)).toBeNull();
  });

  it("ignora outras chaves do storage", () => {
    const storage = criarStorage({ "outra.chave": JSON.stringify({ id: "999" }) });
    expect(lerPerfil(storage, CONTA_A)).toBeNull();
  });
});

describe("gravarPerfil", () => {
  it("grava um id legivel por lerPerfil (round trip)", () => {
    const storage = criarStorage();
    gravarPerfil(storage, "103", CONTA_A);
    expect(lerPerfil(storage, CONTA_A)).toBe("103");
  });

  it("grava normalizado", () => {
    const storage = criarStorage();
    gravarPerfil(storage, " 103 ", CONTA_A);
    expect(lerPerfil(storage, CONTA_A)).toBe("103");
  });

  it("remove a chave quando o id e null", () => {
    const storage = criarStorage();
    gravarPerfil(storage, "103", CONTA_A);
    gravarPerfil(storage, null, CONTA_A);
    expect(storage.dados.has(PERFIL_KEY)).toBe(false);
    expect(lerPerfil(storage, CONTA_A)).toBeNull();
  });

  it("remove a chave quando o id e vazio", () => {
    const storage = criarStorage();
    gravarPerfil(storage, "103", CONTA_A);
    gravarPerfil(storage, "   ", CONTA_A);
    expect(storage.dados.has(PERFIL_KEY)).toBe(false);
  });

  it("substitui o id anterior (troca de perfil)", () => {
    const storage = criarStorage();
    gravarPerfil(storage, "103", CONTA_A);
    gravarPerfil(storage, "104", CONTA_A);
    expect(lerPerfil(storage, CONTA_A)).toBe("104");
    expect(storage.dados.size).toBe(1);
  });
});

describe("validarPerfil", () => {
  const ativos = [{ profissionalId: 101 }, { profissionalId: 103 }];

  it("mantem o id quando a pessoa esta no cadastro", () => {
    expect(validarPerfil("103", ativos)).toBe("103");
  });

  it("normaliza o id antes de comparar", () => {
    expect(validarPerfil(" 103 ", ativos)).toBe("103");
  });

  it("retorna null quando o id nao existe mais no cadastro", () => {
    expect(validarPerfil("999", ativos)).toBeNull();
  });

  it("retorna null quando o id e null", () => {
    expect(validarPerfil(null, ativos)).toBeNull();
  });

  it("retorna null quando o id e vazio", () => {
    expect(validarPerfil("  ", ativos)).toBeNull();
  });

  it("retorna null quando o cadastro esta vazio", () => {
    expect(validarPerfil("103", [])).toBeNull();
  });
});

describe("identidade sempre reversivel", () => {
  it("auto-limpeza: id que saiu do cadastro some do storage", () => {
    const storage = criarStorage();
    gravarPerfil(storage, "103", CONTA_A);

    const valido = validarPerfil(lerPerfil(storage, CONTA_A), [{ profissionalId: 101 }]);
    expect(valido).toBeNull();

    gravarPerfil(storage, valido, CONTA_A);
    expect(lerPerfil(storage, CONTA_A)).toBeNull();
    expect(storage.dados.has(PERFIL_KEY)).toBe(false);
  });

  it("trocar e limpar deixam o storage no estado esperado", () => {
    const storage = criarStorage();
    const ativos = [{ profissionalId: 101 }, { profissionalId: 103 }];

    gravarPerfil(storage, "103", CONTA_A);
    expect(validarPerfil(lerPerfil(storage, CONTA_A), ativos)).toBe("103");

    gravarPerfil(storage, "101", CONTA_A);
    expect(validarPerfil(lerPerfil(storage, CONTA_A), ativos)).toBe("101");

    gravarPerfil(storage, null, CONTA_A);
    expect(validarPerfil(lerPerfil(storage, CONTA_A), ativos)).toBeNull();
  });
});

describe("perfil de aparelho compartilhado (dono da conta)", () => {
  it("grava o id junto com o user.id da conta", () => {
    const storage = criarStorage();
    gravarPerfil(storage, "103", CONTA_A);
    expect(JSON.parse(storage.dados.get(PERFIL_KEY)!)).toEqual({ id: "103", userId: CONTA_A });
  });

  it("a mesma conta lê o próprio perfil", () => {
    const storage = criarStorage();
    gravarPerfil(storage, "103", CONTA_A);
    expect(lerPerfil(storage, CONTA_A)).toBe("103");
  });

  it("outra conta não herda o perfil: ignora e limpa o storage", () => {
    const storage = criarStorage();
    gravarPerfil(storage, "103", CONTA_A);

    expect(lerPerfil(storage, CONTA_B)).toBeNull();
    expect(storage.dados.has(PERFIL_KEY)).toBe(false);
    // E a conta A, ao voltar, também não o encontra mais.
    expect(lerPerfil(storage, CONTA_A)).toBeNull();
  });

  it("perfil antigo, sem user.id, é de outra conta: ignora e limpa", () => {
    const storage = criarStorage({ [PERFIL_KEY]: JSON.stringify({ id: "103" }) });
    expect(lerPerfil(storage, CONTA_A)).toBeNull();
    expect(storage.dados.has(PERFIL_KEY)).toBe(false);
  });

  it("user.id guardado de tipo estranho conta como outra conta", () => {
    const storage = criarStorage({ [PERFIL_KEY]: JSON.stringify({ id: "103", userId: 42 }) });
    expect(lerPerfil(storage, CONTA_A)).toBeNull();
    expect(storage.dados.has(PERFIL_KEY)).toBe(false);
  });

  it("sem conta atual (userId null): não lê e não apaga nada", () => {
    const storage = criarStorage();
    gravarPerfil(storage, "103", CONTA_A);
    expect(lerPerfil(storage, null)).toBeNull();
    expect(storage.dados.has(PERFIL_KEY)).toBe(true);
  });

  it("sem conta atual (userId null): gravar não guarda nada", () => {
    const storage = criarStorage();
    gravarPerfil(storage, "103", null);
    expect(storage.dados.has(PERFIL_KEY)).toBe(false);
  });

  it("troca de conta no mesmo aparelho: a segunda grava o seu e a primeira não vê", () => {
    const storage = criarStorage();
    gravarPerfil(storage, "103", CONTA_A);
    expect(lerPerfil(storage, CONTA_B)).toBeNull();
    gravarPerfil(storage, "104", CONTA_B);
    expect(lerPerfil(storage, CONTA_B)).toBe("104");
    expect(lerPerfil(storage, CONTA_A)).toBeNull();
  });

  it("JSON inválido continua sendo ignorado sem exceção", () => {
    const storage = criarStorage({ [PERFIL_KEY]: "{{{" });
    expect(lerPerfil(storage, CONTA_A)).toBeNull();
  });
});
