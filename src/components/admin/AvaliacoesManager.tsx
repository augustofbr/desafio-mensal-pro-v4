import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Check, X, Loader2, Star, Clock, Undo2, Inbox } from "lucide-react";
import {
  useAdminAvaliacoes,
  HISTORICO_LIMITE,
  type AvaliacaoAdmin,
} from "@/hooks/useAdminAvaliacoes";
import {
  formatDataHoraManaus,
  mesManaus,
  mesManausAtual,
  mesPorExtensoManaus,
} from "@/lib/dateUtils";
import { useToast } from "@/hooks/use-toast";
// auth-kit: controles de escrita só para quem tem write na página "admin".
// Isto é UX — quem burlar o DOM esbarra na RLS (policies destaque_can_write_page).
import { RequireWrite } from "@/auth/guards";
import { cn } from "@/lib/utils";

type Ordenacao =
  | "mais_antiga"
  | "mais_recente"
  | "profissional_az"
  | "profissional_za"
  | "cliente_az"
  | "cliente_za";

const ORDENACOES: { valor: Ordenacao; rotulo: string }[] = [
  { valor: "mais_antiga", rotulo: "Mais antigas primeiro" },
  { valor: "mais_recente", rotulo: "Mais recentes primeiro" },
  { valor: "profissional_az", rotulo: "Profissional (A-Z)" },
  { valor: "profissional_za", rotulo: "Profissional (Z-A)" },
  { valor: "cliente_az", rotulo: "Cliente (A-Z)" },
  { valor: "cliente_za", rotulo: "Cliente (Z-A)" },
];

function ordenar(lista: AvaliacaoAdmin[], modo: Ordenacao): AvaliacaoAdmin[] {
  const copia = [...lista];
  copia.sort((a, b) => {
    switch (modo) {
      case "mais_recente":
        return (
          new Date(b.data_hora_cadastro).getTime() -
          new Date(a.data_hora_cadastro).getTime()
        );
      case "mais_antiga":
        return (
          new Date(a.data_hora_cadastro).getTime() -
          new Date(b.data_hora_cadastro).getTime()
        );
      case "profissional_az":
        return a.nome_profissional.localeCompare(b.nome_profissional, "pt-BR");
      case "profissional_za":
        return b.nome_profissional.localeCompare(a.nome_profissional, "pt-BR");
      case "cliente_az":
        return a.nome_cliente.localeCompare(b.nome_cliente, "pt-BR");
      case "cliente_za":
        return b.nome_cliente.localeCompare(a.nome_cliente, "pt-BR");
      default:
        return 0;
    }
  });
  return copia;
}

function inicial(nome: string): string {
  return (Array.from(String(nome ?? "").trim())[0] ?? "?").toUpperCase();
}

function mensagemDoErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

/** "1 avaliação" / "3 avaliações" — o caso de 1 é o comum aqui (fila pequena),
 *  e "1 avaliação(ões) são" fica ruim justamente no caso mais frequente. */
function plural(n: number, um: string, muitos: string): string {
  return `${n} ${n === 1 ? um : muitos}`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "aprovada") {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 font-body text-xs text-emerald-700 hover:bg-emerald-100">
        Aprovada
      </Badge>
    );
  }
  if (status === "rejeitada") {
    return (
      <Badge className="border-red-200 bg-red-100 font-body text-xs text-red-700 hover:bg-red-100">
        Recusada
      </Badge>
    );
  }
  return (
    <Badge className="border-yellow-200 bg-yellow-100 font-body text-xs text-yellow-700 hover:bg-yellow-100">
      Pendente
    </Badge>
  );
}

function Estatistica({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-2xl border bg-card p-3">
      <p className="font-body text-xs text-muted-foreground">{rotulo}</p>
      <p className="font-mono-num text-2xl font-bold text-foreground">{valor}</p>
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <div className="py-10 text-center">
      <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </span>
      <p className="font-body text-sm text-muted-foreground">{texto}</p>
    </div>
  );
}

/**
 * A estrela pontua no mês em que foi CADASTRADA (`useStarsData` filtra por
 * `data_hora_cadastro`), não no mês da decisão. Aprovar uma pendente atrasada
 * mexe no ranking de um mês que provavelmente já foi encerrado e premiado —
 * por isso essas nunca passam sem aviso.
 */
function ehDeMesAnterior(avaliacao: AvaliacaoAdmin): boolean {
  return mesManaus(avaliacao.data_hora_cadastro) < mesManausAtual();
}

/** Confirmação exigida para o que atinge várias linhas de uma vez, para o que
 *  desfaz uma decisão já tomada e para o que mexe em mês fechado. Aprovar/
 *  recusar uma avaliação isolada do mês corrente sai direto: é a tarefa
 *  repetitiva do painel, e o caminho de volta é o "Devolver para a fila". */
type Confirmacao = {
  acao: "aprovar" | "recusar" | "reverter";
  ids: string[];
  titulo: string;
  descricao: string;
  aviso?: string;
};

export function AvaliacoesManager() {
  const {
    pendentes,
    historico,
    isLoading,
    isLoadingHistorico,
    decidir,
    reverter,
  } = useAdminAvaliacoes();
  const { toast } = useToast();

  const [filtroProfissional, setFiltroProfissional] = useState("");
  const [buscaCliente, setBuscaCliente] = useState("");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("mais_antiga");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [buscaHistorico, setBuscaHistorico] = useState("");
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);

  const profissionaisNaFila = useMemo(
    () =>
      Array.from(new Set(pendentes.map((a) => a.nome_profissional))).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [pendentes],
  );

  const filtradas = useMemo(() => {
    const busca = buscaCliente.trim().toLowerCase();
    const lista = pendentes.filter((a) => {
      if (filtroProfissional && a.nome_profissional !== filtroProfissional) return false;
      if (busca && !a.nome_cliente.toLowerCase().includes(busca)) return false;
      return true;
    });
    return ordenar(lista, ordenacao);
  }, [pendentes, filtroProfissional, buscaCliente, ordenacao]);

  const historicoFiltrado = useMemo(() => {
    const busca = buscaHistorico.trim().toLowerCase();
    if (!busca) return historico;
    return historico.filter(
      (a) =>
        a.nome_cliente.toLowerCase().includes(busca) ||
        a.nome_profissional.toLowerCase().includes(busca),
    );
  }, [historico, buscaHistorico]);

  const aprovadas = historicoFiltrado.filter((a) => a.status === "aprovada");
  const recusadas = historicoFiltrado.filter((a) => a.status === "rejeitada");

  // A seleção vive por id; se o filtro esconder uma linha selecionada, ela sai
  // da conta — o botão de lote nunca age sobre o que não está na tela.
  const idsVisiveis = filtradas.map((a) => a.id);
  const selecionadasVisiveis = idsVisiveis.filter((id) => selecionadas.has(id));
  const todasSelecionadas =
    idsVisiveis.length > 0 && selecionadasVisiveis.length === idsVisiveis.length;

  const emAcao = (id: string) =>
    (decidir.isPending && decidir.variables?.ids.includes(id)) ||
    (reverter.isPending && reverter.variables?.includes(id));

  const alternarSelecao = (id: string) => {
    setSelecionadas((antes) => {
      const novas = new Set(antes);
      if (novas.has(id)) novas.delete(id);
      else novas.add(id);
      return novas;
    });
  };

  const alternarTodas = () => {
    setSelecionadas(todasSelecionadas ? new Set() : new Set(idsVisiveis));
  };

  const executarDecisao = async (
    ids: string[],
    status: "aprovada" | "rejeitada",
    mensagem: string,
  ) => {
    try {
      await decidir.mutateAsync({ ids, status });
      setSelecionadas((antes) => {
        const novas = new Set(antes);
        ids.forEach((id) => novas.delete(id));
        return novas;
      });
      toast({ title: mensagem });
    } catch (err) {
      toast({
        title: "Não foi possível salvar",
        description: mensagemDoErro(err),
        variant: "destructive",
      });
    }
  };

  /** Uma avaliação do mês corrente sai direto; uma atrasada passa pelo diálogo,
   *  porque os 3 pontos caem num ranking que já foi encerrado. */
  const aprovarUma = (avaliacao: AvaliacaoAdmin) => {
    if (ehDeMesAnterior(avaliacao)) {
      setConfirmacao({
        acao: "aprovar",
        ids: [avaliacao.id],
        titulo: "Aprovar avaliação de mês anterior?",
        descricao: `Esta avaliação foi cadastrada em ${mesPorExtensoManaus(
          avaliacao.data_hora_cadastro,
        )}. Os 3 pontos entram no ranking daquele mês, não no de hoje.`,
        aviso: "O ranking desse mês já está encerrado.",
      });
      return;
    }
    executarDecisao(
      [avaliacao.id],
      "aprovada",
      `Estrela de ${avaliacao.nome_cliente} aprovada`,
    );
  };

  const executarReversao = async (ids: string[]) => {
    try {
      await reverter.mutateAsync(ids);
      toast({ title: "Avaliação devolvida para a fila" });
    } catch (err) {
      toast({
        title: "Não foi possível salvar",
        description: mensagemDoErro(err),
        variant: "destructive",
      });
    }
  };

  const confirmar = async () => {
    if (!confirmacao) return;
    const { acao, ids } = confirmacao;
    setConfirmacao(null);
    if (acao === "aprovar") {
      await executarDecisao(
        ids,
        "aprovada",
        `${plural(ids.length, "avaliação aprovada", "avaliações aprovadas")}`,
      );
    } else if (acao === "recusar") {
      await executarDecisao(
        ids,
        "rejeitada",
        `${plural(ids.length, "avaliação recusada", "avaliações recusadas")}`,
      );
    } else {
      await executarReversao(ids);
    }
  };

  const limparFiltros = () => {
    setFiltroProfissional("");
    setBuscaCliente("");
    setOrdenacao("mais_antiga");
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
        <h2 className="text-lg font-heading font-semibold text-gray-900">Aprovações</h2>
        <p className="font-body text-sm text-gray-500">
          Estrelas do Google cadastradas pelas clientes. Cada estrela aprovada vale 3
          pontos no mês em que a avaliação foi cadastrada.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Estatistica rotulo="Na fila" valor={pendentes.length} />
        <Estatistica rotulo="Profissionais" valor={profissionaisNaFila.length} />
        <Estatistica rotulo="Selecionadas" valor={selecionadasVisiveis.length} />
      </div>

      {/* Fila de pendentes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-heading">
            <Clock className="h-4 w-4 text-amber-500" />
            Aguardando decisão ({filtradas.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendentes.length === 0 ? (
            <Vazio texto="Nenhuma avaliação aguardando decisão." />
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1">
                  <label
                    htmlFor="filtro-profissional"
                    className="font-body text-xs text-gray-500"
                  >
                    Profissional
                  </label>
                  <select
                    id="filtro-profissional"
                    value={filtroProfissional}
                    onChange={(e) => setFiltroProfissional(e.target.value)}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 font-body text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="">Todas</option>
                    {profissionaisNaFila.map((nome) => (
                      <option key={nome} value={nome}>
                        {nome} (
                        {pendentes.filter((a) => a.nome_profissional === nome).length})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[180px] flex-1">
                  <label htmlFor="busca-cliente" className="font-body text-xs text-gray-500">
                    Buscar cliente
                  </label>
                  <Input
                    id="busca-cliente"
                    value={buscaCliente}
                    onChange={(e) => setBuscaCliente(e.target.value)}
                    placeholder="Nome da cliente..."
                    className="h-11 font-body text-sm"
                  />
                </div>
                <div className="min-w-[180px] flex-1">
                  <label htmlFor="ordenacao" className="font-body text-xs text-gray-500">
                    Ordenar por
                  </label>
                  <select
                    id="ordenacao"
                    value={ordenacao}
                    onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 font-body text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    {ORDENACOES.map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.rotulo}
                      </option>
                    ))}
                  </select>
                </div>
                {(filtroProfissional || buscaCliente) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={limparFiltros}
                    className="h-11 font-body"
                  >
                    Limpar filtros
                  </Button>
                )}
              </div>

              <RequireWrite chave="admin">
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-muted/50 p-3">
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={todasSelecionadas}
                      onCheckedChange={alternarTodas}
                      disabled={idsVisiveis.length === 0}
                      className="h-5 w-5"
                      aria-label="Selecionar todas as avaliações da lista"
                    />
                    <span className="font-body text-sm text-gray-700">
                      Selecionar todas ({idsVisiveis.length})
                    </span>
                  </label>
                  {selecionadasVisiveis.length > 0 && (
                    <div className="flex flex-1 flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          const atrasadas = filtradas.filter(
                            (a) => selecionadas.has(a.id) && ehDeMesAnterior(a),
                          );
                          setConfirmacao({
                            acao: "aprovar",
                            ids: selecionadasVisiveis,
                            titulo: `Aprovar ${plural(selecionadasVisiveis.length, "avaliação", "avaliações")}?`,
                            descricao:
                              "Cada aprovação soma 3 pontos no mês em que a avaliação foi cadastrada — não no mês de hoje.",
                            aviso:
                              atrasadas.length === 0
                                ? undefined
                                : atrasadas.length === 1
                                  ? "Atenção: 1 avaliação é de um mês anterior — aprová-la altera um ranking já encerrado."
                                  : `Atenção: ${atrasadas.length} avaliações são de meses anteriores — a aprovação altera rankings já encerrados.`,
                          });
                        }}
                        disabled={decidir.isPending}
                        className="min-h-[44px] flex-1 gap-1.5 bg-emerald-600 font-body hover:bg-emerald-700 sm:flex-none"
                      >
                        {decidir.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Aprovar selecionadas
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setConfirmacao({
                            acao: "recusar",
                            ids: selecionadasVisiveis,
                            titulo: `Recusar ${plural(selecionadasVisiveis.length, "avaliação", "avaliações")}?`,
                            descricao:
                              "Elas saem da fila e ficam no histórico como recusadas. Nada é apagado.",
                          })
                        }
                        disabled={decidir.isPending}
                        className="min-h-[44px] flex-1 gap-1.5 font-body text-red-600 hover:bg-red-50 hover:text-red-700 sm:flex-none"
                      >
                        <X className="h-4 w-4" />
                        Recusar selecionadas
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelecionadas(new Set())}
                        className="min-h-[44px] font-body"
                      >
                        Limpar seleção
                      </Button>
                    </div>
                  )}
                </div>
              </RequireWrite>

              {filtradas.length === 0 ? (
                <Vazio texto="Nenhuma avaliação com os filtros aplicados." />
              ) : (
                <ul className="space-y-2.5">
                  {filtradas.map((avaliacao) => {
                    const selecionada = selecionadas.has(avaliacao.id);
                    const ocupada = emAcao(avaliacao.id);
                    return (
                      <li
                        key={avaliacao.id}
                        className={cn(
                          "flex flex-col gap-3 rounded-2xl border p-3 transition-colors sm:flex-row sm:items-center",
                          selecionada ? "border-primary/40 bg-primary/5" : "bg-card",
                        )}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <RequireWrite chave="admin">
                            <Checkbox
                              checked={selecionada}
                              onCheckedChange={() => alternarSelecao(avaliacao.id)}
                              className="h-5 w-5 shrink-0"
                              aria-label={`Selecionar avaliação de ${avaliacao.nome_cliente}`}
                            />
                          </RequireWrite>
                          <Avatar className="h-10 w-10 shrink-0">
                            <AvatarFallback className="text-base font-semibold">
                              {inicial(avaliacao.nome_profissional)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-body text-base font-semibold text-gray-800">
                              {avaliacao.nome_profissional}
                            </p>
                            <p className="truncate font-body text-sm text-gray-600">
                              Cliente: {avaliacao.nome_cliente}
                            </p>
                            <p className="font-mono-num text-xs text-muted-foreground">
                              {formatDataHoraManaus(avaliacao.data_hora_cadastro)}
                            </p>
                          </div>
                        </div>

                        <RequireWrite chave="admin">
                          <div className="flex shrink-0 gap-2">
                            <Button
                              size="sm"
                              onClick={() => aprovarUma(avaliacao)}
                              disabled={ocupada || decidir.isPending}
                              className="min-h-[44px] flex-1 gap-1.5 bg-emerald-600 font-body hover:bg-emerald-700 sm:flex-none"
                            >
                              {ocupada ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                              Aprovar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                executarDecisao(
                                  [avaliacao.id],
                                  "rejeitada",
                                  `Estrela de ${avaliacao.nome_cliente} recusada`,
                                )
                              }
                              disabled={ocupada || decidir.isPending}
                              className="min-h-[44px] flex-1 gap-1.5 font-body text-red-600 hover:bg-red-50 hover:text-red-700 sm:flex-none"
                            >
                              <X className="h-4 w-4" />
                              Recusar
                            </Button>
                          </div>
                        </RequireWrite>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Historico */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-heading">
            <Star className="h-4 w-4 text-violet-500" />
            Histórico de decisões
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Input
              value={buscaHistorico}
              onChange={(e) => setBuscaHistorico(e.target.value)}
              placeholder="Buscar por cliente ou profissional..."
              className="h-11 font-body text-sm"
            />
            {/* Junto do campo de busca, não no rodapé: quem procura algo antigo
                e não acha precisa saber AQUI que a lista é truncada. */}
            <p className="font-body text-xs text-gray-400">
              A busca cobre as {HISTORICO_LIMITE} decisões mais recentes.
            </p>
          </div>

          <Tabs defaultValue="aprovadas">
            <TabsList className="grid w-full grid-cols-2 sm:max-w-sm">
              <TabsTrigger value="aprovadas" className="font-body text-xs">
                Aprovadas ({aprovadas.length})
              </TabsTrigger>
              <TabsTrigger value="recusadas" className="font-body text-xs">
                Recusadas ({recusadas.length})
              </TabsTrigger>
            </TabsList>

            {[
              { valor: "aprovadas", lista: aprovadas },
              { valor: "recusadas", lista: recusadas },
            ].map(({ valor, lista }) => (
              <TabsContent key={valor} value={valor} className="mt-3">
                {isLoadingHistorico ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : lista.length === 0 ? (
                  <Vazio texto="Nada por aqui." />
                ) : (
                  <ul className="space-y-2">
                    {lista.map((avaliacao) => (
                      <li
                        key={avaliacao.id}
                        className="flex flex-col gap-2 rounded-2xl border bg-card p-3 sm:flex-row sm:items-center"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarFallback className="text-sm font-semibold">
                              {inicial(avaliacao.nome_profissional)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-body text-sm font-semibold text-gray-800">
                              {avaliacao.nome_profissional}
                            </p>
                            <p className="truncate font-body text-sm text-gray-600">
                              Cliente: {avaliacao.nome_cliente}
                            </p>
                            <p className="font-mono-num text-xs text-muted-foreground">
                              Cadastro {formatDataHoraManaus(avaliacao.data_hora_cadastro)}
                              {avaliacao.data_aprovacao
                                ? ` · Decisão ${formatDataHoraManaus(avaliacao.data_aprovacao)}`
                                : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StatusBadge status={avaliacao.status} />
                          <RequireWrite chave="admin">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setConfirmacao({
                                  acao: "reverter",
                                  ids: [avaliacao.id],
                                  titulo: "Devolver para a fila?",
                                  descricao: `A estrela de ${avaliacao.nome_cliente} volta a ficar pendente${
                                    avaliacao.status === "aprovada"
                                      ? ` e perde os 3 pontos no ranking de ${mesPorExtensoManaus(
                                          avaliacao.data_hora_cadastro,
                                        )}, o mês do cadastro`
                                      : ""
                                  }.`,
                                })
                              }
                              disabled={emAcao(avaliacao.id) || reverter.isPending}
                              className="min-h-[44px] gap-1.5 font-body text-xs"
                            >
                              {emAcao(avaliacao.id) ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Undo2 className="h-3.5 w-3.5" />
                              )}
                              Devolver para a fila
                            </Button>
                          </RequireWrite>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <AlertDialog
        open={!!confirmacao}
        onOpenChange={(aberto) => !aberto && setConfirmacao(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">
              {confirmacao?.titulo}
            </AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              {confirmacao?.descricao}
            </AlertDialogDescription>
            {confirmacao?.aviso && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 font-body text-sm text-amber-900">
                {confirmacao.aviso}
              </p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-body">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmar}
              className={cn(
                "font-body",
                confirmacao?.acao === "aprovar"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : confirmacao?.acao === "recusar"
                    ? "bg-red-600 hover:bg-red-700"
                    : "",
              )}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
