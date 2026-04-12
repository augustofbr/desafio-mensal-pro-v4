import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Copy, Trash2, Settings, Loader2 } from "lucide-react";
import { useRulesData } from "@/hooks/useRulesData";
import { useAdminRules } from "@/hooks/useAdminRules";
import { RulesVersionForm } from "./RulesVersionForm";
import { useToast } from "@/hooks/use-toast";
import type { RulesVersion, CategoryRules } from "@/lib/rulesConfig";

export function RulesManager() {
  const { allVersions, isLoading } = useRulesData();
  const { createVersion, updateVersion, deleteVersion } = useAdminRules();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit" | "duplicate">("create");
  const [formData, setFormData] = useState<RulesVersion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RulesVersion | null>(null);

  const handleCreate = () => {
    setFormMode("create");
    setFormData(null);
    setFormOpen(true);
  };

  const handleEdit = (version: RulesVersion) => {
    setFormMode("edit");
    setFormData(version);
    setFormOpen(true);
  };

  const handleDuplicate = (version: RulesVersion) => {
    setFormMode("duplicate");
    setFormData(version);
    setFormOpen(true);
  };

  const handleSubmit = async (data: {
    valid_from: string;
    label: string;
    cabelo: CategoryRules;
    unhas: CategoryRules;
    estetica: CategoryRules;
    maquiagem: CategoryRules;
  }) => {
    if (formMode === "edit" && formData) {
      await updateVersion.mutateAsync({ id: formData.id, ...data });
      toast({ title: "Versao atualizada com sucesso" });
    } else {
      await createVersion.mutateAsync(data);
      toast({ title: "Versao criada com sucesso" });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteVersion.mutateAsync(deleteTarget.id);
      toast({ title: "Versao excluida" });
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    }
    setDeleteTarget(null);
  };

  const getCategorySummary = (rules: CategoryRules) => {
    const parts: string[] = [];
    if (rules.qualificationGoals.minUniqueClients) parts.push(`${rules.qualificationGoals.minUniqueClients} clientes`);
    if (rules.qualificationGoals.minSpecialServices) parts.push(`${rules.qualificationGoals.minSpecialServices} especiais`);
    if (rules.qualificationGoals.minRevenue) parts.push(`R$${rules.qualificationGoals.minRevenue.toLocaleString()}`);
    if (rules.qualificationGoals.minServices) parts.push(`${rules.qualificationGoals.minServices} servicos`);
    return parts.join(" + ") || "Sem metas";
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-heading font-semibold text-gray-900">Regras do Desafio</h2>
          <p className="text-sm text-gray-500 font-body">Gerencie as versoes de regras por periodo</p>
        </div>
        <Button onClick={handleCreate} className="gap-2 font-body">
          <Plus className="h-4 w-4" />
          Nova Versao
        </Button>
      </div>

      {allVersions.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <Settings className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 font-body">Nenhuma versao cadastrada. Usando regras padrao do codigo.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {allVersions.map((version) => (
          <Card key={version.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-base font-heading">
                    {version.label || version.validFrom}
                  </CardTitle>
                  <Badge variant="outline" className="font-body text-xs">
                    {version.validFrom}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(version)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDuplicate(version)} title="Duplicar">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(version)} title="Excluir" className="text-red-500 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(["cabelo", "unhas", "estetica", "maquiagem"] as const).map((cat) => {
                  const rules = version[cat];
                  return (
                    <div key={cat} className="text-xs font-body space-y-1 bg-gray-50 rounded-lg p-2.5">
                      <div className="font-semibold text-gray-700 capitalize">{cat === "estetica" ? "Estetica" : cat.charAt(0).toUpperCase() + cat.slice(1)}</div>
                      <div className="text-gray-500">{getCategorySummary(rules)}</div>
                      <div className="text-gray-400">Premio: {rules.prize}</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <RulesVersionForm
        key={`${formMode}-${formData?.id ?? 'new'}`}
        open={formOpen}
        onOpenChange={setFormOpen}
        initialData={formData}
        onSubmit={handleSubmit}
        mode={formMode}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Excluir versao?</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              Tem certeza que deseja excluir a versao "{deleteTarget?.label || deleteTarget?.validFrom}"? Esta acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-body">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 font-body">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
