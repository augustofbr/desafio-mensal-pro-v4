import { describe, expect, it } from "vitest";
import { interpretarAcesso } from "./interpretarAcesso";

const USER = "00000000-0000-0000-0000-000000000001";

function linha(over: Record<string, unknown> = {}) {
  return {
    id: USER,
    nome: "Pessoa",
    ativo: true,
    perfil_id: "perfil-1",
    destaque_perfis: { id: "perfil-1", nome: "Recepção", paginas: { painel: "read", estrelas: "write", admin: "x" } },
    ...over,
  };
}

describe("interpretarAcesso: erro de consulta × ausência legítima", () => {
  it("qualquer error do Supabase → erro (não é acesso removido)", () => {
    expect(interpretarAcesso(USER, "a@b.com", null, { message: "Failed to fetch" })).toEqual({ tipo: "erro" });
  });

  it("error vence mesmo se vier data junto", () => {
    expect(interpretarAcesso(USER, "a@b.com", linha(), { message: "timeout" })).toEqual({ tipo: "erro" });
  });

  it("sem linha → ausente", () => {
    expect(interpretarAcesso(USER, "a@b.com", null, null)).toEqual({ tipo: "ausente" });
  });

  it("inativo → ausente", () => {
    expect(interpretarAcesso(USER, "a@b.com", linha({ ativo: false }), null)).toEqual({ tipo: "ausente" });
  });

  it("perfil sumido → ausente", () => {
    expect(interpretarAcesso(USER, "a@b.com", linha({ destaque_perfis: null }), null)).toEqual({ tipo: "ausente" });
    expect(interpretarAcesso(USER, "a@b.com", linha({ destaque_perfis: [] }), null)).toEqual({ tipo: "ausente" });
  });

  it("linha válida → ok, com toda chave do registry e valor desconhecido virando none", () => {
    const r = interpretarAcesso(USER, "a@b.com", linha(), null);
    expect(r.tipo).toBe("ok");
    if (r.tipo !== "ok") return;
    expect(r.acesso).toEqual({
      userId: USER,
      email: "a@b.com",
      nome: "Pessoa",
      perfilId: "perfil-1",
      perfilNome: "Recepção",
      paginas: { painel: "read", estrelas: "write", admin: "none", usuarios: "none" },
    });
  });

  it("perfil embutido como array (forma do PostgREST) → usa o primeiro", () => {
    const r = interpretarAcesso(USER, "a@b.com", linha({
      destaque_perfis: [{ id: "p2", nome: "Admin", paginas: { usuarios: "write" } }],
    }), null);
    expect(r.tipo === "ok" && r.acesso.paginas.usuarios).toBe("write");
  });
});
