import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { AvaliacaoAdmin } from "@/hooks/useAdminAvaliacoes";

/**
 * Remocao otimista das listas do painel de aprovacoes.
 *
 * Tira as linhas decididas da tela JA, sem esperar o round-trip. Sem isso, no
 * celular do salao a linha fica no lugar por um tempo apos o toque — o admin
 * acha que nao pegou, toca de novo ou comeca a rolar, e a lista muda debaixo do
 * dedo.
 *
 * Fora do hook (com o `QueryClient` injetado) porque o comportamento por
 * PREFIXO precisa de teste: o historico passou a ter uma entrada de cache por
 * periodo — `["admin_avaliacoes","historico",<inicio>,<fim>]` — e a mutacao nao
 * sabe qual periodo esta na tela. Se o match por prefixo falhasse, a linha
 * decidida so sumiria no refetch, e o bug seria invisivel em code review.
 */

export type SnapshotCache = [QueryKey, AvaliacaoAdmin[] | undefined][];

export async function removerDoCache(
  queryClient: QueryClient,
  prefixo: readonly unknown[],
  ids: string[],
): Promise<SnapshotCache> {
  // Um refetch em voo sobrescreveria a remocao ao chegar.
  await queryClient.cancelQueries({ queryKey: prefixo });
  const anterior = queryClient.getQueriesData<AvaliacaoAdmin[]>({ queryKey: prefixo });
  queryClient.setQueriesData<AvaliacaoAdmin[]>({ queryKey: prefixo }, (atual) =>
    // `undefined` volta intacto: materializar `[]` criaria cache vazio para um
    // periodo que nunca foi buscado, e ele abriria vazio em vez de carregar.
    atual ? atual.filter((a) => !ids.includes(a.id)) : atual,
  );
  return anterior;
}

/** Desfaz a remocao otimista quando o servidor recusa (RLS, sessao expirada). */
export function restaurarCache(queryClient: QueryClient, anterior?: SnapshotCache) {
  anterior?.forEach(([chave, dados]) => {
    if (dados) queryClient.setQueryData(chave, dados);
  });
}
