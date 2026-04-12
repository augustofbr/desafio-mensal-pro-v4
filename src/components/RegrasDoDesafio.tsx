import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BookOpen, Scissors, Sparkles, Heart, Palette, LucideIcon } from "lucide-react";
import { RulesVersion, CategoryRules, getCategoryRules } from "@/lib/rulesConfig";

interface CategoriaRegra {
  id: string;
  label: string;
  premio: string;
  icon: LucideIcon;
  colorScheme: {
    gradient: string;
    bgLight: string;
    text: string;
    border: string;
    badge: string;
    bullet: string;
  };
  regras: string[];
  meta: string;
  metaExcelencia?: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: LucideIcon; colorScheme: CategoriaRegra["colorScheme"] }> = {
  cabelo: {
    label: "Cabelo",
    icon: Scissors,
    colorScheme: {
      gradient: "gradient-cabelo",
      bgLight: "bg-blue-50/80",
      text: "text-blue-700",
      border: "border-blue-200",
      badge: "bg-blue-100 text-blue-700",
      bullet: "bg-blue-400",
    },
  },
  unhas: {
    label: "Unhas",
    icon: Sparkles,
    colorScheme: {
      gradient: "gradient-unhas",
      bgLight: "bg-red-50/80",
      text: "text-red-700",
      border: "border-red-200",
      badge: "bg-red-100 text-red-700",
      bullet: "bg-red-400",
    },
  },
  estetica: {
    label: "Estetica",
    icon: Heart,
    colorScheme: {
      gradient: "gradient-estetica",
      bgLight: "bg-violet-50/80",
      text: "text-violet-700",
      border: "border-violet-200",
      badge: "bg-violet-100 text-violet-700",
      bullet: "bg-violet-400",
    },
  },
  maquiagem: {
    label: "Maquiagem",
    icon: Palette,
    colorScheme: {
      gradient: "gradient-make",
      bgLight: "bg-yellow-50/80",
      text: "text-yellow-700",
      border: "border-yellow-200",
      badge: "bg-yellow-100 text-yellow-700",
      bullet: "bg-yellow-400",
    },
  },
};

function buildRegrasForCategory(catRules: CategoryRules, manufacturerLabel?: string): string[] {
  const regras: string[] = [];

  if (catRules.scoringModel === "points") {
    if (catRules.clientPointValue > 0) {
      regras.push(
        `Cada cliente atendido no dia vale ${catRules.clientPointValue} ponto${catRules.clientPointValue > 1 ? "s" : ""} (mesmo cliente no mesmo dia conta so 1 vez)`
      );
    }
    if (catRules.specialServicePointValue > 0) {
      const label = catRules.specialServiceLabel || "servico especial";
      const extra = catRules.manufacturerConstraints ? " da marca autorizada" : "";
      regras.push(
        `Cada ${label}${extra} vale ${catRules.specialServicePointValue} ponto${catRules.specialServicePointValue > 1 ? "s" : ""}`
      );
    }
  } else if (catRules.scoringModel === "revenue-percentage") {
    regras.push("A pontuacao e baseada no faturamento: quanto mais faturar, maior a pontuacao");
  } else if (catRules.scoringModel === "revenue-points") {
    const conv = catRules.revenuePointConversion || 100;
    regras.push(
      `A pontuacao e baseada no faturamento: a cada R$ ${conv.toLocaleString("pt-BR")} faturados, voce ganha 1 ponto`
    );
  }

  if (catRules.starsCountInScore && catRules.starPointValue > 0) {
    regras.push(
      `Cada avaliacao Google aprovada vale ${catRules.starPointValue} ponto${catRules.starPointValue > 1 ? "s" : ""}`
    );
  } else if (!catRules.starsCountInScore) {
    regras.push("Avaliacoes Google aparecem no perfil, mas nao somam pontos nesta categoria");
  }

  return regras;
}

function buildMetaText(catRules: CategoryRules): string {
  const parts: string[] = [];

  if (catRules.qualificationGoals.minUniqueClients) {
    parts.push(`${catRules.qualificationGoals.minUniqueClients} clientes unicos`);
  }
  if (catRules.qualificationGoals.minSpecialServices) {
    parts.push(`${catRules.qualificationGoals.minSpecialServices} ${catRules.specialServiceLabel || "servicos especiais"}`);
  }
  if (catRules.qualificationGoals.minRevenue) {
    parts.push(`faturamento de R$ ${catRules.qualificationGoals.minRevenue.toLocaleString("pt-BR")}`);
  }
  if (catRules.qualificationGoals.minServices) {
    parts.push(`${catRules.qualificationGoals.minServices} servicos`);
  }

  if (parts.length === 0) return "Sem meta minima definida";
  return `Meta minima: ${parts.join(" + ")} no mes`;
}

function buildMetaExcelencia(catRules: CategoryRules): string | undefined {
  if (catRules.symbolicGoals.stars && catRules.symbolicGoals.stars > 0) {
    return `Meta excelencia profissional: ${catRules.symbolicGoals.stars} estrelas Google`;
  }
  return undefined;
}

function buildRegras(rules: RulesVersion): CategoriaRegra[] {
  return (["cabelo", "unhas", "estetica", "maquiagem"] as const).map((catKey) => {
    const catRules = getCategoryRules(rules, catKey);
    const config = CATEGORY_CONFIG[catKey];
    return {
      id: catKey,
      label: config.label,
      premio: catRules.prize,
      icon: config.icon,
      colorScheme: config.colorScheme,
      regras: buildRegrasForCategory(catRules),
      meta: buildMetaText(catRules),
      metaExcelencia: buildMetaExcelencia(catRules),
    };
  });
}

export default function RegrasDoDesafio({ rules }: { rules: RulesVersion }) {
  const regras = buildRegras(rules);

  return (
    <Card className="mb-6 border-0 shadow-md bg-gradient-to-br from-sky-50/60 via-white to-indigo-50/40">
      <CardHeader className="pb-3 px-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center shadow-sm">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle className="font-display text-lg">Regras do Desafio</CardTitle>
            <p className="text-xs text-gray-500 font-body">Como funciona a pontuacao de cada categoria</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <Accordion type="multiple" className="space-y-2">
          {regras.map((categoria) => {
            const Icon = categoria.icon;
            return (
              <AccordionItem
                key={categoria.id}
                value={categoria.id}
                className={`border rounded-xl ${categoria.colorScheme.border} ${categoria.colorScheme.bgLight} overflow-hidden`}
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg ${categoria.colorScheme.gradient} flex items-center justify-center shadow-sm`}>
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <span className={`font-display font-semibold text-sm ${categoria.colorScheme.text}`}>
                      {categoria.label}
                    </span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${categoria.colorScheme.badge}`}>
                      Premio {categoria.premio}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4">
                  <ul className="space-y-2 mb-3">
                    {categoria.regras.map((regra, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700 font-body">
                        <span className={`w-1.5 h-1.5 rounded-full ${categoria.colorScheme.bullet} mt-1.5 shrink-0`} />
                        {regra}
                      </li>
                    ))}
                  </ul>
                  <div className={`text-xs font-semibold ${categoria.colorScheme.text} bg-white/60 rounded-lg px-3 py-2 border ${categoria.colorScheme.border}`}>
                    {categoria.meta}
                  </div>
                  {categoria.metaExcelencia && (
                    <div className={`text-xs font-medium ${categoria.colorScheme.text} bg-white/40 rounded-lg px-3 py-1.5 border ${categoria.colorScheme.border} mt-1`}>
                      {categoria.metaExcelencia}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
