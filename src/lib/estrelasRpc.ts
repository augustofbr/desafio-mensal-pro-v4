import type { AvaliacaoAprovada } from "./estrelasPorCategoria";

/**
 * Linha de `destaque_estrelas_periodo(p_inicio, p_fim)`: aprovadas E pendentes
 * cadastradas no período (`data_hora_cadastro`), sem o nome da cliente. A RPC é
 * `authenticated` com gate `painel:read`; sem permissão devolve 0 linhas.
 */
export interface LinhaEstrelaPeriodo {
  profissional_id: number;
  status: string;
  data_hora_cadastro: string | null;
  data_aprovacao: string | null;
}

/**
 * Teto de linhas do PostgREST (`max-rows`). Uma resposta com este tamanho (ou
 * mais) pode estar TRUNCADA, e contar estrelas sobre ela erraria o ranking em
 * silêncio: é tratada como falha.
 */
export const LIMITE_LINHAS_RPC = 1000;

export const ERRO_PERIODO_LONGO =
  "Período longo demais para carregar as estrelas. Escolha um intervalo menor.";

/**
 * Valida o retorno cru da RPC. `null` (sem linhas) vira lista vazia. Lança (e o
 * hook expõe como erro, nunca como "0 estrelas") quando: não é lista; tem
 * `LIMITE_LINHAS_RPC` linhas ou mais (possível truncamento); ou alguma linha
 * foge do formato (`status` string, `profissional_id` inteiro).
 */
export function linhasDaRpcEstrelas(bruto: unknown): LinhaEstrelaPeriodo[] {
  if (bruto == null) return [];
  if (!Array.isArray(bruto)) {
    throw new Error("Resposta inesperada de destaque_estrelas_periodo");
  }
  if (bruto.length >= LIMITE_LINHAS_RPC) {
    throw new Error(ERRO_PERIODO_LONGO);
  }
  for (const l of bruto) {
    if (
      l === null ||
      typeof l !== "object" ||
      typeof (l as { status?: unknown }).status !== "string" ||
      !Number.isInteger((l as { profissional_id?: unknown }).profissional_id)
    ) {
      throw new Error("Linha inesperada em destaque_estrelas_periodo");
    }
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
    if (l.status !== "pendente") continue;
    const id = String(l.profissional_id);
    porProfissional[id] = (porProfissional[id] ?? 0) + 1;
  }
  return porProfissional;
}
