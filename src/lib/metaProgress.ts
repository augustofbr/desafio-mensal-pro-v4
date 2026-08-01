import type { CategoryRules } from "./rulesConfig";
import { isWorkingWeekday } from "./workingDaysConfig";

/**
 * Metas e projecao de ritmo do painel "Minha Meta".
 *
 * Funcoes puras (sem React, sem Supabase, sem Date.now()) para rodar no vitest
 * em ambiente node. Quem chama injeta feriados e o dia de hoje.
 */

export interface MetaItem {
  chave: "clientes" | "especiais" | "receita" | "servicos";
  /** Ex.: "Clientes únicos", rules.specialServiceLabel, "Meta do mês", "Atendimentos" */
  rotulo: string;
  atual: number;
  alvo: number;
  /** 0..100, sempre com clamp */
  pct: number;
  batida: boolean;
}

export interface Projecao {
  /** false se: mes encerrado, <3 dias uteis decorridos, ou meta batida */
  mostrar: boolean;
  ritmoTexto: string | null;
}

/** Minimo de dias uteis decorridos para a projecao ter significado. */
const MIN_DIAS_UTEIS_PARA_PROJETAR = 3;

/** Le um campo numerico do entry; ausente/invalido vira 0. */
function numero(entry: Record<string, unknown>, campo: string): number {
  const valor = entry[campo];
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

function montarMeta(
  chave: MetaItem["chave"],
  rotulo: string,
  atual: number,
  alvo: number
): MetaItem {
  // (atual * 100) / alvo evita o erro de ponto flutuante de (atual / alvo) * 100.
  const bruto = alvo > 0 ? (atual * 100) / alvo : 0;
  return {
    chave,
    rotulo,
    atual,
    alvo,
    pct: Math.min(100, Math.max(0, bruto)),
    batida: alvo > 0 && atual >= alvo,
  };
}

/**
 * Traduz o entry de um profissional nas metas visiveis da categoria,
 * conforme `rules.scoringModel` + `rules.qualificationGoals`.
 * Metas sem goal configurado simplesmente nao aparecem.
 */
export function resolveMetas(
  entry: Record<string, unknown>,
  rules: CategoryRules
): MetaItem[] {
  const metas: MetaItem[] = [];
  const { minUniqueClients, minSpecialServices, minRevenue, minServices } =
    rules.qualificationGoals;

  if (rules.scoringModel === "points") {
    if (minUniqueClients !== undefined) {
      metas.push(
        montarMeta(
          "clientes",
          "Clientes únicos",
          numero(entry, "uniqueClientDays"),
          minUniqueClients
        )
      );
    }
    if (minSpecialServices !== undefined) {
      metas.push(
        montarMeta(
          "especiais",
          rules.specialServiceLabel,
          numero(entry, "specialServices"),
          minSpecialServices
        )
      );
    }
    return metas;
  }

  if (rules.scoringModel === "revenue-percentage") {
    // O entry ja traz o percentual pronto; o alvo e sempre 100%.
    metas.push(
      montarMeta("receita", "Meta do mês", numero(entry, "revenuePercentage"), 100)
    );
    return metas;
  }

  // revenue-points
  if (minRevenue !== undefined) {
    metas.push(
      montarMeta("receita", "Meta do mês", numero(entry, "totalRevenue"), minRevenue)
    );
  }
  if (minServices !== undefined) {
    metas.push(
      montarMeta(
        "servicos",
        "Atendimentos",
        numero(entry, "totalServices"),
        minServices
      )
    );
  }
  return metas;
}

/**
 * Indice, em `diasUteisPorDiaDoMes`, do dia util em que hoje se apoia.
 * Se hoje nao e dia util (domingo/feriado), ancora no ultimo dia util anterior.
 * Retorna -1 quando nao ha nenhum dia util ate hoje.
 */
function indiceDoDiaUtilAtual(
  diaDoMesHoje: number,
  diasUteisPorDiaDoMes: number[]
): number {
  let indice = -1;
  for (let i = 0; i < diasUteisPorDiaDoMes.length; i++) {
    if (diasUteisPorDiaDoMes[i] <= diaDoMesHoje) indice = i;
    else break;
  }
  return indice;
}

/**
 * Projeta se o ritmo atual alcanca a meta dentro do periodo.
 * `diaDoMesHoje` null significa periodo sem hoje (mes encerrado / custom passado).
 */
export function computeProjecao(args: {
  atual: number;
  alvo: number;
  diasUteisDecorridos: number;
  diasUteisRestantes: number;
  diaDoMesHoje: number | null;
  diasUteisPorDiaDoMes: number[];
  /**
   * Nome da meta projetada, para o texto dizer DE QUAL meta fala quando a
   * categoria tem mais de uma. Ausente = frase generica (comportamento antigo).
   */
  rotuloMeta?: string;
}): Projecao {
  const {
    atual,
    alvo,
    diasUteisDecorridos,
    diasUteisRestantes,
    diaDoMesHoje,
    diasUteisPorDiaDoMes,
    rotuloMeta,
  } = args;

  const nome = rotuloMeta?.trim() ? `, ${rotuloMeta.trim()}` : "";
  const nomeEm = rotuloMeta?.trim() ? ` em ${rotuloMeta.trim()}` : "";

  const semProjecao: Projecao = { mostrar: false, ritmoTexto: null };

  if (diaDoMesHoje === null) return semProjecao;
  if (alvo <= 0) return semProjecao;
  if (atual >= alvo) return semProjecao;
  if (diasUteisDecorridos < MIN_DIAS_UTEIS_PARA_PROJETAR) return semProjecao;

  const faltam = alvo - atual;
  const ritmo = atual / diasUteisDecorridos;
  const abaixo: Projecao = {
    mostrar: true,
    ritmoTexto: `Ritmo abaixo da meta${nomeEm} — faltam ${Math.ceil(faltam)} em ${diasUteisRestantes} dias úteis`,
  };

  if (ritmo <= 0) return abaixo;

  const diasNecessarios = Math.ceil(faltam / ritmo);
  if (diasNecessarios > diasUteisRestantes) return abaixo;

  const indiceHoje = indiceDoDiaUtilAtual(diaDoMesHoje, diasUteisPorDiaDoMes);
  const diaPrevisto = diasUteisPorDiaDoMes[indiceHoje + diasNecessarios];
  // Sem data prevista dentro do mes (calendario mais curto que o esperado):
  // melhor avisar que o ritmo nao fecha do que inventar um dia.
  if (indiceHoje < 0 || diaPrevisto === undefined) return abaixo;

  return { mostrar: true, ritmoTexto: `No seu ritmo${nome}: meta ~dia ${diaPrevisto}` };
}

/** Parse manual — `new Date('YYYY-MM-DD')` seria interpretado como UTC. */
function parseData(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

/**
 * Conta dias uteis (seg-sab, exclui feriados) no intervalo inclusivo.
 * `holidays` no formato "YYYY-MM-DD".
 */
export function contarDiasUteis(
  startDate: string,
  endDate: string,
  holidays: string[]
): number {
  const inicio = parseData(startDate);
  const fim = parseData(endDate);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return 0;
  if (inicio > fim) return 0;

  const feriados = new Set(holidays);
  let total = 0;

  for (const cursor = inicio; cursor <= fim; cursor.setDate(cursor.getDate() + 1)) {
    if (!isWorkingWeekday(cursor.getDay())) continue;
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    if (!feriados.has(iso)) total++;
  }

  return total;
}
