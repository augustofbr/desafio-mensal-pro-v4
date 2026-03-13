import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDateFilter } from "@/contexts/DateFilterContext";
import type { ProfissionalAtivo } from "@/types/profissionaisAtivos";

const STAR_POINTS_VALUE = 3;

export interface StarsByCategory {
  cabelo: Map<string, number>;
  unhas: Map<string, number>;
  maquiagem: Map<string, number>;
  estetica: Map<string, number>;
}

const manausFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Manaus',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getManausDate(isoString: string): string {
  const date = new Date(isoString);
  const parts = manausFormatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

export function useStarsData(activeProfessionals: ProfissionalAtivo[]) {
  const [starsData, setStarsData] = useState<StarsByCategory>({
    cabelo: new Map(),
    unhas: new Map(),
    maquiagem: new Map(),
    estetica: new Map(),
  });
  const [loading, setLoading] = useState(true);
  const { getFilteredDateRange } = useDateFilter();

  const fetchStars = useCallback(async () => {
    try {
      setLoading(true);

      // Buscar estrelas aprovadas
      const { data: avaliacoes, error } = await supabase
        .from('avaliacoes_cadastradas' as any)
        .select('nome_profissional, profissional_id, data_hora_cadastro')
        .eq('status', 'aprovada')
        .not('data_aprovacao', 'is', null);

      if (error) {
        console.error("Erro ao buscar avaliacoes_cadastradas:", error);
        setStarsData({ cabelo: new Map(), unhas: new Map(), maquiagem: new Map(), estetica: new Map() });
        return;
      }

      if (!avaliacoes || avaliacoes.length === 0) {
        console.log("Nenhuma avaliação aprovada encontrada");
        setStarsData({ cabelo: new Map(), unhas: new Map(), maquiagem: new Map(), estetica: new Map() });
        return;
      }

      // Criar mapa profissionalId → categoria
      const idToCategory = new Map<number, string>();
      const idToName = new Map<number, string>();
      activeProfessionals.forEach((prof) => {
        if (prof.categoria) {
          idToCategory.set(prof.profissionalId, prof.categoria.trim());
        }
        if (prof.nome_profissional) {
          idToName.set(prof.profissionalId, prof.nome_profissional);
        }
      });

      // Filtrar por período do dashboard
      const dateRange = getFilteredDateRange();
      const { startDate, endDate } = dateRange;

      const result: StarsByCategory = {
        cabelo: new Map(),
        unhas: new Map(),
        maquiagem: new Map(),
        estetica: new Map(),
      };

      (avaliacoes as any[]).forEach((av) => {
        const profId = av.profissional_id;
        const dataHoraCadastro = av.data_hora_cadastro;

        if (!profId || !dataHoraCadastro) return;

        // Verificar se profissional tem categoria mapeada
        const categoria = idToCategory.get(profId);
        if (!categoria) return;

        // Filtrar por mês usando data_hora_cadastro em timezone Manaus
        const manausDate = getManausDate(dataHoraCadastro);
        if (manausDate < startDate || manausDate > endDate) return;

        // Usar nome_profissional da avaliação
        const nomeProfissional = av.nome_profissional;
        if (!nomeProfissional) return;

        // Mapear para categoria do resultado
        let categoryMap: Map<string, number> | null = null;
        switch (categoria) {
          case "Cabelo":
            categoryMap = result.cabelo;
            break;
          case "Unhas":
            categoryMap = result.unhas;
            break;
          case "Maquiagem":
            categoryMap = result.maquiagem;
            break;
          case "Estetica":
            categoryMap = result.estetica;
            break;
        }

        if (!categoryMap) return;

        const currentCount = categoryMap.get(nomeProfissional) || 0;
        categoryMap.set(nomeProfissional, currentCount + 1);
      });

      console.log("Estrelas processadas:", {
        cabelo: result.cabelo.size,
        unhas: result.unhas.size,
        maquiagem: result.maquiagem.size,
        estetica: result.estetica.size,
      });

      setStarsData(result);
    } catch (error) {
      console.error("Erro ao processar estrelas:", error);
      setStarsData({ cabelo: new Map(), unhas: new Map(), maquiagem: new Map(), estetica: new Map() });
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

  return { starsData, loading };
}

export { STAR_POINTS_VALUE };
