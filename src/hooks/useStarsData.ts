import { useState, useEffect, useCallback } from "react";
// Mesma instância do app, sem o genérico `Database` (que não conhece esta RPC).
import { supabase } from "@/lib/supabase";
import { useDateFilter } from "@/contexts/DateFilterContext";
import type { ProfissionalAtivo } from "@/types/profissionaisAtivos";
import { limitesDoPeriodoISO } from "@/lib/bonusEstrelas";
import {
  agruparEstrelasPorCategoria,
  estrelasVazias,
  type StarsByCategory,
} from "@/lib/estrelasPorCategoria";
import {
  aprovadasDoPeriodo,
  linhasDaRpcEstrelas,
  tipoDoErroEstrelas,
  type TipoErroEstrelas,
} from "@/lib/estrelasRpc";

const STAR_POINTS_VALUE = 3;

export type { StarsByCategory };

export function useStarsData(activeProfessionals: ProfissionalAtivo[]) {
  const [starsData, setStarsData] = useState<StarsByCategory>(estrelasVazias);
  const [loading, setLoading] = useState(true);
  // true quando a leitura/processamento das estrelas falhou. Os mapas continuam
  // zerados (scoring inalterado); o flag so permite a quem exibe valores em R$
  // (Bonus Estrelas) nao confundir "falhou" com "nenhuma estrela".
  const [falhou, setFalhou] = useState(false);
  // Por que falhou, para a tela avisar com o texto certo (teto de linhas x o resto).
  const [tipoErro, setTipoErro] = useState<TipoErroEstrelas | null>(null);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);
  const registrarFalha = useCallback((erro: unknown) => {
    setFalhou(true);
    setTipoErro(tipoDoErroEstrelas(erro));
    const mensagem = (erro as { message?: unknown } | null)?.message;
    setMensagemErro(typeof mensagem === "string" ? mensagem : null);
  }, []);
  const { getFilteredDateRange } = useDateFilter();

  const fetchStars = useCallback(async () => {
    try {
      setLoading(true);
      setFalhou(false);
      setTipoErro(null);
      setMensagemErro(null);

      // Periodo do dashboard (YYYY-MM-DD, dias em fuso Manaus)
      const { startDate, endDate } = getFilteredDateRange();
      const limites = limitesDoPeriodoISO(startDate, endDate);

      // Periodo incompleto (filtro personalizado ainda sem as duas datas): nao ha
      // o que consultar. Nao e falha, so ainda nao ha periodo.
      if (!limites) {
        setStarsData(estrelasVazias());
        return;
      }

      // Estrelas do periodo pela RPC `destaque_estrelas_periodo` (a leitura
      // direta da tabela foi fechada para o painel): recorte NO SERVIDOR por
      // `data_hora_cadastro` [inicio, fim), a mesma data que define o mes da
      // estrela. A RPC devolve aprovadas e pendentes; aqui so contam as
      // aprovadas com `data_aprovacao`. Sem permissao `painel:read` ela devolve
      // 0 linhas; o gate de rota ja barra quem nao tem.
      const { data, error } = await supabase.rpc("destaque_estrelas_periodo", {
        p_inicio: limites.inicioISO,
        p_fim: limites.fimISO,
      });

      if (error) {
        console.error("Erro ao buscar destaque_estrelas_periodo:", error);
        registrarFalha(error);
        setStarsData(estrelasVazias());
        return;
      }

      const avaliacoes = aprovadasDoPeriodo(linhasDaRpcEstrelas(data));

      if (avaliacoes.length === 0) {
        console.log("Nenhuma avaliação aprovada encontrada");
        setStarsData(estrelasVazias());
        return;
      }

      // Inativos ficam fora (ver `agruparEstrelasPorCategoria`): estrela de quem
      // nao participa mais do desafio nao vira linha no ranking.
      const result = agruparEstrelasPorCategoria(
        avaliacoes,
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
      registrarFalha(error);
      setStarsData(estrelasVazias());
    } finally {
      setLoading(false);
    }
  }, [activeProfessionals, getFilteredDateRange, registrarFalha]);

  useEffect(() => {
    if (activeProfessionals.length > 0) {
      fetchStars();
    } else {
      setLoading(false);
    }
  }, [activeProfessionals, fetchStars]);

  return { starsData, loading, error: falhou, errorKind: tipoErro, errorMessage: mensagemErro };
}

export { STAR_POINTS_VALUE };
