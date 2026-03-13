
import { getCurrentMonthName } from "@/lib/utils";
import { Star, Trophy, AlertTriangle } from "lucide-react";
import { PROF_CATEGORIES } from "@/lib/categoryDisplayNames";
import { CategoryRules } from "@/lib/rulesConfig";

interface ProfessionalRankingProps {
  data: any[];
  categoryKey: string;
  onSelectProfessional: (professional: string) => void;
  rules: CategoryRules;
}

const CATEGORY_COLORS: Record<string, {
  firstBg: string;
  firstBorder: string;
  firstBadgeBg: string;
  firstBadgeText: string;
  firstNameText: string;
  firstScoreText: string;
}> = {
  [PROF_CATEGORIES.CABELO]: {
    firstBg: "bg-blue-50/80",
    firstBorder: "border-blue-200/60",
    firstBadgeBg: "bg-white",
    firstBadgeText: "text-blue-600",
    firstNameText: "text-blue-900",
    firstScoreText: "text-blue-700",
  },
  [PROF_CATEGORIES.UNHAS]: {
    firstBg: "bg-red-50/80",
    firstBorder: "border-red-200/60",
    firstBadgeBg: "bg-white",
    firstBadgeText: "text-red-500",
    firstNameText: "text-red-900",
    firstScoreText: "text-red-600",
  },
  [PROF_CATEGORIES.MAQUIAGEM]: {
    firstBg: "bg-yellow-50/80",
    firstBorder: "border-yellow-200/60",
    firstBadgeBg: "bg-white",
    firstBadgeText: "text-yellow-600",
    firstNameText: "text-yellow-900",
    firstScoreText: "text-yellow-700",
  },
  [PROF_CATEGORIES.ESTETICA]: {
    firstBg: "bg-violet-50/80",
    firstBorder: "border-violet-200/60",
    firstBadgeBg: "bg-white",
    firstBadgeText: "text-violet-600",
    firstNameText: "text-violet-900",
    firstScoreText: "text-violet-600",
  },
};

export default function ProfessionalRanking({
  data,
  categoryKey,
  onSelectProfessional,
  rules,
}: ProfessionalRankingProps) {
  const currentMonth = getCurrentMonthName();
  const colors = CATEGORY_COLORS[categoryKey] || CATEGORY_COLORS[PROF_CATEGORIES.CABELO];

  if (data.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
          <Trophy className="h-6 w-6 text-gray-300" />
        </div>
        <p className="text-gray-500 font-body text-sm">
          Nenhum profissional com pontuação em {currentMonth}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
        {data.map((item, index) => {
          const isFirst = index === 0;
          const score = rules.scoringModel === 'revenue-percentage'
            ? `${item.revenuePercentage}%`
            : `${item.points} Pts`;

          return (
            <div
              key={item.professional}
              className={`
                ranking-card-touch rounded-xl p-2.5 sm:p-3.5 cursor-pointer
                animate-fade-slide-up stagger-${Math.min(index + 1, 8)}
                ${isFirst
                  ? `${colors.firstBg} border ${colors.firstBorder} shadow-sm`
                  : "bg-white border border-gray-100 hover:border-gray-200 hover:shadow-sm"
                }
              `}
              onClick={() => onSelectProfessional(item.professional)}
            >
              <div className="flex items-start sm:items-center gap-1.5 sm:gap-2 min-w-0">
                {/* Position badge */}
                <div className={`
                  flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full font-mono-num text-xs sm:text-sm font-bold shadow-sm shrink-0
                  ${isFirst
                    ? `${colors.firstBadgeBg} ${colors.firstBadgeText}`
                    : "bg-gray-100 text-gray-500"
                  }
                `}>
                  {index + 1}º
                </div>

                {/* Content wrapper - two lines on mobile, single line on desktop */}
                <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1.5">
                  {/* Name */}
                  <span className={`font-semibold font-body text-xs sm:text-sm truncate min-w-0 sm:flex-1 ${isFirst ? colors.firstNameText : "text-gray-800"}`}>
                    {item.professional}
                  </span>

                  {/* Stats badges - below name on mobile, inline on desktop */}
                  <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 text-[10px] sm:text-sm">
                    {item.starCount > 0 && (
                      <span className="inline-flex items-center gap-0.5 font-semibold bg-amber-100 text-amber-800 rounded-full px-1.5 sm:px-2 py-0.5">
                        <Star className="h-3 w-3 sm:h-3.5 sm:w-3.5 fill-amber-500 text-amber-500" />
                        <span className="font-mono-num">{item.starCount}</span>
                      </span>
                    )}
                    {categoryKey === PROF_CATEGORIES.CABELO && (
                      <>
                        <span className="inline-flex items-center bg-slate-100 text-slate-600 rounded-full px-1.5 sm:px-2 py-0.5 font-medium">
                          <span className="font-mono-num">{item.uniqueClientDays}</span><span className="text-slate-400 ml-0.5">cli</span>
                        </span>
                        <span className="inline-flex items-center bg-slate-100 text-slate-600 rounded-full px-1.5 sm:px-2 py-0.5 font-medium">
                          <span className="font-mono-num">{item.treatmentServices}</span><span className="text-slate-400 ml-0.5">tratam</span>
                        </span>
                        {rules.manufacturerConstraints && item.invalidTreatmentCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 bg-orange-100 text-orange-600 rounded-full px-1.5 sm:px-2 py-0.5 font-medium">
                            <AlertTriangle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            <span className="font-mono-num">{item.invalidTreatmentCount}</span>
                          </span>
                        )}
                      </>
                    )}
                    {categoryKey === PROF_CATEGORIES.UNHAS && (
                      <>
                        <span className="inline-flex items-center bg-slate-100 text-slate-600 rounded-full px-1.5 sm:px-2 py-0.5 font-medium">
                          <span className="font-mono-num">{item.uniqueClientDays}</span><span className="text-slate-400 ml-0.5">cli</span>
                        </span>
                        <span className="inline-flex items-center bg-slate-100 text-slate-600 rounded-full px-1.5 sm:px-2 py-0.5 font-medium">
                          <span className="font-mono-num">{item.spaServices}</span><span className="text-slate-400 ml-0.5">SPA</span>
                        </span>
                      </>
                    )}
                    {categoryKey === PROF_CATEGORIES.MAQUIAGEM && (
                      <span className="inline-flex items-center bg-slate-100 text-slate-600 rounded-full px-1.5 sm:px-2 py-0.5 font-medium">
                        <span className="font-mono-num">{rules.scoringModel === 'revenue-points' ? item.serviceCount ?? item.totalServices : item.totalServices}</span><span className="text-slate-400 ml-0.5">serv</span>
                      </span>
                    )}
                    {categoryKey === PROF_CATEGORIES.ESTETICA && (
                      <span className="inline-flex items-center bg-slate-100 text-slate-600 rounded-full px-1.5 sm:px-2 py-0.5 font-medium">
                        <span className="font-mono-num">{item.serviceCount}</span><span className="text-slate-400 ml-0.5">serv</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Score - right-aligned */}
                <span className={`font-mono-num text-sm sm:text-lg font-bold shrink-0 ${isFirst ? colors.firstScoreText : "text-gray-700"}`}>
                  {score}
                </span>
              </div>
            </div>
          );
        })}
    </div>
  );
}
