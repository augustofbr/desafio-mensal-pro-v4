import { queryOptions } from "@tanstack/react-query";
// Mesma instância do app, sem o genérico `Database` (que não conhece esta RPC).
import { supabase } from "@/lib/supabase";
import { limitesDoPeriodoISO } from "@/lib/bonusEstrelas";
import {
  linhasDaRpcEstrelas,
  PeriodoLongoError,
  type LinhaEstrelaPeriodo,
} from "@/lib/estrelasRpc";

/**
 * Prefixo da chave das estrelas do período. As mutações da aba Aprovações
 * invalidam este prefixo (`useAdminAvaliacoes`), senão voltar à home pelo SPA
 * mostraria aprovadas e pendentes velhas (staleTime infinito).
 */
export const CHAVE_ESTRELAS_PERIODO = "estrelas_periodo";

/**
 * Consulta ÚNICA de `destaque_estrelas_periodo` para o período do painel:
 * `useStarsData` (aprovadas, ranking) e `useEstrelasPendentes` (pendentes do
 * Bônus Estrelas) leem a mesma entrada de cache, então a RPC roda uma vez por
 * período. Recorte no servidor por `data_hora_cadastro` [início, fim), fuso
 * Manaus. Resposta com 1000 linhas ou mais, ou linha fora do formato, vira erro
 * (`linhasDaRpcEstrelas`), nunca "0 estrelas".
 *
 * `enabled` é falso com o período incompleto (filtro personalizado sem as duas
 * datas): não há o que consultar e não é falha.
 */
export function consultaEstrelasDoPeriodo(startDate: string, endDate: string) {
  const limites = limitesDoPeriodoISO(startDate, endDate);

  return queryOptions({
    queryKey: [CHAVE_ESTRELAS_PERIODO, limites?.inicioISO ?? null, limites?.fimISO ?? null],
    enabled: limites !== null,
    queryFn: async (): Promise<LinhaEstrelaPeriodo[]> => {
      const { data, error } = await supabase.rpc("destaque_estrelas_periodo", {
        p_inicio: limites!.inicioISO,
        p_fim: limites!.fimISO,
      });

      if (error) throw error;

      return linhasDaRpcEstrelas(data);
    },
    // Busca uma vez por período, como o resto do app: sem refetch automático.
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Repetir o teto de linhas daria o mesmo resultado.
    retry: (falhas, erro) => falhas < 1 && !(erro instanceof PeriodoLongoError),
  });
}
