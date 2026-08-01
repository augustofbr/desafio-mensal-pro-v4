import type { CategoryRules } from "./rulesConfig";
import { groupByDay } from "./utils";

/**
 * Agregacao diaria do painel "Minha semana".
 *
 * Funcoes puras (sem React, sem Supabase, sem Date.now()) para rodar no vitest
 * em ambiente node. Quem chama injeta o dia de hoje e o range filtrado.
 */

/** Formato minimo de um servico ja pontuado pelos hooks de categoria. */
export interface ServicoDoDia {
  /** "YYYY-MM-DD". Vazio nas entradas de estrela, que nao tem dia. */
  date?: string;
  points?: number;
  /** Faturamento do servico; so existe nos modelos de receita. */
  value?: number;
}

export interface DiaSemana {
  /** "YYYY-MM-DD" */
  data: string;
  /** Inicial do dia da semana, seg-sab: S T Q Q S S. */
  diaLabel: "S" | "T" | "Q" | "S" | "S";
  diaDoMes: number;
  /** null = dia fora do range filtrado; 0 = dia do periodo sem atendimento. */
  valor: number | null;
}

export interface RangeSemana {
  startDate: string;
  endDate: string;
}

const DIAS_NA_SEMANA = 6; // seg-sab: domingo nao e dia util no Studio X

const LABELS: DiaSemana["diaLabel"][] = ["S", "T", "Q", "Q", "S", "S"];

/** Parse manual — `new Date('YYYY-MM-DD')` seria lido como UTC e voltaria um dia. */
function parseData(iso: string): Date | null {
  const partes = iso.split("-").map(Number);
  if (partes.length !== 3 || partes.some((parte) => !Number.isFinite(parte))) return null;
  const [ano, mes, dia] = partes;
  const data = new Date(ano, mes - 1, dia);
  return Number.isNaN(data.getTime()) ? null : data;
}

function paraISO(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** Soma o faturamento de cada dia. Servicos sem dia (estrelas) ficam de fora. */
function faturamentoPorDia(services: ServicoDoDia[]): Record<string, number> {
  const porDia: Record<string, number> = {};

  for (const servico of services) {
    const data = servico.date;
    const valor = servico.value;
    if (!data) continue;
    if (typeof valor !== "number" || !Number.isFinite(valor)) continue;
    porDia[data] = (porDia[data] ?? 0) + valor;
  }

  return porDia;
}

/**
 * Valor de cada dia na unidade que a categoria exibe:
 * - `points`: soma dos pontos do dia (reusa groupByDay, que ja ignora as
 *   entradas de estrela por elas nao terem dia);
 * - `revenue-percentage`: faturamento do dia como % da meta do mes;
 * - `revenue-points`: faturamento bruto do dia — a conversao em pontos depende
 *   de `revenuePointConversion` e acontece no componente.
 *
 * Dias sem atendimento simplesmente nao aparecem no mapa.
 */
export function valorPorDia(
  services: ServicoDoDia[],
  modelo: CategoryRules["scoringModel"],
  minRevenue?: number
): Record<string, number> {
  if (modelo === "points") return groupByDay(services);

  const faturamento = faturamentoPorDia(services);
  if (modelo === "revenue-points") return faturamento;

  // revenue-percentage: sem meta configurada nao ha percentual honesto a exibir.
  const meta = typeof minRevenue === "number" && minRevenue > 0 ? minRevenue : 0;
  if (meta === 0) return {};

  const percentuais: Record<string, number> = {};
  for (const [data, valor] of Object.entries(faturamento)) {
    // Uma casa decimal, mesma convencao de revenuePercentage nos hooks.
    percentuais[data] = Math.round((valor * 1000) / meta) / 10;
  }
  return percentuais;
}

/** Segunda-feira da semana da referencia. Domingo pertence a semana anterior. */
function segundaDaSemana(referencia: Date): Date {
  const diaDaSemana = referencia.getDay(); // 0 = domingo
  const recuo = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
  return new Date(
    referencia.getFullYear(),
    referencia.getMonth(),
    referencia.getDate() - recuo
  );
}

/**
 * Blocos de segunda a sabado da semana da `referencia`.
 * Dias fora do range filtrado vem com `valor: null` — e o caso da semana que
 * cruza a virada do mes, em que a metade anterior nao pertence ao periodo.
 */
export function montarSemana(
  referencia: Date,
  valores: Record<string, number>,
  range: RangeSemana
): DiaSemana[] {
  const segunda = segundaDaSemana(referencia);
  const { startDate, endDate } = range;
  const rangeValido = Boolean(startDate && endDate);

  const dias: DiaSemana[] = [];
  for (let i = 0; i < DIAS_NA_SEMANA; i++) {
    const data = new Date(
      segunda.getFullYear(),
      segunda.getMonth(),
      segunda.getDate() + i
    );
    const iso = paraISO(data);
    // Comparacao lexicografica: "YYYY-MM-DD" ordena como data.
    const dentroDoPeriodo = rangeValido && iso >= startDate && iso <= endDate;

    dias.push({
      data: iso,
      diaLabel: LABELS[i],
      diaDoMes: data.getDate(),
      valor: dentroDoPeriodo ? (valores[iso] ?? 0) : null,
    });
  }

  return dias;
}

/**
 * Dia em que a semana "atual" do painel se apoia, dado o periodo filtrado:
 * hoje quando o periodo o contem; senao a borda mais proxima (ultimo dia de um
 * periodo encerrado, primeiro dia de um periodo futuro). null = range vazio.
 */
export function referenciaDaSemana(hoje: Date, range: RangeSemana): Date | null {
  const { startDate, endDate } = range;
  if (!startDate || !endDate) return null;

  const inicio = parseData(startDate);
  const fim = parseData(endDate);
  if (!inicio || !fim) return null;

  const hojeISO = paraISO(hoje);
  if (hojeISO > endDate) return fim;
  if (hojeISO < startDate) return inicio;
  return hoje;
}
