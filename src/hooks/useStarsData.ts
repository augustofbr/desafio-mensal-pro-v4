import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDateFilter } from "@/contexts/DateFilterContext";
import type { ProfissionalAtivo } from "@/types/profissionaisAtivos";
import { limitesDoPeriodoISO } from "@/lib/bonusEstrelas";
import {
  agruparEstrelasPorCategoria,
  estrelasVazias,
  type AvaliacaoAprovada,
  type StarsByCategory,
} from "@/lib/estrelasPorCategoria";

const STAR_POINTS_VALUE = 3;

export type { StarsByCategory };

export function useStarsData(activeProfessionals: ProfissionalAtivo[]) {
  const [starsData, setStarsData] = useState<StarsByCategory>(estrelasVazias);
  const [loading, setLoading] = useState(true);
  // true quando a leitura/processamento das estrelas falhou. Os mapas continuam
  // zerados (scoring inalterado); o flag so permite a quem exibe valores em R$
  // (Bonus Estrelas) nao confundir "falhou" com "nenhuma estrela".
  const [falhou, setFalhou] = useState(false);
  const { getFilteredDateRange } = useDateFilter();

  const fetchStars = useCallback(async () => {
    try {
      setLoading(true);
      setFalhou(false);

      // Periodo do dashboard (YYYY-MM-DD, dias em fuso Manaus)
      const { startDate, endDate } = getFilteredDateRange();
      const limites = limitesDoPeriodoISO(startDate, endDate);

      // Buscar estrelas aprovadas, recortadas NO SERVIDOR pelo periodo: sem o
      // recorte a consulta trazia o historico inteiro e o PostgREST corta em
      // 1000 linhas (max-rows), descartando estrelas em silencio.
      let query = supabase
        .from('avaliacoes_cadastradas' as any)
        .select('profissional_id, data_hora_cadastro')
        .eq('status', 'aprovada')
        .not('data_aprovacao', 'is', null);
      if (limites) {
        query = query
          .gte('data_hora_cadastro', limites.inicioISO)
          .lt('data_hora_cadastro', limites.fimISO);
      }
      const { data: avaliacoes, error } = await query;

      if (error) {
        console.error("Erro ao buscar avaliacoes_cadastradas:", error);
        setFalhou(true);
        setStarsData(estrelasVazias());
        return;
      }

      if (!avaliacoes || avaliacoes.length === 0) {
        console.log("Nenhuma avaliação aprovada encontrada");
        setStarsData(estrelasVazias());
        return;
      }

      // Inativos ficam fora (ver `agruparEstrelasPorCategoria`): estrela de quem
      // nao participa mais do desafio nao vira linha no ranking.
      const result = agruparEstrelasPorCategoria(
        avaliacoes as unknown as AvaliacaoAprovada[],
        activeProfessionals,
        startDate,
        endDate
      );

      console.log("Estrelas processadas:", {
        cabelo: result.cabelo.size,
        unhas: result.unhas.size,
        maquiagem: result.maquiagem.size,
        estetica: result.estetica.size,
        semCategoria: result.semCategoria.size,
      });

      setStarsData(result);
    } catch (error) {
      console.error("Erro ao processar estrelas:", error);
      setFalhou(true);
      setStarsData(estrelasVazias());
    } finally {
      setLoading(false);
    }
  }, [activeProfessionals, getFilteredDateRange]);

  useEffect(() => {
    if (activeProfessionals.length > 0) {
      fetchStars();
    } else {
      setLoading(false);
    }
  }, [activeProfessionals, fetchStars]);

  return { starsData, loading, error: falhou };
}

export { STAR_POINTS_VALUE };
