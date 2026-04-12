import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface TratamentoFabricante {
  id: number;
  service_name: string;
  fabricante: string;
}

interface ProfissionalFabricante {
  id: number;
  profissional_id: number;
  nome_profissional: string;
  fabricante: string;
}

export function useAdminManufacturer() {
  const queryClient = useQueryClient();

  const { data: treatments = [], isLoading: treatmentsLoading } = useQuery({
    queryKey: ["admin_tratamento_fabricante"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tratamento_fabricante" as any)
        .select("id, service_name, fabricante")
        .order("fabricante")
        .order("service_name");
      if (error) throw error;
      return data as unknown as TratamentoFabricante[];
    },
  });

  const { data: profBrands = [], isLoading: profBrandsLoading } = useQuery({
    queryKey: ["admin_profissional_fabricante"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profissional_fabricante" as any)
        .select("id, profissional_id, nome_profissional, fabricante")
        .order("nome_profissional");
      if (error) throw error;
      return data as unknown as ProfissionalFabricante[];
    },
  });

  const addTreatment = useMutation({
    mutationFn: async (input: { service_name: string; fabricante: string }) => {
      const { error } = await supabase
        .from("tratamento_fabricante" as any)
        .insert(input);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_tratamento_fabricante"] });
      queryClient.invalidateQueries({ queryKey: ["tratamento_fabricante"] });
    },
  });

  const removeTreatment = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("tratamento_fabricante" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_tratamento_fabricante"] });
      queryClient.invalidateQueries({ queryKey: ["tratamento_fabricante"] });
    },
  });

  const addProfBrand = useMutation({
    mutationFn: async (input: { profissional_id: number; nome_profissional: string; fabricante: string }) => {
      const { error } = await supabase
        .from("profissional_fabricante" as any)
        .insert(input);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_profissional_fabricante"] });
      queryClient.invalidateQueries({ queryKey: ["profissional_fabricante"] });
    },
  });

  const removeProfBrand = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("profissional_fabricante" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_profissional_fabricante"] });
      queryClient.invalidateQueries({ queryKey: ["profissional_fabricante"] });
    },
  });

  // Get unique brands from treatments
  const allBrands = [...new Set(treatments.map((t) => t.fabricante))].sort();

  // Group treatments by brand
  const treatmentsByBrand = treatments.reduce<Record<string, TratamentoFabricante[]>>((acc, t) => {
    if (!acc[t.fabricante]) acc[t.fabricante] = [];
    acc[t.fabricante].push(t);
    return acc;
  }, {});

  // Group brands by professional
  const brandsByProfessional = profBrands.reduce<Record<string, ProfissionalFabricante[]>>((acc, p) => {
    const key = p.nome_profissional;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  return {
    treatments,
    profBrands,
    allBrands,
    treatmentsByBrand,
    brandsByProfessional,
    isLoading: treatmentsLoading || profBrandsLoading,
    addTreatment,
    removeTreatment,
    addProfBrand,
    removeProfBrand,
  };
}
