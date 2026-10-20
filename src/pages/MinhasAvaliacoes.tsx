import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Star, AlertCircle, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import ProfessionalSelect from "@/components/avaliacoes/ProfessionalSelect";
import { useActiveProfessionals } from "@/hooks/useActiveProfessionals";
import { useProfissionaisSelecionaveis } from "@/hooks/useProfissionaisSelecionaveis";
import { useMinhasAvaliacoes, type Avaliacao } from "@/hooks/useMinhasAvaliacoes";
import { useEffect } from "react";
// Mesmo formatador do painel de aprovação — uma definição só de "hora de Manaus".
import { formatDataHoraManaus } from "@/lib/dateUtils";
import { ContaLogada } from "@/components/ContaLogada";
import { useAcesso } from "@/auth/acesso";
import { useMinhaProfissional } from "@/hooks/useMinhaProfissional";
import { resolverIdentidade } from "@/lib/identidade";

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pendente":
      return (
        <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-yellow-200 font-body text-xs">
          Pendente
        </Badge>
      );
    case "aprovada":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 font-body text-xs">
          Aprovada
        </Badge>
      );
    case "rejeitada":
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200 font-body text-xs">
          Rejeitada
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="font-body text-xs">
          {status}
        </Badge>
      );
  }
}

function AvaliacaoCard({ avaliacao }: { avaliacao: Avaliacao }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-white/80 border border-violet-100 shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
          <User className="h-4 w-4 text-violet-500" />
        </div>
        <div className="min-w-0">
          <p className="font-body font-medium text-sm text-gray-800 truncate">
            {avaliacao.nome_cliente}
          </p>
          {avaliacao.nome_cliente_trinks?.trim() && (
            <p className="font-body text-xs text-gray-500 truncate">
              Trinks: {avaliacao.nome_cliente_trinks.trim()}
            </p>
          )}
          <p className="font-body text-xs text-gray-400">
            {formatDataHoraManaus(avaliacao.data_hora_cadastro)}
          </p>
        </div>
      </div>
      <StatusBadge status={avaliacao.status} />
    </div>
  );
}

const MinhasAvaliacoes = () => {
  const navigate = useNavigate();
  const {
    activeProfessionals,
    loading: profsLoading,
    fetchActiveProfessionals,
  } = useActiveProfessionals();

  // Identidade da conta: ligada a uma profissional que nao escolhe outra => a
  // pagina e sempre dela, sem seletor. (A leitura segue como estava; trocar para
  // a RPC `destaque_minhas_avaliacoes` e o motivo da recusa sao da Task 4.)
  const { acesso } = useAcesso();
  const vinculo = useMinhaProfissional();
  const identidade = resolverIdentidade({
    vinculoId: vinculo.id,
    nivelEstrelas: acesso?.paginas.estrelas ?? "none",
    perfilLocalId: null,
  });
  const semSeletor = identidade.fixo && !identidade.podeEscolherProfissionalNoCadastro;

  const [profEscolhidaId, setSelectedProfId] = useState<number | null>(null);
  const selectedProfId = semSeletor ? vinculo.id : profEscolhidaId;
  const {
    avaliacoes,
    loading: avaliacoesLoading,
    isError: avaliacoesFalhou,
    counts,
  } = useMinhasAvaliacoes(selectedProfId);

  useEffect(() => {
    fetchActiveProfessionals();
  }, [fetchActiveProfessionals]);

  // So quem aparece no desafio do mes atual (Manaus) ou participa so do Bonus Estrelas.
  const { profissionais: selecionaveis, regrasCarregando } =
    useProfissionaisSelecionaveis(activeProfessionals);

  const sortedProfessionals = [...selecionaveis]
    .filter((p) => p.nome_profissional)
    .sort((a, b) =>
      (a.nome_profissional ?? "").localeCompare(b.nome_profissional ?? "")
    );

  const filterByStatus = (status: string | null) =>
    status ? avaliacoes.filter((a) => a.status === status) : avaliacoes;

  const renderList = (list: Avaliacao[]) => {
    if (avaliacoesLoading) {
      return (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl animate-shimmer" />
          ))}
        </div>
      );
    }

    // Falha nunca vira "Nenhuma avaliação encontrada." — isso seria informação falsa.
    if (avaliacoesFalhou) {
      return (
        <div role="alert" className="text-center py-10">
          <div className="w-14 h-14 mx-auto rounded-full bg-red-50 flex items-center justify-center mb-3">
            <AlertCircle className="h-7 w-7 text-red-400" />
          </div>
          <p className="text-red-700 font-body text-sm font-semibold">
            Não foi possível carregar as avaliações.
          </p>
          <p className="text-gray-500 font-body text-xs mt-1">
            Recarregue a página para tentar de novo.
          </p>
        </div>
      );
    }

    if (list.length === 0) {
      return (
        <div className="text-center py-10">
          <div className="w-14 h-14 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <Star className="h-7 w-7 text-gray-300" />
          </div>
          <p className="text-gray-500 font-body text-sm">
            Nenhuma avaliação encontrada.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {list.map((av) => (
          <AvaliacaoCard key={av.id} avaliacao={av} />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-warm">
      <div className="px-4 pt-6 pb-4">
        <div className="max-w-7xl mx-auto">
          <ContaLogada />
          {/* Header */}
          <div className="flex flex-col items-center mb-5 animate-fade-slide-up">
            <img
              src="/lovable-uploads/0cb6b226-2d51-4078-9b78-b6565c728721.png"
              alt="Studio X - Salão de Beleza & Estética"
              className="h-20 md:h-28 mb-3"
            />
            <h1 className="text-2xl md:text-4xl font-display font-bold text-gray-800 text-center leading-tight">
              Minhas Avaliações
            </h1>
            <p className="text-sm text-gray-500 font-body text-center mt-1.5 font-medium">
              Acompanhe suas avaliações Google
            </p>
          </div>

          {/* Back button */}
          <div className="flex justify-start mt-1 mb-4 animate-fade-slide-up stagger-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="gap-2 text-gray-600 hover:text-gray-800 font-body"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Dashboard
            </Button>
          </div>

          {/* Main card */}
          <div className="animate-fade-slide-up stagger-3">
            <Card className="mb-6 border-0 shadow-md bg-gradient-to-br from-violet-50/80 via-white to-purple-50/50">
              <CardHeader className="pb-3 px-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center shadow-sm">
                    <Star className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="font-display text-lg">
                      Avaliações Google
                    </CardTitle>
                    <p className="text-xs text-gray-500 font-body">
                      {semSeletor
                        ? "Suas avaliações cadastradas"
                        : "Selecione um profissional para ver suas avaliações"}
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="px-4 pb-4">
                {profsLoading || vinculo.carregando || (!semSeletor && regrasCarregando) ? (
                  <div className="h-10 rounded-lg animate-shimmer" />
                ) : (
                  <>
                    {semSeletor ? (
                      // Conta ligada: so as proprias avaliacoes, sem lista para trocar.
                      <p className="mb-4 font-body text-sm font-medium text-gray-800">
                        {activeProfessionals.find((p) => p.profissionalId === vinculo.id)
                          ?.nome_profissional ?? "Sua conta"}
                      </p>
                    ) : (
                      <>
                        {identidade.motivoBloqueio && (
                          <p
                            role="alert"
                            className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-body text-amber-800"
                          >
                            {identidade.motivoBloqueio}
                          </p>
                        )}
                        <ProfessionalSelect
                          professionals={sortedProfessionals}
                          value={selectedProfId ? String(selectedProfId) : ""}
                          onValueChange={(val) => setSelectedProfId(Number(val))}
                          className="mb-4"
                        />
                      </>
                    )}

                    {!selectedProfId ? (
                      <div className="text-center py-10">
                        <div className="w-14 h-14 mx-auto rounded-full bg-violet-100 flex items-center justify-center mb-3">
                          <AlertCircle className="h-7 w-7 text-violet-300" />
                        </div>
                        <p className="text-gray-500 font-body text-sm">
                          Selecione um profissional acima para visualizar as avaliações.
                        </p>
                      </div>
                    ) : (
                      <Tabs defaultValue="todas" className="mt-1">
                        <TabsList className="grid w-full grid-cols-4 mb-3">
                          <TabsTrigger value="todas" className="font-body text-xs">
                            Todas {avaliacoesFalhou ? "" : `(${counts.todas})`}
                          </TabsTrigger>
                          <TabsTrigger value="pendentes" className="font-body text-xs">
                            Pendentes {avaliacoesFalhou ? "" : `(${counts.pendentes})`}
                          </TabsTrigger>
                          <TabsTrigger value="aprovadas" className="font-body text-xs">
                            Aprovadas {avaliacoesFalhou ? "" : `(${counts.aprovadas})`}
                          </TabsTrigger>
                          <TabsTrigger value="rejeitadas" className="font-body text-xs">
                            Rejeitadas {avaliacoesFalhou ? "" : `(${counts.rejeitadas})`}
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="todas">
                          {renderList(filterByStatus(null))}
                        </TabsContent>
                        <TabsContent value="pendentes">
                          {renderList(filterByStatus("pendente"))}
                        </TabsContent>
                        <TabsContent value="aprovadas">
                          {renderList(filterByStatus("aprovada"))}
                        </TabsContent>
                        <TabsContent value="rejeitadas">
                          {renderList(filterByStatus("rejeitada"))}
                        </TabsContent>
                      </Tabs>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MinhasAvaliacoes;
