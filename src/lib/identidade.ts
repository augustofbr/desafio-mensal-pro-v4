import type { PageAccess } from "@/lib/pages";
import { normalizeProfessionalId } from "./scoring";

/** Texto mostrado a quem tem conta, mas sem profissional ligada a ela. */
export const MOTIVO_SEM_VINCULO =
  "Seu e-mail não está ligado a nenhum cadastro. Fale com a recepção.";

export interface EntradaIdentidade {
  /**
   * `profissional_id` gravado na conta (RPC `destaque_minha_profissional`), ou
   * null quando a conta não está ligada a ninguém (ou a RPC falhou).
   */
  vinculoId: number | null;
  /** Nível da página "estrelas" no perfil da conta. */
  nivelEstrelas: PageAccess;
  /** Id salvo no aparelho (`destaque.perfil.v1`) e já validado para esta conta. */
  perfilLocalId: string | null;
}

export interface Identidade {
  /** Quem a tela mostra como "você". O vínculo sempre vence o perfil local. */
  perfilId: string | null;
  /** true = identidade vem da conta: sem "Trocar", sem "limpar", sem seletor. */
  fixo: boolean;
  /** Recepção (`write`) cadastra para qualquer profissional; as demais, só para a ligada. */
  podeEscolherProfissionalNoCadastro: boolean;
  podeCadastrar: boolean;
  /** Texto para a tela quando `podeCadastrar` é false por falta de vínculo. */
  motivoBloqueio: string | null;
}

/**
 * Quem a conta é e o que ela pode fazer no cadastro de estrelas. Só decide a
 * TELA: quem cadastra para quem, de verdade, é barrado pela RLS e pelas RPCs.
 */
export function resolverIdentidade(i: EntradaIdentidade): Identidade {
  const fixo = i.vinculoId !== null;
  const local = normalizeProfessionalId(i.perfilLocalId);
  const perfilId = fixo ? String(i.vinculoId) : local;

  const temAcesso = i.nivelEstrelas !== "none";
  const recepcao = i.nivelEstrelas === "write";

  // `read` sem vínculo: a conta existe, mas não sabemos por quem cadastrar.
  const semVinculo = i.nivelEstrelas === "read" && !fixo;

  return {
    perfilId,
    fixo,
    podeEscolherProfissionalNoCadastro: recepcao,
    podeCadastrar: temAcesso && !semVinculo,
    motivoBloqueio: semVinculo ? MOTIVO_SEM_VINCULO : null,
  };
}

/**
 * Valida o que a RPC devolveu: só inteiro positivo vale como vínculo. Qualquer
 * outra coisa (null, zero, texto, lixo) é "sem vínculo".
 */
export function normalizarVinculo(bruto: unknown): number | null {
  if (typeof bruto === "string") {
    const texto = bruto.trim();
    if (!/^\d+$/.test(texto)) return null;
    return normalizarVinculo(Number(texto));
  }
  if (typeof bruto !== "number") return null;
  return Number.isSafeInteger(bruto) && bruto > 0 ? bruto : null;
}
