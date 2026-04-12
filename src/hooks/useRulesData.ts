import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RulesVersion } from "@/lib/rulesConfig";
import type { RegrasDesafioDB } from "@/types/admin";

function dbRowToRulesVersion(row: RegrasDesafioDB): RulesVersion {
  return {
    id: row.id,
    validFrom: row.valid_from,
    label: row.label ?? undefined,
    cabelo: row.cabelo,
    unhas: row.unhas,
    estetica: row.estetica,
    maquiagem: row.maquiagem,
  };
}

export function useRulesData() {
  const { data } = useQuery({
    queryKey: ["regras_desafio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regras_desafio" as any)
        .select("*")
        .order("valid_from", { ascending: true });

      if (error) {
        console.warn("Failed to fetch regras_desafio, using hardcoded fallback:", error.message);
        return [];
      }
      return (data as unknown as RegrasDesafioDB[]).map(dbRowToRulesVersion);
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    allVersions: data ?? [],
  };
}
