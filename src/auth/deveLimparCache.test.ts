import { describe, expect, it } from "vitest";
import { deveLimparCache } from "./deveLimparCache";

const A = "user-a";
const B = "user-b";

describe("deveLimparCache", () => {
  it("SIGNED_OUT sempre limpa", () => {
    expect(deveLimparCache("SIGNED_OUT", A, null)).toBe(true);
    expect(deveLimparCache("SIGNED_OUT", null, null)).toBe(true);
  });

  it("troca de usuário limpa, seja qual for o evento", () => {
    expect(deveLimparCache("SIGNED_IN", A, B)).toBe(true);
    expect(deveLimparCache("TOKEN_REFRESHED", A, B)).toBe(true);
    expect(deveLimparCache("USER_UPDATED", A, B)).toBe(true);
  });

  it("sessão some sem SIGNED_OUT (A → nenhum) também limpa", () => {
    expect(deveLimparCache("TOKEN_REFRESHED", A, null)).toBe(true);
  });

  it("mesmo usuário não limpa (renovação de token, USER_UPDATED, SIGNED_IN repetido)", () => {
    expect(deveLimparCache("TOKEN_REFRESHED", A, A)).toBe(false);
    expect(deveLimparCache("USER_UPDATED", A, A)).toBe(false);
    expect(deveLimparCache("SIGNED_IN", A, A)).toBe(false);
  });

  it("primeira sessão conhecida (nenhum → A) não limpa: não havia dono anterior", () => {
    expect(deveLimparCache("INITIAL_SESSION", null, A)).toBe(false);
    expect(deveLimparCache("SIGNED_IN", null, A)).toBe(false);
  });
});
