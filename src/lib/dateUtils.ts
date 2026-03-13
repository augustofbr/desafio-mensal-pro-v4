
import { convertDateFormat } from "@/lib/utils";

export interface DateRange {
  startDate: string;
  endDate: string;
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
