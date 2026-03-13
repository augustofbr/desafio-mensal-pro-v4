import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Aniversario {
  id: number;
  apelido: string;
  dia: number;
  mes: number;
}

export function useAniversariosData() {
  const [aniversarios, setAniversarios] = useState<Aniversario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAniversarios = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: supabaseError } = await (supabase as any)
        .from('aniversarios')
        .select('id, apelido, dia, mes')
        .order('mes', { ascending: true })
        .order('dia', { ascending: true });

      if (supabaseError) throw supabaseError;

      setAniversarios(data || []);
    } catch (err: any) {
      console.error("Erro ao buscar aniversários:", err);
      setError("Não foi possível carregar os aniversários.");
      setAniversarios([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAniversarios();
  }, [fetchAniversarios]);

  const byMonth = new Map<number, Aniversario[]>();
  for (let m = 1; m <= 12; m++) {
    byMonth.set(m, aniversarios.filter(a => a.mes === m));
  }

  return { aniversarios, byMonth, loading, error };
}
