
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
import { Cake, Star, ClipboardList, QrCode, ExternalLink, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import CadastrarAvaliacaoModal from "@/components/avaliacoes/CadastrarAvaliacaoModal";
import QrCodeOverlay from "@/components/QrCodeOverlay";

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
    rules,
    refreshData,
    selectProfessional,
    professionalDetails,
    activeProfessionals
  } = useDashboardData();

  const { workedDays, todayCount, remainingDays, totalDays } = useMonthProgress();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showCadastrarAvaliacao, setShowCadastrarAvaliacao] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
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

          <div className="animate-fade-slide-up stagger-2">
            <DateFilter />
          </div>

          {/* Aniversariantes - card visivel separado do fluxo */}
          <div className="flex justify-center mt-3 mb-2 animate-fade-slide-up stagger-3">
            <button
              onClick={() => navigate('/aniversariantes')}
              className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-xl bg-rose-50 border-2 border-rose-200 text-rose-600 hover:bg-rose-100 hover:border-rose-400 active:bg-rose-200 transition-all duration-150 font-body text-sm font-semibold shadow-sm"
            >
              <Cake className="h-5 w-5" />
              Aniversariantes do Mês
              <ChevronRight className="h-4 w-4 opacity-60" />
            </button>
          </div>

          {/* Passo a passo: Avaliacao Google - vertical mobile-first */}
          <div className="animate-fade-slide-up stagger-3 mt-1 mb-1">
            <div className="bg-white/80 rounded-xl border border-violet-100/70 shadow-sm px-4 py-4">
              <p className="text-xs font-body text-violet-500 font-semibold text-center mb-3">
                Como conseguir suas Estrelas do Google
              </p>

              <div className="flex flex-col items-center gap-0">
                {/* Passo 1 */}
                <button
                  onClick={() => setShowQrCode(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-violet-200 bg-white hover:bg-violet-50 hover:border-violet-400 active:bg-violet-100 transition-all duration-150"
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-violet-600 text-white text-sm font-bold font-body shadow flex-shrink-0">
                    1
                  </div>
                  <div className="flex-1 text-left">
                    <span className="text-xs font-body font-bold text-violet-600 uppercase tracking-wide">Passo 1</span>
                    <p className="text-sm font-body text-gray-700 leading-tight">Mostre o QR Code para a cliente</p>
                  </div>
                  <QrCode className="h-5 w-5 text-violet-400 flex-shrink-0" />
                </button>

                <ChevronDown className="h-5 w-5 text-violet-400 my-1" />

                {/* Passo 2 */}
                <button
                  onClick={() => window.open('https://maps.app.goo.gl/8fND35FPPDSGUu3K8', '_blank')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-violet-200 bg-white hover:bg-violet-50 hover:border-violet-400 active:bg-violet-100 transition-all duration-150"
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-violet-600 text-white text-sm font-bold font-body shadow flex-shrink-0">
                    2
                  </div>
                  <div className="flex-1 text-left">
                    <span className="text-xs font-body font-bold text-violet-600 uppercase tracking-wide">Passo 2</span>
                    <p className="text-sm font-body text-gray-700 leading-tight">Confirme se a cliente avaliou no Google</p>
                  </div>
                  <ExternalLink className="h-5 w-5 text-violet-400 flex-shrink-0" />
                </button>

                <ChevronDown className="h-5 w-5 text-violet-400 my-1" />

                {/* Passo 3 */}
                <div className="relative w-full">
                  <span className="absolute top-1 right-1.5 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-body font-semibold text-amber-600 z-10 shadow-sm">
                    Apenas se estrela entrou no Google
                  </span>
                  <button
                    onClick={() => setShowCadastrarAvaliacao(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-violet-200 bg-white hover:bg-violet-50 hover:border-violet-400 active:bg-violet-100 transition-all duration-150"
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-violet-600 text-white text-sm font-bold font-body shadow flex-shrink-0">
                      3
                    </div>
                    <div className="flex-1 text-left">
                      <span className="text-xs font-body font-bold text-violet-600 uppercase tracking-wide">Passo 3</span>
                      <p className="text-sm font-body text-gray-700 leading-tight">Cadastre a avaliação da sua cliente</p>
                    </div>
                    <Star className="h-5 w-5 text-violet-400 flex-shrink-0" />
                  </button>
                </div>

                <ChevronDown className="h-5 w-5 text-violet-400 my-1" />

                {/* Passo 4 */}
                <button
                  onClick={() => navigate('/minhas-avaliacoes')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-violet-200 bg-white hover:bg-violet-50 hover:border-violet-400 active:bg-violet-100 transition-all duration-150"
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-violet-600 text-white text-sm font-bold font-body shadow flex-shrink-0">
                    4
                  </div>
                  <div className="flex-1 text-left">
                    <span className="text-xs font-body font-bold text-violet-600 uppercase tracking-wide">Passo 4</span>
                    <p className="text-sm font-body text-gray-700 leading-tight">Veja suas avaliações cadastradas</p>
                  </div>
                  <ClipboardList className="h-5 w-5 text-violet-400 flex-shrink-0" />
                </button>
              </div>
            </div>
          </div>

          <div className="animate-fade-slide-up stagger-4">
            <MonthProgress
              workedDays={workedDays}
              todayCount={todayCount}
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
              rules={rules}
            />
          </div>

          <div className="animate-fade-slide-up stagger-6">
            <RegrasDoDesafio rules={rules} />
          </div>

          <div className="animate-fade-slide-up stagger-7">
            <DataRankings
              hairData={hairData}
              manicureData={manicureData}
              esteticaData={esteticaData}
              maquiagemData={maquiagemData}
              loading={loading}
              rules={rules}
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
                rules={rules}
              />
            )}
          </div>
        </div>
      </div>

      <CadastrarAvaliacaoModal
        isOpen={showCadastrarAvaliacao}
        onClose={() => setShowCadastrarAvaliacao(false)}
        activeProfessionals={activeProfessionals}
      />

      <QrCodeOverlay
        isOpen={showQrCode}
        onClose={() => setShowQrCode(false)}
      />
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
