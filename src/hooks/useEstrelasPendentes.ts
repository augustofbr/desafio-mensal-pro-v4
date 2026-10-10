import { useQuery } from "@tanstack/react-query";
// Mesma instância do app, sem o genérico `Database` (que não conhece esta tabela).
import { supabase } from "@/lib/supabase";
import { limitesDoPeriodoISO } from "@/lib/bonusEstrelas";

/**
 * Estrelas PENDENTES (status='pendente') cadastradas no período, por
 * profissional_id. Alimenta só o "aguardando aprovação" do Bônus Estrelas.
 *
 * O recorte roda no servidor por `data_hora_cadastro` — o mesmo campo (e o
 * mesmo fuso, Manaus) que `useStarsData` usa para decidir em que mês a estrela
 * vale. Busca uma vez por período: sem refetch automático, como o resto do app.
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
      const { data, error } = await supabase
        .from("avaliacoes_cadastradas")
        .select("profissional_id")
        .eq("status", "pendente")
        .gte("data_hora_cadastro", limites!.inicioISO)
        .lt("data_hora_cadastro", limites!.fimISO);

      if (error) throw error;

      const porProfissional: Record<string, number> = {};
      for (const linha of (data as { profissional_id: number | null }[] | null) ?? []) {
        if (linha.profissional_id == null) continue;
        const id = String(linha.profissional_id);
        porProfissional[id] = (porProfissional[id] ?? 0) + 1;
      }
      return porProfissional;
    },
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}
