import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDateFilter } from "@/contexts/DateFilterContext";
import type { ProfissionalAtivo } from "@/types/profissionaisAtivos";
import {
  agruparEstrelasPorCategoria,
  estrelasVazias,
  type StarsByCategory,
} from "@/lib/estrelasPorCategoria";
import {
  aprovadasDoPeriodo,
  tipoDoErroEstrelas,
  type TipoErroEstrelas,
} from "@/lib/estrelasRpc";
import { consultaEstrelasDoPeriodo } from "./useEstrelasDoPeriodo";

const STAR_POINTS_VALUE = 3;

export type { StarsByCategory };

interface EstadoEstrelas {
  starsData: StarsByCategory;
  // true quando a leitura/processamento das estrelas falhou. Os mapas continuam
  // zerados (scoring inalterado); o flag so permite a quem exibe valores em R$
  // (Bonus Estrelas) nao confundir "falhou" com "nenhuma estrela".
  falhou: boolean;
  // Por que falhou, para a tela avisar com o texto certo (teto de linhas x o resto).
  tipoErro: TipoErroEstrelas | null;
  mensagemErro: string | null;
}

function semEstrelas(): EstadoEstrelas {
  return { starsData: estrelasVazias(), falhou: false, tipoErro: null, mensagemErro: null };
}

function estadoDeFalha(erro: unknown): EstadoEstrelas {
  const mensagem = (erro as { message?: unknown } | null)?.message;
  return {
    starsData: estrelasVazias(),
    falhou: true,
    tipoErro: tipoDoErroEstrelas(erro),
    mensagemErro: typeof mensagem === "string" ? mensagem : null,
  };
}

export function useStarsData(activeProfessionals: ProfissionalAtivo[]) {
  // Periodo do dashboard (YYYY-MM-DD, dias em fuso Manaus)
  const { startDate, endDate } = useDateFilter().getFilteredDateRange();

  // Estrelas do periodo pela RPC `destaque_estrelas_periodo` (a leitura direta da
  // tabela foi fechada para o painel), na consulta compartilhada com
  // `useEstrelasPendentes`: uma chamada por periodo. Ela devolve aprovadas e
  // pendentes; aqui so contam as aprovadas com `data_aprovacao`. Sem permissao
  // `painel:read` ela devolve 0 linhas; o gate de rota ja barra quem nao tem.
  const consulta = useQuery(consultaEstrelasDoPeriodo(startDate, endDate));
  const temPeriodo = consulta.isEnabled;
  const temProfissionais = activeProfessionals.length > 0;

  const estado = useMemo((): EstadoEstrelas => {
    // Sem profissionais ainda ou com o periodo incompleto (filtro personalizado sem
    // as duas datas): nao ha o que pontuar, e nao e falha.
    if (!temProfissionais || !temPeriodo) return semEstrelas();
    if (consulta.error) return estadoDeFalha(consulta.error);
    if (!consulta.data) return semEstrelas();

    try {
      const avaliacoes = aprovadasDoPeriodo(consulta.data);
      if (avaliacoes.length === 0) return semEstrelas();

      // Inativos ficam fora (ver `agruparEstrelasPorCategoria`): estrela de quem
      // nao participa mais do desafio nao vira linha no ranking.
      return {
        ...semEstrelas(),
        starsData: agruparEstrelasPorCategoria(avaliacoes, activeProfessionals, startDate, endDate),
      };
    } catch (error) {
      return estadoDeFalha(error);
    }
  }, [
    temProfissionais,
    temPeriodo,
    consulta.error,
    consulta.data,
    activeProfessionals,
    startDate,
    endDate,
  ]);

  // Log fora do memo (render puro): uma vez por falha nova.
  useEffect(() => {
    if (estado.falhou) console.error("Erro ao carregar as estrelas do período:", estado.mensagemErro);
  }, [estado]);

  const loading = temProfissionais && temPeriodo && consulta.isPending;

  return {
    starsData: estado.starsData,
    loading,
    error: estado.falhou,
    errorKind: estado.tipoErro,
    errorMessage: estado.mensagemErro,
  };
}

export { STAR_POINTS_VALUE };
