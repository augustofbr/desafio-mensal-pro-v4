
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart } from "@/components/ui/pie-chart";
import { getCurrentMonthName } from "@/lib/utils";
import { getCategoryDisplayName, PROF_CATEGORIES } from "@/lib/categoryDisplayNames";

interface DistributionChartProps {
  hairData: any[];
}

export function DistributionChart({ hairData }: DistributionChartProps) {
  const currentMonth = getCurrentMonthName();

  const prepareHairPieData = () => {
    // Count points from treatments vs unique clients
    let treatmentPoints = 0;
    let clientPoints = 0;

    hairData.forEach(prof => {
      (prof.services || []).forEach((service: any) => {
        if (service.type === 'treatment') {
          treatmentPoints += service.points;
        } else if (service.type === 'client') {
          clientPoints += service.points;
        }
      });
    });

    return {
      labels: ['Tratamentos', 'Clientes Únicas'],
      datasets: [
        {
          data: [treatmentPoints, clientPoints],
          backgroundColor: [
            'rgba(53, 162, 235, 0.7)',
            'rgba(75, 192, 192, 0.7)',
          ],
        },
      ],
    };
  };

  const hairPieData = prepareHairPieData();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribuição de Pontos por Tipo</CardTitle>
        <CardDescription>
          Proporção de pontos: Tratamentos vs Clientes Únicas na categoria {getCategoryDisplayName(PROF_CATEGORIES.CABELO)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[350px]">
          {hairData.length > 0 ? (
            <PieChart
              data={hairPieData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'top' as const,
                  },
                  title: {
                    display: true,
                    text: `Distribuição de Pontos - ${getCategoryDisplayName(PROF_CATEGORIES.CABELO)} (${currentMonth})`,
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
