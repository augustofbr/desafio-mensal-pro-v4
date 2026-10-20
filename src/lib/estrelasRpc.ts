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

export const ERRO_PERIODO_LONGO = "Há estrelas demais para carregar neste período.";

/**
 * Erro do teto de linhas. Tipo próprio para a tela distinguir "período longo
 * demais" das demais falhas sem comparar texto.
 */
export class PeriodoLongoError extends Error {
  readonly codigo = "periodo_longo" as const;
  constructor() {
    super(ERRO_PERIODO_LONGO);
    this.name = "PeriodoLongoError";
  }
}

/** Tipo da falha de leitura das estrelas: o teto de linhas ou qualquer outra. */
export type TipoErroEstrelas = "periodo_longo" | "generico";

export function tipoDoErroEstrelas(erro: unknown): TipoErroEstrelas {
  return erro instanceof PeriodoLongoError ? "periodo_longo" : "generico";
}

/** Aviso da home quando as estrelas não carregaram (a pontuação aparece sem elas). */
export const AVISO_ESTRELAS_PERIODO_LONGO =
  "O período escolhido é longo demais para carregar as estrelas; a pontuação está sem elas. Escolha um intervalo menor.";
export const AVISO_ESTRELAS_GENERICO =
  "Não foi possível carregar as estrelas; a pontuação pode estar incompleta. Recarregue a página.";

export function avisoDoErroEstrelas(tipo: TipoErroEstrelas): string {
  return tipo === "periodo_longo" ? AVISO_ESTRELAS_PERIODO_LONGO : AVISO_ESTRELAS_GENERICO;
}

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
    throw new PeriodoLongoError();
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
