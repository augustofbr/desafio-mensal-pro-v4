import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useAdminHolidays() {
  const queryClient = useQueryClient();

  const addHoliday = useMutation({
    mutationFn: async (input: { data: string; descricao: string }) => {
      const { error } = await supabase
        .from("feriados" as any)
        .insert(input);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feriados"] });
    },
  });

  const removeHoliday = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("feriados" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feriados"] });
    },
  });

  return { addHoliday, removeHoliday };
}
