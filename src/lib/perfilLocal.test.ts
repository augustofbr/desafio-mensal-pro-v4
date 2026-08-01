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

describe("PERFIL_KEY", () => {
  it("e a chave versionada combinada com o app", () => {
    expect(PERFIL_KEY).toBe("destaque.perfil.v1");
  });
});

describe("lerPerfil", () => {
  it("retorna null quando nao ha nada gravado", () => {
    expect(lerPerfil(criarStorage())).toBeNull();
  });

  it("le o id gravado", () => {
    const storage = criarStorage({ [PERFIL_KEY]: JSON.stringify({ id: "103" }) });
    expect(lerPerfil(storage)).toBe("103");
  });

  it("normaliza id gravado como numero", () => {
    const storage = criarStorage({ [PERFIL_KEY]: JSON.stringify({ id: 103 }) });
    expect(lerPerfil(storage)).toBe("103");
  });

  it("normaliza id com espacos em volta", () => {
    const storage = criarStorage({ [PERFIL_KEY]: JSON.stringify({ id: " 103 " }) });
    expect(lerPerfil(storage)).toBe("103");
  });

  it("retorna null quando o id gravado e vazio", () => {
    const storage = criarStorage({ [PERFIL_KEY]: JSON.stringify({ id: "   " }) });
    expect(lerPerfil(storage)).toBeNull();
  });

  it("retorna null quando o JSON e invalido", () => {
    const storage = criarStorage({ [PERFIL_KEY]: "{{{ isto nao e json" });
    expect(lerPerfil(storage)).toBeNull();
  });

  it("retorna null quando o JSON e valido mas nao tem id", () => {
    const storage = criarStorage({ [PERFIL_KEY]: JSON.stringify({ nome: "Brenda" }) });
    expect(lerPerfil(storage)).toBeNull();
  });

  it("retorna null quando o valor gravado e o JSON null", () => {
    const storage = criarStorage({ [PERFIL_KEY]: "null" });
    expect(lerPerfil(storage)).toBeNull();
  });

  it("ignora outras chaves do storage", () => {
    const storage = criarStorage({ "outra.chave": JSON.stringify({ id: "999" }) });
    expect(lerPerfil(storage)).toBeNull();
  });
});

describe("gravarPerfil", () => {
  it("grava um id legivel por lerPerfil (round trip)", () => {
    const storage = criarStorage();
    gravarPerfil(storage, "103");
    expect(lerPerfil(storage)).toBe("103");
  });

  it("grava normalizado", () => {
    const storage = criarStorage();
    gravarPerfil(storage, " 103 ");
    expect(lerPerfil(storage)).toBe("103");
  });

  it("remove a chave quando o id e null", () => {
    const storage = criarStorage();
    gravarPerfil(storage, "103");
    gravarPerfil(storage, null);
    expect(storage.dados.has(PERFIL_KEY)).toBe(false);
    expect(lerPerfil(storage)).toBeNull();
  });

  it("remove a chave quando o id e vazio", () => {
    const storage = criarStorage();
    gravarPerfil(storage, "103");
    gravarPerfil(storage, "   ");
    expect(storage.dados.has(PERFIL_KEY)).toBe(false);
  });

  it("substitui o id anterior (troca de perfil)", () => {
    const storage = criarStorage();
    gravarPerfil(storage, "103");
    gravarPerfil(storage, "104");
    expect(lerPerfil(storage)).toBe("104");
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
    gravarPerfil(storage, "103");

    const valido = validarPerfil(lerPerfil(storage), [{ profissionalId: 101 }]);
    expect(valido).toBeNull();

    gravarPerfil(storage, valido);
    expect(lerPerfil(storage)).toBeNull();
    expect(storage.dados.has(PERFIL_KEY)).toBe(false);
  });

  it("trocar e limpar deixam o storage no estado esperado", () => {
    const storage = criarStorage();
    const ativos = [{ profissionalId: 101 }, { profissionalId: 103 }];

    gravarPerfil(storage, "103");
    expect(validarPerfil(lerPerfil(storage), ativos)).toBe("103");

    gravarPerfil(storage, "101");
    expect(validarPerfil(lerPerfil(storage), ativos)).toBe("101");

    gravarPerfil(storage, null);
    expect(validarPerfil(lerPerfil(storage), ativos)).toBeNull();
  });
});
