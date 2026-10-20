import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "@/auth/acesso";
import { normalizarVinculo } from "@/lib/identidade";
import { supabase } from "@/lib/supabase";

/** Chave fixa: o cache inteiro é zerado quando a sessão sai ou o usuário muda. */
export const CHAVE_MINHA_PROFISSIONAL = ["destaque", "minha_profissional"] as const;

/**
 * Profissional ligada à conta logada, pela RPC `destaque_minha_profissional()`
 * (só `authenticated`). O vínculo é gravado em `destaque_users_app.profissional_id`
 * quando o admin cria a conta; o e-mail do JWT NÃO entra na conta. A RPC devolve
 * NULL se a conta ou a profissional estiverem inativas.
 *
 * - `carregando`: ainda sem resposta. A tela não deve mostrar o seletor livre
 *   nem "Trocar" enquanto isso, para a identidade errada não piscar.
 * - Erro da RPC vale como "sem vínculo" (`id` null, `carregando` false): a tela
 *   não quebra e o cadastro de quem só tem `read` fica bloqueado. O banco barra
 *   de qualquer forma. Sem retry automático para o erro não segurar o
 *   "carregando"; uma nova montagem tenta de novo.
 */
export function useMinhaProfissional(): { id: number | null; carregando: boolean } {
  const { acesso } = useAcesso();
  const logada = Boolean(acesso?.userId);

  const query = useQuery({
    queryKey: CHAVE_MINHA_PROFISSIONAL,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase.rpc("destaque_minha_profissional");
      if (error) throw error;
      return normalizarVinculo(data);
    },
    enabled: logada,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return {
    id: query.data ?? null,
    carregando: logada && query.isPending,
  };
}
