import { describe, expect, it } from "vitest";
import {
  mensagemErroLogin,
  MSG_AGUARDE,
  MSG_GENERICA,
  MSG_MUITOS_PEDIDOS,
  MSG_NAO_CADASTRADO,
} from "./mensagemErroLogin";

describe("mensagemErroLogin", () => {
  it("'email rate limit exceeded' → muitos pedidos", () => {
    expect(mensagemErroLogin("email rate limit exceeded")).toBe(MSG_MUITOS_PEDIDOS);
    expect(mensagemErroLogin("Email rate limit exceeded")).toBe(MSG_MUITOS_PEDIDOS);
  });

  it("'only request this after N seconds' → aguarde", () => {
    expect(mensagemErroLogin("For security purposes, you can only request this after 42 seconds.")).toBe(MSG_AGUARDE);
  });

  it("rate limit genérico / too many requests → aguarde", () => {
    expect(mensagemErroLogin("Request rate limit reached")).toBe(MSG_AGUARDE);
    expect(mensagemErroLogin("Too many requests")).toBe(MSG_AGUARDE);
  });

  it("e-mail não cadastrado / signups not allowed → mensagem do kit", () => {
    expect(mensagemErroLogin("Signups not allowed for otp")).toBe(MSG_NAO_CADASTRADO);
    expect(mensagemErroLogin("User not found")).toBe(MSG_NAO_CADASTRADO);
    expect(mensagemErroLogin("Signups are disabled")).toBe(MSG_NAO_CADASTRADO);
  });

  it("o resto → genérica em pt-BR (nunca a mensagem crua)", () => {
    expect(mensagemErroLogin("Failed to fetch")).toBe(MSG_GENERICA);
    expect(mensagemErroLogin("")).toBe(MSG_GENERICA);
    expect(MSG_GENERICA).not.toMatch(/fetch/i);
  });

  it("textos usam 'e-mail', nunca 'email'", () => {
    for (const m of [MSG_AGUARDE, MSG_GENERICA, MSG_MUITOS_PEDIDOS, MSG_NAO_CADASTRADO]) {
      expect(m).not.toMatch(/\bemail\b/i);
    }
  });
});
