import { useMemo } from "react";
import { mesManausAtual } from "@/lib/dateUtils";
import { profissionaisSelecionaveis } from "@/lib/profissionaisSelecionaveis";
import { getRulesForDateFromVersions, type RulesVersion } from "@/lib/rulesConfig";
import type { ProfissionalAtivo } from "@/types/profissionaisAtivos";
import { useRulesData } from "./useRulesData";

/**
 * Regras do MES ATUAL em America/Manaus, independentes do filtro de data do
 * dashboard. Sem versoes de regra no banco (falha na leitura ou tabela vazia)
 * devolve null — quem chama decide o fallback.
 *
 * O mes e lido a cada render (fora do memo): com a aba aberta na virada do mes,
 * o proximo render ja usa a versao do mes novo, mesmo que `allVersions` nao mude.
 */
export function useRegrasDoMesAtual(): { rules: RulesVersion | null; isLoading: boolean } {
  const { allVersions, isLoading } = useRulesData();
  const mes = mesManausAtual();

  const rules = useMemo<RulesVersion | null>(
    () =>
      allVersions.length > 0 ? getRulesForDateFromVersions(`${mes}-01`, allVersions) : null,
    [allVersions, mes]
  );

  return { rules, isLoading };
}

/**
 * Lista de profissionais para os seletores das paginas publicas em que a acao
 * acontece AGORA (cadastro de estrela, /minhas-avaliacoes): usa as regras do MES
 * ATUAL em America/Manaus — nao o filtro de data do dashboard.
 *
 * Regra em `profissionaisSelecionaveis`. Sem versoes de regra no banco as regras
 * vao como null e vale o fallback dela; `regrasCarregando` deixa a tela esperar
 * a primeira resposta em vez de piscar uma lista que depois encolhe.
 */
export function useProfissionaisSelecionaveis(ativos: ProfissionalAtivo[]): {
  profissionais: ProfissionalAtivo[];
  regrasCarregando: boolean;
} {
  const { rules, isLoading } = useRegrasDoMesAtual();

  const profissionais = useMemo(
    () => profissionaisSelecionaveis(ativos, rules),
    [ativos, rules]
  );

  return { profissionais, regrasCarregando: isLoading };
}
