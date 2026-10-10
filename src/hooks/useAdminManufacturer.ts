import { fabricanteDb } from "@/lib/fabricanteDb";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isMesValido, listarVersoes } from "@/lib/marcasPorMes";

interface TratamentoFabricante {
  id: number;
  service_name: string;
  fabricante: string;
}

export interface ProfissionalFabricante {
  id: number;
  profissional_id: number;
  nome_profissional: string;
  fabricante: string;
  valid_from: string;
}

const PROF_KEYS = [["admin_profissional_fabricante"], ["profissional_fabricante"]] as const;

/**
 * Um UPDATE/DELETE barrado pela RLS volta SEM erro e com zero linhas. Sem esta
 * conferencia a tela diria "salvo" sem ter salvado (ver CLAUDE.md, aba Aprovacoes).
 */
function exigirLinhas(data: unknown, esperado: number, acao: string) {
  const n = Array.isArray(data) ? data.length : 0;
  if (n !== esperado) {
    throw new Error(
      `${acao}: ${n} de ${esperado} linha(s) gravada(s). Verifique sua permissao de escrita no admin.`
    );
  }
}

/**
 * Admin de marcas. `tratamento_fabricante` nao e versionada.
 * `profissional_fabricante` e versionada por mes (`valid_from`, ver src/lib/marcasPorMes.ts):
 * toda escrita de autorizacao recebe a versao explicitamente.
 */
export function useAdminManufacturer() {
  const queryClient = useQueryClient();

  const invalidateProf = async () => {
    await Promise.all(PROF_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey: [...queryKey] })));
  };

  const { data: treatments = [], isLoading: treatmentsLoading } = useQuery({
    queryKey: ["admin_tratamento_fabricante"],
    queryFn: async () => {
      const { data, error } = await fabricanteDb
        .from("tratamento_fabricante")
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
      const { data, error } = await fabricanteDb
        .from("profissional_fabricante")
        .select("id, profissional_id, nome_profissional, fabricante, valid_from")
        .order("nome_profissional");
      if (error) throw error;
      return data as unknown as ProfissionalFabricante[];
    },
  });

  const addTreatment = useMutation({
    mutationFn: async (input: { service_name: string; fabricante: string }) => {
      const { data, error } = await fabricanteDb
        .from("tratamento_fabricante")
        .insert(input)
        .select("id");
      if (error) throw error;
      exigirLinhas(data, 1, "Adicionar tratamento");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_tratamento_fabricante"] });
      queryClient.invalidateQueries({ queryKey: ["tratamento_fabricante"] });
    },
  });

  const removeTreatment = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await fabricanteDb
        .from("tratamento_fabricante")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw error;
      exigirLinhas(data, 1, "Remover tratamento");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_tratamento_fabricante"] });
      queryClient.invalidateQueries({ queryKey: ["tratamento_fabricante"] });
    },
  });

  const addProfBrand = useMutation({
    mutationFn: async (input: {
      profissional_id: number;
      nome_profissional: string;
      fabricante: string;
      valid_from: string;
    }) => {
      if (!isMesValido(input.valid_from)) throw new Error(`Versao invalida: "${input.valid_from}"`);
      const { data, error } = await fabricanteDb
        .from("profissional_fabricante")
        .insert(input)
        .select("id");
      if (error) throw error;
      exigirLinhas(data, 1, "Autorizar marca");
    },
    onSettled: invalidateProf,
  });

  const removeProfBrand = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await fabricanteDb
        .from("profissional_fabricante")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw error;
      exigirLinhas(data, 1, "Remover marca");
    },
    onSettled: invalidateProf,
  });

  /**
   * Cria a versao `destino` copiando TODAS as linhas da versao `origem`.
   * Um unico INSERT multi-linha: ou entram todas, ou nenhuma. Se outra pessoa criar
   * a mesma versao ao mesmo tempo, o UNIQUE (profissional_id, fabricante, valid_from)
   * barra a segunda.
   */
  const createVersion = useMutation({
    mutationFn: async ({ origem, destino }: { origem: string; destino: string }) => {
      if (!isMesValido(destino)) throw new Error(`Mes invalido: "${destino}". Use AAAA-MM.`);

      const { data: atuais, error: errLeitura } = await fabricanteDb
        .from("profissional_fabricante")
        .select("profissional_id, nome_profissional, fabricante, valid_from")
        .in("valid_from", [origem, destino]);
      if (errLeitura) throw errLeitura;

      const linhas = (atuais || []) as unknown as Omit<ProfissionalFabricante, "id">[];
      if (linhas.some((l) => l.valid_from === destino)) {
        throw new Error(`A versao ${destino} ja existe. Selecione-a para editar.`);
      }
      const copia = linhas
        .filter((l) => l.valid_from === origem)
        .map((l) => ({
          profissional_id: l.profissional_id,
          nome_profissional: l.nome_profissional,
          fabricante: l.fabricante,
          valid_from: destino,
        }));
      if (copia.length === 0) throw new Error(`A versao ${origem} nao tem linhas para copiar.`);

      const { data, error } = await fabricanteDb
        .from("profissional_fabricante")
        .insert(copia)
        .select("id");
      if (error) throw error;
      exigirLinhas(data, copia.length, "Criar versao");
      return copia.length;
    },
    onSettled: invalidateProf,
  });

  // Get unique brands from treatments
  const allBrands = [...new Set(treatments.map((t) => t.fabricante))].sort();

  // Group treatments by brand
  const treatmentsByBrand = treatments.reduce<Record<string, TratamentoFabricante[]>>((acc, t) => {
    if (!acc[t.fabricante]) acc[t.fabricante] = [];
    acc[t.fabricante].push(t);
    return acc;
  }, {});

  // Versoes de autorizacao existentes, da mais recente para a mais antiga
  const versions = listarVersoes(profBrands);

  return {
    treatments,
    profBrands,
    versions,
    allBrands,
    treatmentsByBrand,
    isLoading: treatmentsLoading || profBrandsLoading,
    addTreatment,
    removeTreatment,
    addProfBrand,
    removeProfBrand,
    createVersion,
    invalidateProf,
  };
}
