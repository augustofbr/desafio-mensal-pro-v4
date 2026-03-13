import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import type { ProfissionalAtivo, CategoriaAtiva } from "@/types/profissionaisAtivos";

export function useActiveProfessionals() {
  const [activeProfessionals, setActiveProfessionals] = useState<ProfissionalAtivo[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchActiveProfessionals = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Buscar todos os profissionais ativos
      const { data: profData, error: profError } = await supabase
        .from('profissionais_ativos' as any)
        .select('*');

      if (profError) {
        console.error("Erro ao buscar profissionais_ativos:", profError);
        throw profError;
      }

      if (!profData || profData.length === 0) {
        console.warn("Tabela profissionais_ativos está vazia");
        setActiveProfessionals([]);
        return;
      }

      const typedProfData = profData as ProfissionalAtivo[];
      console.log(`Profissionais ativos carregados: ${typedProfData.length}`);

      // 2. Buscar pares (profissionalid, professional) distintos de trinks_services
      const { data: serviceProfs, error: serviceError } = await supabase
        .from('trinks_services')
        .select('profissionalid, professional');

      if (serviceError) {
        console.error("Erro ao buscar profissionais de trinks_services:", serviceError);
        throw serviceError;
      }

      // 3. Criar mapa de pares únicos de trinks_services: nome → profissionalid
      const serviceProfsMap = new Map<string, Set<string>>();
      if (serviceProfs) {
        serviceProfs.forEach((sp: any) => {
          if (sp.professional && sp.profissionalid) {
            if (!serviceProfsMap.has(sp.professional)) {
              serviceProfsMap.set(sp.professional, new Set());
            }
            serviceProfsMap.get(sp.professional)!.add(sp.profissionalid);
          }
        });
      }

      // 4. Validar consistência de IDs
      let allConsistent = true;
      let checkedCount = 0;

      typedProfData.forEach((prof) => {
        const nome = prof.nome_profissional;
        if (!nome) return;

        const serviceIds = serviceProfsMap.get(nome);
        if (!serviceIds) {
          console.warn(`Profissional "${nome}" não encontrado em trinks_services`);
          return;
        }

        checkedCount++;
        const expectedId = String(prof.profissionalId);

        if (!serviceIds.has(expectedId)) {
          allConsistent = false;
          console.warn(
            `ID inconsistente para "${nome}": profissionais_ativos=${prof.profissionalId}, trinks_services=${[...serviceIds].join(', ')}`
          );
        }
      });

      if (allConsistent && checkedCount > 0) {
        console.log(`✅ Validação de IDs: todos os ${checkedCount} profissionais verificados são consistentes`);
      } else if (!allConsistent) {
        console.warn("⚠️ Inconsistências encontradas nos IDs — usando matching por nome");
      }

      setActiveProfessionals(typedProfData);
    } catch (error: any) {
      console.error("Erro ao carregar profissionais ativos:", error);
      toast({
        title: "Erro ao carregar profissionais",
        description: "Não foi possível carregar a lista de profissionais ativos.",
        variant: "destructive"
      });
      setActiveProfessionals([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Lookup Map: nome_profissional → ProfissionalAtivo
  const profLookup = useMemo(() => {
    const map = new Map<string, ProfissionalAtivo>();
    activeProfessionals.forEach((prof) => {
      if (prof.nome_profissional) {
        map.set(prof.nome_profissional, prof);
      }
    });
    return map;
  }, [activeProfessionals]);

  const isActiveProfessional = useCallback((name: string): boolean => {
    return profLookup.has(name);
  }, [profLookup]);

  const getProfessionalCategory = useCallback((name: string): string | null => {
    return profLookup.get(name)?.categoria ?? null;
  }, [profLookup]);

  const getProfessionalsByCategory = useCallback((categoria: CategoriaAtiva): string[] => {
    return activeProfessionals
      .filter((p) => p.categoria === categoria && p.nome_profissional)
      .map((p) => p.nome_profissional!);
  }, [activeProfessionals]);

  return {
    activeProfessionals,
    profLookup,
    loading,
    isActiveProfessional,
    getProfessionalCategory,
    getProfessionalsByCategory,
    fetchActiveProfessionals
  };
}
