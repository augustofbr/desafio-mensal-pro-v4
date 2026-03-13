
import { Card, CardContent } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCurrentMonthName } from "@/lib/utils";
import { EvolutionChartContainer } from "@/components/charts/EvolutionChartContainer";
import { getCategoryDisplayName, PROF_CATEGORIES, isCategoryEnabled } from "@/lib/categoryDisplayNames";

interface DashboardChartsProps {
  hairData: any[];
  manicureData: any[];
  esteticaData: any[];
  maquiagemData: any[];
}

export default function DashboardCharts({ hairData, manicureData, esteticaData, maquiagemData }: DashboardChartsProps) {
  const [hasData, setHasData] = useState(false);
  const [selectedProfessionals, setSelectedProfessionals] = useState<string[]>([]);
  const currentMonth = getCurrentMonthName();

  const enabledTabs = [
    isCategoryEnabled(PROF_CATEGORIES.CABELO) && { key: "hair", category: PROF_CATEGORIES.CABELO },
    isCategoryEnabled(PROF_CATEGORIES.UNHAS) && { key: "manicure", category: PROF_CATEGORIES.UNHAS },
    isCategoryEnabled(PROF_CATEGORIES.MAQUIAGEM) && { key: "maquiagem", category: PROF_CATEGORIES.MAQUIAGEM },
    isCategoryEnabled(PROF_CATEGORIES.ESTETICA) && { key: "estetica", category: PROF_CATEGORIES.ESTETICA },
  ].filter(Boolean) as { key: string; category: string }[];

  const [activeTab, setActiveTab] = useState(enabledTabs[0]?.key || "hair");

  const getDataForTab = (tab: string) => {
    switch (tab) {
      case "hair": return hairData;
      case "manicure": return manicureData;
      case "maquiagem": return maquiagemData;
      case "estetica": return esteticaData;
      default: return [];
    }
  };

  useEffect(() => {
    if ((hairData && hairData.length > 0) || (manicureData && manicureData.length > 0) ||
        (esteticaData && esteticaData.length > 0) || (maquiagemData && maquiagemData.length > 0)) {
      setHasData(true);
      const currentData = getDataForTab(activeTab);
      if (currentData.length > 0) {
        setSelectedProfessionals(currentData.map(prof => prof.professional));
      }
    } else {
      setHasData(false);
    }
  }, [hairData, manicureData, esteticaData, maquiagemData, activeTab]);

  const toggleProfessional = (professional: string) => {
    setSelectedProfessionals(prev => {
      if (prev.includes(professional)) {
        return prev.filter(p => p !== professional);
      } else {
        return [...prev, professional];
      }
    });
  };

  const selectAllProfessionals = () => {
    const currentData = getDataForTab(activeTab);
    setSelectedProfessionals(currentData.map(prof => prof.professional));
  };

  const clearAllProfessionals = () => {
    setSelectedProfessionals([]);
  };

  if (!hasData) {
    return (
      <Card className="p-6">
        <CardContent className="pt-6">
          <div className="flex justify-center items-center h-64">
            <p className="text-gray-500 text-lg">Nenhum dado disponível para o mês atual</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const gridCols = enabledTabs.length <= 2 ? `grid-cols-${enabledTabs.length}` :
                   enabledTabs.length === 3 ? 'grid-cols-3' : 'grid-cols-4';

  return (
    <Card className="w-full">
      <CardContent className="pt-6">
        <div className="w-full overflow-hidden">
          <h3 className="text-lg font-semibold mb-1 text-center">Evolução da Pontuação por Dia</h3>
          <p className="text-sm text-muted-foreground text-center mb-4">
            Evolução acumulada da pontuação dos profissionais ao longo do mês de {currentMonth}
          </p>

          <Tabs defaultValue={enabledTabs[0]?.key || "hair"} className="w-full" onValueChange={setActiveTab}>
            <TabsList className={`grid w-full max-w-lg mx-auto mb-6 ${gridCols}`}>
              {enabledTabs.map(tab => (
                <TabsTrigger key={tab.key} value={tab.key}>
                  {getCategoryDisplayName(tab.category)}
                </TabsTrigger>
              ))}
            </TabsList>

            {isCategoryEnabled(PROF_CATEGORIES.CABELO) && (
              <TabsContent value="hair" className="w-full">
                <EvolutionChartContainer
                  data={hairData}
                  type="hair"
                  selectedProfessionals={selectedProfessionals}
                  onToggleProfessional={toggleProfessional}
                  onSelectAll={selectAllProfessionals}
                  onClearAll={clearAllProfessionals}
                />
              </TabsContent>
            )}

            {isCategoryEnabled(PROF_CATEGORIES.UNHAS) && (
              <TabsContent value="manicure" className="w-full">
                <EvolutionChartContainer
                  data={manicureData}
                  type="manicure"
                  selectedProfessionals={selectedProfessionals}
                  onToggleProfessional={toggleProfessional}
                  onSelectAll={selectAllProfessionals}
                  onClearAll={clearAllProfessionals}
                />
              </TabsContent>
            )}

            {isCategoryEnabled(PROF_CATEGORIES.MAQUIAGEM) && (
              <TabsContent value="maquiagem" className="w-full">
                <EvolutionChartContainer
                  data={maquiagemData}
                  type="maquiagem"
                  selectedProfessionals={selectedProfessionals}
                  onToggleProfessional={toggleProfessional}
                  onSelectAll={selectAllProfessionals}
                  onClearAll={clearAllProfessionals}
                />
              </TabsContent>
            )}

            {isCategoryEnabled(PROF_CATEGORIES.ESTETICA) && (
              <TabsContent value="estetica" className="w-full">
                <EvolutionChartContainer
                  data={esteticaData}
                  type="estetica"
                  selectedProfessionals={selectedProfessionals}
                  onToggleProfessional={toggleProfessional}
                  onSelectAll={selectAllProfessionals}
                  onClearAll={clearAllProfessionals}
                />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </CardContent>
    </Card>
  );
}
