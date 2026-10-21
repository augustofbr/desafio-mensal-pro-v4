import { useQuery } from "@tanstack/react-query";
import { pendentesPorProfissional } from "@/lib/estrelasRpc";
import { consultaEstrelasDoPeriodo } from "./useEstrelasDoPeriodo";

/**
 * Estrelas PENDENTES (status='pendente') cadastradas no período, por
 * profissional_id. Alimenta só o "aguardando aprovação" do Bônus Estrelas.
 *
 * Não faz chamada própria: lê a mesma consulta de `useStarsData`
 * (`consultaEstrelasDoPeriodo`, RPC `destaque_estrelas_periodo`) e fica com as
 * `pendente`. O recorte roda no servidor por `data_hora_cadastro` — o mesmo
 * campo (e o mesmo fuso, Manaus) que `useStarsData` usa para decidir em que mês
 * a estrela vale.
 *
 * `data` é undefined enquanto carrega ou se a consulta falhar; quem consome
 * esconde o número em vez de mostrar um "0" que seria mentira.
 */
export function useEstrelasPendentes(startDate: string, endDate: string) {
  return useQuery({
    ...consultaEstrelasDoPeriodo(startDate, endDate),
    select: pendentesPorProfissional,
  });
}
