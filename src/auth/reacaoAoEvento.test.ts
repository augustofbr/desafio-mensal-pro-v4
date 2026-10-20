import { describe, expect, it } from "vitest";
import { reacaoAoEvento } from "./reacaoAoEvento";

const A = "user-a";
const B = "user-b";

describe("reacaoAoEvento", () => {
  it("INITIAL_SESSION → nada (o refresh da montagem já resolve; sem segundo carregarAcesso)", () => {
    expect(reacaoAoEvento("INITIAL_SESSION", null, A)).toBe("nada");
    expect(reacaoAoEvento("INITIAL_SESSION", null, null)).toBe("nada");
    expect(reacaoAoEvento("INITIAL_SESSION", A, A)).toBe("nada");
  });

  it("SIGNED_IN do mesmo usuário (visibilitychange) → silencioso, sem desmontar a página", () => {
    expect(reacaoAoEvento("SIGNED_IN", A, A)).toBe("silencioso");
  });

  it("USER_UPDATED do mesmo usuário → silencioso", () => {
    expect(reacaoAoEvento("USER_UPDATED", A, A)).toBe("silencioso");
  });

  it("TOKEN_REFRESHED do mesmo usuário → só atualiza a sessão (sem checagem periódica)", () => {
    expect(reacaoAoEvento("TOKEN_REFRESHED", A, A)).toBe("so_sessao");
  });

  it("SIGNED_OUT → visível", () => {
    expect(reacaoAoEvento("SIGNED_OUT", A, null)).toBe("visivel");
    expect(reacaoAoEvento("SIGNED_OUT", null, null)).toBe("visivel");
  });

  it("troca de usuário → visível, seja qual for o evento", () => {
    expect(reacaoAoEvento("SIGNED_IN", A, B)).toBe("visivel");
    expect(reacaoAoEvento("TOKEN_REFRESHED", A, B)).toBe("visivel");
    expect(reacaoAoEvento("USER_UPDATED", A, B)).toBe("visivel");
  });

  it("primeira identidade conhecida (link mágico chegando) → visível", () => {
    expect(reacaoAoEvento("SIGNED_IN", null, A)).toBe("visivel");
  });

  it("sessão some sem SIGNED_OUT → visível", () => {
    expect(reacaoAoEvento("TOKEN_REFRESHED", A, null)).toBe("visivel");
  });
});
