import type { AuthAdminResult } from "@/auth/authAdmin";

/** Linha de `destaque_profissionais_sem_conta()`. */
export type LinhaSemConta = {
  profissionalId: number;
  nome_profissional: string;
  apelido: string | null;
  categoria: string | null;
  email: string;
  /** O e-mail já é de uma conta do Auth de OUTRO app: liberar entrega o acesso a quem sabe a senha. */
  ja_tem_login: boolean;
  /** Ao criar o acesso, o trigger liga a conta à profissional. */
  vincula_automatico: boolean;
};

export const MSG_LIMITE_EMAIL =
  "Limite de e-mails do Supabase atingido. Tente as restantes mais tarde.";

/**
 * Normaliza a linha crua da RPC. Sem a informação (RPC antiga sem as colunas), o padrão é o
 * conservador: assume que já tem login em outro app (vem desmarcada) e que não liga ao cadastro.
 */
export function normalizarLinha(
  raw: Partial<LinhaSemConta> & Pick<LinhaSemConta, "profissionalId" | "nome_profissional" | "email">,
): LinhaSemConta {
  return {
    profissionalId: raw.profissionalId,
    nome_profissional: raw.nome_profissional,
    apelido: raw.apelido ?? null,
    categoria: raw.categoria ?? null,
    email: raw.email,
    ja_tem_login: raw.ja_tem_login !== false,
    vincula_automatico: raw.vincula_automatico === true,
  };
}

/** Quem vem marcada de início: só quem NÃO tem login em outro app. */
export function selecaoInicial(linhas: ReadonlyArray<LinhaSemConta>): Set<number> {
  return new Set(linhas.filter((l) => !l.ja_tem_login).map((l) => l.profissionalId));
}

/** Entre as marcadas, separa as contas novas (convite) das que já têm login em outro app. */
export function separarParaConfirmacao(
  linhas: ReadonlyArray<LinhaSemConta>,
  marcadas: ReadonlySet<number>,
): { novas: LinhaSemConta[]; existentes: LinhaSemConta[] } {
  const alvo = linhas.filter((l) => marcadas.has(l.profissionalId));
  return {
    novas: alvo.filter((l) => !l.ja_tem_login),
    existentes: alvo.filter((l) => l.ja_tem_login),
  };
}

export type ResultadoCriacao = {
  tipo: "convite" | "ja_tinha_conta" | "limite_email" | "erro";
  mensagem: string;
};

// A edge function devolve "Convite falhou: <mensagem do Auth>"; o Auth diz "email rate limit
// exceeded" / "over_email_send_rate_limit" / "Too many requests".
const RE_LIMITE_EMAIL = /rate[\s_-]?limit|over_email_send|too many (requests|emails)/i;

/** Traduz a resposta de `criar_usuario` para o resultado mostrado na linha. */
export function classificarResultado(res: AuthAdminResult): ResultadoCriacao {
  if (res.ok) {
    const jaTinhaConta = (res.data as { jaTinhaConta?: boolean } | undefined)?.jaTinhaConta === true;
    return jaTinhaConta
      ? { tipo: "ja_tinha_conta", mensagem: "já tinha conta, acesso liberado" }
      : { tipo: "convite", mensagem: "convite enviado" };
  }
  // O tsconfig do app não é strict: sem strictNullChecks o `if (res.ok)` não estreita a união.
  const erro = (res as Extract<AuthAdminResult, { ok: false }>).error;
  if (RE_LIMITE_EMAIL.test(erro)) {
    return { tipo: "limite_email", mensagem: MSG_LIMITE_EMAIL };
  }
  return { tipo: "erro", mensagem: erro };
}

export type ContagemLote = { criadas: number; jaTinham: number; falhas: number };

export function contarResultados(resultados: ReadonlyArray<ResultadoCriacao>): ContagemLote {
  const c: ContagemLote = { criadas: 0, jaTinham: 0, falhas: 0 };
  for (const r of resultados) {
    if (r.tipo === "convite") c.criadas += 1;
    else if (r.tipo === "ja_tinha_conta") c.jaTinham += 1;
    else c.falhas += 1;
  }
  return c;
}

export function resumoDoLote(c: ContagemLote): string {
  const criadas = c.criadas === 1 ? "1 criada" : `${c.criadas} criadas`;
  const jaTinham = c.jaTinham === 1 ? "1 já tinha conta" : `${c.jaTinham} já tinham conta`;
  return `${criadas}, ${jaTinham}, ${c.falhas} com falha.`;
}
