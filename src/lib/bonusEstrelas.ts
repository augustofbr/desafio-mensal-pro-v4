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
  /**
   * Categoria ATIVA do desafio no mes, ou null para quem participa so do bonus
   * (via `star_bonus_extra`) — a tela mostra "Bônus Estrelas" no lugar.
   */
  categoria: string | null;
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

/** Extras do mes ja validados: valor por estrela + ids normalizados. */
export interface ExtrasBonus {
  valorPorEstrela: number;
  ids: Set<string>;
}

/**
 * `star_bonus_extra` da regra do mes, validado: valor finito > 0 e ids
 * inteiros positivos. Ids invalidos sao descartados um a um; valor invalido,
 * lista ausente ou sem nenhum id valido = null (sem extras). O JSONB vem do
 * banco sem garantia de forma, entao nada aqui confia no tipo declarado.
 */
export function extrasDoBonus(rules: RulesVersion | null | undefined): ExtrasBonus | null {
  const bruto: unknown = rules?.starBonusExtra;
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const { valuePerStar, profissionalIds } = bruto as Record<string, unknown>;
  if (typeof valuePerStar !== "number" || !Number.isFinite(valuePerStar) || valuePerStar <= 0) {
    return null;
  }
  if (!Array.isArray(profissionalIds)) return null;
  const ids = new Set<string>();
  for (const item of profissionalIds) {
    if (typeof item === "number" && Number.isSafeInteger(item) && item > 0) ids.add(String(item));
  }
  if (ids.size === 0) return null;
  return { valorPorEstrela: valuePerStar, ids };
}

/** Categoria do profissional, se ela estiver ATIVA no desafio do mes; senao null. */
function categoriaAtivaNoMes(
  rules: RulesVersion | null | undefined,
  categoria: string | null | undefined
): string | null {
  const nome = categoria?.trim();
  if (!nome || !CATEGORIAS_BONUS.includes(nome)) return null;
  return isCategoryActive(rules, nome) ? nome : null;
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

/**
 * A area aparece se alguma categoria ativa do mes tiver bonus OU se o mes
 * tiver extras validos (profissionais so do bonus).
 */
export function bonusDisponivel(rules: RulesVersion | null | undefined): boolean {
  return valoresPorCategoria(rules).length > 0 || extrasDoBonus(rules) !== null;
}

/**
 * Valor unico por estrela quando todas as categorias com bonus (e os extras,
 * se houver) pagam o mesmo; null quando diferem (ou quando nao ha bonus) — a
 * tela mostra por linha.
 */
export function valorUnicoPorEstrela(
  rules: RulesVersion | null | undefined
): number | null {
  const valores = new Set(valoresPorCategoria(rules).map((item) => item.valor));
  const extras = extrasDoBonus(rules);
  if (extras) valores.add(extras.valorPorEstrela);
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
 * Quem participa do bonus: profissional ativo (`ativo` nao e false), com id e
 *  - categoria ATIVA no mes com bonus > 0 (valor da categoria), ou
 *  - id listado nos extras do mes (`star_bonus_extra`), com o valor dos extras.
 * A regra da categoria tem precedencia: um id extra que tambem esta numa
 * categoria ativa com bonus entra UMA vez, com o valor da categoria.
 */
export function profissionaisElegiveis(
  ativos: ProfissionalParaBonus[],
  rules: RulesVersion | null | undefined
): ElegivelBonus[] {
  const extras = extrasDoBonus(rules);
  const resultado: ElegivelBonus[] = [];
  const vistos = new Set<string>();
  for (const prof of ativos) {
    if (prof.ativo === false) continue;
    const id = normalizeProfessionalId(prof.profissionalId);
    if (!id || vistos.has(id)) continue;
    const nome = nomeExibicaoBonus(prof);
    const valorDaCategoria = valorPorEstrelaDaCategoria(rules, prof.categoria);
    if (valorDaCategoria > 0) {
      vistos.add(id);
      resultado.push({
        id,
        nome,
        categoria: prof.categoria!.trim(),
        valorPorEstrela: valorDaCategoria,
      });
      continue;
    }
    if (extras?.ids.has(id)) {
      vistos.add(id);
      resultado.push({
        id,
        nome,
        categoria: categoriaAtivaNoMes(rules, prof.categoria),
        valorPorEstrela: extras.valorPorEstrela,
      });
    }
  }
  return resultado;
}

/**
 * Participa SO do Bonus Estrelas no mes: elegivel via extras e sem categoria
 * ativa no desafio. E quem nao tem metas/posicao no cartao pessoal.
 */
export function participaSoDoBonus(
  prof: ProfissionalParaBonus | null | undefined,
  rules: RulesVersion | null | undefined
): boolean {
  if (!prof) return false;
  const [elegivel] = profissionaisElegiveis([prof], rules);
  return Boolean(elegivel) && elegivel.categoria === null;
}

/** Todos os que participam so do bonus no mes (para seletor e regras). */
export function profissionaisSoDoBonus<T extends ProfissionalParaBonus>(
  ativos: T[],
  rules: RulesVersion | null | undefined
): T[] {
  return ativos.filter((prof) => participaSoDoBonus(prof, rules));
}

/** Elegibilidade de um unico profissional (ex.: o perfil escolhido). */
export function ehElegivel(
  prof: ProfissionalParaBonus | null | undefined,
  rules: RulesVersion | null | undefined
): boolean {
  if (!prof) return false;
  return profissionaisElegiveis([prof], rules).length === 1;
}

/** "Ana", "Ana e Bia", "Ana, Bia e Cris". */
function juntarNomes(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join("");
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/**
 * Linha discreta das Regras do Desafio: "Andressa e Kelle participam só do
 * Bônus Estrelas (R$ 5,00 por estrela)". Null quando o mes nao tem extras com
 * alguem ativo no cadastro. Nomes vem do cadastro (apelido > nome).
 */
export function fraseSoDoBonus(
  ativos: ProfissionalParaBonus[],
  rules: RulesVersion | null | undefined
): string | null {
  const extras = extrasDoBonus(rules);
  if (!extras) return null;
  const nomes = profissionaisSoDoBonus(ativos, rules)
    .map(nomeExibicaoBonus)
    .sort((x, y) => x.localeCompare(y, "pt-BR", { sensitivity: "base" }));
  if (nomes.length === 0) return null;
  const verbo = nomes.length === 1 ? "participa" : "participam";
  return `${juntarNomes(nomes)} ${verbo} só do Bônus Estrelas (${formatarBRL(extras.valorPorEstrela)} por estrela aprovada)`;
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
