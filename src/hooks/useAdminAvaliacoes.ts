import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  removerDoCache,
  restaurarCache,
  type SnapshotCache,
} from "@/lib/avaliacoesCache";
// Mesma instância que todo o resto do app usa — `@/lib/supabase` só reexporta o
// client de `@/integrations/supabase/client` sem o genérico `Database` gerado,
// que não conhece `avaliacoes_cadastradas`. Sem isso, cada `.from()` aqui
// precisaria de um `as any`.
import { supabase } from "@/lib/supabase";
// auth-kit: `aprovado_por` tem de ser o auth.uid() de quem decidiu — quem esta
// logado agora, nunca um UID fixo no bundle (era assim no app de origem).
import { useAcesso } from "@/auth/acesso";
import { erroDoMotivo, normalizarMotivo } from "@/lib/motivoRecusa";
import { DecisaoParcialError } from "@/lib/avaliacoesAdmin";

export type StatusAvaliacao = "pendente" | "aprovada" | "rejeitada";

export interface AvaliacaoAdmin {
  id: string;
  profissional_id: number;
  nome_profissional: string;
  nome_cliente: string;
  status: StatusAvaliacao;
  data_hora_cadastro: string;
  aprovado_por: string | null;
  data_aprovacao: string | null;
  /** Cliente no Trinks (colunas de out/2026). NULL em todo cadastro legado. */
  nome_cliente_trinks: string | null;
  cliente_trinks_id: number | null;
  /** 'YYYY-MM-DD' (dia do atendimento, sem hora) — nao passar por `Date`. */
  data_atendimento: string | null;
  origem_cliente_trinks: "lista" | "digitado" | null;
}

// `motivo_recusa` fica FORA de proposito: a coluna nao e legivel por SELECT (nem para
// `authenticated`) — pedir a coluna, ou usar `select("*")`, da 42501 e derruba a fila
// inteira. O motivo e lido so pela RPC (`useMotivosRecusa`).
const COLUNAS =
  "id, profissional_id, nome_profissional, nome_cliente, status, data_hora_cadastro, aprovado_por, data_aprovacao, nome_cliente_trinks, cliente_trinks_id, data_atendimento, origem_cliente_trinks";

/**
 * Teto do historico POR PERIODO. O historico deixou de ser "as N ultimas
 * decisoes" e passou a ser "as decisoes do periodo escolhido", entao o teto tem
 * de caber um mes cheio: os meses de pico da tabela chegam a 200 decisoes
 * (out/2025: 192, nov/2025: 200, mar/2026: 191). 500 da folga de ~2,5x sobre o
 * pior mes ja registrado e continua sendo uma resposta pequena.
 * Quando o retorno bate exatamente no teto, a tela avisa que pode ter cortado.
 */
export const HISTORICO_LIMITE = 500;

/** Janela de busca ja resolvida em instantes UTC — ver `resolverPeriodo` em
 *  `@/lib/periodoHistorico`. Fim EXCLUSIVO. */
export interface JanelaHistorico {
  inicioISO: string;
  fimISO: string;
}

const CHAVE_PENDENTES = ["admin_avaliacoes", "pendentes"] as const;
/** Prefixo: cada periodo tem sua propria entrada de cache abaixo dele. */
const CHAVE_HISTORICO = ["admin_avaliacoes", "historico"] as const;

const chaveHistorico = (janela: JanelaHistorico) =>
  [...CHAVE_HISTORICO, janela.inicioISO, janela.fimISO] as const;

/**
 * Um UPDATE barrado pela RLS nao volta com erro: volta com ZERO linhas. Sem
 * conferir a contagem, uma sessao expirada (ou um perfil que perdeu o write em
 * "admin") daria "salvo com sucesso" sem ter salvado nada. O `.select("id")`
 * devolve as linhas efetivamente escritas — se faltar alguma, isso e um erro.
 */
function conferirLinhasEscritas(
  escritas: { id: string }[] | null,
  ids: string[],
  mensagem = "O banco recusou a alteração (permissão de escrita em Administração). " +
    "Saia e entre de novo; se continuar, fale com quem administra os acessos.",
) {
  const total = escritas?.length ?? 0;
  if (total === ids.length) return;
  throw new Error(mensagem);
}

async function buscarPendentes(): Promise<AvaliacaoAdmin[]> {
  const { data, error } = await supabase
    .from("avaliacoes_cadastradas")
    .select(COLUNAS)
    .eq("status", "pendente")
    .order("data_hora_cadastro", { ascending: true });

  if (error) throw error;
  return (data as AvaliacaoAdmin[] | null) ?? [];
}

/**
 * Historico do periodo. O recorte e por `data_hora_cadastro` — a data que
 * decide em QUE MES a estrela pontua (`useStarsData`), e a mesma que a fila usa
 * para avisar sobre mes fechado. Filtrar pela data da DECISAO daria outra
 * lista: 22 das ~816 decisoes ja registradas foram tomadas num mes diferente do
 * cadastro.
 *
 * O filtro roda no servidor de proposito: com teto de linhas, filtrar no
 * cliente mostraria "nada em julho" so porque as 500 ultimas linhas eram de
 * agosto.
 */
async function buscarHistorico(janela: JanelaHistorico): Promise<AvaliacaoAdmin[]> {
  const { data, error } = await supabase
    .from("avaliacoes_cadastradas")
    .select(COLUNAS)
    .in("status", ["aprovada", "rejeitada"])
    .gte("data_hora_cadastro", janela.inicioISO)
    .lt("data_hora_cadastro", janela.fimISO)
    .order("data_hora_cadastro", { ascending: false })
    .limit(HISTORICO_LIMITE);

  if (error) throw error;
  return (data as AvaliacaoAdmin[] | null) ?? [];
}

/**
 * So a fila de pendentes — usada pelo badge da aba, que precisa do numero
 * mesmo quando o admin esta em outra aba. Compartilha a MESMA queryKey do
 * `useAdminAvaliacoes`, entao as duas montagens dividem cache e uma requisicao.
 */
export function useAvaliacoesPendentes() {
  const { data, isLoading, isError } = useQuery({
    queryKey: CHAVE_PENDENTES,
    queryFn: buscarPendentes,
  });
  // `isError` e obrigatorio para quem consome: sem ele, uma consulta que falhou
  // vira `[]` e o contador mostra "fila vazia" sem estar.
  return { pendentes: data ?? [], isLoading, isError };
}

/**
 * Rollback + refetch das mutacoes. A remocao otimista em si vive em
 * `@/lib/avaliacoesCache` (com o `QueryClient` injetado, para ter teste).
 */
function useRemocaoOtimista() {
  const queryClient = useQueryClient();

  return {
    remover: (prefixo: readonly unknown[], ids: string[]) =>
      removerDoCache(queryClient, prefixo, ids),
    restaurar: (anterior?: SnapshotCache) => restaurarCache(queryClient, anterior),
    // `onSettled` sempre invalida o ramo inteiro: aprovar tira da fila e poe no
    // historico, devolver faz o contrario — os dois lados saem do ar juntos.
    // Tambem invalida as pendentes do Bonus Estrelas da home (`useEstrelasPendentes`,
    // staleTime infinito): sem isso, voltar a home pelo SPA mostraria contagem velha.
    invalidar: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin_avaliacoes"] }),
        queryClient.invalidateQueries({ queryKey: ["bonus_estrelas"] }),
      ]),
  };
}

/** Fila de pendentes + a decisao (aprovar/recusar). */
export function useAdminAvaliacoes() {
  const { acesso } = useAcesso();
  const { remover, restaurar, invalidar } = useRemocaoOtimista();

  const pendentesQuery = useQuery({
    queryKey: CHAVE_PENDENTES,
    queryFn: buscarPendentes,
  });

  /**
   * Aprovar/rejeitar. A regra de negocio do score exige os TRES campos juntos:
   * so conta ponto quem tem `status = 'aprovada'` E `data_aprovacao NOT NULL`,
   * e `aprovado_por` responde "quem decidiu". Rejeitar nunca apaga a linha —
   * a tabela nao tem policy de DELETE e o historico e a prova da decisao.
   *
   * Recusar exige `motivo` (um texto so, gravado em todas as `ids` do lote): o
   * banco recusa `rejeitada` sem motivo com 23514, e a checagem aqui so poupa a
   * ida e volta. Aprovar nao manda motivo — o banco zera `motivo_recusa` sozinho.
   */
  const decidir = useMutation({
    mutationFn: async ({
      ids,
      status,
      motivo,
    }: {
      ids: string[];
      status: "aprovada" | "rejeitada";
      motivo?: string;
    }) => {
      if (ids.length === 0) return;
      const adminId = acesso?.userId;
      if (!adminId) {
        throw new Error("Sessão expirada. Entre novamente para decidir avaliações.");
      }
      if (status === "rejeitada") {
        const erroMotivo = erroDoMotivo(motivo);
        if (erroMotivo) throw new Error(erroMotivo);
      }
      const recusa =
        status === "rejeitada" ? { motivo_recusa: normalizarMotivo(motivo) } : {};
      const { data, error } = await supabase
        .from("avaliacoes_cadastradas")
        .update({
          status,
          aprovado_por: adminId,
          data_aprovacao: new Date().toISOString(),
          ...recusa,
        })
        .in("id", ids)
        // So decide quem ainda esta pendente: outro admin pode ter decidido a mesma
        // estrela com o dialogo aberto, e sem isto esta decisao a sobrescreveria
        // (inclusive trocando o motivo de uma recusa alheia).
        .eq("status", "pendente")
        .select("id");
      if (error) throw error;
      // Gravou umas e outras nao: as que faltam ja estavam decididas por outra pessoa
      // (a RLS barraria todas, nao so algumas). Erro tipado, para a tela fechar o
      // dialogo e dizer as contagens em vez de "nada foi salvo".
      const gravadas = (data as { id: string }[] | null) ?? [];
      if (gravadas.length > 0 && gravadas.length < ids.length) {
        throw new DecisaoParcialError(
          status,
          gravadas.map((l) => l.id),
          ids.length,
        );
      }
      // Zero linhas tem duas causas indistinguiveis daqui (RLS devolve sem erro):
      // alguem decidiu antes, ou a sessao perdeu o write — a mensagem cobre as duas.
      conferirLinhasEscritas(
        data as { id: string }[] | null,
        ids,
        "Alguma avaliação já tinha sido decidida por outra pessoa (a fila foi atualizada) " +
          "ou o banco recusou a alteração (permissão de escrita em Administração). " +
          "Confira a fila; se continuar, saia e entre de novo.",
      );
    },
    onMutate: async ({ ids }) => ({
      anterior: await remover(CHAVE_PENDENTES, ids),
    }),
    onError: (erro, _variaveis, contexto) => {
      // No parcial nenhuma das linhas do lote segue pendente (umas gravadas aqui,
      // as outras decididas por outra pessoa): restaurar o snapshot as traria de
      // volta a fila ate o refetch, ou de vez se o refetch falhasse.
      if (erro instanceof DecisaoParcialError) return;
      restaurar(contexto?.anterior);
    },
    // `onSettled` e nao `onSuccess`: no erro tambem queremos o refetch, para a
    // fila voltar a refletir o servidor e nao o rollback local.
    onSettled: invalidar,
  });

  return {
    pendentes: pendentesQuery.data ?? [],
    isLoading: pendentesQuery.isLoading,
    /** A consulta falhou — a tela NAO pode tratar `pendentes` vazio como fila vazia. */
    isError: pendentesQuery.isError,
    erro: pendentesQuery.error,
    decidir,
  };
}

/**
 * Historico de decisoes de UM periodo + o desfazer.
 *
 * Cada janela e uma entrada de cache propria, entao trocar o filtro de periodo
 * dispara uma busca nova (e `isLoading` volta a ser true na primeira vez que
 * aquele periodo aparece — e o sinal que a tela usa para o esqueleto).
 */
export function useHistoricoAvaliacoes(janela: JanelaHistorico) {
  const { remover, restaurar, invalidar } = useRemocaoOtimista();

  const historicoQuery = useQuery({
    queryKey: chaveHistorico(janela),
    queryFn: () => buscarHistorico(janela),
  });

  /**
   * Desfazer: devolve a avaliacao para a fila. Zera `aprovado_por` e
   * `data_aprovacao` para restaurar exatamente o estado em que a cliente a
   * cadastrou (e o mesmo invariante que a policy de INSERT publico exige) —
   * meia-reversao deixaria uma pendente com carimbo de quem "aprovou".
   */
  const reverter = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { data, error } = await supabase
        .from("avaliacoes_cadastradas")
        .update({ status: "pendente", aprovado_por: null, data_aprovacao: null })
        .in("id", ids)
        .select("id");
      if (error) throw error;
      conferirLinhasEscritas(data as { id: string }[] | null, ids);
    },
    onMutate: async (ids) => ({ anterior: await remover(CHAVE_HISTORICO, ids) }),
    onError: (_erro, _variaveis, contexto) => {
      restaurar(contexto?.anterior);
    },
    onSettled: invalidar,
  });

  /**
   * Editar o motivo de uma recusa que ja esta no historico. So mexe em linha
   * `rejeitada` (`.eq("status")`): se outro admin devolveu a estrela para a fila
   * nesse meio tempo, o UPDATE volta com zero linhas e a tela avisa, em vez de
   * gravar motivo numa pendente. Sem remocao otimista — a linha nao sai da lista.
   * A promessa so resolve depois do refetch (`onSettled` devolve a Promise): ate la
   * a linha fica marcada como ocupada, entao nao mostra o texto velho como definitivo.
   */
  const editarMotivo = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const erroMotivo = erroDoMotivo(motivo);
      if (erroMotivo) throw new Error(erroMotivo);
      const { data, error } = await supabase
        .from("avaliacoes_cadastradas")
        .update({ motivo_recusa: normalizarMotivo(motivo) })
        .in("id", [id])
        .eq("status", "rejeitada")
        .select("id");
      if (error) throw error;
      conferirLinhasEscritas(
        data as { id: string }[] | null,
        [id],
        "Não foi possível editar o motivo: a avaliação não está mais recusada " +
          "ou o banco recusou a alteração (permissão de escrita em Administração).",
      );
    },
    onSettled: invalidar,
  });

  const historico = historicoQuery.data ?? [];

  return {
    historico,
    isLoading: historicoQuery.isLoading,
    /** A consulta falhou — `historico` vazio NAO significa "nenhuma decisao". */
    isError: historicoQuery.isError,
    erro: historicoQuery.error,
    /** O periodo tem mais decisoes do que coube na resposta. */
    atingiuTeto: historico.length >= HISTORICO_LIMITE,
    reverter,
    editarMotivo,
  };
}
