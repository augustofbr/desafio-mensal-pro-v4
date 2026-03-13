import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Award, CheckCircle, AlertCircle, Star } from "lucide-react";
import { getCurrentMonthName } from "@/lib/utils";

interface PremiacaoPanelProps {
  hairData: any[];
  manicureData: any[];
  esteticaData: any[];
  maquiagemData: any[];
  loading: boolean;
}

const PREMIACAO_CONFIG = {
  cabelo: {
    label: "Cabelo",
    premio: 300,
    minimo: 60,
    type: 'clients' as const,
  },
  unhas: {
    label: "Unhas",
    premio: 200,
    minimo: 50,
    type: 'clients' as const,
  },
  estetica: {
    label: "Estética",
    premio: 200,
    minimo: 5000,
    type: 'revenue' as const,
  },
  maquiagem: {
    label: "Make",
    premio: 200,
    minimo: 25,
    type: 'services' as const,
  },
};

type CategoryConfig = typeof PREMIACAO_CONFIG[keyof typeof PREMIACAO_CONFIG];

export default function PremiacaoPanel({ hairData, manicureData, esteticaData, maquiagemData, loading }: PremiacaoPanelProps) {
  const currentMonth = getCurrentMonthName();

  const getCategoryWinner = (data: any[], config: CategoryConfig) => {
    if (!data || data.length === 0) return null;

    const leader = data[0];

    const starCount = leader.starCount || 0;
    const starPoints = leader.starPoints || 0;

    if (config.type === 'revenue') {
      const totalRevenue = leader.totalRevenue || 0;
      const revenuePercentage = leader.revenuePercentage || 0;
      const qualified = totalRevenue >= config.minimo;

      return {
        professional: leader.professional,
        points: leader.points,
        totalRevenue,
        revenuePercentage,
        qualified,
        starCount,
        starPoints,
        type: 'revenue' as const,
      };
    } else if (config.type === 'services') {
      const totalServices = leader.totalServices || 0;
      const qualified = totalServices >= config.minimo;

      return {
        professional: leader.professional,
        points: leader.points,
        totalServices,
        qualified,
        starCount,
        starPoints,
        type: 'services' as const,
      };
    } else {
      const uniqueClients = leader.uniqueClientDays || 0;
      const qualified = uniqueClients >= config.minimo;

      return {
        professional: leader.professional,
        points: leader.points,
        uniqueClients,
        qualified,
        starCount,
        starPoints,
        type: 'clients' as const,
      };
    }
  };

  const hairWinner = getCategoryWinner(hairData, PREMIACAO_CONFIG.cabelo);
  const manicureWinner = getCategoryWinner(manicureData, PREMIACAO_CONFIG.unhas);
  const esteticaWinner = getCategoryWinner(esteticaData, PREMIACAO_CONFIG.estetica);
  const maquiagemWinner = getCategoryWinner(maquiagemData, PREMIACAO_CONFIG.maquiagem);

  if (loading) {
    return (
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 rounded-xl animate-shimmer" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getProgressPercent = (winner: ReturnType<typeof getCategoryWinner>, config: CategoryConfig): number => {
    if (!winner) return 0;
    if (winner.type === 'revenue') return Math.min(winner.revenuePercentage, 100);
    if (winner.type === 'services') return Math.min((winner.totalServices / config.minimo) * 100, 100);
    return Math.min((winner.uniqueClients / config.minimo) * 100, 100);
  };

  const renderCategoryAward = (
    config: CategoryConfig,
    winner: ReturnType<typeof getCategoryWinner>,
    colorScheme: { gradient: string; bgLight: string; text: string; progressBg: string; progressFill: string; iconBg: string },
    index: number
  ) => {
    const progress = getProgressPercent(winner, config);

    const getStatusLabel = () => {
      if (!winner) return 'Em andamento';
      if (winner.type === 'revenue') {
        const faltam = Math.ceil(100 - winner.revenuePercentage);
        return `Faltam ${faltam}% para meta mínima`;
      }
      if (winner.type === 'services') {
        const faltam = config.minimo - winner.totalServices;
        return `Faltam ${faltam} serviços para o mínimo`;
      }
      const faltam = config.minimo - winner.uniqueClients;
      return `Faltam ${faltam} clientes para o mínimo`;
    };

    const getMinimumLabel = () => {
      if (config.type === 'revenue') return `Meta de faturamento`;
      if (config.type === 'services') return `Min. ${config.minimo} serviços`;
      return `Min. ${config.minimo} clientes`;
    };

    const getPointsDisplay = () => {
      if (!winner) return '';
      if (winner.type === 'revenue') return `${winner.revenuePercentage}% da meta`;
      return `${winner.points} pontos`;
    };

    const getProgressLabel = () => {
      if (!winner) return '';
      if (winner.type === 'revenue') {
        return `${winner.revenuePercentage}% da meta de faturamento`;
      } else if (winner.type === 'services') {
        return `${winner.totalServices} / ${config.minimo} serviços`;
      }
      return `${winner.uniqueClients} / ${config.minimo} clientes`;
    };

    return (
      <div
        className={`animate-fade-slide-up stagger-${index + 1} rounded-2xl ${colorScheme.bgLight} p-4 relative overflow-hidden`}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl ${colorScheme.gradient} flex items-center justify-center shadow-sm`}>
              <Award className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <h4 className="font-display font-semibold text-base text-gray-800">{config.label}</h4>
              <p className="text-[11px] text-gray-500 font-body">{getMinimumLabel()}</p>
            </div>
          </div>
          {winner && (
            winner.qualified ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold">
                <CheckCircle className="h-3 w-3" />
                Qualificado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold">
                <AlertCircle className="h-3 w-3" />
                {getStatusLabel()}
              </span>
            )
          )}
        </div>

        {winner ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="font-body font-bold text-gray-900 text-sm">{winner.professional}</p>
                {winner.starCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-yellow-600 text-[11px] font-medium">
                    <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-500" />
                    {winner.starCount}
                    {winner.starPoints > 0 && <span className="text-gray-500">(+{winner.starPoints}pts)</span>}
                  </span>
                )}
              </div>
              <span className={`font-mono-num font-bold text-sm ${colorScheme.text}`}>
                {getPointsDisplay()}
              </span>
            </div>

            <div className="space-y-1">
              <div className={`w-full h-2 rounded-full ${colorScheme.progressBg} overflow-hidden`}>
                <div
                  className={`h-full rounded-full ${colorScheme.progressFill} animate-progress-fill`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-500 font-body">{getProgressLabel()}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-500 font-body py-2">
            Nenhum profissional com pontuação em {currentMonth}.
          </p>
        )}
      </div>
    );
  };

  return (
    <Card className="mb-6 border-0 shadow-md bg-gradient-to-br from-amber-50/80 via-white to-orange-50/50">
      <CardHeader className="pb-3 px-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shadow-sm">
            <Trophy className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle className="font-display text-lg">Painel de Premiação</CardTitle>
            <p className="text-xs text-gray-500 font-body">Ganhadores atuais de {currentMonth}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {renderCategoryAward(
            PREMIACAO_CONFIG.cabelo,
            hairWinner,
            {
              gradient: "gradient-cabelo",
              bgLight: "bg-blue-50/80",
              text: "text-blue-600",
              progressBg: "bg-blue-100",
              progressFill: "bg-gradient-to-r from-blue-400 to-blue-500",
              iconBg: "bg-blue-500",
            },
            0
          )}
          {renderCategoryAward(
            PREMIACAO_CONFIG.unhas,
            manicureWinner,
            {
              gradient: "gradient-unhas",
              bgLight: "bg-red-50/80",
              text: "text-red-600",
              progressBg: "bg-red-100",
              progressFill: "bg-gradient-to-r from-red-400 to-red-500",
              iconBg: "bg-red-500",
            },
            1
          )}
          {renderCategoryAward(
            PREMIACAO_CONFIG.maquiagem,
            maquiagemWinner,
            {
              gradient: "gradient-make",
              bgLight: "bg-yellow-50/80",
              text: "text-yellow-600",
              progressBg: "bg-yellow-100",
              progressFill: "bg-gradient-to-r from-yellow-400 to-yellow-500",
              iconBg: "bg-yellow-500",
            },
            2
          )}
          {renderCategoryAward(
            PREMIACAO_CONFIG.estetica,
            esteticaWinner,
            {
              gradient: "gradient-estetica",
              bgLight: "bg-violet-50/80",
              text: "text-violet-600",
              progressBg: "bg-violet-100",
              progressFill: "bg-gradient-to-r from-violet-400 to-violet-500",
              iconBg: "bg-violet-500",
            },
            3
          )}
        </div>
      </CardContent>
    </Card>
  );
}
