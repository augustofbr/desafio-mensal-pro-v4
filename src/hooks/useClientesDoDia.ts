import { useQuery } from "@tanstack/react-query";
// Mesma instancia do app, sem o generico `Database` (que nao conhece esta RPC).
import { supabase } from "@/lib/supabase";
import type { ClienteDoDia } from "@/lib/clienteTrinks";

const SEM_CLIENTES: ClienteDoDia[] = [];

/**
 * Clientes atendidas pela profissional num dia (RPC `avaliacao_clientes_do_dia`),
 * para o cadastro de estrela escolher a cliente em vez de digitar.
 *
 * So consulta com profissional E dia. Sem retry: se a RPC falhar (ex.: dia fora da
 * janela, migracao ainda nao aplicada), o modal cai direto na digitacao livre.
 */
export function useClientesDoDia(profissionalId: number | null, dia: string | null) {
  const query = useQuery({
    queryKey: ["clientes_do_dia", profissionalId, dia],
    enabled: profissionalId !== null && dia !== null,
    queryFn: async (): Promise<ClienteDoDia[]> => {
      const { data, error } = await supabase.rpc("avaliacao_clientes_do_dia", {
        p_profissional_id: profissionalId,
        p_data: dia,
      });
      if (error) throw error;
      return (data as ClienteDoDia[] | null) ?? SEM_CLIENTES;
    },
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return {
    clientes: query.data ?? SEM_CLIENTES,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
