import { describe, it, expect } from "vitest";
import {
  MOTIVO_ERRO_VINCULO,
  MOTIVO_FORA_DO_DESAFIO,
  MOTIVO_SEM_VINCULO,
  escolherPerfilId,
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

describe("resolverIdentidade com erro ao verificar o vínculo", () => {
  it("erro + read: não culpa a conta; bloqueia com o motivo do erro", () => {
    expect(
      resolverIdentidade({
        vinculoId: null,
        vinculoErro: true,
        nivelEstrelas: "read",
        perfilLocalId: null,
      })
    ).toEqual({
      perfilId: null,
      fixo: false,
      podeEscolherProfissionalNoCadastro: false,
      podeCadastrar: false,
      motivoBloqueio: "Não foi possível verificar seu cadastro. Recarregue a página.",
    });
    expect(MOTIVO_ERRO_VINCULO).toBe(
      "Não foi possível verificar seu cadastro. Recarregue a página."
    );
  });

  it("erro + write (recepção ou aparelho): continua cadastrando, escolhendo", () => {
    const r = resolverIdentidade({
      vinculoId: null,
      vinculoErro: true,
      nivelEstrelas: "write",
      perfilLocalId: null,
    });
    expect(r.podeCadastrar).toBe(true);
    expect(r.podeEscolherProfissionalNoCadastro).toBe(true);
    expect(r.motivoBloqueio).toBeNull();
  });

  it("erro + none: sem cadastro e sem mensagem", () => {
    const r = resolverIdentidade({
      vinculoId: null,
      vinculoErro: true,
      nivelEstrelas: "none",
      perfilLocalId: null,
    });
    expect(r.podeCadastrar).toBe(false);
    expect(r.motivoBloqueio).toBeNull();
  });

  it("vinculoErro ausente ou false mantém o comportamento de sem vínculo", () => {
    for (const vinculoErro of [undefined, false]) {
      expect(
        resolverIdentidade({
          vinculoId: null,
          vinculoErro,
          nivelEstrelas: "read",
          perfilLocalId: null,
        }).motivoBloqueio
      ).toBe(MOTIVO_SEM_VINCULO);
    }
  });
});

describe("resolverIdentidade com a ligada fora do desafio e do Bônus no mês", () => {
  const base = { vinculoId: 885975, perfilLocalId: null };

  it("read + ligada fora das listas do mês: bloqueia com o motivo", () => {
    const r = resolverIdentidade({ ...base, nivelEstrelas: "read", vinculoSelecionavel: false });
    expect(r.podeCadastrar).toBe(false);
    expect(r.motivoBloqueio).toBe("Você não participa do desafio nem do Bônus Estrelas neste mês.");
    expect(MOTIVO_FORA_DO_DESAFIO).toBe(r.motivoBloqueio);
    // A identidade continua sendo a da conta.
    expect(r.fixo).toBe(true);
    expect(r.perfilId).toBe("885975");
  });

  it("read + ligada que aparece na lista (ou ainda desconhecido): cadastra", () => {
    for (const vinculoSelecionavel of [true, undefined]) {
      const r = resolverIdentidade({ ...base, nivelEstrelas: "read", vinculoSelecionavel });
      expect(r.podeCadastrar).toBe(true);
      expect(r.motivoBloqueio).toBeNull();
    }
  });

  it("write + ligada fora da lista: segue a lista normal, sem bloqueio", () => {
    const r = resolverIdentidade({ ...base, nivelEstrelas: "write", vinculoSelecionavel: false });
    expect(r.podeCadastrar).toBe(true);
    expect(r.motivoBloqueio).toBeNull();
  });

  it("none + ligada fora da lista: sem cadastro e sem mensagem", () => {
    const r = resolverIdentidade({ ...base, nivelEstrelas: "none", vinculoSelecionavel: false });
    expect(r.podeCadastrar).toBe(false);
    expect(r.motivoBloqueio).toBeNull();
  });
});

describe("escolherPerfilId (regra única do perfil exibido)", () => {
  it("o vínculo vence o perfil local e torna a identidade fixa", () => {
    expect(escolherPerfilId(885975, "648177")).toEqual({ perfilId: "885975", fixo: true });
  });

  it("sem vínculo vale o perfil local (normalizado)", () => {
    expect(escolherPerfilId(null, " 648177 ")).toEqual({ perfilId: "648177", fixo: false });
  });

  it("sem vínculo e sem local: nada", () => {
    expect(escolherPerfilId(null, null)).toEqual({ perfilId: null, fixo: false });
    expect(escolherPerfilId(null, "  ")).toEqual({ perfilId: null, fixo: false });
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
