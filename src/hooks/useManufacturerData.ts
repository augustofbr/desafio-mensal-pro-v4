import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface TratamentoFabricante {
  service_name: string;
  fabricante: string;
}

interface ProfissionalFabricante {
  profissional_id: number;
  nome_profissional: string;
  fabricante: string;
}

export interface ManufacturerData {
  getTreatmentManufacturers: (serviceName: string) => string[];
  getProfessionalAllowedManufacturers: (profissionalId: number) => string[];
  isTreatmentAllowed: (serviceName: string, profissionalId: number) => boolean;
  isLoading: boolean;
}

export function useManufacturerData(enabled: boolean = true): ManufacturerData {
  const { data: treatmentMap, isLoading: treatmentLoading } = useQuery({
    queryKey: ['tratamento_fabricante'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tratamento_fabricante' as any)
        .select('service_name, fabricante');

      if (error) throw error;

      const map = new Map<string, string[]>();
      for (const row of (data as TratamentoFabricante[])) {
        const existing = map.get(row.service_name) || [];
        existing.push(row.fabricante);
        map.set(row.service_name, existing);
      }
      return map;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const { data: profMap, isLoading: profLoading } = useQuery({
    queryKey: ['profissional_fabricante'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profissional_fabricante' as any)
        .select('profissional_id, nome_profissional, fabricante');

      if (error) throw error;

      const map = new Map<number, string[]>();
      for (const row of (data as ProfissionalFabricante[])) {
        const existing = map.get(row.profissional_id) || [];
        existing.push(row.fabricante);
        map.set(row.profissional_id, existing);
      }
      return map;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const getTreatmentManufacturers = (serviceName: string): string[] => {
    return treatmentMap?.get(serviceName) || [];
  };

  const getProfessionalAllowedManufacturers = (profissionalId: number): string[] => {
    return profMap?.get(profissionalId) || [];
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
    isLoading: enabled ? (treatmentLoading || profLoading) : false,
  };
}
