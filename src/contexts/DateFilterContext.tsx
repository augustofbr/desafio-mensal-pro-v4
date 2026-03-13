
import React, { createContext, useContext, useState, ReactNode } from 'react';

export type DateFilterType = 'previous-month' | 'current-month' | 'custom';

export interface DateRange {
  startDate: string;
  endDate: string;
}

interface DateFilterContextType {
  filterType: DateFilterType;
  dateRange: DateRange;
  setFilterType: (type: DateFilterType) => void;
  setDateRange: (range: DateRange) => void;
  getFilteredDateRange: () => DateRange;
}

const DateFilterContext = createContext<DateFilterContextType | undefined>(undefined);

export const useDateFilter = () => {
  const context = useContext(DateFilterContext);
  if (!context) {
    throw new Error('useDateFilter must be used within a DateFilterProvider');
  }
  return context;
};

interface DateFilterProviderProps {
  children: ReactNode;
}

export const DateFilterProvider: React.FC<DateFilterProviderProps> = ({ children }) => {
  const [filterType, setFilterType] = useState<DateFilterType>('current-month');
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: '',
    endDate: ''
  });

  const getFilteredDateRange = (): DateRange => {
    const now = new Date();
    
    if (filterType === 'current-month') {
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const startDate = new Date(currentYear, currentMonth, 1);
      const endDate = new Date(currentYear, currentMonth + 1, 0);
      
      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      };
    } else if (filterType === 'previous-month') {
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const startDate = new Date(currentYear, currentMonth - 1, 1);
      const endDate = new Date(currentYear, currentMonth, 0);
      
      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      };
    } else {
      return dateRange;
    }
  };

  return (
    <DateFilterContext.Provider value={{
      filterType,
      dateRange,
      setFilterType,
      setDateRange,
      getFilteredDateRange
    }}>
      {children}
    </DateFilterContext.Provider>
  );
};
