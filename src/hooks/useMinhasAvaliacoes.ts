import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Avaliacao {
  id: string;
  nome_profissional: string;
  nome_cliente: string;
  status: string;
  data_hora_cadastro: string;
  data_aprovacao: string | null;
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

  const fetchAvaliacoes = useCallback(async () => {
    if (!profissionalId) {
      setAvaliacoes([]);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("avaliacoes_cadastradas" as any)
        .select("id, nome_profissional, nome_cliente, status, data_hora_cadastro, data_aprovacao")
        .eq("profissional_id", profissionalId)
        .order("data_hora_cadastro", { ascending: false });

      if (error) {
        console.error("Erro ao buscar avaliações:", error);
        setAvaliacoes([]);
        return;
      }

      setAvaliacoes((data as any[] as Avaliacao[]) ?? []);
    } catch (error) {
      console.error("Erro ao buscar avaliações:", error);
      setAvaliacoes([]);
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

  return { avaliacoes, loading, counts };
}
