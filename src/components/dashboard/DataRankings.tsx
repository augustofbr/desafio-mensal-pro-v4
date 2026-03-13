
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ProfessionalRanking from "@/components/ProfessionalRanking";
import ProfessionalModal from "@/components/ProfessionalModal";
import { getCategoryDisplayName, PROF_CATEGORIES, isCategoryEnabled } from "@/lib/categoryDisplayNames";
import { BarChart3 } from "lucide-react";
import { getCurrentMonthName } from "@/lib/utils";

interface DataRankingsProps {
  hairData: any[];
  manicureData: any[];
  esteticaData: any[];
  maquiagemData: any[];
  loading: boolean;
  onSelectProfessional: (professional: string, category: string) => void;
  professionalDetails: any;
  selectedCategory: string;
  showDetails: boolean;
  onCloseDetails: () => void;
}

const CATEGORY_CONFIG = {
  [PROF_CATEGORIES.CABELO]: {
    titleColor: "text-blue-600",
    borderColor: "border-blue-100",
    bgLight: "bg-blue-50/40",
    separatorColor: "bg-gray-200",
  },
  [PROF_CATEGORIES.UNHAS]: {
    titleColor: "text-red-500",
    borderColor: "border-red-100",
    bgLight: "bg-red-50/40",
    separatorColor: "bg-gray-200",
  },
  [PROF_CATEGORIES.MAQUIAGEM]: {
    titleColor: "text-yellow-600",
    borderColor: "border-yellow-100",
    bgLight: "bg-yellow-50/40",
    separatorColor: "bg-gray-200",
  },
  [PROF_CATEGORIES.ESTETICA]: {
    titleColor: "text-violet-600",
    borderColor: "border-violet-100",
    bgLight: "bg-violet-50/40",
    separatorColor: "bg-gray-200",
  },
};

export default function DataRankings({
  hairData,
  manicureData,
  esteticaData,
  maquiagemData,
  loading,
  onSelectProfessional,
  professionalDetails,
  selectedCategory,
  showDetails,
  onCloseDetails
}: DataRankingsProps) {
  const currentMonth = getCurrentMonthName();

  const categories = [
    { key: PROF_CATEGORIES.CABELO, data: hairData, enabled: isCategoryEnabled(PROF_CATEGORIES.CABELO) },
    { key: PROF_CATEGORIES.UNHAS, data: manicureData, enabled: isCategoryEnabled(PROF_CATEGORIES.UNHAS) },
    { key: PROF_CATEGORIES.MAQUIAGEM, data: maquiagemData, enabled: isCategoryEnabled(PROF_CATEGORIES.MAQUIAGEM) },
    { key: PROF_CATEGORIES.ESTETICA, data: esteticaData, enabled: isCategoryEnabled(PROF_CATEGORIES.ESTETICA) },
  ];

  const enabledCategories = categories.filter(c => c.enabled);

  return (
    <>
    <Card className="border-0 shadow-md bg-gradient-to-br from-gray-50/80 via-white to-slate-50/50">
      <CardHeader className="pb-3 px-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center shadow-sm">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle className="font-display text-lg">Ranking por Categorias</CardTitle>
            <p className="text-xs text-gray-500 font-body">Classificação de {currentMonth}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {enabledCategories.map((category, index) => {
            const config = CATEGORY_CONFIG[category.key];

            return (
              <div
                key={category.key}
                className={`animate-fade-slide-up stagger-${Math.min(index + 1, 8)} rounded-2xl border ${config.borderColor} ${config.bgLight} p-4`}
              >
                <h3 className={`text-center font-display text-lg font-bold italic ${config.titleColor}`}>
                  {getCategoryDisplayName(category.key)}
                </h3>
                <div className={`h-px ${config.separatorColor} my-3`} />

                {loading ? (
                  <div className="space-y-2 py-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-14 rounded-xl animate-shimmer" />
                    ))}
                  </div>
                ) : (
                  <ProfessionalRanking
                    data={category.data}
                    categoryKey={category.key}
                    onSelectProfessional={(professional) => onSelectProfessional(professional, category.key)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>

    <ProfessionalModal
      isOpen={showDetails}
      onClose={onCloseDetails}
      details={professionalDetails}
      category={selectedCategory}
    />
    </>
  );
}
