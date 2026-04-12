import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2, CalendarOff, Loader2 } from "lucide-react";
import { useHolidays } from "@/hooks/useHolidays";
import { useAdminHolidays } from "@/hooks/useAdminHolidays";
import { useToast } from "@/hooks/use-toast";

export function HolidaysManager() {
  const { feriados, isLoading } = useHolidays();
  const { addHoliday, removeHoliday } = useAdminHolidays();
  const { toast } = useToast();

  const [newDate, setNewDate] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);

  const handleAdd = async () => {
    if (!newDate || !newDesc.trim()) return;
    try {
      await addHoliday.mutateAsync({ data: newDate, descricao: newDesc.trim() });
      setNewDate("");
      setNewDesc("");
      toast({ title: "Feriado adicionado" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await removeHoliday.mutateAsync(deleteTarget.id);
      toast({ title: "Feriado removido" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setDeleteTarget(null);
  };

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
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
      <div>
        <h2 className="text-lg font-heading font-semibold text-gray-900">Feriados</h2>
        <p className="text-sm text-gray-500 font-body">Dias que nao contam como dia util</p>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="min-w-[160px]">
              <label className="text-xs text-gray-500 font-body">Data</label>
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="font-body text-sm"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-gray-500 font-body">Descricao</label>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Ex: Sexta-feira Santa"
                className="font-body text-sm"
              />
            </div>
            <Button
              onClick={handleAdd}
              disabled={addHoliday.isPending || !newDate || !newDesc.trim()}
              size="sm"
              className="gap-1 font-body"
            >
              {addHoliday.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Adicionar
            </Button>
          </div>

          {feriados.length === 0 ? (
            <div className="text-center py-8">
              <CalendarOff className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400 font-body">Nenhum feriado cadastrado.</p>
            </div>
          ) : (
            <div className="divide-y">
              {feriados.map((f) => (
                <div key={f.id} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                      {formatDate(f.data)}
                    </span>
                    <span className="text-sm font-body text-gray-700">{f.descricao}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget({ id: f.id, label: `${formatDate(f.data)} - ${f.descricao}` })}
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Remover feriado?</AlertDialogTitle>
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
