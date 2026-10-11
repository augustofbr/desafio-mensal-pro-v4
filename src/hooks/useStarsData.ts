import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDateFilter } from "@/contexts/DateFilterContext";
import type { ProfissionalAtivo } from "@/types/profissionaisAtivos";
import { limitesDoPeriodoISO } from "@/lib/bonusEstrelas";

const STAR_POINTS_VALUE = 3;

/** Mapas chaveados por profissionalId (string) → total de estrelas aprovadas. */
export interface StarsByCategory {
  cabelo: Map<string, number>;
  unhas: Map<string, number>;
  maquiagem: Map<string, number>;
  estetica: Map<string, number>;
  /**
   * Aprovadas de quem NAO esta numa das quatro categorias (categoria nula ou
   * desconhecida). Nunca entra no scoring: existe so para o Bonus Estrelas
   * contar quem participa apenas do bonus (`star_bonus_extra`). Quem esta numa
   * categoria conta so no mapa dela — os dois nunca somam a mesma estrela.
   */
  semCategoria: Map<string, number>;
}

function vazio(): StarsByCategory {
  return {
    cabelo: new Map(),
    unhas: new Map(),
    maquiagem: new Map(),
    estetica: new Map(),
    semCategoria: new Map(),
  };
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
  const [starsData, setStarsData] = useState<StarsByCategory>(vazio);
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
        setStarsData(vazio());
        return;
      }

      if (!avaliacoes || avaliacoes.length === 0) {
        console.log("Nenhuma avaliação aprovada encontrada");
        setStarsData(vazio());
        return;
      }

      // Criar mapa profissionalId → categoria
      const idToCategory = new Map<number, string>();
      activeProfessionals.forEach((prof) => {
        if (prof.categoria) {
          idToCategory.set(prof.profissionalId, prof.categoria.trim());
        }
      });

      const result: StarsByCategory = vazio();

      (avaliacoes as any[]).forEach((av) => {
        const profId = av.profissional_id;
        const dataHoraCadastro = av.data_hora_cadastro;

        if (!profId || !dataHoraCadastro) return;

        // Filtrar por mês usando data_hora_cadastro em timezone Manaus
        const manausDate = getManausDate(dataHoraCadastro);
        if (manausDate < startDate || manausDate > endDate) return;

        const categoria = idToCategory.get(profId);

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

        // Sem categoria do desafio: so o Bonus Estrelas pode usar (extras do
        // mes); o scoring nunca le este mapa.
        if (!categoryMap) categoryMap = result.semCategoria;

        // Chave = profissionalId (mesma chave da associacao de servicos).
        // nome_profissional na avaliacao e apenas um snapshot historico.
        const key = String(profId);
        const currentCount = categoryMap.get(key) || 0;
        categoryMap.set(key, currentCount + 1);
      });

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
      setStarsData(vazio());
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
