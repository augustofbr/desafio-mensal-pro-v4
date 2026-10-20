import { describe, it, expect } from "vitest";
import { acharPerfilId, perfilSugerido, PERFIS_DA_CRIACAO } from "./perfilSugerido";

describe("perfilSugerido", () => {
  it("categoria do desafio vira Profissional", () => {
    expect(perfilSugerido("Cabelo")).toBe("Profissional");
    expect(perfilSugerido("Estetica")).toBe("Profissional");
    expect(perfilSugerido("Maquiagem")).toBe("Profissional");
  });

  it("ignora espaços nas pontas", () => {
    expect(perfilSugerido(" Unhas ")).toBe("Profissional");
  });

  it("sem categoria vira Recepção", () => {
    expect(perfilSugerido(null)).toBe("Recepção");
    expect(perfilSugerido("")).toBe("Recepção");
    expect(perfilSugerido("   ")).toBe("Recepção");
  });

  it("categoria desconhecida vira Recepção", () => {
    expect(perfilSugerido("Recepcao")).toBe("Recepção");
    expect(perfilSugerido("cabelo")).toBe("Recepção");
  });
});

describe("PERFIS_DA_CRIACAO", () => {
  it("oferece só Profissional e Recepção (nunca Admin nem Somente Leitura)", () => {
    expect([...PERFIS_DA_CRIACAO]).toEqual(["Profissional", "Recepção"]);
  });
});

describe("acharPerfilId", () => {
  const perfis = [
    { id: "a", nome: "Admin" },
    { id: "r", nome: "Recepção" },
    { id: "p", nome: "Profissional" },
    { id: "s", nome: "Somente Leitura" },
  ];

  it("acha pelo nome", () => {
    expect(acharPerfilId(perfis, "Profissional")).toBe("p");
    expect(acharPerfilId(perfis, "Recepção")).toBe("r");
  });

  it("tolera acento, caixa e espaços no nome do perfil cadastrado", () => {
    expect(acharPerfilId([{ id: "r", nome: " recepcao " }], "Recepção")).toBe("r");
  });

  it("devolve null quando o perfil não existe", () => {
    expect(acharPerfilId([{ id: "a", nome: "Admin" }], "Profissional")).toBeNull();
    expect(acharPerfilId([], "Recepção")).toBeNull();
  });
});
