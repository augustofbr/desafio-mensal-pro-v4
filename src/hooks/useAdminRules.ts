import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CategoryRules } from "@/lib/rulesConfig";

interface CreateVersionInput {
  valid_from: string;
  label: string;
  cabelo: CategoryRules;
  unhas: CategoryRules;
  estetica: CategoryRules;
  maquiagem: CategoryRules;
}

interface UpdateVersionInput extends CreateVersionInput {
  id: string;
}

export function useAdminRules() {
  const queryClient = useQueryClient();

  const createVersion = useMutation({
    mutationFn: async (input: CreateVersionInput) => {
      const { data, error } = await supabase
        .from("regras_desafio" as any)
        .insert({
          valid_from: input.valid_from,
          label: input.label,
          cabelo: input.cabelo as any,
          unhas: input.unhas as any,
          estetica: input.estetica as any,
          maquiagem: input.maquiagem as any,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["regras_desafio"] });
    },
  });

  const updateVersion = useMutation({
    mutationFn: async (input: UpdateVersionInput) => {
      const { data, error } = await supabase
        .from("regras_desafio" as any)
        .update({
          valid_from: input.valid_from,
          label: input.label,
          cabelo: input.cabelo as any,
          unhas: input.unhas as any,
          estetica: input.estetica as any,
          maquiagem: input.maquiagem as any,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["regras_desafio"] });
    },
  });

  const deleteVersion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("regras_desafio" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["regras_desafio"] });
    },
  });

  return { createVersion, updateVersion, deleteVersion };
}
