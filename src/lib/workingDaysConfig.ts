/**
 * Configuração de dias úteis da semana
 * 0 = Domingo, 1 = Segunda, 2 = Terça, 3 = Quarta, 4 = Quinta, 5 = Sexta, 6 = Sábado
 */
export const WORKING_DAYS = {
  0: true,  // Domingo - é dia útil
  1: true,   // Segunda - é dia útil
  2: true,   // Terça - é dia útil
  3: true,   // Quarta - é dia útil
  4: true,   // Quinta - é dia útil
  5: true,   // Sexta - é dia útil
  6: true,   // Sábado - é dia útil
} as const;

/**
 * Lista de feriados (formato: "YYYY-MM-DD")
 * Estes dias não serão contabilizados como dias úteis
 *
 * Exemplos de como adicionar feriados:
 * "2025-01-01",  // Confraternização Universal
 * "2025-04-21",  // Tiradentes
 * "2025-12-25",  // Natal
 */
export const HOLIDAYS: string[] = [
  // Adicione feriados aqui no formato "YYYY-MM-DD"
  "2025-12-25",  // Natal
  "2026-01-01",  // Ano Novo  
];

/**
 * Verifica se um dia da semana é útil
 */
export function isWorkingWeekday(dayOfWeek: number): boolean {
  return WORKING_DAYS[dayOfWeek as keyof typeof WORKING_DAYS] ?? false;
}

/**
 * Verifica se uma data é feriado
 */
export function isHoliday(date: Date): boolean {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  return HOLIDAYS.includes(dateStr);
}

/**
 * Verifica se uma data é dia útil (dia da semana configurado E não é feriado)
 */
export function isWorkingDay(date: Date): boolean {
  return isWorkingWeekday(date.getDay()) && !isHoliday(date);
}
