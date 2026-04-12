import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
// Native selects used instead of Radix Select for better mobile/click compatibility
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, X, Loader2, Factory, User, RefreshCw } from "lucide-react";
import { useAdminManufacturer } from "@/hooks/useAdminManufacturer";
import { useActiveProfessionals } from "@/hooks/useActiveProfessionals";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function ManufacturerManager() {
  const {
    treatmentsByBrand,
    brandsByProfessional,
    profBrands,
    allBrands,
    isLoading,
    addTreatment,
    removeTreatment,
    addProfBrand,
    removeProfBrand,
  } = useAdminManufacturer();

  const { activeProfessionals, fetchActiveProfessionals } = useActiveProfessionals();
  const cabeloProfessionals = activeProfessionals.filter((p) => p.categoria === "Cabelo" && p.nome_profissional);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  // Auto-fetch profissionais on mount
  useEffect(() => {
    fetchActiveProfessionals();
  }, [fetchActiveProfessionals]);

  const handleSyncProfessionals = async () => {
    setSyncing(true);
    try {
      // 1. Refresh profissionais_ativos from DB
      await fetchActiveProfessionals();

      // 2. Get current profissional_fabricante rows
      const { data: currentRows } = await supabase
        .from("profissional_fabricante" as any)
        .select("id, profissional_id, nome_profissional, fabricante");

      const rows = (currentRows || []) as { id: number; profissional_id: number; nome_profissional: string; fabricante: string }[];

      // 3. Get fresh cabelo professionals
      const freshCabelo = activeProfessionals.filter((p) => p.categoria === "Cabelo" && p.nome_profissional);
      const cabeloIds = new Set(freshCabelo.map((p) => p.profissionalId));
      const cabeloNameMap = new Map(freshCabelo.map((p) => [p.profissionalId, p.nome_profissional!]));

      // 4. Update nome_profissional for existing rows where name changed
      for (const row of rows) {
        const newName = cabeloNameMap.get(row.profissional_id);
        if (newName && newName !== row.nome_profissional) {
          await supabase
            .from("profissional_fabricante" as any)
            .update({ nome_profissional: newName })
            .eq("id", row.id);
        }
      }

      // 5. Remove rows for professionals no longer in Cabelo category
      const idsToRemove = rows
        .filter((r) => !cabeloIds.has(r.profissional_id))
        .map((r) => r.id);
      if (idsToRemove.length > 0) {
        await supabase
          .from("profissional_fabricante" as any)
          .delete()
          .in("id", idsToRemove);
      }

      // 6. Refresh frontend data
      await queryClient.invalidateQueries({ queryKey: ["admin_profissional_fabricante"] });
      await queryClient.invalidateQueries({ queryKey: ["profissional_fabricante"] });

      const updated = rows.filter((r) => {
        const newName = cabeloNameMap.get(r.profissional_id);
        return newName && newName !== r.nome_profissional;
      }).length;

      toast({
        title: "Sincronizacao concluida",
        description: `${freshCabelo.length} profissionais de Cabelo. ${updated} nomes atualizados. ${idsToRemove.length} removidos.`,
      });
    } catch (err: any) {
      toast({ title: "Erro na sincronizacao", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const [newTreatmentBrand, setNewTreatmentBrand] = useState("");
  const [newTreatmentName, setNewTreatmentName] = useState("");
  const [newBrandName, setNewBrandName] = useState("");

  const [newProfBrandProfId, setNewProfBrandProfId] = useState("");
  const [newProfBrandFabricante, setNewProfBrandFabricante] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<{ type: "treatment" | "profBrand"; id: number; label: string } | null>(null);

  const handleAddTreatment = async () => {
    const brand = newBrandName.trim() || newTreatmentBrand;
    const name = newTreatmentName.trim();
    if (!brand || !name) return;
    try {
      await addTreatment.mutateAsync({ service_name: name, fabricante: brand });
      setNewTreatmentName("");
      setNewBrandName("");
      toast({ title: "Tratamento adicionado" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleAddProfBrand = async () => {
    if (!newProfBrandProfId || !newProfBrandFabricante) return;
    const prof = cabeloProfessionals.find((p) => String(p.profissionalId) === newProfBrandProfId);
    if (!prof) return;
    try {
      await addProfBrand.mutateAsync({
        profissional_id: prof.profissionalId,
        nome_profissional: prof.nome_profissional,
        fabricante: newProfBrandFabricante,
      });
      setNewProfBrandProfId("");
      setNewProfBrandFabricante("");
      toast({ title: "Marca autorizada adicionada" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "treatment") {
        await removeTreatment.mutateAsync(deleteTarget.id);
      } else {
        await removeProfBrand.mutateAsync(deleteTarget.id);
      }
      toast({ title: "Removido com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setDeleteTarget(null);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Treatment → Brand Mappings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <Factory className="h-4 w-4 text-violet-500" />
            Tratamento → Fabricante
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs text-gray-500 font-body">Fabricante existente</label>
              <select
                value={newTreatmentBrand}
                onChange={(e) => { setNewTreatmentBrand(e.target.value); setNewBrandName(""); }}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm font-body ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">Selecionar...</option>
                {allBrands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[140px]">
              <label className="text-xs text-gray-500 font-body">ou novo fabricante</label>
              <Input
                value={newBrandName}
                onChange={(e) => { setNewBrandName(e.target.value); setNewTreatmentBrand(""); }}
                placeholder="Nova marca..."
                className="font-body text-sm"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-gray-500 font-body">Nome do tratamento</label>
              <Input
                value={newTreatmentName}
                onChange={(e) => setNewTreatmentName(e.target.value)}
                placeholder="Nome do tratamento..."
                className="font-body text-sm"
              />
            </div>
            <Button
              onClick={handleAddTreatment}
              disabled={addTreatment.isPending || (!newTreatmentBrand && !newBrandName.trim()) || !newTreatmentName.trim()}
              size="sm"
              className="gap-1 font-body"
            >
              {addTreatment.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Adicionar
            </Button>
          </div>

          <div className="space-y-3">
            {Object.entries(treatmentsByBrand).map(([brand, items]) => (
              <div key={brand} className="border rounded-lg p-3">
                <h4 className="text-sm font-semibold font-body text-gray-700 mb-2">{brand} ({items.length})</h4>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((t) => (
                    <Badge key={t.id} variant="secondary" className="font-body text-xs gap-1 pr-1">
                      {t.service_name}
                      <button
                        onClick={() => setDeleteTarget({ type: "treatment", id: t.id, label: `${t.service_name} (${brand})` })}
                        className="ml-1 hover:text-red-500 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Professional → Allowed Brands */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <User className="h-4 w-4 text-blue-500" />
              Profissional → Marcas Permitidas
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncProfessionals}
              disabled={syncing}
              className="gap-1.5 font-body text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              Sincronizar Profissionais
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs text-gray-500 font-body">Profissional (Cabelo)</label>
              <select
                value={newProfBrandProfId}
                onChange={(e) => setNewProfBrandProfId(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm font-body ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">Selecionar...</option>
                {cabeloProfessionals.map((p) => (
                  <option key={p.profissionalId} value={String(p.profissionalId)}>
                    {p.nome_profissional}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs text-gray-500 font-body">Fabricante</label>
              <select
                value={newProfBrandFabricante}
                onChange={(e) => setNewProfBrandFabricante(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm font-body ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">Selecionar...</option>
                {allBrands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <Button
              onClick={handleAddProfBrand}
              disabled={addProfBrand.isPending || !newProfBrandProfId || !newProfBrandFabricante}
              size="sm"
              className="gap-1 font-body"
            >
              {addProfBrand.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Autorizar
            </Button>
          </div>

          <div className="space-y-3">
            {cabeloProfessionals.map((prof) => {
              const brands = brandsByProfessional[prof.nome_profissional] || [];
              return (
                <div key={prof.profissionalId} className="border rounded-lg p-3">
                  <h4 className="text-sm font-semibold font-body text-gray-700 mb-2">{prof.nome_profissional}</h4>
                  {brands.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {brands.map((p) => (
                        <Badge key={p.id} variant="outline" className="font-body text-xs gap-1 pr-1">
                          {p.fabricante}
                          <button
                            onClick={() => setDeleteTarget({ type: "profBrand", id: p.id, label: `${p.fabricante} de ${prof.nome_profissional}` })}
                            className="ml-1 hover:text-red-500 transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs font-body text-gray-400 italic">Sem marca atribuida</span>
                  )}
                </div>
              );
            })}

            {cabeloProfessionals.length === 0 && (
              <p className="text-sm text-gray-400 font-body text-center py-4">Nenhum profissional de Cabelo encontrado. Clique em "Sincronizar Profissionais".</p>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Confirmar remocao</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              Remover "{deleteTarget?.label}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-body">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 font-body">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
