import { PROF_CATEGORIES, isCategoryActive } from "./categoryDisplayNames";
import { getCategoryRules, type CategoryRules, type RulesVersion } from "./rulesConfig";
import { normalizeProfessionalId } from "./scoring";

/**
 * "Bonus Estrelas": um EXTRA em R$ por estrela Google aprovada, separado do
 * ranking e da pontuacao. Funcoes puras (sem React, sem Supabase).
 *
 * Atribuicao de mes: igual ao `useStarsData` — a estrela vale no mes do
 * `data_hora_cadastro` (fuso America/Manaus), nao no mes da aprovacao.
 */

/** Categorias que podem ter bonus, na ordem de exibicao do app. */
export const CATEGORIAS_BONUS: string[] = [
  PROF_CATEGORIES.CABELO,
  PROF_CATEGORIES.UNHAS,
  PROF_CATEGORIES.ESTETICA,
  PROF_CATEGORIES.MAQUIAGEM,
];

/** Subconjunto de `ProfissionalAtivo` que o calculo precisa. */
export interface ProfissionalParaBonus {
  profissionalId: number | string;
  nome_profissional: string | null;
  apelido?: string | null;
  categoria: string | null;
  ativo?: boolean | null;
}

export interface ElegivelBonus {
  /** profissionalId normalizado (mesma chave de `useStarsData`). */
  id: string;
  nome: string;
  categoria: string;
  /** R$ por estrela aprovada, ja resolvido pela categoria no mes. Sempre > 0. */
  valorPorEstrela: number;
}

export interface LinhaBonus extends ElegivelBonus {
  aprovadas: number;
  pendentes: number;
  /** R$ acumulado (aprovadas x valor), arredondado em centavos. */
  valor: number;
  /** R$ que as pendentes valeriam se fossem aprovadas. */
  valorPendente: number;
}

export interface ResultadoBonus {
  /** Quem tem >= 1 aprovada: valor desc, depois estrelas desc e nome. */
  ranking: LinhaBonus[];
  /** Elegiveis sem nenhuma aprovada no periodo. */
  semEstrela: number;
  /** Linha de qualquer elegivel (inclusive com 0 aprovadas), por id. */
  porId: Map<string, LinhaBonus>;
}

/** Valor do bonus de uma categoria no mes; 0 quando nao ha bonus. */
export function valorPorEstrelaDaCategoria(
  rules: RulesVersion | null | undefined,
  categoria: string | null | undefined
): number {
  const nome = categoria?.trim();
  if (!rules || !nome || !CATEGORIAS_BONUS.includes(nome)) return 0;
  // Categoria desativada no mes (ou fora do dashboard) nao participa.
  if (!isCategoryActive(rules, nome)) return 0;
  const regras: CategoryRules | undefined = getCategoryRules(rules, nome);
  const valor = regras?.starBonusValue;
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? valor : 0;
}

/** Categorias ATIVAS no mes com bonus > 0, com o respectivo valor. */
export function valoresPorCategoria(
  rules: RulesVersion | null | undefined
): { categoria: string; valor: number }[] {
  return CATEGORIAS_BONUS.map((categoria) => ({
    categoria,
    valor: valorPorEstrelaDaCategoria(rules, categoria),
  })).filter((item) => item.valor > 0);
}

/** A area so aparece se alguma categoria ativa do mes tiver bonus. */
export function bonusDisponivel(rules: RulesVersion | null | undefined): boolean {
  return valoresPorCategoria(rules).length > 0;
}

/**
 * Valor unico por estrela quando todas as categorias com bonus pagam o mesmo;
 * null quando diferem (ou quando nao ha bonus) — a tela mostra por linha.
 */
export function valorUnicoPorEstrela(
  rules: RulesVersion | null | undefined
): number | null {
  const valores = new Set(valoresPorCategoria(rules).map((item) => item.valor));
  if (valores.size !== 1) return null;
  return [...valores][0];
}

/** Apelido quando existe; o nome completo e o fallback. So exibicao. */
export function nomeExibicaoBonus(prof: ProfissionalParaBonus): string {
  const apelido = prof.apelido?.trim();
  if (apelido) return apelido;
  const nome = prof.nome_profissional?.trim();
  if (nome) return nome;
  return `Profissional ${prof.profissionalId}`;
}

/**
 * Quem participa do bonus: profissional ativo (`ativo` nao e false), com id,
 * categoria preenchida, categoria ATIVA no mes e bonus > 0 nas regras do mes.
 */
export function profissionaisElegiveis(
  ativos: ProfissionalParaBonus[],
  rules: RulesVersion | null | undefined
): ElegivelBonus[] {
  const resultado: ElegivelBonus[] = [];
  for (const prof of ativos) {
    if (prof.ativo === false) continue;
    const id = normalizeProfessionalId(prof.profissionalId);
    const categoria = prof.categoria?.trim();
    if (!id || !categoria) continue;
    const valorPorEstrela = valorPorEstrelaDaCategoria(rules, categoria);
    if (valorPorEstrela <= 0) continue;
    resultado.push({ id, nome: nomeExibicaoBonus(prof), categoria, valorPorEstrela });
  }
  return resultado;
}

/** Elegibilidade de um unico profissional (ex.: o perfil escolhido). */
export function ehElegivel(
  prof: ProfissionalParaBonus | null | undefined,
  rules: RulesVersion | null | undefined
): boolean {
  if (!prof) return false;
  return profissionaisElegiveis([prof], rules).length === 1;
}

/** Junta varios mapas id -> contagem (um por categoria) num so Record. */
export function juntarContagens(
  mapas: ReadonlyMap<string, number>[]
): Record<string, number> {
  const total: Record<string, number> = {};
  for (const mapa of mapas) {
    mapa.forEach((qtd, chave) => {
      const id = normalizeProfessionalId(chave);
      if (!id) return;
      total[id] = (total[id] ?? 0) + qtd;
    });
  }
  return total;
}

/** Arredonda em centavos para o float nao vazar (ex.: 0.1 x 3). */
function emCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function contagem(origem: Record<string, number>, id: string): number {
  const qtd = origem[id];
  return typeof qtd === "number" && Number.isFinite(qtd) && qtd > 0 ? Math.floor(qtd) : 0;
}

/**
 * Ordem do ranking do bonus: por VALOR em R$ (desc), depois estrelas aprovadas
 * (desc) e por fim nome. Ordenar por valor — e nao por estrelas — evita que
 * quem recebe menos apareca acima de quem recebe mais quando as categorias
 * pagam valores diferentes por estrela.
 */
export function compararPorValorEstrelasENome(a: LinhaBonus, b: LinhaBonus): number {
  if (b.valor !== a.valor) return b.valor - a.valor;
  if (b.aprovadas !== a.aprovadas) return b.aprovadas - a.aprovadas;
  return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
}

/**
 * Valor por profissional + ranking. Contagens de quem nao e elegivel sao
 * ignoradas (nunca entram no ranking nem em "sem estrela").
 */
export function calcularBonus(
  elegiveis: ElegivelBonus[],
  aprovadasPorId: Record<string, number>,
  pendentesPorId: Record<string, number> = {}
): ResultadoBonus {
  const porId = new Map<string, LinhaBonus>();
  for (const elegivel of elegiveis) {
    const aprovadas = contagem(aprovadasPorId, elegivel.id);
    const pendentes = contagem(pendentesPorId, elegivel.id);
    porId.set(elegivel.id, {
      ...elegivel,
      aprovadas,
      pendentes,
      valor: emCentavos(aprovadas * elegivel.valorPorEstrela),
      valorPendente: emCentavos(pendentes * elegivel.valorPorEstrela),
    });
  }
  const linhas = [...porId.values()];
  const ranking = linhas.filter((l) => l.aprovadas > 0).sort(compararPorValorEstrelasENome);
  return { ranking, semEstrela: linhas.length - ranking.length, porId };
}

/** "R$ 25,00" (espaco comum, nao o NBSP do Intl — estavel em teste e copia). */
export function formatarBRL(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(valor)
    .replace(/\s/g, " ");
}

/** "R$ 5" quando inteiro (selo compacto), senao "R$ 2,50". */
export function formatarBRLCompacto(valor: number): string {
  return Number.isInteger(valor) ? `R$ ${valor}` : formatarBRL(valor);
}

function somarUmDia(dia: string): string {
  const base = new Date(`${dia}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + 1);
  return base.toISOString().slice(0, 10);
}

/**
 * Limites para o filtro do servidor, equivalentes ao filtro de `useStarsData`
 * (dia em Manaus entre startDate e endDate, ambos inclusivos): `inicioISO`
 * INCLUSIVO (`.gte`) e `fimISO` EXCLUSIVO (`.lt`), meia-noite de Manaus
 * (-04:00 fixo, sem horario de verao desde 2008). Null se as datas forem
 * invalidas (filtro personalizado ainda incompleto).
 */
export function limitesDoPeriodoISO(
  startDate: string,
  endDate: string
): { inicioISO: string; fimISO: string } | null {
  const valido = /^\d{4}-\d{2}-\d{2}$/;
  if (!valido.test(startDate) || !valido.test(endDate) || startDate > endDate) return null;
  return {
    inicioISO: new Date(`${startDate}T00:00:00-04:00`).toISOString(),
    fimISO: new Date(`${somarUmDia(endDate)}T00:00:00-04:00`).toISOString(),
  };
}

/** "2026-10-01" -> "outubro de 2026". Vazio se a data for invalida. */
export function nomeDoMes(startDate: string): string {
  const [ano, mes] = startDate.split("-").map(Number);
  if (!ano || !mes || mes < 1 || mes > 12) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(ano, mes - 1, 1)));
}

/** O periodo ja acabou? `hoje` e "YYYY-MM-DD" em Manaus (injetado p/ teste). */
export function periodoEncerrado(endDate: string, hoje: string): boolean {
  return Boolean(endDate) && hoje > endDate;
}
