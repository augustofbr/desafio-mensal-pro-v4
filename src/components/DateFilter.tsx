
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useDateFilter, DateFilterType } from "@/contexts/DateFilterContext";

export default function DateFilter() {
  const { filterType, setFilterType, setDateRange, getFilteredDateRange } = useDateFilter();
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();

  const handleFilterChange = (value: DateFilterType) => {
    setFilterType(value);
    if (value !== 'custom') {
      // Clear custom dates when switching to predefined filters
      setStartDate(undefined);
      setEndDate(undefined);
    }
  };

  const handleCustomDateApply = () => {
    if (startDate && endDate) {
      setDateRange({
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      });
    }
  };

  const getFilterLabel = () => {
    const range = getFilteredDateRange();
    if (filterType === 'current-month') {
      return 'Mês Atual';
    } else if (filterType === 'previous-month') {
      return 'Mês Anterior';
    } else {
      return range.startDate && range.endDate 
        ? `${format(new Date(range.startDate), 'dd/MM/yyyy')} - ${format(new Date(range.endDate), 'dd/MM/yyyy')}`
        : 'Período Personalizado';
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg">Filtro de Período</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <Select value={filterType} onValueChange={handleFilterChange}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Selecione o período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="previous-month">Mês Anterior</SelectItem>
                <SelectItem value="current-month">Mês Atual</SelectItem>
                <SelectItem value="custom">Período Personalizado</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="text-sm text-muted-foreground">
              Período selecionado: {getFilterLabel()}
            </div>
          </div>

          {filterType === 'custom' && (
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex gap-2 items-center">
                <span className="text-sm">De:</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[140px] justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "dd/MM/yyyy") : "Data inicial"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex gap-2 items-center">
                <span className="text-sm">Até:</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[140px] justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "dd/MM/yyyy") : "Data final"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <Button 
                onClick={handleCustomDateApply}
                disabled={!startDate || !endDate}
                className="w-full sm:w-auto"
              >
                Aplicar
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
