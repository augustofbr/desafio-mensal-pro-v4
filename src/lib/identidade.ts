import type { PageAccess } from "@/lib/pages";
import { normalizeProfessionalId } from "./scoring";

/** Texto mostrado a quem tem conta, mas sem profissional ligada a ela. */
export const MOTIVO_SEM_VINCULO =
  "Seu e-mail não está ligado a nenhum cadastro. Fale com a recepção.";

/** A RPC do vínculo falhou: não dá para saber se a conta está ligada. Não é culpa da conta. */
export const MOTIVO_ERRO_VINCULO = "Não foi possível verificar seu cadastro. Recarregue a página.";

/** Conta ligada a uma profissional que não aparece no desafio nem no Bônus Estrelas do mês. */
export const MOTIVO_FORA_DO_DESAFIO =
  "Você não participa do desafio nem do Bônus Estrelas neste mês.";

export interface EntradaIdentidade {
  /**
   * `profissional_id` gravado na conta (RPC `destaque_minha_profissional`), ou
   * null quando a conta não está ligada a ninguém (ou a RPC falhou).
   */
  vinculoId: number | null;
  /**
   * A leitura do vínculo falhou (a RPC deu erro). Opcional: ausente = false.
   * Diferente de "sem vínculo": a tela não pode dizer que o e-mail não está ligado.
   */
  vinculoErro?: boolean;
  /**
   * A profissional ligada aparece nas listas do mês (`profissionaisSelecionaveis`
   * com as regras do mês atual). Opcional: undefined = ainda não se sabe, não bloqueia.
   * Só barra quem tem `read`; `write` segue a lista normal.
   */
  vinculoSelecionavel?: boolean;
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
 * Regra única do perfil exibido: o vínculo da conta vence o perfil local do
 * aparelho e torna a identidade fixa.
 */
export function escolherPerfilId(
  vinculoId: number | null,
  perfilLocalId: string | null
): { perfilId: string | null; fixo: boolean } {
  if (vinculoId !== null) return { perfilId: String(vinculoId), fixo: true };
  return { perfilId: normalizeProfessionalId(perfilLocalId), fixo: false };
}

/**
 * Quem a conta é e o que ela pode fazer no cadastro de estrelas. Só decide a
 * TELA: quem cadastra para quem, de verdade, é barrado pela RLS e pelas RPCs.
 */
export function resolverIdentidade(i: EntradaIdentidade): Identidade {
  const { perfilId, fixo } = escolherPerfilId(i.vinculoId, i.perfilLocalId);

  const temAcesso = i.nivelEstrelas !== "none";
  const recepcao = i.nivelEstrelas === "write";
  const soLeitura = i.nivelEstrelas === "read";

  // `read` depende do vínculo para saber por quem cadastrar; `write` não.
  let motivoBloqueio: string | null = null;
  if (soLeitura) {
    if (!fixo) {
      motivoBloqueio = i.vinculoErro ? MOTIVO_ERRO_VINCULO : MOTIVO_SEM_VINCULO;
    } else if (i.vinculoSelecionavel === false) {
      motivoBloqueio = MOTIVO_FORA_DO_DESAFIO;
    }
  }

  return {
    perfilId,
    fixo,
    podeEscolherProfissionalNoCadastro: recepcao,
    podeCadastrar: temAcesso && motivoBloqueio === null,
    motivoBloqueio,
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

/** Como `/minhas-avaliacoes` se comporta para a conta (decide a TELA; a RPC é o gate real). */
export type ModoMinhasAvaliacoes =
  | { tipo: "sem_acesso" }
  | { tipo: "seletor" }
  | { tipo: "fixo"; profissionalId: number }
  | { tipo: "bloqueado"; mensagem: string };

/**
 * - `none`: perfil sem a página "estrelas" — não há lista.
 * - `write` (recepção): seletor livre; a RPC aceita qualquer id.
 * - `read`: só a profissional ligada à conta. Sem vínculo (conta sem ligação, RPC do
 *   vínculo com erro ou profissional inativa) ou com `motivoBloqueio`, a RPC devolveria 0
 *   linhas para qualquer outro id e a tela diria "Nenhuma avaliação" por engano: então
 *   fica bloqueado, sem seletor e sem chamar a RPC, só com a mensagem.
 */
export function modoMinhasAvaliacoes(i: {
  nivelEstrelas: PageAccess;
  vinculoId: number | null;
  motivoBloqueio: string | null;
}): ModoMinhasAvaliacoes {
  if (i.nivelEstrelas === "none") return { tipo: "sem_acesso" };
  if (i.nivelEstrelas === "write") return { tipo: "seletor" };
  if (i.motivoBloqueio) return { tipo: "bloqueado", mensagem: i.motivoBloqueio };
  if (i.vinculoId === null) return { tipo: "bloqueado", mensagem: MOTIVO_SEM_VINCULO };
  return { tipo: "fixo", profissionalId: i.vinculoId };
}
