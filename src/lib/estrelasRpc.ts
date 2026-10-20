import type { AvaliacaoAprovada } from "./estrelasPorCategoria";

/**
 * Linha de `destaque_estrelas_periodo(p_inicio, p_fim)`: aprovadas E pendentes
 * cadastradas no período (`data_hora_cadastro`), sem o nome da cliente. A RPC é
 * `authenticated` com gate `painel:read`; sem permissão devolve 0 linhas.
 */
export interface LinhaEstrelaPeriodo {
  profissional_id: number | null;
  status: string;
  data_hora_cadastro: string | null;
  data_aprovacao: string | null;
}

/**
 * Valida o retorno cru da RPC. `null` (sem linhas) vira lista vazia; qualquer
 * outra coisa que não seja lista é falha do contrato e NÃO pode virar "0
 * estrelas" em silêncio: lança para o hook expor o erro.
 */
export function linhasDaRpcEstrelas(bruto: unknown): LinhaEstrelaPeriodo[] {
  if (bruto == null) return [];
  if (!Array.isArray(bruto)) {
    throw new Error("Resposta inesperada de destaque_estrelas_periodo");
  }
  return bruto as LinhaEstrelaPeriodo[];
}

/**
 * Só conta no ranking a estrela `aprovada` COM `data_aprovacao` (mesmo critério
 * que a leitura direta aplicava; gravar só o status não pontua).
 */
export function aprovadasDoPeriodo(linhas: LinhaEstrelaPeriodo[]): AvaliacaoAprovada[] {
  return linhas
    .filter((l) => l.status === "aprovada" && l.data_aprovacao != null)
    .map((l) => ({
      profissional_id: l.profissional_id,
      data_hora_cadastro: l.data_hora_cadastro,
    }));
}

/** Pendentes por `profissional_id` (chave string), para o "aguardando aprovação" do Bônus Estrelas. */
export function pendentesPorProfissional(
  linhas: LinhaEstrelaPeriodo[]
): Record<string, number> {
  const porProfissional: Record<string, number> = {};
  for (const l of linhas) {
    if (l.status !== "pendente" || l.profissional_id == null) continue;
    const id = String(l.profissional_id);
    porProfissional[id] = (porProfissional[id] ?? 0) + 1;
  }
  return porProfissional;
}
