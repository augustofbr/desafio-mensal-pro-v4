
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
