import { useMemo } from "react";
import { fabricanteDb } from "@/lib/fabricanteDb";
import { useQuery } from "@tanstack/react-query";
import { linhasDoMes } from "@/lib/marcasPorMes";

interface TratamentoFabricante {
  service_name: string;
  fabricante: string;
}

interface ProfissionalFabricante {
  profissional_id: number;
  nome_profissional: string;
  fabricante: string;
  valid_from: string;
}

export interface ManufacturerData {
  getTreatmentManufacturers: (serviceName: string) => string[];
  getProfessionalAllowedManufacturers: (profissionalId: number) => string[];
  isTreatmentAllowed: (serviceName: string, profissionalId: number) => boolean;
  isLoading: boolean;
  /** Alguma das leituras falhou (depois das retentativas do React Query). */
  isError: boolean;
  error: Error | null;
}

/**
 * @param enabled liga as queries (so quando a regra do mes usa manufacturerConstraints)
 * @param mes 'YYYY-MM' do inicio do filtro de data. As marcas autorizadas vem da
 *   versao de `profissional_fabricante` vigente nesse mes (ver `src/lib/marcasPorMes.ts`).
 *   `tratamento_fabricante` nao e versionada.
 */
export function useManufacturerData(enabled: boolean, mes: string): ManufacturerData {
  const {
    data: treatmentMap,
    isLoading: treatmentLoading,
    error: treatmentError,
  } = useQuery({
    queryKey: ['tratamento_fabricante'],
    queryFn: async () => {
      const { data, error } = await fabricanteDb
        .from('tratamento_fabricante')
        .select('service_name, fabricante');

      if (error) throw error;

      const map = new Map<string, string[]>();
      for (const row of (data as unknown as TratamentoFabricante[])) {
        const existing = map.get(row.service_name) || [];
        existing.push(row.fabricante);
        map.set(row.service_name, existing);
      }
      return map;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  // Busca TODAS as versoes (tabela pequena); a resolucao pelo mes fica fora do
  // queryFn, entao a chave nao depende do mes e as invalidacoes do admin
  // (['profissional_fabricante']) continuam valendo.
  const { data: profRows, isLoading: profLoading, error: profError } = useQuery({
    queryKey: ['profissional_fabricante'],
    queryFn: async () => {
      const { data, error } = await fabricanteDb
        .from('profissional_fabricante')
        .select('profissional_id, nome_profissional, fabricante, valid_from');

      if (error) throw error;
      return data as unknown as ProfissionalFabricante[];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const profMap = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const row of linhasDoMes(profRows || [], mes)) {
      const existing = map.get(row.profissional_id) || [];
      existing.push(row.fabricante);
      map.set(row.profissional_id, existing);
    }
    return map;
  }, [profRows, mes]);

  const isLoading = enabled ? (treatmentLoading || profLoading) : false;
  const error = enabled ? ((treatmentError ?? profError) as Error | null) : null;

  // Memoizado: os consumidores (useHairTreatmentData, useProfessionalDetails) poem
  // este objeto em deps de effect/callback; um objeto novo a cada render refaria
  // o calculo a cada render.
  return useMemo(() => {
    const getTreatmentManufacturers = (serviceName: string): string[] => {
      return treatmentMap?.get(serviceName) || [];
    };

    const getProfessionalAllowedManufacturers = (profissionalId: number): string[] => {
      return profMap.get(profissionalId) || [];
    };

    const isTreatmentAllowed = (serviceName: string, profissionalId: number): boolean => {
      const treatmentManufacturers = getTreatmentManufacturers(serviceName);
      const allowedManufacturers = getProfessionalAllowedManufacturers(profissionalId);

      if (treatmentManufacturers.length === 0) return false;
      if (allowedManufacturers.length === 0) return false;

      return treatmentManufacturers.some(
        tm => tm !== 'Não classificado' && allowedManufacturers.includes(tm)
      );
    };

    return {
      getTreatmentManufacturers,
      getProfessionalAllowedManufacturers,
      isTreatmentAllowed,
      isLoading,
      isError: error !== null,
      error,
    };
  }, [treatmentMap, profMap, isLoading, error]);
}
