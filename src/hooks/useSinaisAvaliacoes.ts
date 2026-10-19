import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  idsParaSinais,
  normalizarSinal,
  type SinalAvaliacao,
} from "@/lib/avaliacoesAdmin";

export type { SinalAvaliacao } from "@/lib/avaliacoesAdmin";

/**
 * Chave dos sinais. Fica sob `["admin_avaliacoes", ...]` DE PROPOSITO: as
 * mutacoes ja invalidam esse ramo, entao aprovar/recusar/devolver recalcula os
 * selos sem codigo novo. E NAO colide com a remocao otimista, que opera pelos
 * prefixos `[..., "pendentes"]` e `[..., "historico"]` (`avaliacoesCache.ts`) —
 * esta entrada guarda uma lista de SINAIS, nao de avaliacoes, e um filtro de
 * avaliacoes sobre ela a corromperia. Ha teste disso em `avaliacoesCache.test.ts`.
 */
export const CHAVE_SINAIS = ["admin_avaliacoes", "sinais"] as const;

/**
 * Sinais de conferencia ("Atendida?" e "Possivel duplicata") das pendentes, numa
 * unica chamada a RPC `avaliacoes_sinais` (so `authenticated` executa — a fila ja
 * e restrita ao admin).
 *
 * A RPC recusa mais de 300 ids; `idsParaSinais` corta nas 300 primeiras (as mais
 * antigas da fila) em vez de lotear: uma fila de 300+ pendentes nao existe na
 * pratica (hoje sao ~10) e lotear multiplicaria chamadas de ~2 s cada.
 *
 * Falha da RPC nao derruba a fila: `isError` so troca os selos por um aviso
 * discreto.
 */
export function useSinaisAvaliacoes(ids: string[]): {
  sinais: Map<string, SinalAvaliacao>;
  isLoading: boolean;
  isError: boolean;
} {
  // Ordenado para a chave nao mudar quando so a ORDEM da lista muda (filtro,
  // ordenacao na tela): o mesmo conjunto de pendentes e a mesma chamada.
  const alvo = useMemo(() => [...idsParaSinais(ids)].sort(), [ids]);

  const query = useQuery({
    queryKey: [...CHAVE_SINAIS, ...alvo],
    queryFn: async (): Promise<SinalAvaliacao[]> => {
      const { data, error } = await supabase.rpc("avaliacoes_sinais", { p_ids: alvo });
      if (error) throw error;
      return ((data as SinalAvaliacao[] | null) ?? []).map(normalizarSinal);
    },
    enabled: alvo.length > 0,
    // Decidir uma estrela muda o conjunto de ids (chave nova): segurar os selos
    // anteriores evita a fila "piscar" sem selo a cada aprovacao.
    placeholderData: keepPreviousData,
    // O calculo e pesado no servidor (linear nos ids). As mutacoes invalidam o
    // ramo, entao nao precisa refazer por foco de janela.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const sinais = useMemo(
    () => new Map((query.data ?? []).map((s) => [s.avaliacao_id, s])),
    [query.data],
  );

  return {
    sinais,
    // Carregando = ainda sem nada para mostrar (nao conta o refetch com dados).
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
