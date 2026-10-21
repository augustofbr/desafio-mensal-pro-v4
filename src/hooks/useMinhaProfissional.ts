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
 * - Erro da RPC (`erro` true, `id` null, `carregando` false): o vínculo é
 *   desconhecido, e a tela NÃO pode culpar a conta ("e-mail não ligado"). Quem
 *   só tem `read` fica sem cadastrar, com a mensagem de falha; a home não mostra
 *   seletor livre nem "Trocar". O banco barra de qualquer forma. Uma nova
 *   tentativa automática antes de desistir; uma nova montagem tenta de novo.
 */
export function useMinhaProfissional(): {
  id: number | null;
  carregando: boolean;
  /** A RPC falhou (depois de uma nova tentativa): o vínculo é DESCONHECIDO, não ausente. */
  erro: boolean;
} {
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
    retry: 1,
    refetchOnWindowFocus: false,
  });

  return {
    id: query.data ?? null,
    carregando: logada && query.isPending,
    erro: query.isError,
  };
}
