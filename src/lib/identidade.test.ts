import { describe, it, expect } from "vitest";
import {
  MOTIVO_SEM_VINCULO,
  normalizarVinculo,
  resolverIdentidade,
} from "./identidade";

describe("resolverIdentidade", () => {
  it("profissional ligada: o vínculo vence o perfil local e é fixo", () => {
    expect(
      resolverIdentidade({ vinculoId: 885975, nivelEstrelas: "read", perfilLocalId: "648177" })
    ).toEqual({
      perfilId: "885975",
      fixo: true,
      podeEscolherProfissionalNoCadastro: false,
      podeCadastrar: true,
      motivoBloqueio: null,
    });
  });

  it("profissional sem vínculo: não cadastra e recebe o motivo", () => {
    expect(
      resolverIdentidade({ vinculoId: null, nivelEstrelas: "read", perfilLocalId: "885975" })
    ).toEqual({
      perfilId: "885975",
      fixo: false,
      podeEscolherProfissionalNoCadastro: false,
      podeCadastrar: false,
      motivoBloqueio: "Seu e-mail não está ligado a nenhum cadastro. Fale com a recepção.",
    });
  });

  it("recepção ligada: identidade fixa, mas escolhe a profissional no cadastro", () => {
    expect(
      resolverIdentidade({ vinculoId: 648177, nivelEstrelas: "write", perfilLocalId: null })
    ).toEqual({
      perfilId: "648177",
      fixo: true,
      podeEscolherProfissionalNoCadastro: true,
      podeCadastrar: true,
      motivoBloqueio: null,
    });
  });

  it("aparelho (write sem vínculo): identidade local solta e cadastro livre", () => {
    expect(
      resolverIdentidade({ vinculoId: null, nivelEstrelas: "write", perfilLocalId: "885975" })
    ).toEqual({
      perfilId: "885975",
      fixo: false,
      podeEscolherProfissionalNoCadastro: true,
      podeCadastrar: true,
      motivoBloqueio: null,
    });
  });

  it("sem acesso a estrelas (none): não cadastra e não há mensagem (o botão some)", () => {
    const r = resolverIdentidade({ vinculoId: null, nivelEstrelas: "none", perfilLocalId: null });
    expect(r.podeCadastrar).toBe(false);
    expect(r.motivoBloqueio).toBeNull();
    expect(r.podeEscolherProfissionalNoCadastro).toBe(false);
  });

  it("none com vínculo: continua sem cadastro e sem mensagem", () => {
    const r = resolverIdentidade({ vinculoId: 885975, nivelEstrelas: "none", perfilLocalId: null });
    expect(r.podeCadastrar).toBe(false);
    expect(r.motivoBloqueio).toBeNull();
    expect(r.fixo).toBe(true);
    expect(r.perfilId).toBe("885975");
  });

  it("perfil local vazio vira null (nada de string vazia como identidade)", () => {
    expect(
      resolverIdentidade({ vinculoId: null, nivelEstrelas: "read", perfilLocalId: "  " }).perfilId
    ).toBeNull();
  });

  it("exporta o texto do motivo sem vínculo", () => {
    expect(MOTIVO_SEM_VINCULO).toBe(
      "Seu e-mail não está ligado a nenhum cadastro. Fale com a recepção."
    );
  });
});

describe("normalizarVinculo", () => {
  it("aceita inteiro positivo, em número ou texto", () => {
    expect(normalizarVinculo(885975)).toBe(885975);
    expect(normalizarVinculo("885975")).toBe(885975);
  });

  it.each([null, undefined, 0, -3, 1.5, "abc", "", NaN, {}, []])(
    "devolve null para %p",
    (valor) => {
      expect(normalizarVinculo(valor)).toBeNull();
    }
  );
});
