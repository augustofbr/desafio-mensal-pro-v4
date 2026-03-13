
import { Card } from "@/components/ui/card";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import DataRankings from "@/components/dashboard/DataRankings";
import DashboardCharts from "@/components/dashboard/DashboardCharts";
import PremiacaoPanel from "@/components/PremiacaoPanel";
import RegrasDoDesafio from "@/components/RegrasDoDesafio";
import DateFilter from "@/components/DateFilter";
import MonthProgress from "@/components/dashboard/MonthProgress";
import { EdgeFunctionProcessor } from "@/components/dashboard/EdgeFunctionProcessor";
import { DateFilterProvider, useDateFilter } from "@/contexts/DateFilterContext";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useMonthProgress } from "@/hooks/useMonthProgress";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Cake } from "lucide-react";
import { Button } from "@/components/ui/button";

function DashboardContent() {
  const navigate = useNavigate();
  const {
    hairData,
    manicureData,
    esteticaData,
    maquiagemData,
    lastUpdate,
    lastServiceDate,
    loading,
    refreshData,
    selectProfessional,
    professionalDetails
  } = useDashboardData();

  const { workedDays, remainingDays, totalDays } = useMonthProgress();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const { getFilteredDateRange } = useDateFilter();

  useEffect(() => {
    setShowDetails(!!professionalDetails);
  }, [professionalDetails]);

  const handleSelectProfessional = (professional: string, category: string) => {
    setSelectedCategory(category);
    selectProfessional(professional, category);
  };

  const handleCloseDetails = () => {
    setShowDetails(false);
    selectProfessional(null, null);
  };

  const getDataPeriodFromFilter = (): string => {
    const range = getFilteredDateRange();
    if (!range.startDate || !range.endDate) {
      return "Período não disponível";
    }

    const formatDate = (dateStr: string) => {
      const [year, month, day] = dateStr.split('-');
      return `${day}/${month}/${year}`;
    };

    return `De ${formatDate(range.startDate)} até ${formatDate(range.endDate)}`;
  };

  return (
    <div className="min-h-screen bg-gradient-warm">
      <EdgeFunctionProcessor
        refreshData={refreshData}
      />

      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center mb-5 animate-fade-slide-up">
            <img
              src="/lovable-uploads/0cb6b226-2d51-4078-9b78-b6565c728721.png"
              alt="Studio X - Salão de Beleza & Estética"
              className="h-20 md:h-28 mb-3"
            />
            <h1 className="text-2xl md:text-4xl font-display font-bold text-gray-800 text-center leading-tight">
              Desafio do Profissional Parceiro
            </h1>
            <p className="text-sm text-gray-500 font-body text-center mt-1.5 font-medium">
              {getDataPeriodFromFilter()}
            </p>
          </div>

          <div className="flex justify-center mt-3 mb-1 animate-fade-slide-up stagger-2">
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/aniversariantes')}
                className="gap-2 border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-body btn-novo-highlight shadow-sm shadow-rose-100/60"
              >
                <Cake className="h-4 w-4" />
                Aniversariantes
              </Button>
              <span className="absolute -top-2.5 -right-4 badge-novo text-[10px] font-body font-bold text-white px-2 py-0.5 rounded-full shadow-sm pointer-events-none">
                NOVO
              </span>
            </div>
          </div>

          <div className="animate-fade-slide-up stagger-3">
            <DateFilter />
          </div>

          <div className="animate-fade-slide-up stagger-4">
            <MonthProgress
              workedDays={workedDays}
              remainingDays={remainingDays}
              totalDays={totalDays}
              className="mb-5"
            />
          </div>

          <DashboardHeader
            lastUpdate={lastUpdate}
            loading={loading}
          />

          <div className="animate-fade-slide-up stagger-5">
            <PremiacaoPanel
              hairData={hairData}
              manicureData={manicureData}
              esteticaData={esteticaData}
              maquiagemData={maquiagemData}
              loading={loading}
            />
          </div>

          <div className="animate-fade-slide-up stagger-6">
            <RegrasDoDesafio />
          </div>

          <div className="animate-fade-slide-up stagger-7">
            <DataRankings
              hairData={hairData}
              manicureData={manicureData}
              esteticaData={esteticaData}
              maquiagemData={maquiagemData}
              loading={loading}
              onSelectProfessional={handleSelectProfessional}
              professionalDetails={professionalDetails}
              selectedCategory={selectedCategory || ""}
              showDetails={showDetails}
              onCloseDetails={handleCloseDetails}
            />
          </div>

          <div className="animate-fade-slide-up stagger-8 mt-5">
            {loading ? (
              <Card className="p-6 border-0 shadow-sm">
                <div className="flex justify-center items-center h-64">
                  <div className="text-center">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full animate-shimmer" />
                    <p className="text-gray-500 text-sm font-body">Carregando dados...</p>
                  </div>
                </div>
              </Card>
            ) : (
              <DashboardCharts
                hairData={hairData}
                manicureData={manicureData}
                esteticaData={esteticaData}
                maquiagemData={maquiagemData}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const Index = () => {
  return (
    <DateFilterProvider>
      <DashboardContent />
    </DateFilterProvider>
  );
}

export default Index;
