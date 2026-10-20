import { describe, expect, it } from "vitest";
import { destinoDoLink } from "./destinoDoLink";

const BASE = "https://x3.studioxbrasil.com.br";

describe("destinoDoLink", () => {
  it("URL limpa fica igual", () => {
    expect(destinoDoLink(`${BASE}/minhas-avaliacoes`)).toBe(`${BASE}/minhas-avaliacoes`);
    expect(destinoDoLink(`${BASE}/`)).toBe(`${BASE}/`);
  });

  it("tira o fragmento", () => {
    expect(destinoDoLink(`${BASE}/admin#error=access_denied&error_code=otp_expired`)).toBe(`${BASE}/admin`);
  });

  it("tira da query os parâmetros de auth e mantém os demais", () => {
    const href = `${BASE}/aniversariantes?mes=10&error=access_denied&error_code=otp_expired`
      + "&error_description=Email+link+is+invalid&access_token=x&refresh_token=y&code=z&type=magiclink&expires_in=3600&aba=2";
    expect(destinoDoLink(href)).toBe(`${BASE}/aniversariantes?mes=10&aba=2`);
  });

  it("query só com parâmetros de auth some inteira (sem '?' sobrando)", () => {
    expect(destinoDoLink(`${BASE}/?code=abc&type=signup`)).toBe(`${BASE}/`);
  });

  it("query e fragmento juntos", () => {
    expect(destinoDoLink(`${BASE}/admin?x=1&error=a#access_token=t`)).toBe(`${BASE}/admin?x=1`);
  });
});
