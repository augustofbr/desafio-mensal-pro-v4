import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Star, Trophy } from "lucide-react";
import { getCurrentMonthName } from "@/lib/utils";
import { getCategoryRules, CategoryRules, RulesVersion } from "@/lib/rulesConfig";
import { isCategoryActive, PROF_CATEGORIES } from "@/lib/categoryDisplayNames";

interface PremiacaoPanelProps {
  hairData: any[];
  manicureData: any[];
  esteticaData: any[];
  maquiagemData: any[];
  loading: boolean;
  rules: RulesVersion;
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
  const specialServices = leader.specialServices || 0;
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
        label: `${treatmentServices}/${goals.minSpecialServices} ${categoryRules.specialServiceLabel}`,
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
        label: `${spaServices}/${goals.minSpecialServices} ${categoryRules.specialServiceLabel}`,
        current: spaServices,
        goal: goals.minSpecialServices,
        percent: pct,
      });
      if (spaServices < goals.minSpecialServices) qualified = false;
    }
  } else if (categoryKey === "estetica" && categoryRules.scoringModel === "points") {
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
      const pct = Math.min((specialServices / goals.minSpecialServices) * 100, 100);
      progressBars.push({
        label: `${specialServices}/${goals.minSpecialServices} ${categoryRules.specialServiceLabel}`,
        current: specialServices,
        goal: goals.minSpecialServices,
        percent: pct,
      });
      if (specialServices < goals.minSpecialServices) qualified = false;
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

type Barra = WinnerInfo["progressBars"][number];

/**
 * Barra de faturamento: o painel nunca expoe reais, so o percentual da meta
 * (mesma convencao do MeuCartao). O marcador e o rotulo montado no buildWinner
 * ("89% da meta"), e nao o scoringModel, porque Estetica e Make trocam de
 * modelo entre as versoes de regra e a barra nem sempre acompanha.
 */
function ehPercentual(barra: Barra): boolean {
  return barra.goal === 100 && barra.label.includes("%");
}

/** Nome da meta: o rotulo do buildWinner sem o prefixo numerico. */
function rotuloDaBarra(barra: Barra): string {
  if (ehPercentual(barra)) return "Meta do mês";
  return barra.label
    .replace(/^[\d.,]+\/[\d.,]+\s*/, "")
    .replace(/^[\d.,]+%\s*/, "")
    .trim();
}

/** Mesma leitura do MeuCartao: "73 de 60" ou "89% da meta". */
function textoDaBarra(barra: Barra): string {
  if (ehPercentual(barra)) return `${barra.current}% da meta`;
  return `${barra.current} de ${barra.goal}`;
}

function inicial(nome: string): string {
  return (Array.from(nome?.trim() ?? "")[0] ?? "?").toUpperCase();
}

/**
 * Painel de Premiação: quem lidera cada categoria e o quanto falta para a
 * premiação ser liberada.
 *
 * Veste a mesma anatomia da familia `resultados/` (MeuCartao/MinhaSemana):
 * card por categoria, avatar de inicial, numero grande em `.font-mono-num` e
 * as metas como `Progress`. `buildWinner` e os rotulos de status seguem
 * intactos — a apresentacao mudou, os numeros nao.
 */
export default function PremiacaoPanel({ hairData, manicureData, esteticaData, maquiagemData, loading, rules }: PremiacaoPanelProps) {
  const currentMonth = getCurrentMonthName();

  const getWinner = (data: any[], categoryKey: string): WinnerInfo | null => {
    if (!data || data.length === 0) return null;
    const categoryRules = getCategoryRules(rules, categoryKey);
    return buildWinner(data[0], categoryKey, categoryRules);
  };

  const hairWinner = getWinner(hairData, "cabelo");
  const manicureWinner = getWinner(manicureData, "unhas");
  const esteticaWinner = getWinner(esteticaData, "estetica");
  const maquiagemWinner = getWinner(maquiagemData, "maquiagem");

  const activeCategoryKeys = ['cabelo', 'unhas', 'estetica', 'maquiagem'].filter(
    (key) => getCategoryRules(rules, key)?.enabled !== false
  );
  const allPrizes = activeCategoryKeys.map((key) => getCategoryRules(rules, key).prize);
  const allSamePrize = allPrizes.length > 0 && new Set(allPrizes).size === 1;
  const commonPrize = allSamePrize ? allPrizes[0] : null;

  if (loading) {
    return (
      <Card className="mb-6">
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 rounded-2xl animate-shimmer" />
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

    if (categoryKey === "cabelo" || categoryKey === "unhas" ||
        (categoryKey === "estetica" && categoryRules.scoringModel === "points")) {
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

    const esteticaPorFaturamento =
      categoryKey === "estetica" && getCategoryRules(rules, categoryKey).scoringModel !== "points";
    if (esteticaPorFaturamento || (categoryKey === "maquiagem" && bars.length === 1 && bars[0].goal === 100)) {
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
    index: number
  ) => {
    const categoryRules = getCategoryRules(rules, categoryKey);
    const label = CATEGORY_LABELS[categoryKey] || categoryKey;
    const statusPendente =
      winner && !winner.qualified ? getStatusLabel(winner, categoryKey) : "";
    // Com lider na tela as barras ja dizem cada alvo ("clientes · 73 de 60"):
    // repetir "Min. 60 clientes + 5 Cronograma Capilar" no topo duplicaria os
    // mesmos numeros. Sem lider nao ha barra, e a regra vira a unica informacao.
    const regraDaCategoria = winner ? "" : getMinimumLabel(categoryKey);

    return (
      <div
        key={categoryKey}
        className={`animate-fade-slide-up stagger-${index + 1} space-y-4 rounded-2xl border bg-muted/30 p-4`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{label}</h3>
            {!allSamePrize && (
              <p className="text-base text-muted-foreground">
                Prêmio: {categoryRules.prize}
              </p>
            )}
          </div>
          {winner?.qualified && (
            <Badge variant="secondary" className="shrink-0 text-sm">
              <span aria-hidden="true" className="mr-1">
                ✅
              </span>
              Qualificado
            </Badge>
          )}
        </div>

        {winner ? (
          <>
            <div className="flex items-center gap-3">
              <Avatar className="h-11 w-11 shrink-0">
                <AvatarFallback className="text-base font-semibold">
                  {inicial(winner.professional)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold">{winner.professional}</p>
                {winner.starCount > 0 && (
                  <p className="flex flex-wrap items-center gap-x-1.5 text-base text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-4 w-4 fill-accent text-accent" aria-hidden="true" />
                      <span className="font-mono-num">{winner.starCount}</span> estrelas
                    </span>
                    {winner.starPoints > 0 && (
                      <span>
                        · <span className="font-mono-num">+{winner.starPoints}</span> pts
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <span className="font-mono-num text-2xl font-bold leading-none tracking-tight text-primary">
                  {getPointsDisplay(winner, categoryKey).split(" ")[0]}
                </span>
                <span className="mt-0.5 block text-base text-muted-foreground">
                  {getPointsDisplay(winner, categoryKey).split(" ").slice(1).join(" ")}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {winner.progressBars.map((bar, bIdx) => (
                <div key={bIdx} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-base">
                    <span className="min-w-0">
                      <span className="font-medium">{rotuloDaBarra(bar)}</span>
                      <span className="text-muted-foreground"> · </span>
                      <span className="font-mono-num">{textoDaBarra(bar)}</span>
                    </span>
                    {bar.percent >= 100 && (
                      <span role="img" aria-label="meta batida" className="shrink-0">
                        ✅
                      </span>
                    )}
                  </div>
                  <Progress
                    value={bar.percent}
                    aria-label={`${rotuloDaBarra(bar)}: ${textoDaBarra(bar)}`}
                    className="h-3"
                  />
                </div>
              ))}
            </div>

            {statusPendente && (
              <p className="text-base text-muted-foreground">{statusPendente}</p>
            )}
          </>
        ) : (
          <div className="space-y-1">
            <p className="text-base text-muted-foreground">
              Nenhum profissional com pontuação em {currentMonth}.
            </p>
            {regraDaCategoria && (
              <p className="text-base text-muted-foreground">{regraDaCategoria}</p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="mb-6">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Trophy className="h-6 w-6 text-primary" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Painel de Premiação</h2>
            <p className="text-base text-muted-foreground">
              Ganhadores atuais de {currentMonth}
            </p>
            {commonPrize && <p className="text-base font-medium">Prêmio: {commonPrize}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isCategoryActive(rules, PROF_CATEGORIES.CABELO) &&
            renderCategoryAward("cabelo", hairWinner, 0)}
          {isCategoryActive(rules, PROF_CATEGORIES.UNHAS) &&
            renderCategoryAward("unhas", manicureWinner, 1)}
          {isCategoryActive(rules, PROF_CATEGORIES.MAQUIAGEM) &&
            renderCategoryAward("maquiagem", maquiagemWinner, 2)}
          {isCategoryActive(rules, PROF_CATEGORIES.ESTETICA) &&
            renderCategoryAward("estetica", esteticaWinner, 3)}
        </div>
      </CardContent>
    </Card>
  );
}
