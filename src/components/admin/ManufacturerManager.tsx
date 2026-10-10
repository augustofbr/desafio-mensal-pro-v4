import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
// Native selects used instead of Radix Select for better mobile/click compatibility
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, X, Loader2, Factory, User, RefreshCw, CopyPlus } from "lucide-react";
import { useAdminManufacturer, ProfissionalFabricante } from "@/hooks/useAdminManufacturer";
import { useActiveProfessionals } from "@/hooks/useActiveProfessionals";
import { useToast } from "@/hooks/use-toast";
import { isMesValido, ultimoMesDaVersao, versaoVigente } from "@/lib/marcasPorMes";
import { mesManausAtual } from "@/lib/dateUtils";
import { fabricanteDb, mensagemDeErro } from "@/lib/fabricanteDb";
// auth-kit: controles de escrita só para quem tem write na página "admin".
// Isto é UX — quem burlar o DOM esbarra na RLS (policies destaque_can_write_page).
import { RequireWrite } from "@/auth/guards";

/** 'AAAA-MM' -> 'MM/AAAA' para exibicao; '2000-01' e a versao-base, sem data real. */
function rotuloVersao(v: string): string {
  if (v === "2000-01") return "Base (desde o início)";
  const [ano, mes] = v.split("-");
  return `A partir de ${mes}/${ano}`;
}

function rotuloMes(v: string): string {
  const [ano, mes] = v.split("-");
  return `${mes}/${ano}`;
}

export function ManufacturerManager() {
  const {
    treatmentsByBrand,
    profBrands,
    versions,
    allBrands,
    isLoading,
    addTreatment,
    removeTreatment,
    addProfBrand,
    removeProfBrand,
    createVersion,
    invalidateProf,
  } = useAdminManufacturer();

  const { activeProfessionals, fetchActiveProfessionals } = useActiveProfessionals();
  const cabeloProfessionals = activeProfessionals.filter((p) => p.categoria === "Cabelo" && p.nome_profissional);
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);

  // Versao de profissional_fabricante em edicao. Padrao: a mais recente. Se a
  // selecionada deixar de existir (ultima linha removida), volta para a mais recente.
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const versaoAtual =
    selectedVersion && versions.includes(selectedVersion) ? selectedVersion : versions[0] ?? null;
  const rowsDaVersao = versaoAtual ? profBrands.filter((p) => p.valid_from === versaoAtual) : [];
  const brandsByProfessionalId = rowsDaVersao.reduce<Record<number, ProfissionalFabricante[]>>((acc, p) => {
    if (!acc[p.profissional_id]) acc[p.profissional_id] = [];
    acc[p.profissional_id].push(p);
    return acc;
  }, {});
  const fimVersaoAtual = versaoAtual ? ultimoMesDaVersao(versions, versaoAtual) : null;
  const mesCorrente = mesManausAtual();
  const versaoDoMesCorrente = versaoVigente(versions, mesCorrente);

  // Tabela sem nenhuma versao: a primeira autorizacao precisa dizer de que mes vale.
  const [versaoInicial, setVersaoInicial] = useState(mesCorrente);
  const versaoParaInserir = versaoAtual ?? versaoInicial;

  const [newVersionOpen, setNewVersionOpen] = useState(false);
  const [newVersionOrigin, setNewVersionOrigin] = useState("");
  const [newVersionMonth, setNewVersionMonth] = useState("");

  // Auto-fetch profissionais on mount
  useEffect(() => {
    fetchActiveProfessionals();
  }, [fetchActiveProfessionals]);

  /**
   * Sincroniza SO a versao selecionada: atualiza o nome exibido e remove quem saiu
   * de Cabelo. Versoes anteriores ficam intocadas — sao o historico de meses ja
   * apurados.
   */
  const handleSyncProfessionals = async () => {
    if (!versaoAtual) return;
    setSyncing(true);
    try {
      // 1. Refresh profissionais_ativos from DB
      await fetchActiveProfessionals();

      // 2. Linhas atuais da versao selecionada
      const { data: currentRows, error: readError } = await fabricanteDb
        .from("profissional_fabricante")
        .select("id, profissional_id, nome_profissional, fabricante")
        .eq("valid_from", versaoAtual);
      if (readError) throw readError;

      const rows = (currentRows || []) as unknown as { id: number; profissional_id: number; nome_profissional: string; fabricante: string }[];

      // 3. Profissionais de Cabelo
      const freshCabelo = activeProfessionals.filter((p) => p.categoria === "Cabelo" && p.nome_profissional);
      // Lista vazia = cadastro nao carregou (ou falhou). Remover com base nela
      // apagaria a versao inteira.
      if (freshCabelo.length === 0) {
        throw new Error("Lista de profissionais de Cabelo vazia; nada foi alterado. Recarregue e tente de novo.");
      }
      const cabeloIds = new Set(freshCabelo.map((p) => p.profissionalId));
      const cabeloNameMap = new Map(freshCabelo.map((p) => [p.profissionalId, p.nome_profissional!]));

      // 4. Update nome_profissional for existing rows where name changed
      let updated = 0;
      for (const row of rows) {
        const newName = cabeloNameMap.get(row.profissional_id);
        if (newName && newName !== row.nome_profissional) {
          const { data, error } = await fabricanteDb
            .from("profissional_fabricante")
            .update({ nome_profissional: newName })
            .eq("id", row.id)
            .select("id");
          if (error) throw error;
          if (!data || data.length !== 1) throw new Error("Atualizacao de nome barrada (0 linhas gravadas).");
          updated++;
        }
      }

      // 5. Remove rows for professionals no longer in Cabelo category
      const idsToRemove = rows
        .filter((r) => !cabeloIds.has(r.profissional_id))
        .map((r) => r.id);
      if (idsToRemove.length > 0) {
        const { data, error } = await fabricanteDb
          .from("profissional_fabricante")
          .delete()
          .in("id", idsToRemove)
          .select("id");
        if (error) throw error;
        if (!data || data.length !== idsToRemove.length) {
          throw new Error(`Remocao parcial: ${data?.length ?? 0} de ${idsToRemove.length} linha(s).`);
        }
      }

      toast({
        title: "Sincronizacao concluida",
        description: `Versao ${rotuloVersao(versaoAtual)}: ${freshCabelo.length} profissionais de Cabelo. ${updated} nomes atualizados. ${idsToRemove.length} removidos.`,
      });
    } catch (err: unknown) {
      toast({ title: "Erro na sincronizacao", description: mensagemDeErro(err), variant: "destructive" });
    } finally {
      // 6. Refresh frontend data (tambem apos erro: pode ter havido escrita parcial)
      await invalidateProf();
      setSyncing(false);
    }
  };

  const openNewVersion = () => {
    setNewVersionOrigin(versaoAtual ?? "");
    setNewVersionMonth(mesCorrente);
    setNewVersionOpen(true);
  };

  const newVersionError = (() => {
    if (!isMesValido(newVersionMonth)) return "Informe o mes no formato AAAA-MM.";
    if (versions.includes(newVersionMonth)) return `A versao ${rotuloMes(newVersionMonth)} ja existe.`;
    return null;
  })();

  const handleCreateVersion = async () => {
    if (!newVersionOrigin || newVersionError) return;
    try {
      const n = await createVersion.mutateAsync({ origem: newVersionOrigin, destino: newVersionMonth });
      setSelectedVersion(newVersionMonth);
      setNewVersionOpen(false);
      toast({ title: "Versao criada", description: `${n} autorizacao(oes) copiada(s) para ${rotuloVersao(newVersionMonth)}.` });
    } catch (err: unknown) {
      toast({ title: "Erro", description: mensagemDeErro(err), variant: "destructive" });
    }
  };

  const [newTreatmentBrand, setNewTreatmentBrand] = useState("");
  const [newTreatmentName, setNewTreatmentName] = useState("");
  const [newBrandName, setNewBrandName] = useState("");

  const [newProfBrandProfId, setNewProfBrandProfId] = useState("");
  const [newProfBrandFabricante, setNewProfBrandFabricante] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<{ type: "treatment" | "profBrand"; id: number; label: string } | null>(null);

  // Uma versao so existe enquanto tiver linhas. Remover a ultima faz os meses dela
  // caírem na versao anterior (ou em "nenhuma marca"), entao o dialogo avisa.
  const avisoUltimaLinha = (() => {
    if (deleteTarget?.type !== "profBrand" || !versaoAtual || rowsDaVersao.length !== 1) return null;
    const anterior = versions.find((v) => v < versaoAtual);
    return anterior
      ? `É a última autorização desta versão: ela deixa de existir e os meses dela passam a usar a versão "${rotuloVersao(anterior)}".`
      : "É a última autorização desta versão: ela deixa de existir e os meses dela ficam sem nenhuma marca autorizada.";
  })();

  const handleAddTreatment = async () => {
    const brand = newBrandName.trim() || newTreatmentBrand;
    const name = newTreatmentName.trim();
    if (!brand || !name) return;
    try {
      await addTreatment.mutateAsync({ service_name: name, fabricante: brand });
      setNewTreatmentName("");
      setNewBrandName("");
      toast({ title: "Tratamento adicionado" });
    } catch (err: unknown) {
      toast({ title: "Erro", description: mensagemDeErro(err), variant: "destructive" });
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
        // So a versao selecionada muda; as outras (outros meses) ficam intocadas.
        valid_from: versaoParaInserir,
      });
      setSelectedVersion(versaoParaInserir);
      setNewProfBrandProfId("");
      setNewProfBrandFabricante("");
      toast({ title: "Marca autorizada adicionada" });
    } catch (err: unknown) {
      toast({ title: "Erro", description: mensagemDeErro(err), variant: "destructive" });
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
    } catch (err: unknown) {
      toast({ title: "Erro", description: mensagemDeErro(err), variant: "destructive" });
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
          <RequireWrite chave="admin">
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
          </RequireWrite>

          <div className="space-y-3">
            {Object.entries(treatmentsByBrand).map(([brand, items]) => (
              <div key={brand} className="border rounded-lg p-3">
                <h4 className="text-sm font-semibold font-body text-gray-700 mb-2">{brand} ({items.length})</h4>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((t) => (
                    <Badge key={t.id} variant="secondary" className="font-body text-xs gap-1 pr-1">
                      {t.service_name}
                      <RequireWrite chave="admin">
                        <button
                          onClick={() => setDeleteTarget({ type: "treatment", id: t.id, label: `${t.service_name} (${brand})` })}
                          className="ml-1 hover:text-red-500 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </RequireWrite>
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Professional → Allowed Brands (versionado por mes) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <User className="h-4 w-4 text-blue-500" />
              Profissional → Marcas Permitidas
            </CardTitle>
            <RequireWrite chave="admin">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncProfessionals}
                disabled={syncing || !versaoAtual}
                className="gap-1.5 font-body text-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                Sincronizar Profissionais
              </Button>
            </RequireWrite>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Seletor de versao */}
          <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs text-gray-500 font-body">Versão das autorizações</label>
                <select
                  value={versaoAtual ?? ""}
                  onChange={(e) => setSelectedVersion(e.target.value)}
                  disabled={versions.length === 0}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm font-body ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  {versions.length === 0 && <option value="">Nenhuma versão cadastrada</option>}
                  {versions.map((v) => (
                    <option key={v} value={v}>
                      {rotuloVersao(v)}{v === versaoDoMesCorrente ? " (vigente)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <RequireWrite chave="admin">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openNewVersion}
                  disabled={!versaoAtual || createVersion.isPending}
                  className="gap-1.5 font-body text-xs h-10"
                >
                  <CopyPlus className="h-3.5 w-3.5" />
                  Nova versão a partir desta…
                </Button>
              </RequireWrite>
            </div>
            {versaoAtual && (
              <p className="text-xs font-body text-gray-500">
                Vale para os meses de{" "}
                <strong>{versaoAtual === "2000-01" ? "todo o histórico" : rotuloMes(versaoAtual)}</strong>
                {fimVersaoAtual ? <> até <strong>{rotuloMes(fimVersaoAtual)}</strong></> : " em diante"}.
                Mudanças aqui alteram o ranking de todos esses meses. Para mudar só a partir de um mês, crie uma nova versão.
              </p>
            )}
          </div>

          <RequireWrite chave="admin">
          <div className="flex flex-wrap gap-2 items-end">
            {!versaoAtual && (
              <div className="min-w-[140px]">
                <label className="text-xs text-gray-500 font-body">Vale a partir de (AAAA-MM)</label>
                <Input
                  value={versaoInicial}
                  onChange={(e) => setVersaoInicial(e.target.value.trim())}
                  placeholder="2026-10"
                  className="font-body text-sm"
                />
              </div>
            )}
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
              disabled={addProfBrand.isPending || !newProfBrandProfId || !newProfBrandFabricante || !isMesValido(versaoParaInserir)}
              size="sm"
              className="gap-1 font-body"
            >
              {addProfBrand.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Autorizar
            </Button>
          </div>
          </RequireWrite>

          <div className="space-y-3">
            {cabeloProfessionals.map((prof) => {
              const brands = brandsByProfessionalId[prof.profissionalId] || [];
              return (
                <div key={prof.profissionalId} className="border rounded-lg p-3">
                  <h4 className="text-sm font-semibold font-body text-gray-700 mb-2">{prof.nome_profissional}</h4>
                  {brands.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {brands.map((p) => (
                        <Badge key={p.id} variant="outline" className="font-body text-xs gap-1 pr-1">
                          {p.fabricante}
                          <RequireWrite chave="admin">
                            <button
                              onClick={() => setDeleteTarget({ type: "profBrand", id: p.id, label: `${p.fabricante} de ${prof.nome_profissional} (versão ${rotuloVersao(p.valid_from)})` })}
                              className="ml-1 hover:text-red-500 transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </RequireWrite>
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

      <Dialog open={newVersionOpen} onOpenChange={setNewVersionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Nova versão de marcas autorizadas</DialogTitle>
            <DialogDescription className="font-body">
              Copia todas as autorizações da versão de origem para um novo mês. A partir desse mês,
              o ranking usa a nova versão; os meses anteriores continuam com a versão que já usavam.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 font-body">Copiar de</label>
              <select
                value={newVersionOrigin}
                onChange={(e) => setNewVersionOrigin(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm font-body ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                {versions.map((v) => (
                  <option key={v} value={v}>{rotuloVersao(v)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-body">Vale a partir do mês (AAAA-MM)</label>
              <Input
                value={newVersionMonth}
                onChange={(e) => setNewVersionMonth(e.target.value.trim())}
                placeholder="2026-10"
                className="font-body text-sm"
              />
              {newVersionError && (
                <p className="text-xs text-red-600 font-body mt-1">{newVersionError}</p>
              )}
              {!newVersionError && newVersionMonth <= mesCorrente && (
                <p className="text-xs text-amber-700 font-body mt-1">
                  {rotuloMes(newVersionMonth)} já começou: o ranking desse mês passa a usar a nova versão assim que ela for editada.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewVersionOpen(false)} className="font-body">
              Cancelar
            </Button>
            <Button
              onClick={handleCreateVersion}
              disabled={!newVersionOrigin || !!newVersionError || createVersion.isPending}
              className="gap-1 font-body"
            >
              {createVersion.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Criar versão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Confirmar remocao</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              Remover "{deleteTarget?.label}"?
              {avisoUltimaLinha && (
                <span className="block mt-2 text-amber-700">{avisoUltimaLinha}</span>
              )}
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
