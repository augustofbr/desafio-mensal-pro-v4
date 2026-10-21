import { useState, useEffect, useCallback, useMemo } from "react";
// Mesma instância do app, sem o genérico `Database` (que não conhece esta RPC).
import { supabase } from "@/lib/supabase";

export interface Avaliacao {
  id: string;
  nome_profissional: string;
  nome_cliente: string;
  /** Nome no Trinks; NULL nos cadastros anteriores a out/2026. */
  nome_cliente_trinks: string | null;
  status: string;
  data_hora_cadastro: string;
  data_aprovacao: string | null;
  /** Só vem preenchido nas recusadas; recusa legada = NULL ("Sem motivo registrado"). */
  motivo_recusa: string | null;
}

interface AvaliacaoCounts {
  todas: number;
  pendentes: number;
  aprovadas: number;
  rejeitadas: number;
}

export function useMinhasAvaliacoes(profissionalId: number | null) {
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [loading, setLoading] = useState(false);
  // Falha na consulta precisa chegar a tela: sem isso a lista ficava vazia e
  // parecia "nenhuma avaliacao", que e informacao falsa para a profissional.
  const [isError, setIsError] = useState(false);

  const fetchAvaliacoes = useCallback(async () => {
    if (!profissionalId) {
      setAvaliacoes([]);
      setIsError(false);
      return;
    }

    try {
      setLoading(true);
      setIsError(false);

      // RPC `destaque_minhas_avaliacoes` (ordenada por data_hora_cadastro desc):
      // `estrelas:write` ve qualquer id; `estrelas:read` so o do proprio vinculo.
      // Sem permissao ela devolve 0 linhas, por isso a tela nem a chama quando o
      // perfil nao tem acesso a "estrelas".
      const { data, error } = await supabase.rpc("destaque_minhas_avaliacoes", {
        p_profissional_id: profissionalId,
      });

      if (error) {
        console.error("Erro ao buscar avaliações:", error);
        setAvaliacoes([]);
        setIsError(true);
        return;
      }

      setAvaliacoes((data as Avaliacao[] | null) ?? []);
    } catch (error) {
      console.error("Erro ao buscar avaliações:", error);
      setAvaliacoes([]);
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }, [profissionalId]);

  useEffect(() => {
    fetchAvaliacoes();
  }, [fetchAvaliacoes]);

  const counts: AvaliacaoCounts = useMemo(() => {
    return {
      todas: avaliacoes.length,
      pendentes: avaliacoes.filter((a) => a.status === "pendente").length,
      aprovadas: avaliacoes.filter((a) => a.status === "aprovada").length,
      rejeitadas: avaliacoes.filter((a) => a.status === "rejeitada").length,
    };
  }, [avaliacoes]);

  return { avaliacoes, loading, isError, counts };
}
