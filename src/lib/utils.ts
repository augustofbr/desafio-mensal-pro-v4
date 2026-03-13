
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getCurrentMonthName(): string {
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  
  const currentMonth = new Date().getMonth();
  return months[currentMonth];
}

export function getCurrentYearMonthName(): string {
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  return `${months[currentMonth]}/${currentYear}`;
}

export function getDataPeriod(lastServiceDate: string | null): string {
  if (!lastServiceDate) {
    return "Período não disponível";
  }

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  
  // Format first day of current month
  const firstDay = `01/${currentMonth.toString().padStart(2, '0')}/${currentYear}`;
  
  // Format last service date
  let formattedLastDate = lastServiceDate;
  
  // Convert YYYY-MM-DD to DD/MM/YYYY if needed
  if (lastServiceDate.includes('-') && lastServiceDate.split('-')[0].length === 4) {
    const [year, month, day] = lastServiceDate.split('-');
    formattedLastDate = `${day}/${month}/${year}`;
  }
  
  return `De ${firstDay} até ${formattedLastDate}`;
}

export function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function convertDateFormat(dateString: string): string {
  if (!dateString) return '';
  
  // If it's already in YYYY-MM-DD format, return as is
  if (dateString.includes('-') && dateString.split('-').length === 3) {
    const parts = dateString.split('-');
    if (parts[0].length === 4) {
      return dateString;
    }
  }
  
  // If it's in DD/MM/YYYY format, convert to YYYY-MM-DD
  if (dateString.includes('/')) {
    const [day, month, year] = dateString.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return dateString;
}

export function groupByDay(services: any[]): Record<string, number> {
  const dailyPoints: Record<string, number> = {};
  
  services.forEach(service => {
    const date = service.date;
    if (date && service.points) {
      if (!dailyPoints[date]) {
        dailyPoints[date] = 0;
      }
      dailyPoints[date] += service.points;
    }
  });
  
  return dailyPoints;
}

export function calculateDailyAccumulated(dailyPoints: Record<string, number>, allDates?: string[]): Record<string, number> {
  const accumulated: Record<string, number> = {};
  let runningTotal = 0;
  
  // Use provided date range or sort existing dates
  const datesToProcess = allDates || Object.keys(dailyPoints).sort();
  
  datesToProcess.forEach(date => {
    // Add points for this day (if any)
    runningTotal += dailyPoints[date] || 0;
    accumulated[date] = runningTotal;
  });
  
  return accumulated;
}

export function formatServiceDate(dateString: string): string {
  if (!dateString) return '';

  // Se for timestamp ISO (contém 'T'), formatar com hora
  if (dateString.includes('T')) {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}/${month}/${year} às ${hours}:${minutes}`;
  }

  // Se for YYYY-MM-DD, converter para DD/MM/YYYY
  if (dateString.includes('-') && dateString.split('-')[0].length === 4) {
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  }

  return dateString;
}
