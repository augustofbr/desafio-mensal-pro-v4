import { useQuery } from "@tanstack/react-query";
// Mesma instância do app, sem o genérico `Database` (que não conhece esta tabela).
import { supabase } from "@/lib/supabase";
import { limitesDoPeriodoISO } from "@/lib/bonusEstrelas";
import { linhasDaRpcEstrelas, pendentesPorProfissional } from "@/lib/estrelasRpc";

/**
 * Estrelas PENDENTES (status='pendente') cadastradas no período, por
 * profissional_id. Alimenta só o "aguardando aprovação" do Bônus Estrelas.
 *
 * Lê a RPC `destaque_estrelas_periodo` (a mesma de `useStarsData`; a tabela não
 * é mais lida direto pelo painel) e fica com as `pendente`. O recorte roda no
 * servidor por `data_hora_cadastro` — o mesmo campo (e o mesmo fuso, Manaus) que
 * `useStarsData` usa para decidir em que mês a estrela vale. Busca uma vez por
 * período: sem refetch automático, como o resto do app.
 *
 * `data` é undefined enquanto carrega ou se a consulta falhar; quem consome
 * esconde o número em vez de mostrar um "0" que seria mentira.
 */
export function useEstrelasPendentes(startDate: string, endDate: string) {
  const limites = limitesDoPeriodoISO(startDate, endDate);

  return useQuery({
    queryKey: ["bonus_estrelas", "pendentes", limites?.inicioISO ?? null, limites?.fimISO ?? null],
    enabled: limites !== null,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.rpc("destaque_estrelas_periodo", {
        p_inicio: limites!.inicioISO,
        p_fim: limites!.fimISO,
      });

      if (error) throw error;

      return pendentesPorProfissional(linhasDaRpcEstrelas(data));
    },
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}
