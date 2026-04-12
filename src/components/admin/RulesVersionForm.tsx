import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, Scissors, Sparkles, Heart, Palette } from "lucide-react";
import type { CategoryRules, RulesVersion } from "@/lib/rulesConfig";

type ScoringModel = "points" | "revenue-percentage" | "revenue-points";

const CATEGORY_META: Record<string, { label: string; icon: any; color: string }> = {
  cabelo: { label: "Cabelo", icon: Scissors, color: "text-blue-600" },
  unhas: { label: "Unhas", icon: Sparkles, color: "text-red-500" },
  estetica: { label: "Estetica", icon: Heart, color: "text-violet-600" },
  maquiagem: { label: "Maquiagem", icon: Palette, color: "text-yellow-600" },
};

function defaultCategoryRules(): CategoryRules {
  return {
    scoringModel: "points",
    clientPointValue: 1,
    specialServicePointValue: 2,
    specialServiceLabel: "Tratamentos",
    starPointValue: 3,
    starsCountInScore: true,
    qualificationGoals: {},
    symbolicGoals: {},
    manufacturerConstraints: false,
    prize: "R$200",
  };
}

interface RulesVersionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: RulesVersion | null;
  onSubmit: (data: {
    valid_from: string;
    label: string;
    cabelo: CategoryRules;
    unhas: CategoryRules;
    estetica: CategoryRules;
    maquiagem: CategoryRules;
  }) => Promise<void>;
  mode: "create" | "edit" | "duplicate";
}

export function RulesVersionForm({ open, onOpenChange, initialData, onSubmit, mode }: RulesVersionFormProps) {
  const [validFrom, setValidFrom] = useState(
    mode === "duplicate" ? "" : initialData?.validFrom ?? ""
  );
  const [label, setLabel] = useState(
    mode === "duplicate" ? `Copia de ${(initialData as any)?.label || initialData?.validFrom || ""}` : (initialData as any)?.label ?? ""
  );
  const [categories, setCategories] = useState<Record<string, CategoryRules>>({
    cabelo: initialData?.cabelo ?? defaultCategoryRules(),
    unhas: initialData?.unhas ?? { ...defaultCategoryRules(), specialServiceLabel: "SPA dos Pes" },
    estetica: initialData?.estetica ?? { ...defaultCategoryRules(), scoringModel: "revenue-percentage", clientPointValue: 0, starsCountInScore: false },
    maquiagem: initialData?.maquiagem ?? { ...defaultCategoryRules(), clientPointValue: 0, specialServicePointValue: 1, specialServiceLabel: "Servicos", starsCountInScore: false },
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateCategory = (cat: string, field: string, value: any) => {
    setCategories((prev) => ({
      ...prev,
      [cat]: { ...prev[cat], [field]: value },
    }));
  };

  const updateGoal = (cat: string, field: string, value: string) => {
    const numValue = value === "" ? undefined : Number(value);
    setCategories((prev) => ({
      ...prev,
      [cat]: {
        ...prev[cat],
        qualificationGoals: { ...prev[cat].qualificationGoals, [field]: numValue },
      },
    }));
  };

  const updateSymbolicGoal = (cat: string, value: string) => {
    const numValue = value === "" ? undefined : Number(value);
    setCategories((prev) => ({
      ...prev,
      [cat]: {
        ...prev[cat],
        symbolicGoals: { ...prev[cat].symbolicGoals, stars: numValue },
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validFrom.match(/^\d{4}-\d{2}$/)) {
      setError("Formato deve ser AAAA-MM (ex: 2026-04)");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        valid_from: validFrom,
        label,
        cabelo: categories.cabelo,
        unhas: categories.unhas,
        estetica: categories.estetica,
        maquiagem: categories.maquiagem,
      });
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Erro ao salvar");
    } finally {
      setSubmitting(false);
    }
  };

  const title = mode === "edit" ? "Editar Versao" : mode === "duplicate" ? "Duplicar Versao" : "Nova Versao";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="font-body text-sm">Vigencia a partir de</Label>
              <Input
                placeholder="2026-04"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="font-body"
                disabled={mode === "edit"}
              />
            </div>
            <div>
              <Label className="font-body text-sm">Label</Label>
              <Input
                placeholder="V3 - Abril 2026"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="font-body"
              />
            </div>
          </div>

          <Accordion type="multiple" className="w-full" defaultValue={["cabelo"]}>
            {Object.entries(CATEGORY_META).map(([key, meta]) => {
              const cat = categories[key];
              const Icon = meta.icon;
              return (
                <AccordionItem key={key} value={key}>
                  <AccordionTrigger className="font-body hover:no-underline">
                    <span className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${meta.color}`} />
                      {meta.label}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-gray-500">Modelo de pontuacao</Label>
                        <Select
                          value={cat.scoringModel}
                          onValueChange={(v) => updateCategory(key, "scoringModel", v as ScoringModel)}
                        >
                          <SelectTrigger className="font-body text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="points">Pontos</SelectItem>
                            <SelectItem value="revenue-percentage">% Faturamento</SelectItem>
                            <SelectItem value="revenue-points">Faturamento → Pontos</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Premio</Label>
                        <Input
                          value={cat.prize}
                          onChange={(e) => updateCategory(key, "prize", e.target.value)}
                          className="font-body text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs text-gray-500">Pts/Cliente unico</Label>
                        <Input
                          type="number"
                          value={cat.clientPointValue}
                          onChange={(e) => updateCategory(key, "clientPointValue", Number(e.target.value))}
                          className="font-body text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Pts/Servico especial</Label>
                        <Input
                          type="number"
                          value={cat.specialServicePointValue}
                          onChange={(e) => updateCategory(key, "specialServicePointValue", Number(e.target.value))}
                          className="font-body text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Pts/Estrela Google</Label>
                        <Input
                          type="number"
                          value={cat.starPointValue}
                          onChange={(e) => updateCategory(key, "starPointValue", Number(e.target.value))}
                          className="font-body text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-gray-500">Label servico especial</Label>
                        <Input
                          value={cat.specialServiceLabel}
                          onChange={(e) => updateCategory(key, "specialServiceLabel", e.target.value)}
                          className="font-body text-sm"
                        />
                      </div>
                      {(cat.scoringModel === "revenue-points") && (
                        <div>
                          <Label className="text-xs text-gray-500">R$ por ponto</Label>
                          <Input
                            type="number"
                            value={cat.revenuePointConversion ?? ""}
                            onChange={(e) => updateCategory(key, "revenuePointConversion", e.target.value ? Number(e.target.value) : undefined)}
                            className="font-body text-sm"
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={cat.starsCountInScore}
                          onCheckedChange={(v) => updateCategory(key, "starsCountInScore", v)}
                        />
                        <Label className="text-xs text-gray-500">Estrelas contam no score</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={cat.manufacturerConstraints}
                          onCheckedChange={(v) => updateCategory(key, "manufacturerConstraints", v)}
                        />
                        <Label className="text-xs text-gray-500">Restricao de fabricante</Label>
                      </div>
                    </div>

                    <div className="border-t pt-3 mt-2">
                      <Label className="text-xs text-gray-500 font-semibold">Metas de qualificacao</Label>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <div>
                          <Label className="text-xs text-gray-400">Min. clientes unicos</Label>
                          <Input
                            type="number"
                            value={cat.qualificationGoals.minUniqueClients ?? ""}
                            onChange={(e) => updateGoal(key, "minUniqueClients", e.target.value)}
                            placeholder="--"
                            className="font-body text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-400">Min. servicos especiais</Label>
                          <Input
                            type="number"
                            value={cat.qualificationGoals.minSpecialServices ?? ""}
                            onChange={(e) => updateGoal(key, "minSpecialServices", e.target.value)}
                            placeholder="--"
                            className="font-body text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-400">Min. faturamento (R$)</Label>
                          <Input
                            type="number"
                            value={cat.qualificationGoals.minRevenue ?? ""}
                            onChange={(e) => updateGoal(key, "minRevenue", e.target.value)}
                            placeholder="--"
                            className="font-body text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-400">Min. servicos</Label>
                          <Input
                            type="number"
                            value={cat.qualificationGoals.minServices ?? ""}
                            onChange={(e) => updateGoal(key, "minServices", e.target.value)}
                            placeholder="--"
                            className="font-body text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs text-gray-500">Meta simbolica de estrelas</Label>
                      <Input
                        type="number"
                        value={cat.symbolicGoals.stars ?? ""}
                        onChange={(e) => updateSymbolicGoal(key, e.target.value)}
                        placeholder="--"
                        className="font-body text-sm w-32"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          {error && <p className="text-sm text-red-500 font-body">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="font-body">
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting} className="font-body">
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {mode === "edit" ? "Salvar" : "Criar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
