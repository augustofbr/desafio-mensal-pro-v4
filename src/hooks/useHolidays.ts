import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { HOLIDAYS } from "@/lib/workingDaysConfig";
import type { FeriadoDB } from "@/types/admin";

export function useHolidays() {
  const { data, isLoading } = useQuery({
    queryKey: ["feriados"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feriados" as any)
        .select("*")
        .order("data", { ascending: true });

      if (error) throw error;
      return data as unknown as FeriadoDB[];
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    feriados: data ?? [],
    holidays: data?.map((f) => f.data) ?? HOLIDAYS,
    isLoading,
  };
}
