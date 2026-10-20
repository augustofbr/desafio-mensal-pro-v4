import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Check, X, Loader2, Clock, SlidersHorizontal } from "lucide-react";
import { useAdminAvaliacoes, type AvaliacaoAdmin } from "@/hooks/useAdminAvaliacoes";
import { useSinaisAvaliacoes } from "@/hooks/useSinaisAvaliacoes";
import {
  formatDataHoraManaus,
  mesManaus,
  mesManausAtual,
  mesPorExtensoManaus,
} from "@/lib/dateUtils";
import {
  DecisaoParcialError,
  ORDENACOES_FILA,
  casaBuscaCliente,
  estadoDaLista,
  inicial,
  linhaTrinks,
  mensagemDoErro,
  ordenar,
  plural,
  type Ordenacao,
} from "@/lib/avaliacoesAdmin";
import { useToast } from "@/hooks/use-toast";
// auth-kit: controles de escrita só para quem tem write na página "admin".
// Isto é UX — quem burlar o DOM esbarra na RLS (policies destaque_can_write_page).
import { RequireWrite } from "@/auth/guards";
import { cn } from "@/lib/utils";
import {
  AvisoDesatualizada,
  ConfirmacaoDialog,
  ErroCarregamento,
  SelectFiltro,
  Vazio,
  type Confirmacao,
} from "./AvaliacoesUI";
import { HistoricoDecisoes } from "./HistoricoDecisoes";
import { SinaisAvaliacao } from "./SinaisAvaliacao";

function Estatistica({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-2xl border bg-card p-3">
      <p className="font-body text-xs text-muted-foreground">{rotulo}</p>
      <p className="font-mono-num text-2xl font-bold text-foreground">{valor}</p>
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

export function AvaliacoesManager() {
  const { pendentes, isLoading, isError, decidir } = useAdminAvaliacoes();
  const estadoFila = estadoDaLista({ isLoading, isError, total: pendentes.length });
  const { toast } = useToast();

  // Sinais de TODAS as pendentes (não só as filtradas): filtrar ou ordenar a
  // fila não pode disparar outra chamada nem tirar selos da tela.
  const idsPendentes = useMemo(() => pendentes.map((a) => a.id), [pendentes]);
  const { sinais, isError: sinaisIndisponiveis } = useSinaisAvaliacoes(idsPendentes);

  const [filtroProfissional, setFiltroProfissional] = useState("");
  const [buscaCliente, setBuscaCliente] = useState("");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("mais_antiga");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);
  // Só governa o celular: no desktop o `sm:grid` mostra os filtros sempre,
  // independentemente deste estado.
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const profissionaisNaFila = useMemo(
    () =>
      Array.from(new Set(pendentes.map((a) => a.nome_profissional))).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [pendentes],
  );

  const filtradas = useMemo(() => {
    const lista = pendentes.filter((a) => {
      if (filtroProfissional && a.nome_profissional !== filtroProfissional) return false;
      if (!casaBuscaCliente(a, buscaCliente)) return false;
      return true;
    });
    return ordenar(lista, ordenacao);
  }, [pendentes, filtroProfissional, buscaCliente, ordenacao]);

  // A seleção vive por id; se o filtro esconder uma linha selecionada, ela sai
  // da conta — o botão de lote nunca age sobre o que não está na tela.
  const idsVisiveis = filtradas.map((a) => a.id);
  const selecionadasVisiveis = idsVisiveis.filter((id) => selecionadas.has(id));
  const todasSelecionadas =
    idsVisiveis.length > 0 && selecionadasVisiveis.length === idsVisiveis.length;

  const emAcao = (id: string) =>
    decidir.isPending && !!decidir.variables?.ids.includes(id);

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
    motivo?: string,
  ): Promise<boolean> => {
    // Devolve `true` quando o dialogo pode fechar: gravou tudo, ou gravou so parte
    // (repetir com os mesmos ids nao adianta). `false` = nada gravado por erro de
    // banco/rede/permissao — o dialogo fica aberto, com o texto, para tentar de novo.
    try {
      await decidir.mutateAsync({ ids, status, motivo });
      setSelecionadas((antes) => {
        const novas = new Set(antes);
        ids.forEach((id) => novas.delete(id));
        return novas;
      });
      toast({ title: mensagem });
      return true;
    } catch (err) {
      if (err instanceof DecisaoParcialError) {
        // O lote inteiro sai da selecao: nenhuma segue pendente, e uma que outra
        // pessoa devolva a fila nao pode reaparecer ja marcada para o proximo lote.
        setSelecionadas((antes) => {
          const novas = new Set(antes);
          ids.forEach((id) => novas.delete(id));
          return novas;
        });
        toast({
          title: "Decisão gravada em parte",
          description: err.message,
          variant: "destructive",
        });
        return true;
      }
      toast({
        title: "Não foi possível salvar",
        description: mensagemDoErro(err),
        variant: "destructive",
      });
      return false;
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

  /** Recusar sempre abre o diálogo: o motivo é obrigatório, e o texto digitado vale
   *  para todas as `ids` (uma só no botão da linha, a seleção inteira no lote). */
  const recusar = (ids: string[], titulo: string, descricao: string) => {
    setConfirmacao({ acao: "recusar", ids, titulo, descricao, motivo: { inicial: "" } });
  };

  const confirmar = async (motivo?: string) => {
    if (!confirmacao) return;
    const { acao, ids } = confirmacao;
    // Com motivo, o diálogo fica aberto até a gravação dar certo: se falhar, o texto
    // digitado continua lá para tentar de novo. Sem motivo, fecha logo, como antes.
    if (!confirmacao.motivo) setConfirmacao(null);
    let ok = true;
    if (acao === "aprovar") {
      ok = await executarDecisao(
        ids,
        "aprovada",
        `${plural(ids.length, "avaliação aprovada", "avaliações aprovadas")}`,
      );
    } else if (acao === "recusar") {
      ok = await executarDecisao(
        ids,
        "rejeitada",
        `${plural(ids.length, "avaliação recusada", "avaliações recusadas")}`,
        motivo,
      );
    }
    if (ok && confirmacao.motivo) setConfirmacao(null);
  };

  const temFiltroAtivo =
    filtroProfissional !== "" || buscaCliente !== "" || ordenacao !== "mais_antiga";

  const limparFiltros = () => {
    setFiltroProfissional("");
    setBuscaCliente("");
    setOrdenacao("mais_antiga");
  };

  // Esqueleto com a altura aproximada da fila real, em vez de um spinner de
  // 100px. Uma primeira pintura curta encolhe o documento inteiro, e aí o
  // navegador nao tem como restaurar o scroll no refresh (media: 849 → 0) e a
  // pagina "cresce" debaixo de quem ja comecou a ler.
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-heading">
              <Clock className="h-4 w-4 text-amber-500" />
              Aguardando decisão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <div className="h-11 rounded-md animate-shimmer" />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-[86px] rounded-2xl animate-shimmer" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    // A FILA VEM PRIMEIRO, de propósito. Título da seção, estatísticas e
    // explicação desceram para depois dela: são leitura ocasional, enquanto a
    // fila é o trabalho. Antes, o 1º pendente começava a 534px (desktop) e
    // 782px (celular) — fora da tela em qualquer reset. Não reintroduza blocos
    // acima deste Card sem medir de novo onde o 1º item passa a cair.
    <div className="space-y-4">
      {/* 1. Fila de pendentes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-heading">
            <Clock className="h-4 w-4 text-amber-500" />
            {estadoFila === "erro"
              ? "Aguardando decisão"
              : `Aguardando decisão (${filtradas.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {estadoFila === "erro" ? (
            <ErroCarregamento texto="Não foi possível carregar a fila de aprovações." />
          ) : estadoFila === "vazio" ? (
            <Vazio texto="Nenhuma avaliação aguardando decisão." />
          ) : (
            <>
              {estadoFila === "lista_desatualizada" && <AvisoDesatualizada />}
              {/* Filtros: uma linha no desktop; no celular ficam atrás de um
                  toque, porque 3 controles empilhados (~230px) empurravam a
                  fila para fora da tela. `sm:grid` vence o `hidden` por ordem
                  de media query — sem JS de breakpoint, sem piscar na 1ª
                  pintura (que é o que um `useIsMobile` traria de volta). */}
              <div>
                <button
                  type="button"
                  onClick={() => setFiltrosAbertos((v) => !v)}
                  aria-expanded={filtrosAbertos}
                  aria-controls="filtros-da-fila"
                  className="flex min-h-[44px] w-full items-center justify-between rounded-xl border bg-muted/30 px-3 font-body text-sm text-gray-600 sm:hidden"
                >
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                    Filtrar e ordenar
                  </span>
                  {temFiltroAtivo && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 font-body text-xs text-primary">
                      ativo
                    </span>
                  )}
                </button>

                <div
                  id="filtros-da-fila"
                  className={cn(
                    "grid-cols-1 gap-2 pt-2 sm:grid sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center sm:gap-2 sm:pt-0",
                    filtrosAbertos ? "grid" : "hidden",
                  )}
                >
                  <SelectFiltro
                    rotulo="Filtrar por profissional"
                    valor={filtroProfissional}
                    onChange={setFiltroProfissional}
                  >
                    <option value="">Todos os profissionais</option>
                    {profissionaisNaFila.map((nome) => (
                      <option key={nome} value={nome}>
                        {nome} (
                        {pendentes.filter((a) => a.nome_profissional === nome).length})
                      </option>
                    ))}
                  </SelectFiltro>

                  <Input
                    aria-label="Buscar cliente"
                    value={buscaCliente}
                    onChange={(e) => setBuscaCliente(e.target.value)}
                    placeholder="Buscar cliente (Google ou Trinks)..."
                    className="h-11 font-body text-sm"
                  />

                  <SelectFiltro
                    rotulo="Ordenar por"
                    valor={ordenacao}
                    onChange={(valor) => setOrdenacao(valor as Ordenacao)}
                  >
                    {ORDENACOES_FILA.map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.rotulo}
                      </option>
                    ))}
                  </SelectFiltro>

                  {temFiltroAtivo && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={limparFiltros}
                      className="h-11 font-body"
                    >
                      Limpar
                    </Button>
                  )}
                </div>
              </div>

              <RequireWrite chave="admin">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border bg-muted/50 px-3 py-1">
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
                          recusar(
                            selecionadasVisiveis,
                            `Recusar ${plural(selecionadasVisiveis.length, "avaliação", "avaliações")}?`,
                            selecionadasVisiveis.length === 1
                              ? "Ela sai da fila e fica no histórico como recusada, com o motivo abaixo. Nada é apagado."
                              : `Elas saem da fila e ficam no histórico como recusadas. O mesmo motivo, abaixo, é gravado nas ${selecionadasVisiveis.length}. Nada é apagado.`,
                          )
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
                <>
                {sinaisIndisponiveis && (
                  <p className="font-body text-xs text-muted-foreground">
                    Sinais indisponíveis no momento — a fila funciona normalmente.
                  </p>
                )}
                <ul className="space-y-2.5">
                  {filtradas.map((avaliacao) => {
                    const selecionada = selecionadas.has(avaliacao.id);
                    const ocupada = emAcao(avaliacao.id);
                    return (
                      <li
                        key={avaliacao.id}
                        className={cn(
                          "space-y-2 rounded-2xl border p-3 transition-colors",
                          selecionada ? "border-primary/40 bg-primary/5" : "bg-card",
                        )}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
                              Google: {avaliacao.nome_cliente}
                            </p>
                            <p className="truncate font-body text-sm text-gray-600">
                              {linhaTrinks(avaliacao)}
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
                                recusar(
                                  [avaliacao.id],
                                  "Recusar esta avaliação?",
                                  `A estrela de ${avaliacao.nome_cliente} sai da fila e fica no histórico como recusada, com o motivo abaixo. Nada é apagado.`,
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
                        </div>
                        <SinaisAvaliacao sinal={sinais.get(avaliacao.id)} />
                      </li>
                    );
                  })}
                </ul>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 2. Estatísticas e contexto — abaixo da fila, por serem leitura ocasional */}
      {/* Numa falha, "Na fila 0" seria a mesma mentira do estado vazio. */}
      {estadoFila !== "erro" && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Estatistica rotulo="Na fila" valor={pendentes.length} />
          <Estatistica rotulo="Profissionais" valor={profissionaisNaFila.length} />
          <Estatistica rotulo="Selecionadas" valor={selecionadasVisiveis.length} />
        </div>
      )}

      <p className="font-body text-xs text-gray-500">
        Estrelas do Google cadastradas pelas clientes. Cada estrela aprovada vale 3
        pontos no mês em que a avaliação foi cadastrada.
      </p>

      {/* 3. Histórico — estado e filtros próprios, ver HistoricoDecisoes */}
      <HistoricoDecisoes />

      <ConfirmacaoDialog
        confirmacao={confirmacao}
        onFechar={() => setConfirmacao(null)}
        onConfirmar={confirmar}
      />
    </div>
  );
}
