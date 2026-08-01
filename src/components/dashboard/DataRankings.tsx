
import { Card, CardContent } from "@/components/ui/card";
import ProfessionalRanking from "@/components/ProfessionalRanking";
import ProfessionalModal from "@/components/ProfessionalModal";
import { getCategoryDisplayName, PROF_CATEGORIES, isCategoryActive } from "@/lib/categoryDisplayNames";
import { BarChart3 } from "lucide-react";
import { getCurrentMonthName } from "@/lib/utils";
import { getCategoryRules, RulesVersion } from "@/lib/rulesConfig";

interface DataRankingsProps {
  hairData: any[];
  manicureData: any[];
  esteticaData: any[];
  maquiagemData: any[];
  loading: boolean;
  rules: RulesVersion;
  onSelectProfessional: (professionalId: string, professional: string, category: string) => void;
  professionalDetails: any;
  selectedCategory: string;
  showDetails: boolean;
  onCloseDetails: () => void;
}

export default function DataRankings({
  hairData,
  manicureData,
  esteticaData,
  maquiagemData,
  loading,
  rules,
  onSelectProfessional,
  professionalDetails,
  selectedCategory,
  showDetails,
  onCloseDetails
}: DataRankingsProps) {
  const currentMonth = getCurrentMonthName();

  const categories = [
    { key: PROF_CATEGORIES.CABELO, data: hairData, enabled: isCategoryActive(rules, PROF_CATEGORIES.CABELO) },
    { key: PROF_CATEGORIES.UNHAS, data: manicureData, enabled: isCategoryActive(rules, PROF_CATEGORIES.UNHAS) },
    { key: PROF_CATEGORIES.MAQUIAGEM, data: maquiagemData, enabled: isCategoryActive(rules, PROF_CATEGORIES.MAQUIAGEM) },
    { key: PROF_CATEGORIES.ESTETICA, data: esteticaData, enabled: isCategoryActive(rules, PROF_CATEGORIES.ESTETICA) },
  ];

  const enabledCategories = categories.filter(c => c.enabled);

  return (
    <>
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <BarChart3 className="h-6 w-6 text-primary" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Ranking por Categorias</h2>
            <p className="text-base text-muted-foreground">
              Classificação de {currentMonth} · toque num nome para ver o detalhe
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {enabledCategories.map((category, index) => (
            <div
              key={category.key}
              className={`animate-fade-slide-up stagger-${Math.min(index + 1, 8)} space-y-3 rounded-2xl border bg-muted/30 p-4`}
            >
              <h3 className="text-lg font-semibold">
                {getCategoryDisplayName(category.key)}
              </h3>

              {loading ? (
                <div className="space-y-2.5 py-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-14 rounded-xl animate-shimmer" />
                  ))}
                </div>
              ) : (
                <ProfessionalRanking
                  data={category.data}
                  categoryKey={category.key}
                  onSelectProfessional={(professionalId, professional) =>
                    onSelectProfessional(professionalId, professional, category.key)
                  }
                  rules={getCategoryRules(rules, category.key)}
                />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>

    <ProfessionalModal
      isOpen={showDetails}
      onClose={onCloseDetails}
      details={professionalDetails}
      category={selectedCategory}
      rules={selectedCategory ? getCategoryRules(rules, selectedCategory) : undefined}
    />
    </>
  );
}
