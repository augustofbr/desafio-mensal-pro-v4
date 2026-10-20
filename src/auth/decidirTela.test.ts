import { describe, expect, it } from "vitest";
import { decidirTela } from "./decidirTela";
import type { Acesso } from "./acesso";
import type { PageAccess, PageKey } from "@/lib/pages";

function acessoCom(paginas: Partial<Record<PageKey, PageAccess>>): Acesso {
  return {
    userId: "00000000-0000-0000-0000-000000000001",
    email: "pessoa@exemplo.com",
    nome: "Pessoa",
    perfilId: "perfil-1",
    perfilNome: "Perfil",
    paginas: {
      painel: "none",
      estrelas: "none",
      admin: "none",
      usuarios: "none",
      ...paginas,
    },
  };
}

describe("decidirTela", () => {
  it("loading → carregando", () => {
    expect(decidirTela({ loading: true, temSessao: false, acesso: null, chave: "painel" })).toBe("carregando");
  });

  it("sem sessão → login", () => {
    expect(decidirTela({ loading: false, temSessao: false, acesso: null, chave: "painel" })).toBe("login");
  });

  it("sessão + acesso null → removido", () => {
    expect(decidirTela({ loading: false, temSessao: true, acesso: null, chave: "painel" })).toBe("removido");
  });

  it("acesso com painel:none → sem_acesso", () => {
    const acesso = acessoCom({ painel: "none", admin: "read" });
    expect(decidirTela({ loading: false, temSessao: true, acesso, chave: "painel" })).toBe("sem_acesso");
  });

  it("acesso com painel:read → ok", () => {
    const acesso = acessoCom({ painel: "read" });
    expect(decidirTela({ loading: false, temSessao: true, acesso, chave: "painel" })).toBe("ok");
  });

  it("acesso com write também → ok", () => {
    const acesso = acessoCom({ admin: "write" });
    expect(decidirTela({ loading: false, temSessao: true, acesso, chave: "admin" })).toBe("ok");
  });

  it("a chave consultada é a pedida, não outra", () => {
    const acesso = acessoCom({ painel: "read", usuarios: "none" });
    expect(decidirTela({ loading: false, temSessao: true, acesso, chave: "usuarios" })).toBe("sem_acesso");
  });

  it("sem sessão nunca libera, mesmo com um acesso velho no estado", () => {
    const acesso = acessoCom({ painel: "write" });
    expect(decidirTela({ loading: false, temSessao: false, acesso, chave: "painel" })).toBe("login");
  });

  it("loading tem precedência sobre todo o resto", () => {
    const comAcesso = acessoCom({ painel: "read" });
    const semPainel = acessoCom({ painel: "none" });
    expect(decidirTela({ loading: true, temSessao: true, acesso: comAcesso, chave: "painel" })).toBe("carregando");
    expect(decidirTela({ loading: true, temSessao: true, acesso: null, chave: "painel" })).toBe("carregando");
    expect(decidirTela({ loading: true, temSessao: true, acesso: semPainel, chave: "painel" })).toBe("carregando");
    expect(decidirTela({ loading: true, temSessao: false, acesso: comAcesso, chave: "painel" })).toBe("carregando");
  });
});
