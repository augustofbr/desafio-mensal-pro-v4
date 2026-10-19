/**
 * Helpers do cadastro de estrelas com cliente no Trinks.
 *
 * Funcoes puras (sem React, sem Supabase) para rodar no vitest em ambiente node.
 * Datas sao strings 'YYYY-MM-DD'; a conta de dias e feita em UTC para nao depender
 * do fuso da maquina.
 */

/** Quantos dias para tras o cadastro aceita atendimento (hoje - 10). */
export const JANELA_DIAS_ATENDIMENTO = 10;

export type OrigemClienteTrinks = "lista" | "digitado";

export interface ClienteDoDia {
  cliente_trinks_id: number | null;
  nome: string;
  servicos: string[];
  fonte: "espelho" | "fila";
}

const FORMATO_DIA_MANAUS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Manaus",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Soma `n` dias a uma data 'YYYY-MM-DD' (n negativo volta no tempo). */
function somarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  const data = new Date(Date.UTC(y, m - 1, d + n));
  return data.toISOString().slice(0, 10);
}

/** Dia corrente em America/Manaus, 'YYYY-MM-DD'. */
export function diaManaus(agora: Date = new Date()): string {
  return FORMATO_DIA_MANAUS.format(agora);
}

/** Dias aceitos pelo cadastro: de `hoje` ate `hoje - 10`, mais recente primeiro. */
export function diasPermitidos(hoje: string): string[] {
  return Array.from({ length: JANELA_DIAS_ATENDIMENTO + 1 }, (_, i) =>
    somarDias(hoje, -i)
  );
}

/** Rotulo do seletor de dia: "Hoje · sáb 17", "Ontem · sex 16" ou "qua 14/10". */
export function rotuloDia(dia: string, hoje: string): string {
  const [y, m, d] = dia.split("-").map(Number);
  const diaSemana = DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const numero = String(d).padStart(2, "0");

  if (dia === hoje) return `Hoje · ${diaSemana} ${numero}`;
  if (dia === somarDias(hoje, -1)) return `Ontem · ${diaSemana} ${numero}`;
  return `${diaSemana} ${numero}/${String(m).padStart(2, "0")}`;
}

/** Nome que vai para o Google: copia o do Trinks quando marcado, senao mantem o digitado. */
export function nomeGoogleEfetivo(
  nomeGoogle: string,
  nomeTrinks: string,
  mesmoNome: boolean
): string {
  return mesmoNome ? nomeTrinks : nomeGoogle;
}

/** Monta a linha de `avaliacoes_cadastradas` para insert; digitado nunca leva id de cliente. */
export function montarInsertAvaliacao(v: {
  profissionalId: number;
  nomeProfissional: string;
  nomeGoogle: string;
  nomeTrinks: string;
  clienteTrinksId: number | null;
  dataAtendimento: string;
  origem: OrigemClienteTrinks;
  agoraISO: string;
}): Record<string, unknown> {
  return {
    profissional_id: v.profissionalId,
    nome_profissional: v.nomeProfissional.trim(),
    nome_cliente: v.nomeGoogle.trim(),
    nome_cliente_trinks: v.nomeTrinks.trim(),
    cliente_trinks_id: v.origem === "digitado" ? null : v.clienteTrinksId,
    data_atendimento: v.dataAtendimento,
    origem_cliente_trinks: v.origem,
    status: "pendente",
    data_hora_cadastro: v.agoraISO,
  };
}

export type EstadoDaLista = "carregando" | "erro" | "vazia" | "pronta";

/** Estado da lista de clientes do dia: erro vence lista vazia (vazio por falha nao e "sem clientes"). */
export function estadoDaLista(q: {
  isLoading: boolean;
  isError: boolean;
  clientes: ClienteDoDia[];
}): EstadoDaLista {
  if (q.isLoading) return "carregando";
  if (q.isError) return "erro";
  return q.clientes.length === 0 ? "vazia" : "pronta";
}

/** Texto de busca sem acento, minusculo e sem espacos nas pontas. */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
