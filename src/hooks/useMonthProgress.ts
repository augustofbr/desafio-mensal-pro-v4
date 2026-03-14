import { useEffect, useState } from 'react';
import { useDateFilter } from '@/contexts/DateFilterContext';
import { isWorkingWeekday } from '@/lib/workingDaysConfig';

interface MonthProgressData {
  workedDays: number;
  todayCount: number;
  remainingDays: number;
  totalDays: number;
}

/**
 * Verifica se uma data é dia válido (seg-sáb), ignorando feriados
 */
function isValidDay(date: Date): boolean {
  return isWorkingWeekday(date.getDay());
}

/**
 * Calcula dias válidos trabalhados no mês atual (do início do mês até ontem)
 */
function calculateWorkedDays(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  startOfMonth.setHours(0, 0, 0, 0);

  if (yesterday < startOfMonth) {
    return 0;
  }

  let workedDays = 0;
  const currentDate = new Date(startOfMonth);

  while (currentDate <= yesterday) {
    if (isValidDay(currentDate)) {
      workedDays++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return workedDays;
}

/**
 * Retorna 1 se hoje é dia válido (seg-sáb), 0 se domingo
 */
function calculateTodayCount(): number {
  const today = new Date();
  return isWorkingWeekday(today.getDay()) ? 1 : 0;
}

/**
 * Calcula total de dias válidos (seg-sáb) no mês atual
 */
function calculateTotalWorkingDays(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  startOfMonth.setHours(0, 0, 0, 0);

  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  endOfMonth.setHours(0, 0, 0, 0);

  let totalDays = 0;
  const currentDate = new Date(startOfMonth);

  while (currentDate <= endOfMonth) {
    if (isValidDay(currentDate)) {
      totalDays++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return totalDays;
}

/**
 * Hook para calcular e retornar o progresso do mês em dias úteis
 */
export function useMonthProgress() {
  const [data, setData] = useState<MonthProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const { filterType } = useDateFilter();
  
  useEffect(() => {
    // Recalcula quando o componente monta ou quando o filtro de data muda
    // Nota: Estamos sempre calculando para o mês atual, independente do filtro
    // Se desejar, podemos adaptar para considerar o filtro de data
    
    const calculateProgress = () => {
      setLoading(true);
      
      try {
        const workedDays = calculateWorkedDays();
        const todayCount = calculateTodayCount();
        const totalDays = calculateTotalWorkingDays();
        const remainingDays = totalDays - workedDays - todayCount;

        setData({
          workedDays,
          todayCount,
          remainingDays,
          totalDays
        });
      } catch (error) {
        console.error('Error calculating month progress:', error);
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    
    calculateProgress();
    
    // Opcionalmente, podemos atualizar a cada mudança de dia
    // configurando um interval que verifica mudança de data
    const checkDateChange = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      
      const msUntilMidnight = tomorrow.getTime() - now.getTime();
      
      // Reagenda para meia-noite
      setTimeout(() => {
        calculateProgress();
        // Depois da primeira execução à meia-noite, 
        // configura para executar diariamente
        setInterval(calculateProgress, 24 * 60 * 60 * 1000);
      }, msUntilMidnight);
    };
    
    checkDateChange();
    
    // Cleanup não necessário para este caso simples
  }, [filterType]);
  
  return {
    workedDays: data?.workedDays,
    todayCount: data?.todayCount,
    remainingDays: data?.remainingDays,
    totalDays: data?.totalDays,
    loading,
    error: null
  };
}