
import { LineChart } from "@/components/ui/line-chart";
import { ChartFilters } from "./ChartFilters";
import { ExpandableChart } from "./ExpandableChart";
import { groupByDay, calculateDailyAccumulated } from "@/lib/utils";
import { useDateFilter } from "@/contexts/DateFilterContext";
import { getCategoryDisplayName, PROF_CATEGORIES } from "@/lib/categoryDisplayNames";

interface EvolutionChartContainerProps {
  data: any[];
  type: 'hair' | 'manicure' | 'maquiagem' | 'estetica';
  selectedProfessionals: string[];
  onToggleProfessional: (professional: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

export function EvolutionChartContainer({
  data,
  type,
  selectedProfessionals,
  onToggleProfessional,
  onSelectAll,
  onClearAll
}: EvolutionChartContainerProps) {
  const { getFilteredDateRange } = useDateFilter();

  const prepareEvolutionData = () => {
    if (!data || data.length === 0) {
      return {
        labels: ['No data'],
        datasets: [{
          label: 'No data',
          data: [0],
          borderColor: 'rgb(200, 200, 200)',
          tension: 0.3,
        }]
      };
    }

    const filteredData = data.filter(prof =>
      selectedProfessionals.includes(prof.professional)
    );

    if (filteredData.length === 0) {
      return {
        labels: ['No data'],
        datasets: [{
          label: 'Nenhum profissional selecionado',
          data: [0],
          borderColor: 'rgb(200, 200, 200)',
          tension: 0.3,
        }]
      };
    }

    const dateRange = getFilteredDateRange();
    const startDate = new Date(dateRange.startDate);
    const endDate = new Date(dateRange.endDate);
    const today = new Date();

    let latestDataDate: Date | null = null;
    filteredData.forEach(prof => {
      if (Array.isArray(prof.services)) {
        prof.services.forEach((service: any) => {
          if (service && service.date) {
            const serviceDate = new Date(service.date);
            if (!latestDataDate || serviceDate > latestDataDate) {
              latestDataDate = serviceDate;
            }
          }
        });
      }
    });

    let actualEndDate = endDate;
    if (today < endDate) {
      actualEndDate = today;
    }
    if (latestDataDate && latestDataDate < actualEndDate) {
      actualEndDate = latestDataDate;
    }

    const fullDateRange: string[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= actualEndDate) {
      const formattedDate = currentDate.toISOString().split('T')[0];
      fullDateRange.push(formattedDate);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const colors = [
      'rgb(255, 99, 132)',
      'rgb(53, 162, 235)',
      'rgb(75, 192, 192)',
      'rgb(255, 159, 64)',
      'rgb(153, 102, 255)',
      'rgb(201, 203, 207)',
      'rgb(54, 162, 235)',
      'rgb(255, 205, 86)',
      'rgb(255, 99, 71)',
      'rgb(50, 205, 50)',
    ];

    const datasets = filteredData.map((prof, index) => {
      const services = Array.isArray(prof.services) ? prof.services : [];
      const dailyPoints = groupByDay(services);
      const accumulated = calculateDailyAccumulated(dailyPoints, fullDateRange);
      const color = colors[index % colors.length];

      return {
        label: prof.professional,
        data: fullDateRange.map(date => accumulated[date] || 0),
        borderColor: color,
        tension: 0.3,
      };
    });

    const formattedDates = fullDateRange.map(date => {
      const parts = date.split('-');
      return parts.length === 3 ? parts[2] : date;
    });

    return {
      labels: formattedDates.length > 0 ? formattedDates : ['No data'],
      datasets: datasets.length > 0 ? datasets : [{
        label: 'No data',
        data: [0],
        borderColor: 'rgb(200, 200, 200)',
        tension: 0.3,
      }],
    };
  };

  const chartData = prepareEvolutionData();
  const categoryMap: Record<string, string> = {
    hair: PROF_CATEGORIES.CABELO,
    manicure: PROF_CATEGORIES.UNHAS,
    maquiagem: PROF_CATEGORIES.MAQUIAGEM,
    estetica: PROF_CATEGORIES.ESTETICA,
  };
  const title = `Evolução de Pontos - ${getCategoryDisplayName(categoryMap[type] || type)}`;

  return (
    <div className="w-full">
      <h4 className="text-sm font-semibold text-center text-muted-foreground mb-2">
        {title}
      </h4>

      <ChartFilters
        data={data}
        selectedProfessionals={selectedProfessionals}
        onToggleProfessional={onToggleProfessional}
        onSelectAll={onSelectAll}
        onClearAll={onClearAll}
      />

      <ExpandableChart chartData={chartData} title={title}>
        <div className="w-full h-[400px] sm:h-[420px] mt-3">
          <LineChart
            data={chartData}
            showEndLabels={true}
            showEnhancedTooltips={true}
            legendPosition="top"
            xAxisLabel="Dia do Período"
            yAxisLabel="Pontos Acumulados"
          />
        </div>
      </ExpandableChart>
    </div>
  );
}
