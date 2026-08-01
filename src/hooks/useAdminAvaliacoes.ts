import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

/** Teto do historico: a tabela ja passa de 700 aprovadas e o painel so precisa
 *  das decisoes recentes (o resto vive no dashboard). */
export const HISTORICO_LIMITE = 100;

const CHAVE_PENDENTES = ["admin_avaliacoes", "pendentes"] as const;
const CHAVE_HISTORICO = ["admin_avaliacoes", "historico"] as const;

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

async function buscarHistorico(): Promise<AvaliacaoAdmin[]> {
  const { data, error } = await supabase
    .from("avaliacoes_cadastradas")
    .select(COLUNAS)
    .in("status", ["aprovada", "rejeitada"])
    .order("data_aprovacao", { ascending: false, nullsFirst: false })
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

export function useAdminAvaliacoes() {
  const queryClient = useQueryClient();
  const { acesso } = useAcesso();

  const pendentesQuery = useQuery({
    queryKey: CHAVE_PENDENTES,
    queryFn: buscarPendentes,
  });

  const historicoQuery = useQuery({
    queryKey: CHAVE_HISTORICO,
    queryFn: buscarHistorico,
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["admin_avaliacoes"] });
  };

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
    onSuccess: invalidar,
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
    onSuccess: invalidar,
  });

  return {
    pendentes: pendentesQuery.data ?? [],
    historico: historicoQuery.data ?? [],
    isLoading: pendentesQuery.isLoading,
    isLoadingHistorico: historicoQuery.isLoading,
    decidir,
    reverter,
  };
}
