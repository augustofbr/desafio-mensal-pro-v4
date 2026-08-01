
import { convertDateFormat } from "@/lib/utils";

export interface DateRange {
  startDate: string;
  endDate: string;
}

const manausDateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Manaus",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Formata um timestamptz (ISO) como DD/MM/AAAA HH:mm no fuso do salao
 * (America/Manaus). Toda data de avaliacao mostrada ao usuario passa por aqui:
 * `data_hora_cadastro` chega em UTC do banco, e ler "23:00 de ontem" numa fila
 * de aprovacao do dia induz erro de decisao.
 */
export function formatDataHoraManaus(isoString: string): string {
  return manausDateTimeFormatter.format(new Date(isoString));
}

const manausMesFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Manaus",
  year: "numeric",
  month: "2-digit",
});

function mesDe(date: Date): string {
  const partes = manausMesFormatter.formatToParts(date);
  const ano = partes.find((p) => p.type === "year")?.value;
  const mes = partes.find((p) => p.type === "month")?.value;
  return `${ano}-${mes}`;
}

/**
 * Mes "AAAA-MM" (fuso America/Manaus) de um timestamptz. Existe por causa da
 * regra de atribuicao das estrelas: `useStarsData` filtra por
 * `data_hora_cadastro`, entao a estrela pontua no mes em que foi CADASTRADA —
 * nao no mes em que o admin decidiu. Aprovar uma pendente antiga mexe no
 * ranking daquele mes, que provavelmente ja foi encerrado e premiado.
 */
export function mesManaus(isoString: string): string {
  return mesDe(new Date(isoString));
}

export function mesManausAtual(): string {
  return mesDe(new Date());
}

const manausMesExtensoFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Manaus",
  month: "long",
  year: "numeric",
});

/** "maio de 2026" — para dizer ao admin QUAL ranking ele vai mexer. */
export function mesPorExtensoManaus(isoString: string): string {
  return manausMesExtensoFormatter.format(new Date(isoString));
}

export function filterDataByDateRange(data: any[], dateRange: DateRange): any[] {
  if (!data || data.length === 0) return [];
  
  const { startDate, endDate } = dateRange;
  
  return data.filter(service => {
    if (!service.service_date || typeof service.service_date !== 'string') {
      return false;
    }
    
    // Convert service date to YYYY-MM-DD format for comparison
    const serviceDate = convertDateFormat(service.service_date);
    
    // Compare dates as strings (YYYY-MM-DD format allows direct string comparison)
    return serviceDate >= startDate && serviceDate <= endDate;
  });
}
