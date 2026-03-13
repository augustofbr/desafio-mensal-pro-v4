import { useEffect, useState } from 'react';
import { useDateFilter } from '@/contexts/DateFilterContext';
import { isWorkingDay } from '@/lib/workingDaysConfig';

interface MonthProgressData {
  workedDays: number;
  remainingDays: number;
  totalDays: number;
}

/**
 * Calcula dias úteis trabalhados no mês atual (do início do mês até ontem)
 * O dia atual não é contado como trabalhado
 */
function calculateWorkedDays(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);  // Normaliza para meia-noite

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  startOfMonth.setHours(0, 0, 0, 0);  // Normaliza para meia-noite

  // Se ontem foi antes do início do mês, não há dias trabalhados ainda
  if (yesterday < startOfMonth) {
    return 0;
  }

  let workedDays = 0;
  const currentDate = new Date(startOfMonth);

  while (currentDate <= yesterday) {
    if (isWorkingDay(currentDate)) {
      workedDays++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return workedDays;
}

/**
 * Calcula dias úteis restantes no mês atual (de amanhã até o fim do mês)
 * O dia atual não é incluído nos dias restantes
 */
function calculateRemainingDays(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);  // Normaliza para meia-noite

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  endOfMonth.setHours(0, 0, 0, 0);  // Normaliza para meia-noite

  // Se amanhã já passou do último dia do mês, retorna 0
  if (tomorrow > endOfMonth) {
    return 0;
  }

  let remainingDays = 0;
  const currentDate = new Date(tomorrow);

  while (currentDate <= endOfMonth) {
    if (isWorkingDay(currentDate)) {
      remainingDays++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return remainingDays;
}

/**
 * Calcula total de dias úteis no mês atual
 */
function calculateTotalWorkingDays(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);  // Normaliza para meia-noite

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  startOfMonth.setHours(0, 0, 0, 0);  // Normaliza para meia-noite

  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  endOfMonth.setHours(0, 0, 0, 0);  // Normaliza para meia-noite

  let totalDays = 0;
  const currentDate = new Date(startOfMonth);

  while (currentDate <= endOfMonth) {
    if (isWorkingDay(currentDate)) {
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
        const remainingDays = calculateRemainingDays();
        const totalDays = calculateTotalWorkingDays();
        
        setData({
          workedDays,
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
    remainingDays: data?.remainingDays,
    totalDays: data?.totalDays,
    loading,
    error: null
  };
}