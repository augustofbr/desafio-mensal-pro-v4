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
import {
  impactoNovaVersao,
  isMesValido,
  isVersaoPassada,
  mesesDaVersao,
  mesesFechadosDaVersao,
  planejarSincronizacao,
  versaoVigente,
  type IntervaloMeses,
  type LinhaSync,
  type PlanoSincronizacao,
} from "@/lib/marcasPorMes";
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

/** "de 04/2026 até 09/2026", "de 10/2026 em diante", "desde o início até 09/2026". */
function rotuloIntervalo(i: IntervaloMeses): string {
  const de = i.de === "2000-01" ? "desde o início" : `de ${rotuloMes(i.de)}`;
  return i.ate ? `${de} até ${rotuloMes(i.ate)}` : `${de} em diante`;
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

  const mesCorrente = mesManausAtual();
  const versaoDoMesCorrente = versaoVigente(versions, mesCorrente);

  // Versao de profissional_fabricante em edicao. Padrao: a VIGENTE no mes corrente
  // (nao a mais recente nem a base), para nao editar historico sem querer. Se a
  // selecionada deixar de existir (ultima linha removida), volta para o padrao.
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const versaoAtual =
    selectedVersion && versions.includes(selectedVersion)
      ? selectedVersion
      : versaoDoMesCorrente ?? versions[0] ?? null;
  const rowsDaVersao = versaoAtual ? profBrands.filter((p) => p.valid_from === versaoAtual) : [];
  const brandsByProfessionalId = rowsDaVersao.reduce<Record<number, ProfissionalFabricante[]>>((acc, p) => {
    if (!acc[p.profissional_id]) acc[p.profissional_id] = [];
    acc[p.profissional_id].push(p);
    return acc;
  }, {});

  // Tabela sem nenhuma versao: a primeira autorizacao precisa dizer de que mes vale.
  const [versaoInicial, setVersaoInicial] = useState(mesCorrente);
  const versaoParaInserir = versaoAtual ?? versaoInicial;

  // Meses ja encerrados que a versao em edicao cobre (null = so corrente/futuro).
  const fechadosDaVersaoAtual = versaoAtual
    ? mesesFechadosDaVersao(versions, versaoAtual, mesCorrente)
    : isMesValido(versaoInicial)
      ? mesesFechadosDaVersao([versaoInicial], versaoInicial, mesCorrente)
      : null;

  const [newVersionOpen, setNewVersionOpen] = useState(false);
  const [newVersionOrigin, setNewVersionOrigin] = useState("");
  const [newVersionMonth, setNewVersionMonth] = useState("");
  const [newVersionAck, setNewVersionAck] = useState(false);

  type AddPayload = { profissional_id: number; nome_profissional: string; fabricante: string; valid_from: string };
  const [confirmAdd, setConfirmAdd] = useState<AddPayload | null>(null);
  const [confirmSync, setConfirmSync] = useState<{ plano: PlanoSincronizacao; versao: string } | null>(null);

  // Auto-fetch profissionais on mount
  useEffect(() => {
    fetchActiveProfessionals();
  }, [fetchActiveProfessionals]);

  /** Aplica um plano de sincronizacao na versao selecionada, conferindo as linhas gravadas. */
  const executarSincronizacao = async (plano: PlanoSincronizacao, versao: string) => {
    setSyncing(true);
    try {
      for (const r of plano.renomear) {
        const { data, error } = await fabricanteDb
          .from("profissional_fabricante")
          .update({ nome_profissional: r.nome })
          .eq("id", r.id)
          .eq("valid_from", versao)
          .select("id");
        if (error) throw error;
        if (!data || data.length !== 1) throw new Error("Atualização de nome barrada (0 linhas gravadas).");
      }

      if (plano.remover.length > 0) {
        const { data, error } = await fabricanteDb
          .from("profissional_fabricante")
          .delete()
          .in("id", plano.remover)
          .eq("valid_from", versao)
          .select("id");
        if (error) throw error;
        if (!data || data.length !== plano.remover.length) {
          throw new Error(`Remoção parcial: ${data?.length ?? 0} de ${plano.remover.length} linha(s).`);
        }
      }

      const bloqueio =
        plano.bloqueio === "versao-passada"
          ? ` ${plano.bloqueadas.length} autorização(ões) de quem saiu de Cabelo NÃO foram removidas: esta versão é passada (vale ${rotuloIntervalo(mesesDaVersao(versions, versao))}) e remover reescreveria rankings já apurados.`
          : plano.bloqueio === "esvaziaria"
            ? ` ${plano.bloqueadas.length} autorização(ões) NÃO foram removidas: a versão ficaria vazia e deixaria de existir. Confira o cadastro de profissionais.`
            : "";
      toast({
        title: plano.bloqueio ? "Sincronização parcial" : "Sincronização concluída",
        description: `Versão ${rotuloVersao(versao)}: ${plano.renomear.length} nome(s) atualizado(s), ${plano.remover.length} removida(s).${bloqueio}`,
        variant: plano.bloqueio ? "destructive" : undefined,
      });
    } catch (err: unknown) {
      toast({ title: "Erro na sincronização", description: mensagemDeErro(err), variant: "destructive" });
    } finally {
      // Refresh tambem apos erro: pode ter havido escrita parcial
      await invalidateProf();
      setSyncing(false);
    }
  };

  /**
   * Sincroniza SO a versao selecionada (ver `planejarSincronizacao`): renomeia sempre;
   * remove quem saiu de Cabelo apenas na versao vigente ou em futuras, nunca esvaziando
   * a versao. Se a remocao alcancar meses ja encerrados, pede confirmacao nomeando-os.
   */
  const handleSyncProfessionals = async () => {
    if (!versaoAtual) return;
    const versao = versaoAtual;
    setSyncing(true);
    let plano: PlanoSincronizacao;
    try {
      await fetchActiveProfessionals();
      const { data: currentRows, error: readError } = await fabricanteDb
        .from("profissional_fabricante")
        .select("id, profissional_id, nome_profissional")
        .eq("valid_from", versao);
      if (readError) throw readError;
      const rows = (currentRows || []) as unknown as LinhaSync[];

      const freshCabelo = activeProfessionals.filter((p) => p.categoria === "Cabelo" && p.nome_profissional);
      const cabeloNomes = new Map(freshCabelo.map((p) => [p.profissionalId, p.nome_profissional!]));
      plano = planejarSincronizacao(rows, cabeloNomes, isVersaoPassada(versions, versao, mesCorrente));
    } catch (err: unknown) {
      toast({ title: "Erro na sincronização", description: mensagemDeErro(err), variant: "destructive" });
      setSyncing(false);
      return;
    }
    setSyncing(false);

    if (plano.bloqueio === "lista-vazia") {
      toast({
        title: "Sincronização não executada",
        description: "A lista de profissionais de Cabelo veio vazia; nada foi alterado. Recarregue e tente de novo.",
        variant: "destructive",
      });
      return;
    }
    if (plano.remover.length > 0 && mesesFechadosDaVersao(versions, versao, mesCorrente)) {
      setConfirmSync({ plano, versao });
      return;
    }
    await executarSincronizacao(plano, versao);
  };

  const openNewVersion = () => {
    setNewVersionOrigin(versaoAtual ?? "");
    setNewVersionMonth(mesCorrente);
    setNewVersionAck(false);
    setNewVersionOpen(true);
  };

  const newVersionError = (() => {
    if (!isMesValido(newVersionMonth)) return "Informe o mês no formato AAAA-MM.";
    if (versions.includes(newVersionMonth)) return `A versão ${rotuloMes(newVersionMonth)} já existe.`;
    return null;
  })();
  const impacto =
    !newVersionError && newVersionOrigin
      ? impactoNovaVersao(versions, newVersionOrigin, newVersionMonth, mesCorrente)
      : null;
  const precisaAck = !!impacto?.mesesFechados;

  const handleCreateVersion = async () => {
    if (!newVersionOrigin || newVersionError) return;
    if (precisaAck && !newVersionAck) return;
    try {
      const n = await createVersion.mutateAsync({ origem: newVersionOrigin, destino: newVersionMonth });
      setSelectedVersion(newVersionMonth);
      setNewVersionOpen(false);
      toast({ title: "Versão criada", description: `${n} autorização(ões) copiada(s) para ${rotuloVersao(newVersionMonth)}.` });
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

  const executarAddProfBrand = async (payload: AddPayload) => {
    try {
      // So a versao do payload muda; as outras (outros meses) ficam intocadas.
      await addProfBrand.mutateAsync(payload);
      setSelectedVersion(payload.valid_from);
      setNewProfBrandProfId("");
      setNewProfBrandFabricante("");
      toast({ title: "Marca autorizada adicionada" });
    } catch (err: unknown) {
      toast({ title: "Erro", description: mensagemDeErro(err), variant: "destructive" });
    }
  };

  const handleAddProfBrand = async () => {
    if (!newProfBrandProfId || !newProfBrandFabricante) return;
    const prof = cabeloProfessionals.find((p) => String(p.profissionalId) === newProfBrandProfId);
    if (!prof) return;
    const payload: AddPayload = {
      profissional_id: prof.profissionalId,
      nome_profissional: prof.nome_profissional,
      fabricante: newProfBrandFabricante,
      valid_from: versaoParaInserir,
    };
    // Versao que cobre meses encerrados: autorizar muda rankings ja apurados.
    if (fechadosDaVersaoAtual) {
      setConfirmAdd(payload);
      return;
    }
    await executarAddProfBrand(payload);
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
                Vale para os meses <strong>{rotuloIntervalo(mesesDaVersao(versions, versaoAtual))}</strong>.
                Mudanças aqui alteram o ranking de todos esses meses. Para mudar só a partir de um mês, crie uma nova versão.
                {fechadosDaVersaoAtual && (
                  <span className="block mt-1 text-amber-700">
                    Esta versão cobre meses já encerrados ({rotuloIntervalo(fechadosDaVersaoAtual)}): autorizar ou remover aqui reescreve esses rankings e pede confirmação.
                  </span>
                )}
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
                onChange={(e) => { setNewVersionOrigin(e.target.value); setNewVersionAck(false); }}
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
                onChange={(e) => { setNewVersionMonth(e.target.value.trim()); setNewVersionAck(false); }}
                placeholder="2026-10"
                className="font-body text-sm"
              />
              {newVersionError && (
                <p className="text-xs text-red-600 font-body mt-1">{newVersionError}</p>
              )}
              {impacto && (
                <p className={`text-xs font-body mt-1 ${impacto.mudaRankingNaCriacao ? "text-amber-700" : "text-gray-500"}`}>
                  {impacto.mudaRankingNaCriacao ? (
                    <>
                      O ranking muda <strong>já na criação</strong>: os meses{" "}
                      <strong>{rotuloIntervalo(impacto.meses)}</strong> deixam de usar{" "}
                      {impacto.vigenteNoDestino ? `a versão "${rotuloVersao(impacto.vigenteNoDestino)}"` : "nenhuma marca (hoje não há versão para eles)"}{" "}
                      e passam a usar as autorizações copiadas de "{rotuloVersao(newVersionOrigin)}".
                    </>
                  ) : (
                    <>
                      Nada muda no ranking ao criar: os meses <strong>{rotuloIntervalo(impacto.meses)}</strong> já usam
                      "{rotuloVersao(newVersionOrigin)}". Só as edições feitas depois na nova versão passam a valer para eles.
                    </>
                  )}
                </p>
              )}
              {impacto?.mesesFechados && (
                <label className="flex items-start gap-2 mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs font-body text-red-800">
                  <input
                    type="checkbox"
                    checked={newVersionAck}
                    onChange={(e) => setNewVersionAck(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Entendo que esta versão cobre meses <strong>já encerrados</strong> (
                    {rotuloIntervalo(impacto.mesesFechados)}) e que{" "}
                    {impacto.mudaRankingNaCriacao
                      ? "o ranking desses meses é reescrito já na criação"
                      : "qualquer edição nela reescreve o ranking desses meses"}.
                  </span>
                </label>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewVersionOpen(false)} className="font-body">
              Cancelar
            </Button>
            <Button
              onClick={handleCreateVersion}
              disabled={!newVersionOrigin || !!newVersionError || (precisaAck && !newVersionAck) || createVersion.isPending}
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
              {deleteTarget?.type === "profBrand" && fechadosDaVersaoAtual && (
                <span className="block mt-2 text-amber-700">
                  Esta versão cobre meses já encerrados ({rotuloIntervalo(fechadosDaVersaoAtual)}): o ranking desses meses será reescrito.
                </span>
              )}
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

      {/* Autorizar numa versao que cobre meses encerrados */}
      <AlertDialog open={!!confirmAdd} onOpenChange={(open) => !open && setConfirmAdd(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Reescrever meses encerrados?</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              Autorizar "{confirmAdd?.fabricante}" para {confirmAdd?.nome_profissional} na versão{" "}
              "{confirmAdd ? rotuloVersao(confirmAdd.valid_from) : ""}" muda o ranking de Cabelo dos meses já encerrados
              {fechadosDaVersaoAtual ? ` ${rotuloIntervalo(fechadosDaVersaoAtual)}` : ""}.
              Para valer só a partir de agora, cancele e crie uma nova versão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-body">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const payload = confirmAdd;
                setConfirmAdd(null);
                if (payload) void executarAddProfBrand(payload);
              }}
              className="bg-amber-600 hover:bg-amber-700 font-body"
            >
              Autorizar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sincronizacao que remove linhas de uma versao que cobre meses encerrados */}
      <AlertDialog open={!!confirmSync} onOpenChange={(open) => !open && setConfirmSync(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Remover autorizações de meses encerrados?</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              A sincronização vai remover {confirmSync?.plano.remover.length} autorização(ões) de quem saiu de Cabelo
              na versão "{confirmSync ? rotuloVersao(confirmSync.versao) : ""}", que cobre os meses já encerrados
              {confirmSync ? ` ${rotuloIntervalo(mesesFechadosDaVersao(versions, confirmSync.versao, mesCorrente) ?? mesesDaVersao(versions, confirmSync.versao))}` : ""}.
              O ranking desses meses será reescrito. Para preservá-los, cancele e crie uma nova versão a partir do mês corrente antes de sincronizar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-body">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const alvo = confirmSync;
                setConfirmSync(null);
                if (alvo) void executarSincronizacao(alvo.plano, alvo.versao);
              }}
              className="bg-red-600 hover:bg-red-700 font-body"
            >
              Sincronizar e remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
