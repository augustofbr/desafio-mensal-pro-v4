
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { LineChart } from "@/components/ui/line-chart";
import { Scissors, Sparkles, Heart, AlertTriangle, DollarSign, Star } from "lucide-react";
import { getCurrentMonthName, groupByDay, calculateDailyAccumulated } from "@/lib/utils";
import { getCategoryDisplayName } from "@/lib/categoryDisplayNames";
import { CategoryRules } from "@/lib/rulesConfig";

interface ProfessionalModalProps {
  isOpen: boolean;
  onClose: () => void;
  details: any;
  category: string;
  rules?: CategoryRules;
}

export default function ProfessionalModal({ isOpen, onClose, details, category, rules }: ProfessionalModalProps) {
  if (!details) return null;

  const renderSummaryCards = () => {
    if (!details.summary) return null;

    const summary = details.summary;

    if (category === "Cabelo") {
      return (
        <div className={`grid grid-cols-1 ${rules?.manufacturerConstraints && summary.invalidTreatmentCount > 0 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
          <Card className="border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Scissors className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-gray-700">Tratamentos</h4>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-2xl font-bold text-blue-600">{summary.treatmentCount}</span>
                    <span className="text-sm text-gray-500">Tratamentos</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{summary.treatmentPoints} pontos total</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Heart className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-gray-700">Clientes Únicas</h4>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-2xl font-bold text-green-600">{summary.hairUniqueClients}</span>
                    <span className="text-sm text-gray-500">clientes</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{summary.hairClientPoints} pontos total</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {rules?.manufacturerConstraints && summary.invalidTreatmentCount > 0 && (
            <Card className="border-amber-200">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm text-gray-700">Tratamentos não contabilizados</h4>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-2xl font-bold text-amber-600">{summary.invalidTreatmentCount}</span>
                      <span className="text-sm text-gray-500">tratamentos</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      );
    } else if (category === "Unhas") {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-red-200">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <Sparkles className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-gray-700">SPA dos Pés</h4>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-2xl font-bold text-red-600">{summary.spaCount}</span>
                    <span className="text-sm text-gray-500">SPA dos Pés</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{summary.spaPoints} pontos total</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-200">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <Heart className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-gray-700">Clientes Únicas</h4>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-2xl font-bold text-red-600">{summary.manicureUniqueClients}</span>
                    <span className="text-sm text-gray-500">clientes</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{summary.manicureClientPoints} pontos total</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    } else if (category === "Estetica") {
      if (rules?.scoringModel === 'revenue-points') {
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-violet-200">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-violet-100 rounded-lg">
                    <Sparkles className="h-5 w-5 text-violet-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm text-gray-700">Serviços Realizados</h4>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-2xl font-bold text-violet-600">{summary.esteticaServiceCount}</span>
                      <span className="text-sm text-gray-500">serviços</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">Total no período</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-violet-200">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-violet-100 rounded-lg">
                    <DollarSign className="h-5 w-5 text-violet-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm text-gray-700">Pontos de Faturamento</h4>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-2xl font-bold text-violet-600">{summary.revenuePoints}</span>
                      <span className="text-sm text-gray-500">pontos</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-violet-200">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-violet-100 rounded-lg">
                    <Star className="h-5 w-5 text-violet-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm text-gray-700">Pontos de Estrelas</h4>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-2xl font-bold text-violet-600">{summary.starPoints}</span>
                      <span className="text-sm text-gray-500">pontos</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      }

      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-violet-200">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-violet-100 rounded-lg">
                  <Sparkles className="h-5 w-5 text-violet-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-gray-700">Serviços Realizados</h4>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-2xl font-bold text-violet-600">{summary.esteticaServiceCount}</span>
                    <span className="text-sm text-gray-500">serviços</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">Total no período</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-violet-200">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-violet-100 rounded-lg">
                  <Heart className="h-5 w-5 text-violet-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-gray-700">Percentual da Meta</h4>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-2xl font-bold text-violet-600">{summary.esteticaRevenuePercentage}%</span>
                    <span className="text-sm text-gray-500">da meta</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">Meta de faturamento</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    } else if (category === "Maquiagem") {
      if (rules?.scoringModel === 'revenue-points') {
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-yellow-200">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <DollarSign className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm text-gray-700">Pontos de Faturamento</h4>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-2xl font-bold text-yellow-600">{summary.revenuePoints}</span>
                      <span className="text-sm text-gray-500">pontos</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-yellow-200">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <Star className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm text-gray-700">Pontos de Estrelas</h4>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-2xl font-bold text-yellow-600">{summary.starPoints}</span>
                      <span className="text-sm text-gray-500">pontos</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      }

      return (
        <div className="grid grid-cols-1 gap-4">
          <Card className="border-yellow-200">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Sparkles className="h-5 w-5 text-yellow-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-gray-700">Serviços Realizados</h4>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-2xl font-bold text-yellow-600">{summary.maquiagemTotalServices}</span>
                    <span className="text-sm text-gray-500">serviços</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{summary.maquiagemTotalPoints} pontos total</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return null;
  };

  const prepareIndividualEvolutionData = () => {
    if (!details.rawServices || details.rawServices.length === 0) {
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

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const today = now.getDate();

    const fullDateRange = [];
    for (let day = 1; day <= today; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const formattedDate = date.toISOString().split('T')[0];
      fullDateRange.push(formattedDate);
    }

    const dailyPoints = groupByDay(details.rawServices);
    const accumulated = calculateDailyAccumulated(dailyPoints, fullDateRange);

    const formattedDates = fullDateRange.map(date => {
      const parts = date.split('-');
      return parts.length === 3 ? parts[2] : date;
    });

    return {
      labels: formattedDates,
      datasets: [{
        label: details.professional,
        data: fullDateRange.map(date => accumulated[date] || 0),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.3,
        fill: true
      }]
    };
  };

  const shouldShowPointsColumn = () => {
    if (category === "Estetica") {
      return rules?.scoringModel === 'revenue-points';
    }
    return true;
  };

  const chartData = prepareIndividualEvolutionData();
  const currentMonth = getCurrentMonthName();
  const displayCategory = getCategoryDisplayName(category);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{details.professional}</DialogTitle>
          <DialogDescription className="mt-1">
            {displayCategory}: {details.totalServices} serviços | {rules?.scoringModel === 'revenue-points'
              ? `${details.totalPoints} Pts`
              : category === "Estetica"
                ? `${details.totalPoints}% da meta`
                : `${details.totalPoints} pontos`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {renderSummaryCards() && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Resumo da Categoria</h3>
              {renderSummaryCards()}
            </div>
          )}

          <div>
            <h3 className="text-lg font-semibold mb-3">Detalhamento dos Serviços</h3>
            {details.services.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">Nenhum serviço registrado para este mês.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead className="text-center">Quantidade</TableHead>
                    {shouldShowPointsColumn() && (
                      <TableHead className="text-right">Pontos</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {details.services.map((service: any) => (
                    <TableRow key={service.name}>
                      <TableCell>
                        <div className="font-medium">{service.name}</div>
                      </TableCell>
                      <TableCell className="text-center">{service.count}</TableCell>
                      {shouldShowPointsColumn() && (
                        <TableCell className="text-right font-medium">
                          {service.points}
                          <span className="text-xs text-muted-foreground ml-1">
                            ({service.pointsPerService} por serviço)
                          </span>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="w-full">
            <h3 className="text-lg font-semibold mb-3">Evolução Individual - {currentMonth}</h3>
            <div className="w-full h-[250px]">
              <LineChart
                data={chartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      display: false
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
