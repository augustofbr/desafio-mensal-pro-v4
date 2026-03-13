
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart } from "@/components/ui/bar-chart";
import { getCurrentMonthName } from "@/lib/utils";
import { getCategoryDisplayName, PROF_CATEGORIES, isCategoryEnabled } from "@/lib/categoryDisplayNames";

interface ComparisonChartProps {
  hairData: any[];
  manicureData: any[];
  maquiagemData?: any[];
  esteticaData?: any[];
}

export function ComparisonChart({ hairData, manicureData, maquiagemData = [], esteticaData = [] }: ComparisonChartProps) {
  const currentMonth = getCurrentMonthName();
  
  const prepareBarChartData = () => {
    const allProfessionals = new Set([
      ...hairData.map(item => item.professional),
      ...manicureData.map(item => item.professional),
      ...maquiagemData.map(item => item.professional),
      ...esteticaData.map(item => item.professional),
    ]);

    const labels = Array.from(allProfessionals);

    const datasets: any[] = [];

    if (isCategoryEnabled(PROF_CATEGORIES.CABELO)) {
      datasets.push({
        label: getCategoryDisplayName(PROF_CATEGORIES.CABELO),
        data: labels.map(professional => {
          const prof = hairData.find(p => p.professional === professional);
          return prof ? prof.points : 0;
        }),
        backgroundColor: 'rgba(53, 162, 235, 0.7)',
      });
    }

    if (isCategoryEnabled(PROF_CATEGORIES.UNHAS)) {
      datasets.push({
        label: getCategoryDisplayName(PROF_CATEGORIES.UNHAS),
        data: labels.map(professional => {
          const prof = manicureData.find(p => p.professional === professional);
          return prof ? prof.points : 0;
        }),
        backgroundColor: 'rgba(255, 99, 132, 0.7)',
      });
    }

    if (isCategoryEnabled(PROF_CATEGORIES.MAQUIAGEM)) {
      datasets.push({
        label: getCategoryDisplayName(PROF_CATEGORIES.MAQUIAGEM),
        data: labels.map(professional => {
          const prof = maquiagemData.find(p => p.professional === professional);
          return prof ? prof.points : 0;
        }),
        backgroundColor: 'rgba(244, 63, 94, 0.7)',
      });
    }

    if (isCategoryEnabled(PROF_CATEGORIES.ESTETICA)) {
      datasets.push({
        label: getCategoryDisplayName(PROF_CATEGORIES.ESTETICA),
        data: labels.map(professional => {
          const prof = esteticaData.find(p => p.professional === professional);
          return prof ? prof.points : 0;
        }),
        backgroundColor: 'rgba(245, 158, 11, 0.7)',
      });
    }

    return { labels, datasets };
  };

  const barChartData = prepareBarChartData();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pontuação Total por Categoria</CardTitle>
        <CardDescription>
          Comparação da pontuação de cada profissional nas diferentes categorias
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[350px]">
          {(hairData.length > 0 || manicureData.length > 0 || maquiagemData.length > 0 || esteticaData.length > 0) ? (
            <BarChart
              data={barChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  y: {
                    beginAtZero: true,
                    title: {
                      display: true,
                      text: 'Pontos'
                    }
                  }
                },
                plugins: {
                  legend: {
                    position: 'top' as const,
                  },
                  title: {
                    display: true,
                    text: `Pontuação Total por Categoria (${currentMonth})`,
                  },
                },
              }}
            />
          ) : (
            <div className="flex justify-center items-center h-full">
              <p className="text-gray-500">Nenhum dado disponível para exibir</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
