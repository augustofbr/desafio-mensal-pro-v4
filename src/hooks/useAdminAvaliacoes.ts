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
}

const COLUNAS =
  "id, profissional_id, nome_profissional, nome_cliente, status, data_hora_cadastro, aprovado_por, data_aprovacao";

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
function conferirLinhasEscritas(escritas: { id: string }[] | null, ids: string[]) {
  const total = escritas?.length ?? 0;
  if (total === ids.length) return;
  throw new Error(
    "O banco recusou a alteração (permissão de escrita em Administração). " +
      "Saia e entre de novo; se continuar, fale com quem administra os acessos.",
  );
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
  const { data, isLoading } = useQuery({
    queryKey: CHAVE_PENDENTES,
    queryFn: buscarPendentes,
  });
  return { pendentes: data ?? [], isLoading };
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
    invalidar: () => queryClient.invalidateQueries({ queryKey: ["admin_avaliacoes"] }),
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
   */
  const decidir = useMutation({
    mutationFn: async ({
      ids,
      status,
    }: {
      ids: string[];
      status: "aprovada" | "rejeitada";
    }) => {
      if (ids.length === 0) return;
      const adminId = acesso?.userId;
      if (!adminId) {
        throw new Error("Sessão expirada. Entre novamente para decidir avaliações.");
      }
      const { data, error } = await supabase
        .from("avaliacoes_cadastradas")
        .update({
          status,
          aprovado_por: adminId,
          data_aprovacao: new Date().toISOString(),
        })
        .in("id", ids)
        .select("id");
      if (error) throw error;
      conferirLinhasEscritas(data as { id: string }[] | null, ids);
    },
    onMutate: async ({ ids }) => ({
      anterior: await remover(CHAVE_PENDENTES, ids),
    }),
    onError: (_erro, _variaveis, contexto) => {
      restaurar(contexto?.anterior);
    },
    // `onSettled` e nao `onSuccess`: no erro tambem queremos o refetch, para a
    // fila voltar a refletir o servidor e nao o rollback local.
    onSettled: invalidar,
  });

  return {
    pendentes: pendentesQuery.data ?? [],
    isLoading: pendentesQuery.isLoading,
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

  const historico = historicoQuery.data ?? [];

  return {
    historico,
    isLoading: historicoQuery.isLoading,
    /** O periodo tem mais decisoes do que coube na resposta. */
    atingiuTeto: historico.length >= HISTORICO_LIMITE,
    reverter,
  };
}
