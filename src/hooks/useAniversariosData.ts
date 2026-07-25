import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Aniversario {
  /** profissionalId em profissionais_ativos */
  id: number;
  apelido: string;
  dia: number;
  mes: number;
}

/** Linha retornada pela query — profissionais_ativos não está em supabase/types.ts */
interface ProfissionalAniversarioRow {
  profissionalId: number;
  apelido: string | null;
  nome_profissional: string | null;
  dia_aniversario: number;
  mes_aniversario: number;
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
        .from('profissionais_ativos')
        .select('profissionalId, apelido, nome_profissional, dia_aniversario, mes_aniversario')
        .not('dia_aniversario', 'is', null)
        .not('mes_aniversario', 'is', null)
        .not('ativo', 'is', false)
        .order('mes_aniversario', { ascending: true })
        .order('dia_aniversario', { ascending: true });

      if (supabaseError) throw supabaseError;

      const rows = (data || []) as ProfissionalAniversarioRow[];

      setAniversarios(
        rows.map((prof) => ({
          id: prof.profissionalId,
          apelido: prof.apelido || prof.nome_profissional || "Sem nome",
          dia: prof.dia_aniversario,
          mes: prof.mes_aniversario,
        }))
      );
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
