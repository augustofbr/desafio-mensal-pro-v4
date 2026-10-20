import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  idsParaMotivos,
  mapaDeMotivos,
  type MotivoRecusaLinha,
} from "@/lib/motivoRecusa";

/**
 * Chave dos motivos. Mesma logica da chave dos sinais: fica sob
 * `["admin_avaliacoes", ...]` para as mutacoes (que invalidam o ramo inteiro)
 * refazerem a leitura, e FORA dos prefixos `pendentes`/`historico` da remocao
 * otimista (`avaliacoesCache.ts`) — esta entrada guarda motivos, nao avaliacoes,
 * e um filtro de avaliacoes sobre ela a corromperia.
 */
export const CHAVE_MOTIVOS = ["admin_avaliacoes", "motivos"] as const;

/**
 * Motivos das RECUSADAS do periodo carregado, numa chamada a RPC
 * `avaliacoes_motivos_recusa`. A coluna `motivo_recusa` nao e legivel por SELECT
 * (nem para `authenticated`): a RPC, com o gate da pagina "admin", e o unico
 * caminho de leitura — por isso o historico nunca a coloca no `.select(...)`.
 *
 * O mapa so contem quem a RPC devolveu (recusadas). Recusa legada vem com `null`;
 * id ausente do mapa = ainda carregando ou falha, e a tela NAO pode chamar isso de
 * "sem motivo". Falha da RPC nao derruba o historico: `isError` so troca o motivo
 * por um aviso discreto.
 */
export function useMotivosRecusa(ids: string[]): {
  motivos: Map<string, string | null>;
  isLoading: boolean;
  isError: boolean;
  /** Ha uma busca em andamento (inclusive a de uma chave nova, com os dados da anterior na tela). */
  isFetching: boolean;
  /** Os `motivos` em tela sao os da chave ANTERIOR, ainda sem resposta para os ids atuais. */
  isPlaceholderData: boolean;
  /** Refaz a leitura agora e devolve o mapa fresco; `null` se a RPC falhou. */
  recarregar: () => Promise<Map<string, string | null> | null>;
} {
  // Ordenado para a chave nao mudar quando so a ORDEM muda (filtro/ordenacao na tela).
  const alvo = useMemo(() => [...idsParaMotivos(ids)].sort(), [ids]);

  const query = useQuery({
    queryKey: [...CHAVE_MOTIVOS, ...alvo],
    queryFn: async (): Promise<MotivoRecusaLinha[]> => {
      const { data, error } = await supabase.rpc("avaliacoes_motivos_recusa", {
        p_ids: alvo,
      });
      if (error) throw error;
      return (data as MotivoRecusaLinha[] | null) ?? [];
    },
    enabled: alvo.length > 0,
    // Devolver uma recusa para a fila muda o conjunto de ids (chave nova): segurar
    // os motivos anteriores evita as outras linhas piscarem sem motivo.
    placeholderData: keepPreviousData,
    // As mutacoes invalidam o ramo; nao precisa refazer por foco de janela.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const motivos = useMemo(() => mapaDeMotivos(query.data), [query.data]);

  return {
    motivos,
    // Carregando = ainda sem nada para mostrar (nao conta o refetch com dados).
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    isPlaceholderData: query.isPlaceholderData,
    recarregar: async () => {
      const r = await query.refetch();
      return r.isError ? null : mapaDeMotivos(r.data);
    },
  };
}
