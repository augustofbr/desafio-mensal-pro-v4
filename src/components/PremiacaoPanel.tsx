import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Award, CheckCircle, AlertCircle, Star } from "lucide-react";
import { getCurrentMonthName } from "@/lib/utils";
import { useDateFilter } from "@/contexts/DateFilterContext";
import { getRulesForDate, getCategoryRules, CategoryRules, RulesVersion } from "@/lib/rulesConfig";

interface PremiacaoPanelProps {
  hairData: any[];
  manicureData: any[];
  esteticaData: any[];
  maquiagemData: any[];
  loading: boolean;
}

interface WinnerInfo {
  professional: string;
  points: number;
  uniqueClients: number;
  treatmentServices: number;
  spaServices: number;
  totalServices: number;
  revenuePercentage: number;
  starCount: number;
  starPoints: number;
  qualified: boolean;
  progressBars: { label: string; current: number; goal: number; percent: number }[];
}

type ColorScheme = {
  gradient: string;
  bgLight: string;
  text: string;
  progressBg: string;
  progressFill: string;
  iconBg: string;
};

function buildWinner(
  leader: any,
  categoryKey: string,
  categoryRules: CategoryRules
): WinnerInfo {
  const starCount = leader.starCount || 0;
  const starPoints = leader.starPoints || 0;
  const uniqueClients = leader.uniqueClientDays || 0;
  const treatmentServices = leader.treatmentServices || 0;
  const spaServices = leader.spaServices || 0;
  const totalServices = leader.totalServices || 0;
  const revenuePercentage = leader.revenuePercentage || 0;

  const goals = categoryRules.qualificationGoals;
  const progressBars: WinnerInfo["progressBars"] = [];
  let qualified = true;

  if (categoryKey === "cabelo") {
    if (goals.minUniqueClients != null) {
      const pct = Math.min((uniqueClients / goals.minUniqueClients) * 100, 100);
      progressBars.push({
        label: `${uniqueClients}/${goals.minUniqueClients} clientes`,
        current: uniqueClients,
        goal: goals.minUniqueClients,
        percent: pct,
      });
      if (uniqueClients < goals.minUniqueClients) qualified = false;
    }
    if (goals.minSpecialServices != null) {
      const pct = Math.min((treatmentServices / goals.minSpecialServices) * 100, 100);
      progressBars.push({
        label: `${treatmentServices}/${goals.minSpecialServices} tratamentos`,
        current: treatmentServices,
        goal: goals.minSpecialServices,
        percent: pct,
      });
      if (treatmentServices < goals.minSpecialServices) qualified = false;
    }
  } else if (categoryKey === "unhas") {
    if (goals.minUniqueClients != null) {
      const pct = Math.min((uniqueClients / goals.minUniqueClients) * 100, 100);
      progressBars.push({
        label: `${uniqueClients}/${goals.minUniqueClients} clientes`,
        current: uniqueClients,
        goal: goals.minUniqueClients,
        percent: pct,
      });
      if (uniqueClients < goals.minUniqueClients) qualified = false;
    }
    if (goals.minSpecialServices != null) {
      const pct = Math.min((spaServices / goals.minSpecialServices) * 100, 100);
      progressBars.push({
        label: `${spaServices}/${goals.minSpecialServices} SPA`,
        current: spaServices,
        goal: goals.minSpecialServices,
        percent: pct,
      });
      if (spaServices < goals.minSpecialServices) qualified = false;
    }
  } else if (categoryKey === "estetica") {
    const pct = Math.min(revenuePercentage, 100);
    progressBars.push({
      label: `${revenuePercentage}% da meta`,
      current: revenuePercentage,
      goal: 100,
      percent: pct,
    });
    if (revenuePercentage < 100) qualified = false;
  } else if (categoryKey === "maquiagem") {
    if (goals.minServices != null) {
      // V1: service count
      const pct = Math.min((totalServices / goals.minServices) * 100, 100);
      progressBars.push({
        label: `${totalServices}/${goals.minServices} serviços`,
        current: totalServices,
        goal: goals.minServices,
        percent: pct,
      });
      if (totalServices < goals.minServices) qualified = false;
    } else if (goals.minRevenue != null) {
      // V2: revenue percentage
      const pct = Math.min(revenuePercentage, 100);
      progressBars.push({
        label: `${revenuePercentage}% da meta`,
        current: revenuePercentage,
        goal: 100,
        percent: pct,
      });
      if (revenuePercentage < 100) qualified = false;
    }
  }

  return {
    professional: leader.professional,
    points: leader.points,
    uniqueClients,
    treatmentServices,
    spaServices,
    totalServices,
    revenuePercentage,
    starCount,
    starPoints,
    qualified,
    progressBars,
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  cabelo: "Cabelo",
  unhas: "Unhas",
  estetica: "Estética",
  maquiagem: "Make",
};

export default function PremiacaoPanel({ hairData, manicureData, esteticaData, maquiagemData, loading }: PremiacaoPanelProps) {
  const currentMonth = getCurrentMonthName();
  const { getFilteredDateRange } = useDateFilter();
  const { startDate } = getFilteredDateRange();
  const rules = getRulesForDate(startDate);

  const getWinner = (data: any[], categoryKey: string): WinnerInfo | null => {
    if (!data || data.length === 0) return null;
    const categoryRules = getCategoryRules(rules, categoryKey);
    return buildWinner(data[0], categoryKey, categoryRules);
  };

  const hairWinner = getWinner(hairData, "cabelo");
  const manicureWinner = getWinner(manicureData, "unhas");
  const esteticaWinner = getWinner(esteticaData, "estetica");
  const maquiagemWinner = getWinner(maquiagemData, "maquiagem");

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

  const getPointsDisplay = (winner: WinnerInfo, categoryKey: string): string => {
    const categoryRules = getCategoryRules(rules, categoryKey);
    if (categoryRules.scoringModel === 'revenue-percentage' || categoryRules.scoringModel === 'revenue-points') {
      if (categoryKey === 'estetica' || (categoryKey === 'maquiagem' && categoryRules.qualificationGoals.minRevenue != null)) {
        return `${winner.revenuePercentage}% da meta`;
      }
    }
    return `${winner.points} pontos`;
  };

  const getMinimumLabel = (categoryKey: string): string => {
    const categoryRules = getCategoryRules(rules, categoryKey);
    const goals = categoryRules.qualificationGoals;

    if (categoryKey === "cabelo" || categoryKey === "unhas") {
      const parts: string[] = [];
      if (goals.minUniqueClients != null) parts.push(`${goals.minUniqueClients} clientes`);
      if (goals.minSpecialServices != null) parts.push(`${goals.minSpecialServices} ${categoryRules.specialServiceLabel}`);
      return parts.length > 0 ? `Min. ${parts.join(" + ")}` : "";
    }
    if (goals.minRevenue != null) return `Meta de faturamento`;
    if (goals.minServices != null) return `Min. ${goals.minServices} serviços`;
    return "";
  };

  const getStatusLabel = (winner: WinnerInfo, categoryKey: string): string => {
    const bars = winner.progressBars;
    const unmet = bars.filter(b => b.percent < 100);
    if (unmet.length === 0) return "";

    if (categoryKey === "estetica" || (categoryKey === "maquiagem" && bars.length === 1 && bars[0].goal === 100)) {
      const faltam = Math.ceil(100 - winner.revenuePercentage);
      return `Faltam ${faltam}% para meta mínima`;
    }

    const parts = unmet.map(b => {
      const remaining = b.goal - b.current;
      return `${remaining} ${b.label.split(" ").slice(1).join(" ")}`;
    });
    return `Faltam ${parts.join(" e ")}`;
  };

  const renderCategoryAward = (
    categoryKey: string,
    winner: WinnerInfo | null,
    colorScheme: ColorScheme,
    index: number
  ) => {
    const categoryRules = getCategoryRules(rules, categoryKey);
    const label = CATEGORY_LABELS[categoryKey] || categoryKey;

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
              <h4 className="font-display font-semibold text-base text-gray-800">{label}</h4>
              <p className="text-[11px] text-gray-500 font-body">{getMinimumLabel(categoryKey)}</p>
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
                {getStatusLabel(winner, categoryKey)}
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
                {getPointsDisplay(winner, categoryKey)}
              </span>
            </div>

            <div className="flex items-end justify-between gap-2">
              <span className="text-[11px] text-gray-500 font-body whitespace-nowrap">
                {categoryRules.prize}
              </span>
            </div>

            <div className="space-y-1.5">
              {winner.progressBars.map((bar, bIdx) => (
                <div key={bIdx} className="space-y-0.5">
                  <div className={`w-full h-2 rounded-full ${colorScheme.progressBg} overflow-hidden`}>
                    <div
                      className={`h-full rounded-full ${colorScheme.progressFill} animate-progress-fill`}
                      style={{ width: `${bar.percent}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-gray-500 font-body">{bar.label}</p>
                </div>
              ))}
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
            "cabelo",
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
            "unhas",
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
            "maquiagem",
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
            "estetica",
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
