import { describe, it, expect } from "vitest";
import {
  MOTIVO_MAX,
  LIMITE_IDS_MOTIVOS,
  normalizarMotivo,
  erroDoMotivo,
  idsParaMotivos,
  mapaDeMotivos,
  motivoParaProfissional,
  SEM_MOTIVO_REGISTRADO,
} from "./motivoRecusa";

describe("normalizarMotivo", () => {
  it("apara os espacos das pontas e preserva os do meio", () => {
    expect(normalizarMotivo("  Nome não confere \n")).toBe("Nome não confere");
    expect(normalizarMotivo("duas  palavras")).toBe("duas  palavras");
  });
  it("null e undefined viram string vazia", () => {
    expect(normalizarMotivo(null)).toBe("");
    expect(normalizarMotivo(undefined)).toBe("");
  });
});

describe("erroDoMotivo", () => {
  it("vazio, so espacos e so quebras de linha sao erro", () => {
    expect(erroDoMotivo("")).toBe("Informe o motivo da recusa.");
    expect(erroDoMotivo("   ")).toBe("Informe o motivo da recusa.");
    expect(erroDoMotivo("\n\t ")).toBe("Informe o motivo da recusa.");
    expect(erroDoMotivo(null)).toBe("Informe o motivo da recusa.");
  });
  it("texto normal passa", () => {
    expect(erroDoMotivo("Cliente não encontrada no Trinks")).toBeNull();
  });
  it("exatamente 500 caracteres passa; 501 nao", () => {
    expect(erroDoMotivo("a".repeat(MOTIVO_MAX))).toBeNull();
    expect(erroDoMotivo("a".repeat(MOTIVO_MAX + 1))).toBe(
      "O motivo pode ter no máximo 500 caracteres.",
    );
  });
  it("o limite vale depois do trim (espacos nas pontas nao contam)", () => {
    expect(erroDoMotivo(`  ${"a".repeat(MOTIVO_MAX)}  `)).toBeNull();
  });
});

describe("idsParaMotivos", () => {
  it("lista pequena passa inteira", () => {
    expect(idsParaMotivos(["a", "b"])).toEqual(["a", "b"]);
  });
  it("corta no teto da RPC", () => {
    const ids = Array.from({ length: LIMITE_IDS_MOTIVOS + 20 }, (_, i) => String(i));
    expect(idsParaMotivos(ids)).toHaveLength(LIMITE_IDS_MOTIVOS);
  });
});

describe("mapaDeMotivos", () => {
  it("guarda o motivo por id; legado (null ou so espacos) fica null, mas presente", () => {
    const mapa = mapaDeMotivos([
      { id: "1", motivo_recusa: " Duplicada " },
      { id: "2", motivo_recusa: null },
      { id: "3", motivo_recusa: "   " },
    ]);
    expect(mapa.get("1")).toBe("Duplicada");
    expect(mapa.has("2")).toBe(true);
    expect(mapa.get("2")).toBeNull();
    expect(mapa.get("3")).toBeNull();
  });
  it("id que a RPC nao devolveu nao esta no mapa", () => {
    expect(mapaDeMotivos([{ id: "1", motivo_recusa: "x" }]).has("9")).toBe(false);
  });
  it("resposta nula vira mapa vazio", () => {
    expect(mapaDeMotivos(null).size).toBe(0);
  });
});

describe("motivoParaProfissional", () => {
  it("só mostra motivo nas recusadas", () => {
    expect(motivoParaProfissional("pendente", "x")).toBeNull();
    expect(motivoParaProfissional("aprovada", "x")).toBeNull();
    expect(motivoParaProfissional("rejeitada", " Duplicada ")).toBe("Duplicada");
  });
  it("recusa legada (null ou só espaços) mostra 'Sem motivo registrado'", () => {
    expect(motivoParaProfissional("rejeitada", null)).toBe(SEM_MOTIVO_REGISTRADO);
    expect(motivoParaProfissional("rejeitada", "   ")).toBe(SEM_MOTIVO_REGISTRADO);
    expect(motivoParaProfissional("rejeitada", undefined)).toBe("Sem motivo registrado");
  });
});
