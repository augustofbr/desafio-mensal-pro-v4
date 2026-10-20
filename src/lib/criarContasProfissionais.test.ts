import { describe, it, expect } from "vitest";
import {
  MSG_LIMITE_EMAIL,
  classificarResultado,
  contarResultados,
  normalizarLinha,
  resumoDoLote,
  selecaoInicial,
  separarParaConfirmacao,
  type LinhaSemConta,
  type ResultadoCriacao,
} from "./criarContasProfissionais";

const linha = (over: Partial<LinhaSemConta> = {}): LinhaSemConta => ({
  profissionalId: 1,
  nome_profissional: "Ana Souza",
  apelido: "Ana",
  categoria: "Cabelo",
  email: "ana@x.com",
  ja_tem_login: false,
  vincula_automatico: true,
  ...over,
});

describe("normalizarLinha", () => {
  it("passa os campos e trata o que faltar de forma conservadora", () => {
    const l = normalizarLinha({ profissionalId: 7, nome_profissional: "B", email: "b@x.com" });
    expect(l.apelido).toBeNull();
    expect(l.categoria).toBeNull();
    // sem a informação, assume que já tem login (desmarcada) e que NÃO liga
    expect(l.ja_tem_login).toBe(true);
    expect(l.vincula_automatico).toBe(false);
  });

  it("respeita os booleanos quando vêm", () => {
    const l = normalizarLinha({ ...linha(), ja_tem_login: false, vincula_automatico: true });
    expect(l.ja_tem_login).toBe(false);
    expect(l.vincula_automatico).toBe(true);
  });
});

describe("selecaoInicial", () => {
  it("marca quem não tem login em outro app e desmarca quem tem", () => {
    const linhas = [
      linha({ profissionalId: 1 }),
      linha({ profissionalId: 2, ja_tem_login: true }),
      linha({ profissionalId: 3 }),
    ];
    expect([...selecaoInicial(linhas)].sort()).toEqual([1, 3]);
  });

  it("lista vazia dá seleção vazia", () => {
    expect(selecaoInicial([]).size).toBe(0);
  });
});

describe("separarParaConfirmacao", () => {
  it("separa as novas das que já têm login em outro app, só entre as marcadas", () => {
    const linhas = [
      linha({ profissionalId: 1 }),
      linha({ profissionalId: 2, ja_tem_login: true }),
      linha({ profissionalId: 3 }),
      linha({ profissionalId: 4, ja_tem_login: true }),
    ];
    const r = separarParaConfirmacao(linhas, new Set([1, 2, 3]));
    expect(r.novas.map((l) => l.profissionalId)).toEqual([1, 3]);
    expect(r.existentes.map((l) => l.profissionalId)).toEqual([2]);
  });
});

describe("classificarResultado", () => {
  it("convite enviado quando a conta não existia", () => {
    expect(classificarResultado({ ok: true, data: { jaTinhaConta: false } }).tipo).toBe("convite");
    expect(classificarResultado({ ok: true }).tipo).toBe("convite");
  });

  it("já tinha conta, acesso liberado", () => {
    const r = classificarResultado({ ok: true, data: { jaTinhaConta: true } });
    expect(r.tipo).toBe("ja_tinha_conta");
    expect(r.mensagem).toBe("já tinha conta, acesso liberado");
  });

  it("erro de rate limit vira a mensagem do limite de e-mails", () => {
    for (const e of [
      "Convite falhou: email rate limit exceeded",
      "Convite falhou: over_email_send_rate_limit",
      "Convite falhou: For security purposes, you can only request this after 60 seconds. Rate limit",
      "Convite falhou: Too many requests",
    ]) {
      const r = classificarResultado({ ok: false, error: e });
      expect(r.tipo).toBe("limite_email");
      expect(r.mensagem).toBe(MSG_LIMITE_EMAIL);
    }
    expect(MSG_LIMITE_EMAIL).toBe("Limite de e-mails do Supabase atingido. Tente as restantes mais tarde.");
  });

  it("outro erro mantém a mensagem original", () => {
    const r = classificarResultado({ ok: false, error: "Este email já é usuário do sistema." });
    expect(r.tipo).toBe("erro");
    expect(r.mensagem).toBe("Este email já é usuário do sistema.");
  });
});

describe("contarResultados / resumoDoLote", () => {
  const rs: ResultadoCriacao[] = [
    { tipo: "convite", mensagem: "" },
    { tipo: "convite", mensagem: "" },
    { tipo: "ja_tinha_conta", mensagem: "" },
    { tipo: "limite_email", mensagem: "" },
    { tipo: "erro", mensagem: "x" },
  ];

  it("conta criadas, já tinham conta e falhas (limite e erro somam em falhas)", () => {
    expect(contarResultados(rs)).toEqual({ criadas: 2, jaTinham: 1, falhas: 2 });
  });

  it("resumo em texto", () => {
    expect(resumoDoLote({ criadas: 2, jaTinham: 1, falhas: 2 })).toBe(
      "2 criadas, 1 já tinha conta, 2 com falha.",
    );
    expect(resumoDoLote({ criadas: 1, jaTinham: 0, falhas: 0 })).toBe(
      "1 criada, 0 já tinham conta, 0 com falha.",
    );
  });
});
