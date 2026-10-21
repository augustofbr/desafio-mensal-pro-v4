/**
 * Motivo da recusa de uma estrela (aba "Aprovacoes"). Regras puras — o banco
 * repete as duas (rejeitada sem motivo = erro 23514, motivo > 500 = check), e o
 * front so antecipa a mensagem para o botao nao ficar clicavel a toa.
 */

/** Mesmo teto da coluna `avaliacoes_cadastradas.motivo_recusa`. */
export const MOTIVO_MAX = 500;

/** A RPC `avaliacoes_motivos_recusa` aceita ate 500 ids — o teto do historico. */
export const LIMITE_IDS_MOTIVOS = 500;

/** O que vai para o banco: sem espacos nas pontas. `null`/`undefined` viram "". */
export function normalizarMotivo(texto: string | null | undefined): string {
  return (texto ?? "").trim();
}

/**
 * Mensagem de erro do texto digitado, ou `null` se serve. Vale o texto JA
 * normalizado: so espacos conta como vazio. A mensagem de "vazio" e a mesma que
 * o banco devolve no 23514.
 */
export function erroDoMotivo(texto: string | null | undefined): string | null {
  const motivo = normalizarMotivo(texto);
  if (motivo.length === 0) return "Informe o motivo da recusa.";
  if (motivo.length > MOTIVO_MAX) {
    return `O motivo pode ter no máximo ${MOTIVO_MAX} caracteres.`;
  }
  return null;
}

/** Uma linha da RPC `avaliacoes_motivos_recusa` (so devolve `rejeitada`). */
export interface MotivoRecusaLinha {
  id: string;
  motivo_recusa: string | null;
}

/**
 * Ids que vao para a RPC: so os das recusadas, ate o teto. O historico ja vem
 * limitado a `HISTORICO_LIMITE` (= 500), entao o corte e so uma garantia.
 */
export function idsParaMotivos(ids: string[]): string[] {
  return ids.slice(0, LIMITE_IDS_MOTIVOS);
}

/**
 * id -> motivo. Recusa legada (anterior a coluna) vem com `null`, e isso e
 * DIFERENTE de o id nao estar no mapa (ainda carregando, ou a RPC falhou): a
 * tela so escreve "Sem motivo registrado" para o primeiro caso.
 */
export function mapaDeMotivos(
  linhas: MotivoRecusaLinha[] | null | undefined,
): Map<string, string | null> {
  return new Map(
    (linhas ?? []).map((l) => {
      const motivo = normalizarMotivo(l.motivo_recusa);
      return [l.id, motivo === "" ? null : motivo] as const;
    }),
  );
}

/** Texto exibido para recusa legada (`motivo_recusa` NULL ou só espaços). */
export const SEM_MOTIVO_REGISTRADO = "Sem motivo registrado";

/**
 * Motivo mostrado à profissional em `/minhas-avaliacoes`: só nas recusadas
 * (`status = 'rejeitada'`); nas demais devolve `null` e a tela não mostra nada.
 */
export function motivoParaProfissional(
  status: string,
  motivo: string | null | undefined,
): string | null {
  if (status !== "rejeitada") return null;
  return normalizarMotivo(motivo) || SEM_MOTIVO_REGISTRADO;
}
