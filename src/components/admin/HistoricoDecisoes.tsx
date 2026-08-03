import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Star, Undo2 } from "lucide-react";
import {
  useHistoricoAvaliacoes,
  HISTORICO_LIMITE,
  type AvaliacaoAdmin,
} from "@/hooks/useAdminAvaliacoes";
import { formatDataHoraManaus, mesPorExtensoManaus } from "@/lib/dateUtils";
import {
  ORDENACOES_HISTORICO,
  inicial,
  mensagemDoErro,
  ordenar,
  plural,
  type Ordenacao,
} from "@/lib/avaliacoesAdmin";
import {
  PERIODOS,
  resolverPeriodo,
  type PeriodoChave,
  type PeriodoPersonalizado,
} from "@/lib/periodoHistorico";
import { useToast } from "@/hooks/use-toast";
import { RequireWrite } from "@/auth/guards";
import {
  ConfirmacaoDialog,
  SelectFiltro,
  StatusBadge,
  Vazio,
  type Confirmacao,
} from "./AvaliacoesUI";

type Aba = "todas" | "aprovadas" | "recusadas";

const PERIODO_PADRAO: PeriodoChave = "mes_atual";
const ORDENACAO_PADRAO: Ordenacao = "mais_recente";

function LinhaHistorico({
  avaliacao,
  ocupada,
  onDevolver,
}: {
  avaliacao: AvaliacaoAdmin;
  ocupada: boolean;
  onDevolver: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-2xl border bg-card p-3 sm:flex-row sm:items-center">
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
            onClick={onDevolver}
            disabled={ocupada}
            className="min-h-[44px] gap-1.5 font-body text-xs"
          >
            {ocupada ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Undo2 className="h-3.5 w-3.5" />
            )}
            Devolver para a fila
          </Button>
        </RequireWrite>
      </div>
    </li>
  );
}

/**
 * Historico de decisoes ja tomadas, com recorte por periodo, profissional e
 * status.
 *
 * O periodo e recortado por `data_hora_cadastro` (ver `buscarHistorico`): e a
 * data que decide em que mes a estrela pontua, a mesma referencia que a fila
 * usa nos avisos de mes fechado. Cada linha mostra as duas datas, de cadastro e
 * de decisao, para quem precisar conferir a diferenca.
 */
export function HistoricoDecisoes() {
  const { toast } = useToast();

  const [periodoChave, setPeriodoChave] = useState<PeriodoChave>(PERIODO_PADRAO);
  const [personalizado, setPersonalizado] = useState<PeriodoPersonalizado>({
    de: "",
    ate: "",
  });
  const [filtroProfissional, setFiltroProfissional] = useState("");
  const [busca, setBusca] = useState("");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>(ORDENACAO_PADRAO);
  const [aba, setAba] = useState<Aba>("todas");
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);

  // O "agora" e fixado por escolha de filtro, nao por render: recalcular a cada
  // render trocaria a janela (e a chave de cache) sem motivo. O efeito colateral
  // e que uma aba aberta atravessando a meia-noite mantem o "Hoje" do dia em que
  // foi aberta — some ao trocar de filtro ou recarregar.
  const periodo = useMemo(
    () => resolverPeriodo(periodoChave, new Date(), personalizado),
    [periodoChave, personalizado],
  );

  const { historico, isLoading, atingiuTeto, reverter } =
    useHistoricoAvaliacoes(periodo);

  // Derivada do periodo inteiro, ANTES dos demais filtros — se saisse da lista
  // ja filtrada, escolher um profissional esvaziaria as opcoes dos outros.
  const profissionaisNoPeriodo = useMemo(() => {
    const contagem = new Map<string, number>();
    historico.forEach((a) => {
      contagem.set(a.nome_profissional, (contagem.get(a.nome_profissional) ?? 0) + 1);
    });
    // Quem esta filtrado mas nao tem decisoes no periodo continua na lista (com
    // zero): sem isso o `<select>` ficaria em branco e o filtro pareceria solto.
    if (filtroProfissional && !contagem.has(filtroProfissional)) {
      contagem.set(filtroProfissional, 0);
    }
    return Array.from(contagem.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], "pt-BR"),
    );
  }, [historico, filtroProfissional]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = historico.filter((a) => {
      if (filtroProfissional && a.nome_profissional !== filtroProfissional) return false;
      if (
        termo &&
        !a.nome_cliente.toLowerCase().includes(termo) &&
        !a.nome_profissional.toLowerCase().includes(termo)
      ) {
        return false;
      }
      return true;
    });
    return ordenar(lista, ordenacao);
  }, [historico, filtroProfissional, busca, ordenacao]);

  const aprovadas = filtradas.filter((a) => a.status === "aprovada");
  const recusadas = filtradas.filter((a) => a.status === "rejeitada");

  const temFiltroAtivo =
    periodoChave !== PERIODO_PADRAO ||
    filtroProfissional !== "" ||
    busca !== "" ||
    ordenacao !== ORDENACAO_PADRAO ||
    aba !== "todas";

  const limparFiltros = () => {
    setPeriodoChave(PERIODO_PADRAO);
    setPersonalizado({ de: "", ate: "" });
    setFiltroProfissional("");
    setBusca("");
    setOrdenacao(ORDENACAO_PADRAO);
    setAba("todas");
  };

  /** Ao abrir o personalizado, os campos ja vem com o periodo que esta na tela —
   *  em branco, o filtro pareceria ter perdido o recorte anterior. */
  const trocarPeriodo = (valor: string) => {
    const chave = valor as PeriodoChave;
    if (chave === "personalizado" && !personalizado.de && !personalizado.ate) {
      setPersonalizado({ de: periodo.de, ate: periodo.ate });
    }
    setPeriodoChave(chave);
  };

  const devolverParaFila = async (ids: string[]) => {
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

  const listaDaAba: Record<Aba, AvaliacaoAdmin[]> = {
    todas: filtradas,
    aprovadas,
    recusadas,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-heading">
          <Star className="h-4 w-4 text-violet-500" />
          Histórico de decisões
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <SelectFiltro
              rotulo="Filtrar por período"
              valor={periodoChave}
              onChange={trocarPeriodo}
            >
              {PERIODOS.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.rotulo}
                </option>
              ))}
            </SelectFiltro>

            <SelectFiltro
              rotulo="Filtrar por profissional"
              valor={filtroProfissional}
              onChange={setFiltroProfissional}
            >
              <option value="">Todos os profissionais</option>
              {profissionaisNoPeriodo.map(([nome, total]) => (
                <option key={nome} value={nome}>
                  {nome} ({total})
                </option>
              ))}
            </SelectFiltro>

            <SelectFiltro
              rotulo="Ordenar por"
              valor={ordenacao}
              onChange={(valor) => setOrdenacao(valor as Ordenacao)}
            >
              {ORDENACOES_HISTORICO.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </SelectFiltro>
          </div>

          {periodoChave === "personalizado" && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="font-body text-xs text-gray-500">
                De
                <Input
                  type="date"
                  value={personalizado.de}
                  max={personalizado.ate || undefined}
                  onChange={(e) =>
                    setPersonalizado((antes) => ({ ...antes, de: e.target.value }))
                  }
                  className="mt-1 h-11 font-body text-sm"
                />
              </label>
              <label className="font-body text-xs text-gray-500">
                Até
                <Input
                  type="date"
                  value={personalizado.ate}
                  min={personalizado.de || undefined}
                  onChange={(e) =>
                    setPersonalizado((antes) => ({ ...antes, ate: e.target.value }))
                  }
                  className="mt-1 h-11 font-body text-sm"
                />
              </label>
            </div>
          )}

          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por cliente ou profissional..."
            className="h-11 font-body text-sm"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* O intervalo em datas resolve qualquer duvida sobre o que "semana
                passada" ou "mes anterior" abrangem — e diz por qual data o
                recorte foi feito, ja que cada linha mostra duas. */}
            <p className="font-body text-xs text-gray-500">
              {plural(filtradas.length, "decisão", "decisões")} de avaliações
              cadastradas entre {periodo.rotulo}
            </p>
            {temFiltroAtivo && (
              <Button
                variant="ghost"
                size="sm"
                onClick={limparFiltros}
                className="h-9 font-body text-xs"
              >
                Limpar filtros
              </Button>
            )}
          </div>

          {atingiuTeto && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-2 font-body text-xs text-amber-900">
              Este período tem mais de {HISTORICO_LIMITE} decisões e a lista foi
              cortada. Escolha um intervalo menor para ver o restante.
            </p>
          )}
        </div>

        <Tabs value={aba} onValueChange={(valor) => setAba(valor as Aba)}>
          <TabsList className="grid w-full grid-cols-3 sm:max-w-md">
            <TabsTrigger value="todas" className="font-body text-xs">
              Todas ({filtradas.length})
            </TabsTrigger>
            <TabsTrigger value="aprovadas" className="font-body text-xs">
              Aprovadas ({aprovadas.length})
            </TabsTrigger>
            <TabsTrigger value="recusadas" className="font-body text-xs">
              Recusadas ({recusadas.length})
            </TabsTrigger>
          </TabsList>

          {(Object.keys(listaDaAba) as Aba[]).map((valor) => (
            <TabsContent key={valor} value={valor} className="mt-3">
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-[78px] rounded-2xl animate-shimmer" />
                  ))}
                </div>
              ) : listaDaAba[valor].length === 0 ? (
                <Vazio
                  texto={
                    historico.length === 0
                      ? "Nenhuma decisão neste período."
                      : "Nenhuma decisão com os filtros aplicados."
                  }
                />
              ) : (
                <ul className="space-y-2">
                  {listaDaAba[valor].map((avaliacao) => (
                    <LinhaHistorico
                      key={avaliacao.id}
                      avaliacao={avaliacao}
                      ocupada={
                        reverter.isPending && !!reverter.variables?.includes(avaliacao.id)
                      }
                      onDevolver={() =>
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
                    />
                  ))}
                </ul>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>

      <ConfirmacaoDialog
        confirmacao={confirmacao}
        onFechar={() => setConfirmacao(null)}
        onConfirmar={() => {
          const ids = confirmacao?.ids ?? [];
          setConfirmacao(null);
          void devolverParaFila(ids);
        }}
      />
    </Card>
  );
}
